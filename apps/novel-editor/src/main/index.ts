import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, dirname, extname, join, resolve } from "node:path";

import { LEGACY_PROJECT_MANIFEST, PROJECT_MANIFEST, ProjectStore, type NoteKind, type ProjectSettings, type ReviewStatus } from "@kohon/project-store";
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, session, shell, type IpcMainEvent, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from "electron";

import { isHexColor } from "../shared/editor-theme.js";
import { sanitizeEditorSession } from "../shared/editor-session.js";
import { resolveLensScope } from "../shared/lens-scope.js";
import { COMMAND_DEFINITIONS, defaultUserSettings, toElectronAccelerator, type AppCommandId, type UserSettings } from "../shared/settings.js";
import { commandLabel, resolveAppLocale, uiText, type AppLocale } from "../shared/locale.js";
import { defaultChapterTitle } from "../shared/chapter-title.js";
import { runLens, type LensExecutionInput } from "./lens.js";
import type { ChapterDocument, LensRunInput, ProjectSummary, RecoveryDraft, RecoveryDraftInput } from "../shared/types.js";
import { ConnectionManager } from "./connections.js";
import { SecureCredentialStore } from "./secure-credentials.js";
import { installerLaunchArguments, isWindowsPortable, LATEST_RELEASE_PAGE, UpdateManager } from "./updates.js";
import { migrateLegacyUserData } from "./user-data-migration.js";
import { UserSettingsStore } from "./user-settings.js";

// The editor does not use GPU-heavy features. Software rendering avoids startup
// failures on Windows systems whose graphics runtime is incomplete or blocked.
app.disableHardwareAcceleration();

const allowedRoots = new Set<string>();
let mainWindow: BrowserWindow | null = null;
let closeApproved = false;
let closeFallback: ReturnType<typeof setTimeout> | null = null;
let settingsStore: UserSettingsStore | null = null;
let userSettings = defaultUserSettings();
let keybindingRecording = false;
let updateManager: UpdateManager | null = null;
const connections = new ConnectionManager((status) => mainWindow?.webContents.send("connections:status", status));
const EXTERNAL_PAGES = {
  chatgpt: "https://chatgpt.com/",
  "openai-api-keys": "https://platform.openai.com/api-keys",
  "github-cli": "https://cli.github.com/",
  "github-applications": "https://github.com/settings/applications",
  "latest-release": LATEST_RELEASE_PAGE
} as const;

function workbenchBackgroundColor(): string {
  const theme = userSettings.appearance.colorTheme;
  if (theme === "dark" || (theme === "system" && nativeTheme.shouldUseDarkColors)) return "#181818";
  return theme === "light" ? "#ffffff" : "#eee9df";
}

function suggestedFolderName(title: string): string {
  return title.replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "-").replace(/[. ]+$/u, "").trim() || mainText("新しい小説");
}

function safeMessage(error: unknown): string {
  if (!(error instanceof Error)) return mainText("処理を完了できませんでした。");
  const message = error.message.replace(/[\r\n\u0000]+/gu, " ").slice(0, 500);
  const translations: Record<string, string> = {
    "chapter not found": "章が見つかりません。",
    "invalid project manifest": "KOHON projectとして読み込めません。",
    "managed path boundary violation": "project外のファイル操作を拒否しました。",
    "invalid snapshot id": "保存点を確認できません。"
  };
  return mainText(translations[message] ?? message);
}

function recoveryDraftFrom(value: unknown, expectedChapterId: string): RecoveryDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("復旧ドラフトを読み取れません。");
  const source = value as Record<string, unknown>;
  const text = source["text"];
  const baseVersion = source["baseVersion"];
  const updatedAt = source["updatedAt"];
  if (source["schemaVersion"] !== 1 || source["chapterId"] !== expectedChapterId || typeof text !== "string" || text.length > 10_000_000 || typeof baseVersion !== "string" || !/^[a-f0-9]{64}$/u.test(baseVersion) || typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt))) throw new Error("復旧ドラフトを読み取れません。");
  const offset = (key: keyof RecoveryDraftInput, maximum: number): number => {
    const candidate = source[key];
    if (typeof candidate !== "number" || !Number.isFinite(candidate)) return 0;
    return Math.min(maximum, Math.max(0, Math.trunc(candidate)));
  };
  const selectionStart = offset("selectionStart", text.length);
  const selectionEnd = Math.max(selectionStart, offset("selectionEnd", text.length));
  return { schemaVersion: 1, chapterId: expectedChapterId, text, baseVersion, updatedAt, selectionStart, selectionEnd, scrollTop: offset("scrollTop", 1_000_000_000), scrollLeft: offset("scrollLeft", 1_000_000_000) };
}

function recoveryDraftForWrite(value: unknown): RecoveryDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("復旧ドラフトを保存できません。");
  const source = value as Record<string, unknown>;
  if (typeof source["chapterId"] !== "string") throw new Error("章IDが不正です。");
  return recoveryDraftFrom({ ...source, schemaVersion: 1, updatedAt: new Date().toISOString() }, source["chapterId"]);
}

function trustedIpcSender(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return mainWindow !== null && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame;
}

function handle(channel: string, listener: (...args: any[]) => unknown | Promise<unknown>): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    if (!trustedIpcSender(event)) throw new Error("IPC送信元を確認できません。");
    try { return await listener(...args); }
    catch (error) { throw new Error(safeMessage(error)); }
  });
}

function requireSettingsStore(): UserSettingsStore {
  if (settingsStore === null) throw new Error("設定をまだ読み込めません。");
  return settingsStore;
}

async function openExternalPage(page: unknown): Promise<void> {
  if (typeof page !== "string" || !(page in EXTERNAL_PAGES)) throw new Error("外部ページを開けません。");
  await shell.openExternal(EXTERNAL_PAGES[page as keyof typeof EXTERNAL_PAGES], { activate: true });
}

async function registerRoot(root: string): Promise<string> {
  const canonical = await realpath(root);
  allowedRoots.add(canonical);
  return canonical;
}

async function storeFor(requestedRoot: unknown): Promise<ProjectStore> {
  if (typeof requestedRoot !== "string") throw new Error("project pathが不正です。");
  const canonical = await realpath(requestedRoot);
  if (!allowedRoots.has(canonical)) throw new Error("この起動中に開いたprojectではありません。");
  return new ProjectStore(canonical);
}

async function summary(store: ProjectStore): Promise<ProjectSummary> {
  return { root: store.root, manifest: await store.manifest() };
}

async function chooseNewProject(title: unknown): Promise<ProjectSummary | null> {
  if (typeof title !== "string" || title.trim().length === 0 || title.length > 200) throw new Error("作品名は1〜200文字で入力してください。");
  const selected = await dialog.showSaveDialog(mainWindow!, {
    title: mainText("新しい作品フォルダーの保存場所を選択"),
    defaultPath: join(app.getPath("documents"), suggestedFolderName(title.trim())),
    buttonLabel: mainText("ここに作品を作成"),
    nameFieldLabel: mainText("作品フォルダー名:"),
    properties: ["createDirectory", "showOverwriteConfirmation"]
  });
  if (selected.canceled || selected.filePath.length === 0) return null;
  const root = resolve(selected.filePath);
  if (existsSync(root)) {
    const entries = await readdir(root);
    if (entries.length > 0) throw new Error("空ではないフォルダーには新規projectを作成できません。");
  } else {
    await mkdir(root, { recursive: true });
  }
  const store = await ProjectStore.create(root, title.trim());
  await store.createChapter(defaultChapterTitle(1, currentLocale()), "");
  await registerRoot(root);
  await store.checkpoint(mainText("最初の保存点"));
  return summary(store);
}

async function chooseExistingProject(): Promise<ProjectSummary | null> {
  const selected = await dialog.showOpenDialog(mainWindow!, {
    title: currentLocale() === "en" ? `Select ${PROJECT_MANIFEST} or ${LEGACY_PROJECT_MANIFEST} inside the project folder` : `作品フォルダー内の ${PROJECT_MANIFEST} または ${LEGACY_PROJECT_MANIFEST} を選択`,
    defaultPath: app.getPath("documents"),
    buttonLabel: mainText("この作品を開く"),
    filters: [{ name: currentLocale() === "en" ? `KOHON Project (${PROJECT_MANIFEST} / ${LEGACY_PROJECT_MANIFEST})` : `KOHON作品 (${PROJECT_MANIFEST} / ${LEGACY_PROJECT_MANIFEST})`, extensions: ["json"] }],
    properties: ["openFile"]
  });
  const selectedPath = selected.filePaths[0];
  if (selected.canceled || selectedPath === undefined) return null;
  if (basename(selectedPath) !== PROJECT_MANIFEST && basename(selectedPath) !== LEGACY_PROJECT_MANIFEST) throw new Error(`作品フォルダー内の ${PROJECT_MANIFEST} または ${LEGACY_PROJECT_MANIFEST} を選択してください。`);
  const root = await registerRoot(dirname(selectedPath));
  const store = new ProjectStore(root);
  await store.open();
  return summary(store);
}

function registerIpc(): void {
  handle("app:info", () => ({ name: app.getName(), version: app.getVersion(), platform: process.platform }));
  handle("user-settings:get", () => requireSettingsStore().current());
  handle("user-settings:update", async (patch) => {
    if (typeof patch !== "object" || patch === null || Array.isArray(patch)) throw new Error("ユーザー設定を確認してください。");
    userSettings = await requireSettingsStore().update(patch);
    mainWindow?.setBackgroundColor(workbenchBackgroundColor());
    installMenu();
    return userSettings;
  });
  handle("user-settings:reset-keybindings", async () => {
    userSettings = await requireSettingsStore().resetKeybindings();
    installMenu();
    return userSettings;
  });
  handle("user-settings:keybinding-recording", (active) => {
    if (typeof active !== "boolean") throw new Error("キー入力状態を確認できません。");
    keybindingRecording = active;
    installMenu();
  });
  handle("project:create", chooseNewProject);
  handle("project:open", chooseExistingProject);
  handle("project:refresh", async (root) => summary(await storeFor(root)));
  handle("chapter:read", async (root, chapterId): Promise<ChapterDocument> => {
    if (typeof chapterId !== "string") throw new Error("章IDが不正です。");
    const store = await storeFor(root);
    const manifest = await store.manifest();
    const chapter = manifest.chapters.find((item) => item.id === chapterId);
    if (chapter === undefined) throw new Error("chapter not found");
    const document = await store.readChapterWithVersion(chapterId);
    return { chapter, ...document };
  });
  handle("chapter:save", async (root, chapterId, text) => {
    if (typeof chapterId !== "string" || typeof text !== "string" || text.length > 10_000_000) throw new Error("保存する本文を確認してください。");
    return { version: await (await storeFor(root)).saveChapter(chapterId, text) };
  });
  handle("editor-session:read", async (root) => {
    const store = await storeFor(root);
    const manifest = await store.manifest();
    const sessionState = sanitizeEditorSession(await store.readEditorSession(), manifest.chapters.map((chapter) => chapter.id));
    await store.writeEditorSession(sessionState);
    return sessionState;
  });
  handle("editor-session:write", async (root, sessionState) => {
    const store = await storeFor(root);
    const manifest = await store.manifest();
    const sanitized = sanitizeEditorSession(sessionState, manifest.chapters.map((chapter) => chapter.id));
    await store.writeEditorSession(sanitized);
    return sanitized;
  });
  handle("recovery:read", async (root, chapterId) => {
    if (typeof chapterId !== "string") throw new Error("章IDが不正です。");
    const store = await storeFor(root);
    const stored = await store.readRecoveryDraft(chapterId);
    if (stored === null) return null;
    const draft = recoveryDraftFrom(stored, chapterId);
    const canonical = await store.readChapterWithVersion(chapterId);
    if (draft.text === canonical.text) {
      await store.clearRecoveryDraft(chapterId);
      return null;
    }
    return { draft, canonicalVersion: canonical.version, conflict: draft.baseVersion !== canonical.version };
  });
  handle("recovery:write", async (root, draftInput) => {
    const draft = recoveryDraftForWrite(draftInput);
    await (await storeFor(root)).writeRecoveryDraft(draft.chapterId, draft);
  });
  handle("recovery:clear", async (root, chapterId) => {
    if (typeof chapterId !== "string") throw new Error("章IDが不正です。");
    await (await storeFor(root)).clearRecoveryDraft(chapterId);
  });
  handle("chapter:create", async (root, title, kind) => {
    if (typeof title !== "string" || title.trim().length === 0 || title.length > 200) throw new Error("章タイトルを確認してください。");
    if (kind !== undefined && kind !== "chapter" && kind !== "scene") throw new Error("章・場面の種類を確認してください。");
    return (await storeFor(root)).createChapter(title, "", kind ?? "chapter");
  });
  handle("chapter:split", async (root, chapterId, offset, title) => {
    if (typeof chapterId !== "string" || !Number.isInteger(offset) || typeof title !== "string" || title.trim().length === 0 || title.length > 200) throw new Error("場面の分割位置を確認してください。");
    const store = await storeFor(root);
    const created = await store.splitChapter(chapterId, offset, title);
    return { project: await summary(store), created };
  });
  handle("chapter:merge-previous", async (root, chapterId) => {
    if (typeof chapterId !== "string") throw new Error("結合する章・場面を確認してください。");
    const store = await storeFor(root);
    const target = await store.mergeChapterIntoPrevious(chapterId);
    return { project: await summary(store), target };
  });
  handle("chapter:import", async (root) => {
    const store = await storeFor(root);
    const selected = await dialog.showOpenDialog(mainWindow!, {
      title: mainText("TXT / Markdownを章・場面として取り込む"),
      buttonLabel: mainText("取り込む"),
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Text / Markdown", extensions: ["txt", "md", "markdown"] }]
    });
    if (selected.canceled || selected.filePaths.length === 0) return null;
    const buffers = await Promise.all(selected.filePaths.map((path) => readFile(path)));
    if (buffers.reduce((sum, value) => sum + value.byteLength, 0) > 50_000_000) throw new Error("取り込むファイルの合計が50MBを超えています。");
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const importedChapterIds: string[] = [];
    for (let index = 0; index < selected.filePaths.length; index += 1) {
      const path = selected.filePaths[index]!;
      const buffer = buffers[index]!;
      let text: string;
      try { text = decoder.decode(buffer); }
      catch { throw new Error(`${basename(path)} はUTF-8として読み込めません。`); }
      const extension = extname(path);
      const created = await store.createChapter(basename(path, extension), text.replace(/^\uFEFF/u, ""));
      importedChapterIds.push(created.id);
    }
    return { project: await summary(store), importedChapterIds };
  });
  handle("chapter:rename", async (root, chapterId, title) => {
    if (typeof chapterId !== "string" || typeof title !== "string" || title.trim().length === 0 || title.length > 200) throw new Error("章タイトルを確認してください。");
    await (await storeFor(root)).renameChapter(chapterId, title);
  });
  handle("chapter:metadata", async (root, chapterId, metadata) => {
    if (typeof chapterId !== "string" || typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) throw new Error("章・場面情報を確認してください。");
    const store = await storeFor(root);
    await store.updateChapterMetadata(chapterId, metadata);
    return summary(store);
  });
  handle("chapter:reorder", async (root, chapterIds) => {
    if (!Array.isArray(chapterIds) || chapterIds.some((id) => typeof id !== "string")) throw new Error("章順を確認できません。");
    const store = await storeFor(root);
    await store.reorderChapters(chapterIds as string[]);
    return summary(store);
  });
  handle("project:rename", async (root, title) => {
    if (typeof title !== "string") throw new Error("作品名を確認してください。");
    const store = await storeFor(root);
    await store.renameProject(title);
    return summary(store);
  });
  handle("chapter:delete", async (root, chapterId) => {
    if (typeof chapterId !== "string") throw new Error("章IDが不正です。");
    await (await storeFor(root)).deleteChapter(chapterId);
  });
  handle("project:settings", async (root, settings) => {
    if (typeof settings !== "object" || settings === null) throw new Error("設定を確認してください。");
    const source = settings as Record<string, unknown>;
    const safeSettings: ProjectSettings = {};
    if (source["writingMode"] === "horizontal" || source["writingMode"] === "vertical-rl") safeSettings.writingMode = source["writingMode"];
    if (typeof source["font"] === "string" && source["font"].length <= 200) safeSettings.font = source["font"];
    if (typeof source["width"] === "number" && source["width"] >= 480 && source["width"] <= 1600) safeSettings.width = source["width"];
    if (typeof source["lineHeight"] === "number" && source["lineHeight"] >= 1.2 && source["lineHeight"] <= 3) safeSettings.lineHeight = source["lineHeight"];
    if (typeof source["fontSize"] === "number" && source["fontSize"] >= 12 && source["fontSize"] <= 36) safeSettings["fontSize"] = source["fontSize"];
    if (source["theme"] === "paper" || source["theme"] === "sepia" || source["theme"] === "gray" || source["theme"] === "dark" || source["theme"] === "custom") safeSettings["theme"] = source["theme"];
    if (isHexColor(source["canvasBackground"])) safeSettings["canvasBackground"] = source["canvasBackground"].toLowerCase();
    if (source["canvasText"] === null || isHexColor(source["canvasText"])) safeSettings["canvasText"] = typeof source["canvasText"] === "string" ? source["canvasText"].toLowerCase() : null;
    const store = await storeFor(root);
    await store.updateSettings(safeSettings);
    return summary(store);
  });
  handle("project:settings-reset", async (root, key) => {
    const allowed = new Set(["writingMode", "theme", "canvasBackground", "canvasText", "font", "fontSize", "lineHeight", "width"]);
    if (typeof key !== "string" || !allowed.has(key)) throw new Error("設定項目を確認してください。");
    const store = await storeFor(root);
    await store.resetSetting(key as "writingMode" | "theme" | "canvasBackground" | "canvasText" | "font" | "fontSize" | "lineHeight" | "width");
    return summary(store);
  });
  handle("project:search", async (root, query, caseSensitive) => {
    if (typeof query !== "string" || query.trim().length === 0 || query.length > 500) return [];
    return (await (await storeFor(root)).search(query, caseSensitive === true)).map(({ chapterId, title, start, end, excerpt }) => ({ chapterId, title, start, end, excerpt }));
  });
  handle("project:replace", async (root, query, replacement, caseSensitive) => {
    if (typeof query !== "string" || query.trim().length === 0 || query.length > 500 || typeof replacement !== "string" || replacement.length > 10_000 || typeof caseSensitive !== "boolean") throw new Error("置換する文字を確認してください。");
    const store = await storeFor(root);
    await store.checkpoint(`作品全体の置換前: ${query.slice(0, 80)}`);
    return store.replaceAll(query, replacement, caseSensitive);
  });
  handle("history:checkpoint", async (root, subject) => {
    if (typeof subject !== "string" || subject.trim().length === 0 || subject.length > 200) throw new Error("保存点の名前を確認してください。");
    return (await storeFor(root)).checkpoint(subject.trim());
  });
  handle("history:list", async (root) => {
    const store = await storeFor(root);
    return store.history(100);
  });
  handle("history:compare-current", async (root, commit) => {
    if (typeof commit !== "string") throw new Error("保存点を確認できません。");
    return (await storeFor(root)).compareCurrentToCheckpoint(commit);
  });
  handle("history:compare-checkpoints", async (root, leftCommit, rightCommit) => {
    if (typeof leftCommit !== "string" || typeof rightCommit !== "string") throw new Error("保存点を確認できません。");
    return (await storeFor(root)).compareCheckpoints(leftCommit, rightCommit);
  });
  handle("history:restore", async (root, commit) => {
    if (typeof commit !== "string") throw new Error("保存点を確認できません。");
    const store = await storeFor(root);
    await store.restore(commit);
    return summary(store);
  });
  handle("history:restore-chapter", async (root, commit, chapterId) => {
    if (typeof commit !== "string" || typeof chapterId !== "string") throw new Error("保存点の章を確認できません。");
    const store = await storeFor(root);
    await store.restoreChapter(commit, chapterId);
    return summary(store);
  });
  handle("project:variation", async (root) => {
    const store = await storeFor(root);
    const selected = await dialog.showSaveDialog(mainWindow!, {
      title: mainText("別案を新しいフォルダーへ作成"),
      defaultPath: `${basename(store.root)}-別案`,
      buttonLabel: mainText("別案を作成"),
      properties: ["createDirectory", "showOverwriteConfirmation"]
    });
    if (selected.canceled || selected.filePath.length === 0) return null;
    await store.createVariation(selected.filePath);
    return selected.filePath;
  });
  handle("project:export", async (root) => {
    const store = await storeFor(root);
    const selected = await dialog.showSaveDialog(mainWindow!, {
      title: mainText("作品を結合Markdownとして書き出す"),
      defaultPath: join(dirname(store.root), `${basename(store.root)}.md`),
      buttonLabel: mainText("書き出す"),
      filters: [{ name: "Markdown", extensions: ["md"] }]
    });
    if (selected.canceled || selected.filePath.length === 0) return null;
    await writeFile(selected.filePath, await store.exportMarkdown(), "utf8");
    return selected.filePath;
  });
  handle("project:export-text", async (root) => {
    const store = await storeFor(root);
    const selected = await dialog.showSaveDialog(mainWindow!, {
      title: mainText("作品を結合テキストとして書き出す"),
      defaultPath: join(dirname(store.root), `${basename(store.root)}.txt`),
      buttonLabel: mainText("書き出す"),
      filters: [{ name: "Text", extensions: ["txt"] }]
    });
    if (selected.canceled || selected.filePath.length === 0) return null;
    await writeFile(selected.filePath, await store.exportText(), "utf8");
    return selected.filePath;
  });
  handle("lens:run", async (input) => {
    if (typeof input !== "object" || input === null) throw new Error("AI requestを確認してください。");
    const source = input as LensRunInput;
    if (typeof source.root !== "string" || !Array.isArray(source.approvedChapterIds) || source.approvedChapterIds.some((id) => typeof id !== "string")) throw new Error("AIへ渡す章を確認してください。");
    const store = await storeFor(source.root);
    const manifest = await store.manifest();
    const expected = resolveLensScope(manifest.chapters, source.scope, source.cutoffChapterId, source.approvedChapterIds);
    const chapters = await Promise.all(expected.map(async (chapter) => ({ ...chapter, ...(await store.readChapterWithVersion(chapter.id)) })));
    const request: LensExecutionInput = { role: source.role, query: source.query, scope: source.scope, cutoffChapterId: source.cutoffChapterId, chapters, provider: source.provider, modelId: source.modelId, conversation: source.conversation };
    if (request.provider === "openai") request.apiKey = connections.requireOpenAIKey();
    const result = await runLens(request, (modelId, prompt, outputSchema) => connections.runCodex(modelId, prompt, outputSchema));
    const sources = new Map(request.chapters.map((chapter) => [chapter.id, chapter]));
    try {
      await store.appendReviewFindings(result.findings.flatMap((finding) => {
        if (finding.chapterId === null || finding.quote.length === 0) return [];
        const source = sources.get(finding.chapterId);
        if (source === undefined) return [];
        return [{ role: result.role, provider: result.provider, model: result.modelId, scope: request.scope, ...(request.cutoffChapterId === null ? {} : { cutoffChapter: request.cutoffChapterId }), sourceVersionHash: source.version, sourceText: source.text, chapterId: source.id, findingTitle: finding.title, findingBody: `${finding.observation}\n\n読者への影響: ${finding.readerEffect}`, severity: finding.priority, exactQuote: finding.quote }];
      }));
      return { ...result, ledgerStored: true };
    } catch (error) {
      return { ...result, ledgerStored: false, ledgerMessage: safeMessage(error) };
    }
  });
  handle("reviews:list", async (root) => (await storeFor(root)).listReviewFindings());
  handle("reviews:set-status", async (root, id, status) => {
    if (typeof id !== "string" || id.length > 100 || (status !== "open" && status !== "resolved" && status !== "ignored")) throw new Error("指摘の状態を確認してください。");
    return (await storeFor(root)).setReviewFindingStatus(id, status as ReviewStatus);
  });
  handle("reviews:recheck", async (root, id) => {
    if (typeof id !== "string" || id.length > 100) throw new Error("指摘を確認してください。");
    return (await storeFor(root)).recheckReviewFinding(id);
  });
  handle("notes:list", async (root) => (await storeFor(root)).listNotes());
  handle("notes:read", async (root, id) => {
    if (typeof id !== "string" || id.length > 100) throw new Error("メモを確認してください。");
    return (await storeFor(root)).readNote(id);
  });
  handle("notes:create", async (root, title, kind, chapterIds) => {
    if (typeof title !== "string" || title.trim().length === 0 || title.length > 200 || (kind !== "character" && kind !== "place" && kind !== "world" && kind !== "plot" && kind !== "memo") || !Array.isArray(chapterIds) || chapterIds.length > 200 || chapterIds.some(id => typeof id !== "string")) throw new Error("メモの内容を確認してください。");
    return (await storeFor(root)).createNote(title, kind as NoteKind, chapterIds, "");
  });
  handle("notes:save", async (root, id, title, kind, chapterIds, text) => {
    if (typeof id !== "string" || id.length > 100 || typeof title !== "string" || title.trim().length === 0 || title.length > 200 || (kind !== "character" && kind !== "place" && kind !== "world" && kind !== "plot" && kind !== "memo") || !Array.isArray(chapterIds) || chapterIds.length > 200 || chapterIds.some(chapterId => typeof chapterId !== "string") || typeof text !== "string" || text.length > 2_000_000) throw new Error("メモの内容を確認してください。");
    return (await storeFor(root)).saveNote(id, title, kind as NoteKind, chapterIds, text);
  });
  handle("notes:archive", async (root, id, archived) => {
    if (typeof id !== "string" || id.length > 100 || typeof archived !== "boolean") throw new Error("メモを確認してください。");
    return (await storeFor(root)).setNoteArchived(id, archived);
  });
  handle("connections:status", () => connections.refreshStatus());
  handle("connections:codex-login", () => connections.loginCodex(async (target) => {
    const url = new URL(target);
    const trusted = url.protocol === "https:" && (url.hostname === "chatgpt.com" || url.hostname.endsWith(".chatgpt.com") || url.hostname === "openai.com" || url.hostname.endsWith(".openai.com"));
    if (!trusted) throw new Error("ChatGPT認証先URLを確認できません。");
    await shell.openExternal(url.toString(), { activate: true });
  }));
  handle("connections:codex-logout", () => connections.logoutCodex());
  handle("connections:codex-models-refresh", () => connections.refreshCodexModels());
  handle("connections:openai-connect", (apiKey) => {
    if (typeof apiKey !== "string") throw new Error("OpenAI APIキーを確認してください。");
    return connections.connectOpenAI(apiKey);
  });
  handle("connections:openai-disconnect", () => connections.disconnectOpenAI());
  handle("connections:github-login", () => connections.loginGitHub());
  handle("updates:check", () => {
    if (updateManager === null) throw new Error("更新機能をまだ利用できません。");
    return updateManager.check();
  });
  handle("updates:install", async () => {
    if (updateManager === null) throw new Error("更新機能をまだ利用できません。");
    if (isWindowsPortable(process.platform, process.env)) {
      await shell.openExternal(LATEST_RELEASE_PAGE, { activate: true });
      throw new Error("portable版は実行中のfileを自己置換しません。Releaseページから新しいportable版を取得してください。");
    }
    const status = await updateManager.install(async (installerPath) => {
      if (process.platform === "linux" && installerPath.endsWith(".AppImage")) await chmod(installerPath, 0o700);
      if (process.platform === "win32") {
        return new Promise<string>((resolveLaunch) => {
          const child = spawn(installerPath, installerLaunchArguments(process.platform), { detached: true, stdio: "ignore", windowsHide: true });
          child.once("error", (error) => resolveLaunch(error.message));
          child.once("spawn", () => { child.unref(); resolveLaunch(""); });
        });
      }
      return shell.openPath(installerPath);
    });
    if (status.state === "installing" && process.platform === "win32") {
      setTimeout(() => { closeApproved = true; app.quit(); }, 800);
    }
    return status;
  });
  handle("updates:open-page", async () => {
    const status = updateManager?.snapshot();
    const target = status?.releaseUrl ?? LATEST_RELEASE_PAGE;
    const url = new URL(target);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || !url.pathname.startsWith("/Hum1Tab/kohon/releases/")) throw new Error("更新先URLを確認できません。");
    await shell.openExternal(url.toString(), { activate: true });
  });
  handle("app:open-external", openExternalPage);
  ipcMain.on("app:close-ready", (event) => {
    if (!trustedIpcSender(event) || mainWindow === null) return;
    closeApproved = true;
    if (closeFallback !== null) { clearTimeout(closeFallback); closeFallback = null; }
    mainWindow.close();
  });
  ipcMain.on("app:close-cancel", (event) => {
    if (!trustedIpcSender(event) || mainWindow === null) return;
    closeApproved = false;
    if (closeFallback !== null) { clearTimeout(closeFallback); closeFallback = null; }
    mainWindow.show();
    mainWindow.focus();
  });
}

function armCloseFallback(): void {
  if (closeFallback !== null) clearTimeout(closeFallback);
  closeFallback = setTimeout(() => {
    closeFallback = null;
    void confirmSlowClose();
  }, 4_000);
}

async function confirmSlowClose(): Promise<void> {
  const window = mainWindow;
  if (window === null || window.isDestroyed() || closeApproved) return;
  const result = await dialog.showMessageBox(window, {
    type: "warning",
    title: mainText("保存の完了を待っています"),
    message: mainText("原稿の保存処理がまだ完了していません。"),
    detail: mainText("通常は「保存を待つ」を選んでください。強制終了すると、最後の入力は復旧ドラフトから戻す必要があります。"),
    buttons: [mainText("保存を待つ"), mainText("強制終了")],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (mainWindow !== window || window.isDestroyed() || closeApproved) return;
  if (result.response === 1) {
    closeApproved = true;
    window.close();
    return;
  }
  window.webContents.send("app:before-close");
  armCloseFallback();
}

function sendMenuAction(action: AppCommandId): void {
  mainWindow?.webContents.send("menu:action", action);
}

function currentLocale(): AppLocale {
  return resolveAppLocale(userSettings.general.language, app.getLocale());
}

function mainText(japanese: string): string {
  return uiText(currentLocale(), japanese);
}

function commandMenuItem(id: AppCommandId, label?: string, includeAccelerator = true): MenuItemConstructorOptions {
  const definition = COMMAND_DEFINITIONS.find((item) => item.id === id)!;
  const accelerator = !includeAccelerator || keybindingRecording ? undefined : toElectronAccelerator(userSettings.keybindings[id]);
  return { label: label ?? commandLabel(definition, currentLocale()), click: () => sendMenuAction(id), ...(accelerator === undefined ? {} : { accelerator }) };
}

function installMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: mainText("ファイル"),
      submenu: [
        commandMenuItem("file.new"),
        commandMenuItem("file.open"),
        { type: "separator" },
        commandMenuItem("file.save"),
        commandMenuItem("history.checkpoint"),
        commandMenuItem("file.export"),
        commandMenuItem("file.exportText"),
        { type: "separator" },
        { role: process.platform === "darwin" ? "close" : "quit", label: mainText(process.platform === "darwin" ? "閉じる" : "終了") }
      ]
    },
    { label: mainText("編集"), submenu: [commandMenuItem("editor.find"), commandMenuItem("editor.replace"), { type: "separator" }, { label: mainText("小説向け入力"), submenu: [commandMenuItem("editor.ruby"), commandMenuItem("editor.emphasis"), commandMenuItem("editor.normalizePunctuation"), commandMenuItem("editor.indentedParagraph"), commandMenuItem("editor.japaneseQuotes"), commandMenuItem("editor.tateChuYoko")] }, { label: mainText("構成編集"), submenu: [commandMenuItem("editor.splitScene"), commandMenuItem("editor.mergePrevious")] }, { type: "separator" }, commandMenuItem("editor.undo"), commandMenuItem("editor.redo"), { type: "separator" }, { role: "cut", label: mainText("切り取り") }, { role: "copy", label: mainText("コピー") }, { role: "paste", label: mainText("貼り付け") }, { role: "selectAll", label: mainText("すべて選択") }] },
    { label: mainText("設定"), submenu: [commandMenuItem("view.settings", mainText("設定を開く…")), { type: "separator" }, commandMenuItem("view.settings.appearance"), commandMenuItem("view.settings.layout"), commandMenuItem("view.settings.editor"), commandMenuItem("view.settings.ai"), commandMenuItem("view.settings.accounts"), commandMenuItem("view.settings.keyboard"), commandMenuItem("view.settings.updates")] },
    { label: mainText("表示"), submenu: [commandMenuItem("workbench.commandPalette"), commandMenuItem("workbench.quickOpen"), { type: "separator" }, commandMenuItem("editor.splitRight"), commandMenuItem("editor.splitDown"), commandMenuItem("editor.closeGroup"), { label: mainText("エディター タブ"), submenu: [commandMenuItem("editor.moveTabLeft"), commandMenuItem("editor.moveTabRight"), commandMenuItem("editor.moveTabToOtherGroup")] }, { type: "separator" }, commandMenuItem("view.outline"), commandMenuItem("view.lens"), commandMenuItem("view.search"), commandMenuItem("view.history"), { type: "separator" }, commandMenuItem("view.zen"), commandMenuItem("layout.reset"), { type: "separator" }, { role: "togglefullscreen", label: mainText("全画面表示を切り替える") }, { role: "resetZoom", label: mainText("表示倍率をリセット") }, { role: "zoomIn", label: mainText("拡大") }, { role: "zoomOut", label: mainText("縮小") }] },
    { label: mainText("ヘルプ"), submenu: [commandMenuItem("updates.check"), { label: mainText("GitHub Releasesを開く"), click: () => { void openExternalPage("latest-release"); } }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow(): Promise<void> {
  closeApproved = false;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: workbenchBackgroundColor(),
    title: "KOHON",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../dist-preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.on("close", (event) => {
    if (closeApproved) return;
    event.preventDefault();
    mainWindow?.webContents.send("app:before-close");
    if (closeFallback === null) armCloseFallback();
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  await mainWindow.loadFile(join(__dirname, "../dist/index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (mainWindow !== null) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(async () => {
    app.setAppUserModelId("io.github.hum1tab.kohon");
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    const userData = app.getPath("userData");
    const appData = app.getPath("appData");
    await migrateLegacyUserData(userData, [join(appData, "Novel Lens"), join(appData, "novel-lens")]);
    settingsStore = new UserSettingsStore(join(userData, "settings.json"));
    userSettings = await settingsStore.load();
    nativeTheme.on("updated", () => { if (userSettings.appearance.colorTheme === "system") mainWindow?.setBackgroundColor(workbenchBackgroundColor()); });
    updateManager = new UpdateManager(app.getVersion(), process.platform, process.arch, (status) => mainWindow?.webContents.send("updates:status", status), join(app.getPath("temp"), "KOHON-updates"));
    await connections.initializeOpenAI(new SecureCredentialStore(join(userData, "openai-credential.bin")));
    connections.initializeCodex(app.getVersion(), join(app.getPath("temp"), "KOHON-Codex"));
    registerIpc();
    installMenu();
    await createWindow();
    if (app.isPackaged && userSettings.updates.checkOnStartup) setTimeout(() => { void updateManager?.check(); }, 3000);
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
  });
  app.on("before-quit", () => connections.clear());
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
