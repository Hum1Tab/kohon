import { bindingFromKeyboardEvent, COMMAND_DEFINITIONS, type UserSettings, type UserSettingsPatch } from "../shared/settings.js";
import { uiText } from "../shared/locale.js";
import type {
  AppCommandId,
  AppInfo,
  ConnectionStatus,
  KohonApi,
  RecentProject,
  UpdateStatus
} from "../shared/types.js";

import { ConnectionManager } from "./connections.js";
import { appPaths, command, listenEvent, openExternalUrl } from "./ipc.js";
import { localizeApiErrors } from "./localized-api.js";
import { currentLocale, safeMessage } from "./locale.js";
import { createMenuController } from "./menu.js";
import { ProjectService } from "./projects.js";
import { DesktopRecentProjectsStore, DesktopSettingsStore, recentProjectsPath, settingsPath } from "./stores.js";
import { projectFs } from "./tauri-fs.js";
import { UpdateService } from "./updates.js";

const EXTERNAL_PAGES = {
  chatgpt: "https://chatgpt.com/",
  "openai-api-keys": "https://platform.openai.com/api-keys",
  "github-cli": "https://cli.github.com/",
  "github-applications": "https://github.com/settings/applications",
  "latest-release": "https://github.com/Hum1Tab/kohon/releases/latest"
} as const;

const BEFORE_CLOSE_EVENT = "app://before-close";

type AsyncListener<T> = (value: T) => void;

function subscribe<T>(listeners: Set<AsyncListener<T>>, listener: AsyncListener<T>): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function broadcast<T>(listeners: Set<AsyncListener<T>>, value: T): void {
  for (const listener of [...listeners]) {
    try { listener(value); }
    catch { /* A broken listener must not stop the other subscribers. */ }
  }
}

/** Keep menu shortcuts working on Windows and Linux, where the titlebar menu is a popup. */
function installGlobalKeybindings(options: {
  platform: string;
  settings: () => UserSettings;
  recording: () => boolean;
  dispatch: (action: AppCommandId) => void;
}): () => void {
  if (options.platform === "darwin") return () => undefined;
  const handler = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229) return;
    if (options.recording()) return;
    if (event.metaKey) return;
    if (event.getModifierState("AltGraph")) return;
    const binding = bindingFromKeyboardEvent(event);
    if (binding === null) return;
    const settings = options.settings();
    const definition = COMMAND_DEFINITIONS.find((item) => settings.keybindings[item.id] === binding);
    if (definition === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    options.dispatch(definition.id);
  };
  window.addEventListener("keydown", handler, true);
  return () => window.removeEventListener("keydown", handler, true);
}

export async function createDesktopApi(): Promise<KohonApi> {
  const paths = await appPaths();
  const systemLocale = typeof navigator === "undefined" ? "ja-JP" : navigator.language || "ja-JP";
  const settingsStore = new DesktopSettingsStore(projectFs, settingsPath(paths.dataDir));
  const recentProjects = new DesktopRecentProjectsStore(projectFs, recentProjectsPath(paths.dataDir));
  let settings = await settingsStore.load();
  await recentProjects.load();

  const locale = (): "ja" | "en" => currentLocale(settings, systemLocale);
  const text = (japanese: string): string => uiText(locale(), japanese);

  const menuActionListeners = new Set<AsyncListener<AppCommandId>>();
  const connectionListeners = new Set<AsyncListener<ConnectionStatus>>();
  const updateListeners = new Set<AsyncListener<UpdateStatus>>();
  const beforeCloseListeners = new Set<() => void | Promise<void>>();
  let keybindingRecording = false;
  let closeInFlight = false;

  const connections = new ConnectionManager((status) => broadcast(connectionListeners, status));
  const updates = new UpdateService(paths.version, (status) => broadcast(updateListeners, status));
  const projects = new ProjectService({
    paths,
    fs: projectFs,
    recent: recentProjects,
    connections,
    locale,
    text
  });
  const menu = createMenuController({
    settings: () => settings,
    locale,
    recording: () => keybindingRecording,
    dispatch: (action) => broadcast(menuActionListeners, action)
  });

  const refreshNativeMenu = async (): Promise<void> => {
    if (paths.platform !== "darwin") return;
    await menu.installApplicationMenu();
  };

  const finishClose = async (): Promise<void> => {
    if (closeInFlight) return;
    closeInFlight = true;
    try {
      await Promise.all([...beforeCloseListeners].map((listener) => listener()));
      await command<void>("app_close_ready");
    } catch (error) {
      console.error("KOHON could not complete the close handshake.", error);
    } finally {
      closeInFlight = false;
    }
  };

  await listenEvent(BEFORE_CLOSE_EVENT, () => { void finishClose(); });

  const raw: KohonApi = {
    readStoryMap: (root) => projects.readStoryMap(root),
    saveStoryMap: (root, map, revision) => projects.saveStoryMap(root, map, revision),
    appInfo: () => command<AppInfo>("app_info"),
    appMenu: async () => menu.groups(),
    showAppMenu: (options) => menu.show(options),
    getUserSettings: async () => settingsStore.current(),
    updateUserSettings: async (patch: UserSettingsPatch) => {
      if (typeof patch !== "object" || patch === null || Array.isArray(patch)) throw new Error("ユーザー設定を確認してください。");
      settings = await settingsStore.update(patch);
      await refreshNativeMenu();
      return settings;
    },
    resetKeybindings: async () => {
      settings = await settingsStore.resetKeybindings();
      await refreshNativeMenu();
      return settings;
    },
    setKeybindingRecording: async (active: boolean) => {
      if (typeof active !== "boolean") throw new Error("キー入力状態を確認できません。");
      keybindingRecording = active;
      await refreshNativeMenu();
    },
    createProject: (title) => projects.createProject(title),
    openProject: () => projects.openProject(),
    recentProjects: async (): Promise<RecentProject[]> => projects.recentProjects(),
    openRecentProject: (root) => projects.openRecentProject(root),
    refreshProject: (root) => projects.refreshProject(root),
    readChapter: (root, chapterId) => projects.readChapter(root, chapterId),
    saveChapter: (root, chapterId, value) => projects.saveChapter(root, chapterId, value),
    readEditorSession: (root) => projects.readEditorSession(root),
    writeEditorSession: (root, session) => projects.writeEditorSession(root, session),
    readRecoveryDraft: (root, chapterId) => projects.readRecoveryDraft(root, chapterId),
    writeRecoveryDraft: (root, draft) => projects.writeRecoveryDraft(root, draft),
    clearRecoveryDraft: (root, chapterId) => projects.clearRecoveryDraft(root, chapterId),
    createChapter: (root, title, kind) => projects.createChapter(root, title, kind),
    splitChapter: (root, chapterId, offset, title) => projects.splitChapter(root, chapterId, offset, title),
    mergeChapterIntoPrevious: (root, chapterId) => projects.mergeChapterIntoPrevious(root, chapterId),
    importDocuments: (root) => projects.importDocuments(root),
    renameChapter: (root, chapterId, title) => projects.renameChapter(root, chapterId, title),
    updateChapterMetadata: (root, chapterId, metadata) => projects.updateChapterMetadata(root, chapterId, metadata),
    reorderChapters: (root, chapterIds) => projects.reorderChapters(root, chapterIds),
    renameProject: (root, title) => projects.renameProject(root, title),
    deleteChapter: (root, chapterId) => projects.deleteChapter(root, chapterId),
    updateSettings: (root, value) => projects.updateSettings(root, value),
    resetProjectSetting: (root, key) => projects.resetProjectSetting(root, key),
    search: (root, query, caseSensitive) => projects.search(root, query, caseSensitive),
    replaceProjectText: (root, query, replacement, caseSensitive) => projects.replaceProjectText(root, query, replacement, caseSensitive),
    createCheckpoint: (root, subject) => projects.createCheckpoint(root, subject),
    listCheckpoints: (root) => projects.listCheckpoints(root),
    compareCurrentToCheckpoint: (root, commit) => projects.compareCurrentToCheckpoint(root, commit),
    compareCheckpoints: (root, leftCommit, rightCommit) => projects.compareCheckpoints(root, leftCommit, rightCommit),
    restoreCheckpoint: (root, commit) => projects.restoreCheckpoint(root, commit),
    restoreCheckpointChapter: (root, commit, chapterId) => projects.restoreCheckpointChapter(root, commit, chapterId),
    createVariation: (root) => projects.createVariation(root),
    exportMarkdown: (root) => projects.exportMarkdown(root),
    exportText: (root) => projects.exportText(root),
    exportReviewBrief: (root) => projects.exportReviewBrief(root),
    runLens: (input) => projects.runLens(input),
    listReviewFindings: (root) => projects.listReviewFindings(root),
    setReviewFindingStatus: (root, id, status) => projects.setReviewFindingStatus(root, id, status),
    setReviewAuthorNote: (root, id, note) => projects.setReviewAuthorNote(root, id, note),
    recheckReviewFinding: (root, id) => projects.recheckReviewFinding(root, id),
    listNotes: (root) => projects.listNotes(root),
    readNote: (root, id) => projects.readNote(root, id),
    createNote: (root, title, kind, chapterIds) => projects.createNote(root, title, kind, chapterIds),
    saveNote: (root, id, title, kind, chapterIds, value) => projects.saveNote(root, id, title, kind, chapterIds, value),
    setNoteArchived: (root, id, archived) => projects.setNoteArchived(root, id, archived),
    connectionStatus: () => connections.refreshStatus(),
    loginCodex: () => connections.loginCodex(),
    logoutCodex: () => connections.logoutCodex(),
    refreshCodexModels: () => connections.refreshCodexModels(),
    checkCodexRuntimeUpdates: () => connections.checkCodexRuntimeUpdates(),
    connectOpenAI: (apiKey) => connections.connectOpenAI(apiKey),
    disconnectOpenAI: () => connections.disconnectOpenAI(),
    loginGitHub: () => connections.loginGitHub(),
    checkForUpdates: () => updates.check(),
    installUpdate: () => updates.install(),
    openUpdatePage: () => updates.openPage(),
    openExternalPage: async (page) => {
      if (typeof page !== "string" || !(page in EXTERNAL_PAGES)) throw new Error("外部ページを開けません。");
      await openExternalUrl(EXTERNAL_PAGES[page as keyof typeof EXTERNAL_PAGES]);
    },
    onMenuAction: (listener) => subscribe(menuActionListeners, listener),
    onConnectionStatus: (listener) => subscribe(connectionListeners, listener),
    onUpdateStatus: (listener) => subscribe(updateListeners, listener),
    onBeforeClose: (listener) => {
      beforeCloseListeners.add(listener);
      return () => { beforeCloseListeners.delete(listener); };
    }
  };

  if (paths.platform === "darwin") await refreshNativeMenu();
  connections.initializeCodex(paths.version, (url) => openExternalUrl(url));
  await connections.initializeOpenAI();

  const api = localizeApiErrors(raw, (error) => safeMessage(settings, systemLocale, error));
  installGlobalKeybindings({
    platform: paths.platform,
    settings: () => settings,
    recording: () => keybindingRecording,
    dispatch: (action) => broadcast(menuActionListeners, action)
  });

  if (settings.updates.checkOnStartup && import.meta.env.PROD) {
    window.setTimeout(() => { void updates.check(); }, 3_000);
  }

  return api;
}
