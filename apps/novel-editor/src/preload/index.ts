import { contextBridge, ipcRenderer } from "electron";
import type { AppCommandId, ConnectionStatus, KohonApi, UpdateStatus } from "../shared/types.js";

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>;

const api: KohonApi = {
  appInfo: () => invoke("app:info"),
  getUserSettings: () => invoke("user-settings:get"),
  updateUserSettings: (patch) => invoke("user-settings:update", patch),
  resetKeybindings: () => invoke("user-settings:reset-keybindings"),
  setKeybindingRecording: (active) => invoke("user-settings:keybinding-recording", active),
  createProject: (title) => invoke("project:create", title),
  openProject: () => invoke("project:open"),
  recentProjects: () => invoke("project:recent"),
  openRecentProject: (root) => invoke("project:open-recent", root),
  refreshProject: (root) => invoke("project:refresh", root),
  readChapter: (root, chapterId) => invoke("chapter:read", root, chapterId),
  saveChapter: (root, chapterId, text) => invoke("chapter:save", root, chapterId, text),
  readEditorSession: (root) => invoke("editor-session:read", root),
  writeEditorSession: (root, editorSession) => invoke("editor-session:write", root, editorSession),
  readRecoveryDraft: (root, chapterId) => invoke("recovery:read", root, chapterId),
  writeRecoveryDraft: (root, draft) => invoke("recovery:write", root, draft),
  clearRecoveryDraft: (root, chapterId) => invoke("recovery:clear", root, chapterId),
  createChapter: (root, title, kind) => invoke("chapter:create", root, title, kind),
  splitChapter: (root, chapterId, offset, title) => invoke("chapter:split", root, chapterId, offset, title),
  mergeChapterIntoPrevious: (root, chapterId) => invoke("chapter:merge-previous", root, chapterId),
  importDocuments: (root) => invoke("chapter:import", root),
  renameChapter: (root, chapterId, title) => invoke("chapter:rename", root, chapterId, title),
  updateChapterMetadata: (root, chapterId, metadata) => invoke("chapter:metadata", root, chapterId, metadata),
  reorderChapters: (root, chapterIds) => invoke("chapter:reorder", root, chapterIds),
  renameProject: (root, title) => invoke("project:rename", root, title),
  deleteChapter: (root, chapterId) => invoke("chapter:delete", root, chapterId),
  updateSettings: (root, settings) => invoke("project:settings", root, settings),
  resetProjectSetting: (root, key) => invoke("project:settings-reset", root, key),
  search: (root, query, caseSensitive) => invoke("project:search", root, query, caseSensitive),
  replaceProjectText: (root, query, replacement, caseSensitive) => invoke("project:replace", root, query, replacement, caseSensitive),
  createCheckpoint: (root, subject) => invoke("history:checkpoint", root, subject),
  listCheckpoints: (root) => invoke("history:list", root),
  compareCurrentToCheckpoint: (root, commit) => invoke("history:compare-current", root, commit),
  compareCheckpoints: (root, leftCommit, rightCommit) => invoke("history:compare-checkpoints", root, leftCommit, rightCommit),
  restoreCheckpoint: (root, commit) => invoke("history:restore", root, commit),
  restoreCheckpointChapter: (root, commit, chapterId) => invoke("history:restore-chapter", root, commit, chapterId),
  createVariation: (root) => invoke("project:variation", root),
  exportMarkdown: (root) => invoke("project:export", root),
  exportText: (root) => invoke("project:export-text", root),
  runLens: (input) => invoke("lens:run", input),
  listReviewFindings: (root) => invoke("reviews:list", root),
  setReviewFindingStatus: (root, id, status) => invoke("reviews:set-status", root, id, status),
  recheckReviewFinding: (root, id) => invoke("reviews:recheck", root, id),
  listNotes: (root) => invoke("notes:list", root),
  readNote: (root, id) => invoke("notes:read", root, id),
  createNote: (root, title, kind, chapterIds) => invoke("notes:create", root, title, kind, chapterIds),
  saveNote: (root, id, title, kind, chapterIds, text) => invoke("notes:save", root, id, title, kind, chapterIds, text),
  setNoteArchived: (root, id, archived) => invoke("notes:archive", root, id, archived),
  connectionStatus: () => invoke("connections:status"),
  loginCodex: () => invoke("connections:codex-login"),
  logoutCodex: () => invoke("connections:codex-logout"),
  refreshCodexModels: () => invoke("connections:codex-models-refresh"),
  connectOpenAI: (apiKey) => invoke("connections:openai-connect", apiKey),
  disconnectOpenAI: () => invoke("connections:openai-disconnect"),
  loginGitHub: () => invoke("connections:github-login"),
  checkForUpdates: () => invoke("updates:check"),
  installUpdate: () => invoke("updates:install"),
  openUpdatePage: () => invoke("updates:open-page"),
  openExternalPage: (page) => invoke("app:open-external", page),
  onMenuAction: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, action: AppCommandId) => listener(action);
    ipcRenderer.on("menu:action", handler);
    return () => ipcRenderer.removeListener("menu:action", handler);
  },
  onConnectionStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: ConnectionStatus) => listener(status);
    ipcRenderer.on("connections:status", handler);
    return () => ipcRenderer.removeListener("connections:status", handler);
  },
  onUpdateStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => listener(status);
    ipcRenderer.on("updates:status", handler);
    return () => ipcRenderer.removeListener("updates:status", handler);
  },
  onBeforeClose: (listener) => {
    const handler = () => { void Promise.resolve(listener()).then(() => ipcRenderer.send("app:close-ready"), () => ipcRenderer.send("app:close-cancel")); };
    ipcRenderer.on("app:before-close", handler);
    return () => ipcRenderer.removeListener("app:before-close", handler);
  }
};

contextBridge.exposeInMainWorld("kohon", Object.freeze(api));
