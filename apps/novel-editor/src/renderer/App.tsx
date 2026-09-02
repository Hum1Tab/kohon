import { getRole, ROLE_REGISTRY, textStats } from "@novel-lens/editor-core";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { isHexColor, resolveManuscriptPalette, type ManuscriptTheme } from "../shared/editor-theme.js";
import { closeEditorTab, defaultEditorSession, openEditorTab, updateEditorTabView, type EditorSessionState, type EditorTabState } from "../shared/editor-session.js";
import {
  defaultLayout,
  defaultUserSettings,
  EDITOR_SCROLL_MIN_HEIGHT,
  LAYOUT_LIMITS,
  moveSlotToSide,
  moveView,
  placeViewOnSide,
  sideOf,
  slotOf,
  VIEW_IDS,
  type LayoutPreferences,
  type PhysicalSide,
  type SlotId,
  type UserSettingsPatch,
  type ViewId
} from "../shared/settings.js";
import type {
  AppInfo,
  ChapterDocument,
  CheckpointEntry,
  CodexModelOption,
  ConnectionStatus,
  LensFinding,
  LensMessage,
  LensProviderId,
  LensRunResult,
  ProjectSettings,
  ProjectSummary,
  RecoveryDraftResult,
  RoleId,
  SearchHit,
  UpdateStatus
} from "../shared/types.js";
import { defaultChapterTitle } from "../shared/chapter-title.js";
import { SettingsView, type SettingsCategory } from "./SettingsView.js";
import { AppIcon } from "./AppIcon.js";

type SaveState = "saved" | "dirty" | "saving" | "error";
type ScopeMode = "current" | "through-current" | "all";

type DropTarget =
  | { kind: "slot-tab"; slot: SlotId; index: number }
  | { kind: "side-edge"; side: PhysicalSide }
  | { kind: "bottom-edge" }
  | { kind: "reject" };

interface DockDragState {
  view: ViewId;
  x: number;
  y: number;
  target: DropTarget;
}

interface ViewMenuState {
  view: ViewId;
  x: number;
  y: number;
}

const VIEW_LABELS: Record<ViewId, string> = {
  outline: "章・場面",
  lens: "編集レンズ",
  search: "作品内検索",
  history: "履歴"
};
const MANUSCRIPT_THEME_LABELS: Record<ManuscriptTheme, string> = { paper: "白い紙", sepia: "生成り", gray: "グレー", dark: "黒", custom: "カスタム" };

function applyDropTarget(layout: LayoutPreferences, view: ViewId, target: DropTarget): LayoutPreferences {
  if (target.kind === "reject") return layout;
  if (target.kind === "slot-tab") {
    const source = slotOf(layout, view);
    const sourceIndex = source === target.slot ? layout.slots[source].views.indexOf(view) : -1;
    const correctedIndex = sourceIndex >= 0 && sourceIndex < target.index ? target.index - 1 : target.index;
    return moveView(layout, view, target.slot, correctedIndex);
  }
  if (target.kind === "bottom-edge") return moveView(layout, view, "bottom");
  return placeViewOnSide(layout, view, target.side);
}

interface TextPromptRequest {
  id: number;
  title: string;
  label: string;
  initialValue: string;
  confirmLabel: string;
}

type TextPromptOptions = Omit<TextPromptRequest, "id">;

const ROLE_IDS = Object.keys(ROLE_REGISTRY) as RoleId[];
const DEFAULT_QUERY = "この範囲で、作者が見直す価値のある箇所を根拠付きで教えてください。";
const EMPTY_THREADS = (): Record<RoleId, LensMessage[]> => ({ "first-reader": [], editor: [], critic: [], consistency: [], setting: [] });
const DEFAULT_CONNECTIONS: ConnectionStatus = {
  codex: { installed: false, connected: false, state: "unavailable", message: "Codex実行環境をまだ確認していません。", email: null, planType: null, models: [], modelsUpdatedAt: null, usedPercent: null, resetsAt: null },
  openai: { connected: false, state: "disconnected", storage: "none", message: "OpenAI APIは未接続です。", verifiedAt: null },
  github: { cliInstalled: false, connected: false, state: "unavailable", message: "GitHub CLIの状態をまだ確認していません。" }
};

function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+': Error:\s*/u, "").slice(0, 500);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function settingNumber(settings: ProjectSettings, key: string, fallback: number): number {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function App(): ReactNode {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [userSettings, setUserSettings] = useState(defaultUserSettings);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>("general");
  const [connections, setConnections] = useState<ConnectionStatus>(DEFAULT_CONNECTIONS);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [editorSession, setEditorSession] = useState<EditorSessionState>(() => defaultEditorSession());
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [chapter, setChapter] = useState<ChapterDocument | null>(null);
  const [text, setText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [recoveryConflict, setRecoveryConflict] = useState<RecoveryDraftResult | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dockDrag, setDockDrag] = useState<DockDragState | null>(null);
  const [viewMenu, setViewMenu] = useState<ViewMenuState | null>(null);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [layoutAnnouncement, setLayoutAnnouncement] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointEntry[]>([]);
  const [role, setRole] = useState<RoleId>("first-reader");
  const [provider, setProvider] = useState<LensProviderId>("mock");
  const [modelId, setModelId] = useState("gpt-5.6-luna");
  const [lensQuery, setLensQuery] = useState(DEFAULT_QUERY);
  const [scopeMode, setScopeMode] = useState<ScopeMode>("through-current");
  const [scopeApproved, setScopeApproved] = useState(false);
  const [threads, setThreads] = useState<Record<RoleId, LensMessage[]>>(EMPTY_THREADS);
  const [lensResult, setLensResult] = useState<LensRunResult | null>(null);
  const [lensBusy, setLensBusy] = useState(false);
  const [textPrompt, setTextPrompt] = useState<TextPromptRequest | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef("");
  const savedVersionRef = useRef("");
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const queuedSaveRef = useRef<{ root: string; chapterId: string; text: string } | null>(null);
  const sessionHydratedRootRef = useRef<string | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const viewMenuOriginRef = useRef<HTMLElement | null>(null);
  const dockSessionRef = useRef<DockDragState | null>(null);
  const suppressDockClickRef = useRef(false);
  const promptResolverRef = useRef<((value: string | null) => void) | null>(null);
  const promptSequenceRef = useRef(0);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (query === undefined) return;
    const onChange = (event: MediaQueryListEvent): void => setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const onResize = (): void => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const pointerMode = (): void => document.body.classList.add("input-pointer");
    const keyboardMode = (event: KeyboardEvent): void => {
      if (event.key === "Tab" || event.key.startsWith("Arrow")) document.body.classList.remove("input-pointer");
    };
    window.addEventListener("pointerdown", pointerMode, true);
    window.addEventListener("keydown", keyboardMode, true);
    return () => {
      window.removeEventListener("pointerdown", pointerMode, true);
      window.removeEventListener("keydown", keyboardMode, true);
      document.body.classList.remove("input-pointer");
    };
  }, []);

  useEffect(() => {
    if (viewMenu === null) {
      viewMenuOriginRef.current?.focus();
      viewMenuOriginRef.current = null;
      return;
    }
    window.requestAnimationFrame(() => viewMenuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"], button[role="menuitemcheckbox"]')?.focus());
    const closeOutside = (event: PointerEvent): void => {
      if (!(event.target instanceof Element) || event.target.closest(".view-context-menu") === null) setViewMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent): void => { if (event.key === "Escape") setViewMenu(null); };
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [viewMenu]);

  useEffect(() => {
    if (!layoutMenuOpen) return;
    const closeOutside = (event: PointerEvent): void => {
      if (!(event.target instanceof Element) || event.target.closest(".layout-menu-anchor") === null) setLayoutMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => { if (event.key === "Escape") setLayoutMenuOpen(false); };
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [layoutMenuOpen]);

  const requestText = useCallback((options: TextPromptOptions): Promise<string | null> => {
    promptResolverRef.current?.(null);
    promptSequenceRef.current += 1;
    setTextPrompt({ id: promptSequenceRef.current, ...options });
    return new Promise((resolve) => { promptResolverRef.current = resolve; });
  }, []);

  const finishTextPrompt = useCallback((value: string | null): void => {
    const resolvePrompt = promptResolverRef.current;
    promptResolverRef.current = null;
    setTextPrompt(null);
    resolvePrompt?.(value);
  }, []);

  useEffect(() => () => {
    promptResolverRef.current?.(null);
    promptResolverRef.current = null;
  }, []);

  useEffect(() => {
    void window.novelLens.appInfo().then(setAppInfo).catch(() => undefined);
    void window.novelLens.connectionStatus().then(setConnections).catch(() => undefined);
    void window.novelLens.getUserSettings().then((loaded) => {
      setUserSettings(loaded);
      setProvider(loaded.ai.defaultProvider);
      setModelId(loaded.ai.defaultProvider === "openai" ? loaded.ai.openaiModel : loaded.ai.codexModel);
    }).catch(() => undefined);
    const removeUpdateListener = window.novelLens.onUpdateStatus(setUpdateStatus);
    const removeConnectionListener = window.novelLens.onConnectionStatus(setConnections);
    return () => { removeUpdateListener(); removeConnectionListener(); };
  }, []);

  useEffect(() => {
    if (provider !== "codex" || connections.codex.models.length === 0) return;
    if (connections.codex.models.some((model) => model.id === modelId)) return;
    const fallback = connections.codex.models.find((model) => model.id === "gpt-5.6-luna") ?? connections.codex.models.find((model) => model.isDefault) ?? connections.codex.models[0];
    if (fallback === undefined) return;
    setModelId(fallback.id);
    void window.novelLens.updateUserSettings({ ai: { codexModel: fallback.id } }).then(setUserSettings).catch(() => undefined);
  }, [connections.codex.models, modelId, provider]);

  const manifestChapters = useMemo(() => [...(project?.manifest.chapters ?? [])].sort((a, b) => a.order - b.order), [project]);
  const activeIndex = manifestChapters.findIndex((item) => item.id === activeChapterId);
  const settings = project?.manifest.settings ?? {};
  const writingMode = settings.writingMode ?? userSettings.editor.writingMode;
  const editorFont = settings.font ?? userSettings.editor.font;
  const editorWidth = settingNumber(settings, "width", userSettings.editor.width);
  const editorLineHeight = settingNumber(settings, "lineHeight", userSettings.editor.lineHeight);
  const editorFontSize = settingNumber(settings, "fontSize", userSettings.editor.fontSize);
  const theme: ManuscriptTheme = settings["theme"] === "custom" || settings["theme"] === "gray" || settings["theme"] === "dark" || settings["theme"] === "sepia" || settings["theme"] === "paper" ? settings["theme"] : userSettings.editor.theme;
  const canvasBackground = isHexColor(settings["canvasBackground"]) ? settings["canvasBackground"] : userSettings.editor.canvasBackground;
  const canvasText = settings["canvasText"] === null || isHexColor(settings["canvasText"]) ? settings["canvasText"] : userSettings.editor.canvasText;
  const manuscriptPalette = resolveManuscriptPalette(theme, canvasBackground, canvasText);
  const stats = useMemo(() => textStats(text), [text]);
  const colorTheme = userSettings.appearance.colorTheme === "system" ? (systemDark ? "dark" : "default") : userSettings.appearance.colorTheme;
  const shellClass = `app-shell ui-${colorTheme} accent-${userSettings.appearance.accent} density-${userSettings.appearance.density}`;

  useEffect(() => {
    if (writingMode !== "vertical-rl") return;
    const frame = window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (editor === null) return;
      editor.scrollLeft = editor.scrollWidth;
      if (editor.parentElement !== null) editor.parentElement.scrollLeft = editor.parentElement.scrollWidth;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeChapterId, editorWidth, viewport.width, writingMode]);

  const scopeChapters = useMemo(() => {
    if (activeIndex < 0) return [];
    if (scopeMode === "current") return [manifestChapters[activeIndex]!];
    if (scopeMode === "through-current") return manifestChapters.slice(0, activeIndex + 1);
    return manifestChapters;
  }, [activeIndex, manifestChapters, scopeMode]);

  useEffect(() => { setScopeApproved(false); }, [role, scopeMode, activeChapterId, project?.root]);

  useEffect(() => { textRef.current = text; }, [text]);

  useEffect(() => {
    if (project === null || sessionHydratedRootRef.current !== project.root) return;
    const timer = window.setTimeout(() => {
      void window.novelLens.writeEditorSession(project.root, editorSession).catch((cause) => setError(errorText(cause)));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [editorSession, project]);

  const clearMessages = useCallback(() => { setError(null); setNotice(null); }, []);

  const captureEditorView = useCallback((sessionState: EditorSessionState = editorSession): EditorSessionState => {
    if (activeChapterId === null) return sessionState;
    const editor = editorRef.current;
    if (editor === null) return sessionState;
    return updateEditorTabView(sessionState, sessionState.activeGroupId, activeChapterId, {
      selectionStart: editor.selectionStart,
      selectionEnd: editor.selectionEnd,
      scrollTop: editor.scrollTop,
      scrollLeft: editor.scrollLeft
    });
  }, [activeChapterId, editorSession]);

  const currentDraftInput = useCallback((chapterId: string, value: string, baseVersion: string) => {
    const editor = editorRef.current;
    return {
      chapterId,
      text: value,
      baseVersion,
      selectionStart: editor?.selectionStart ?? 0,
      selectionEnd: editor?.selectionEnd ?? 0,
      scrollTop: editor?.scrollTop ?? 0,
      scrollLeft: editor?.scrollLeft ?? 0
    };
  }, []);

  const saveNow = useCallback(async (): Promise<void> => {
    if (project === null || activeChapterId === null || text === savedText) return;
    const snapshot = { root: project.root, chapterId: activeChapterId, text };
    const queued = queuedSaveRef.current;
    if (queued !== null && queued.root === snapshot.root && queued.chapterId === snapshot.chapterId && queued.text === snapshot.text) return saveQueueRef.current;
    queuedSaveRef.current = snapshot;
    setSaveState("saving");
    const operation = saveQueueRef.current.catch(() => undefined).then(async () => {
      try {
        const result = await window.novelLens.saveChapter(snapshot.root, snapshot.chapterId, snapshot.text);
        savedVersionRef.current = result.version;
        setSavedText(snapshot.text);
        if (textRef.current === snapshot.text) {
          await window.novelLens.clearRecoveryDraft(snapshot.root, snapshot.chapterId);
          setSaveState("saved");
        } else {
          await window.novelLens.writeRecoveryDraft(snapshot.root, currentDraftInput(snapshot.chapterId, textRef.current, result.version));
          setSaveState("dirty");
        }
      } catch (cause) {
        setSaveState("error");
        setError(errorText(cause));
        throw cause;
      } finally {
        if (queuedSaveRef.current === snapshot) queuedSaveRef.current = null;
      }
    });
    saveQueueRef.current = operation;
    return operation;
  }, [activeChapterId, currentDraftInput, project, savedText, text]);

  useEffect(() => {
    if (text === savedText) { if (saveState !== "saving") setSaveState("saved"); return; }
    setSaveState("dirty");
    if (isComposing || project === null || activeChapterId === null || recoveryConflict?.draft.chapterId === activeChapterId) return;
    const timer = window.setTimeout(() => { void saveNow(); }, userSettings.general.autoSaveDelayMs);
    return () => window.clearTimeout(timer);
  }, [activeChapterId, isComposing, project, recoveryConflict, saveNow, saveState, savedText, text, userSettings.general.autoSaveDelayMs]);

  useEffect(() => {
    if (project === null || activeChapterId === null || text === savedText || savedVersionRef.current.length === 0 || isComposing || recoveryConflict?.draft.chapterId === activeChapterId) return;
    const timer = window.setTimeout(() => {
      void window.novelLens.writeRecoveryDraft(project.root, currentDraftInput(activeChapterId, text, savedVersionRef.current)).catch((cause) => setError(errorText(cause)));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [activeChapterId, currentDraftInput, isComposing, project, recoveryConflict, savedText, text]);

  const focusRange = useCallback((start: number, end: number): void => {
    window.setTimeout(() => {
      const editor = editorRef.current;
      if (editor === null) return;
      editor.focus();
      editor.setSelectionRange(start, end);
    }, 60);
  }, []);

  const restoreEditorView = useCallback((view: EditorTabState | undefined): void => {
    if (view === undefined) return;
    window.setTimeout(() => {
      const editor = editorRef.current;
      if (editor === null) return;
      const start = Math.min(view.selectionStart, editor.value.length);
      const end = Math.min(Math.max(start, view.selectionEnd), editor.value.length);
      editor.setSelectionRange(start, end);
      editor.scrollTop = view.scrollTop;
      editor.scrollLeft = view.scrollLeft;
    }, 60);
  }, []);

  const displayChapter = useCallback(async (root: string, next: ChapterDocument, view?: EditorTabState, range?: { start: number; end: number }): Promise<void> => {
    let recovery: RecoveryDraftResult | null = null;
    try { recovery = await window.novelLens.readRecoveryDraft(root, next.chapter.id); }
    catch (cause) { setError(errorText(cause)); }
    const recovered = recovery !== null && !recovery.conflict;
    const displayedText = recovery !== null && !recovery.conflict ? recovery.draft.text : next.text;
    savedVersionRef.current = next.version;
    textRef.current = displayedText;
    setActiveChapterId(next.chapter.id);
    setChapter(next);
    setText(displayedText);
    setSavedText(next.text);
    setRecoveryConflict(recovery?.conflict ? recovery : null);
    setSaveState(recovered ? "dirty" : "saved");
    if (recovered) setNotice(`「${next.chapter.title}」の未保存内容を復旧しました。`);
    else if (recovery?.conflict) setNotice(`「${next.chapter.title}」に保存内容と競合する復旧ドラフトがあります。`);
    if (range !== undefined) focusRange(range.start, range.end);
    else restoreEditorView(recovered ? recovery?.draft : view);
  }, [focusRange, restoreEditorView]);

  const loadChapter = useCallback(async (chapterId: string, range?: { start: number; end: number }): Promise<void> => {
    if (project === null) return;
    await saveNow();
    clearMessages();
    setBusy(true);
    try {
      const nextSession = openEditorTab(captureEditorView(), chapterId);
      const next = await window.novelLens.readChapter(project.root, chapterId);
      setEditorSession(nextSession);
      const group = nextSession.groups.find((item) => item.id === nextSession.activeGroupId);
      await displayChapter(project.root, next, group?.tabs.find((item) => item.chapterId === chapterId), range);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }, [captureEditorView, clearMessages, displayChapter, project, saveNow]);

  const adoptProject = useCallback(async (next: ProjectSummary | null): Promise<void> => {
    if (next === null) return;
    const restoredSession = await window.novelLens.readEditorSession(next.root);
    sessionHydratedRootRef.current = next.root;
    setProject(next);
    setEditorSession(restoredSession);
    setThreads(EMPTY_THREADS());
    setLensResult(null);
    setSearchHits([]);
    setCheckpoints([]);
    setError(null);
    setNotice(`「${next.manifest.title}」を開きました。`);
    const first = [...next.manifest.chapters].sort((a, b) => a.order - b.order)[0];
    if (first === undefined) {
      savedVersionRef.current = ""; textRef.current = ""; setRecoveryConflict(null);
      setActiveChapterId(null); setChapter(null); setText(""); setSavedText("");
      return;
    }
    const activeGroup = restoredSession.groups.find((group) => group.id === restoredSession.activeGroupId) ?? restoredSession.groups[0];
    const activeId = activeGroup?.activeChapterId ?? first.id;
    const loaded = await window.novelLens.readChapter(next.root, activeId);
    await displayChapter(next.root, loaded, activeGroup?.tabs.find((item) => item.chapterId === activeId));
  }, [displayChapter]);

  const recordEditorView = useCallback((): void => {
    setEditorSession((current) => captureEditorView(current));
  }, [captureEditorView]);

  const closeChapterTab = useCallback(async (chapterId: string): Promise<void> => {
    if (project === null) return;
    const captured = captureEditorView();
    const groupId = captured.activeGroupId;
    const group = captured.groups.find((item) => item.id === groupId);
    const wasActive = activeChapterId === chapterId;
    if (wasActive) await saveNow();
    const nextSession = closeEditorTab(captured, groupId, chapterId);
    setEditorSession(nextSession);
    if (!wasActive) return;
    const nextId = nextSession.groups.find((item) => item.id === groupId)?.activeChapterId ?? null;
    if (nextId === null) {
      savedVersionRef.current = "";
      textRef.current = "";
      setActiveChapterId(null);
      setChapter(null);
      setText("");
      setSavedText("");
      setRecoveryConflict(null);
      setSaveState("saved");
      return;
    }
    const loaded = await window.novelLens.readChapter(project.root, nextId);
    const nextView = nextSession.groups.find((item) => item.id === groupId)?.tabs.find((item) => item.chapterId === nextId);
    await displayChapter(project.root, loaded, nextView);
  }, [activeChapterId, captureEditorView, displayChapter, project, saveNow]);

  const useRecoveryDraft = useCallback((): void => {
    if (recoveryConflict === null) return;
    const draft = recoveryConflict.draft;
    savedVersionRef.current = recoveryConflict.canonicalVersion;
    textRef.current = draft.text;
    setText(draft.text);
    setRecoveryConflict(null);
    setSaveState("dirty");
    restoreEditorView(draft);
    setNotice("復旧ドラフトを本文へ戻しました。自動保存します。");
  }, [recoveryConflict, restoreEditorView]);

  const discardRecoveryDraft = useCallback(async (): Promise<void> => {
    if (project === null || recoveryConflict === null) return;
    try {
      await window.novelLens.clearRecoveryDraft(project.root, recoveryConflict.draft.chapterId);
      setRecoveryConflict(null);
      setNotice("復旧ドラフトを破棄し、現在の保存内容を維持しました。");
    } catch (cause) { setError(errorText(cause)); }
  }, [project, recoveryConflict]);

  const createProject = useCallback(async (): Promise<void> => {
    const title = await requestText({
      title: "新しい作品を作る",
      label: "作品名",
      initialValue: "新しい小説",
      confirmLabel: "保存場所を選ぶ"
    });
    if (title === null || title.trim().length === 0) return;
    await saveNow(); clearMessages(); setBusy(true);
    try { await adoptProject(await window.novelLens.createProject(title.trim())); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }, [adoptProject, clearMessages, requestText, saveNow]);

  const openProject = useCallback(async (): Promise<void> => {
    await saveNow(); clearMessages(); setBusy(true);
    try { await adoptProject(await window.novelLens.openProject()); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }, [adoptProject, clearMessages, saveNow]);

  const exportProject = useCallback(async (): Promise<void> => {
    if (project === null) return;
    try { await saveNow(); const path = await window.novelLens.exportMarkdown(project.root); if (path !== null) setNotice(`Markdownを書き出しました: ${path}`); }
    catch (cause) { setError(errorText(cause)); }
  }, [project, saveNow]);

  const refreshProject = useCallback(async (): Promise<ProjectSummary | null> => {
    if (project === null) return null;
    const refreshed = await window.novelLens.refreshProject(project.root);
    setProject(refreshed);
    return refreshed;
  }, [project]);

  const addChapter = useCallback(async (): Promise<void> => {
    if (project === null) return;
    const title = await requestText({
      title: "章・場面を追加",
      label: "タイトル",
      initialValue: defaultChapterTitle(manifestChapters.length + 1),
      confirmLabel: "追加する"
    });
    if (title === null || title.trim().length === 0) return;
    try { await saveNow(); const created = await window.novelLens.createChapter(project.root, title.trim()); await refreshProject(); await loadChapter(created.id); }
    catch (cause) { setError(errorText(cause)); }
  }, [loadChapter, manifestChapters.length, project, refreshProject, requestText, saveNow]);

  const importDocuments = useCallback(async (): Promise<void> => {
    if (project === null) return;
    try {
      await saveNow();
      const imported = await window.novelLens.importDocuments(project.root);
      if (imported === null) return;
      setProject(imported.project);
      const firstId = imported.importedChapterIds[0];
      if (firstId !== undefined) await loadChapter(firstId);
      setNotice(`${imported.importedChapterIds.length}件のファイルを取り込みました。`);
    } catch (cause) { setError(errorText(cause)); }
  }, [loadChapter, project, saveNow]);

  const moveChapter = useCallback(async (delta: -1 | 1): Promise<void> => {
    if (project === null || activeIndex < 0) return;
    const destination = activeIndex + delta;
    if (destination < 0 || destination >= manifestChapters.length) return;
    const ids = manifestChapters.map((item) => item.id);
    const current = ids[activeIndex]!;
    ids[activeIndex] = ids[destination]!;
    ids[destination] = current;
    try { setProject(await window.novelLens.reorderChapters(project.root, ids)); }
    catch (cause) { setError(errorText(cause)); }
  }, [activeIndex, manifestChapters, project]);

  const renameProject = useCallback(async (): Promise<void> => {
    if (project === null) return;
    const title = await requestText({
      title: "作品名を変更",
      label: "作品名",
      initialValue: project.manifest.title,
      confirmLabel: "変更する"
    });
    if (title === null || title.trim().length === 0 || title.trim() === project.manifest.title) return;
    try { setProject(await window.novelLens.renameProject(project.root, title.trim())); }
    catch (cause) { setError(errorText(cause)); }
  }, [project, requestText]);

  const renameChapter = useCallback(async (): Promise<void> => {
    if (project === null || chapter === null) return;
    const title = await requestText({
      title: "章・場面の名前を変更",
      label: "タイトル",
      initialValue: chapter.chapter.title,
      confirmLabel: "変更する"
    });
    if (title === null || title.trim().length === 0 || title.trim() === chapter.chapter.title) return;
    try { await window.novelLens.renameChapter(project.root, chapter.chapter.id, title.trim()); const refreshed = await refreshProject(); const found = refreshed?.manifest.chapters.find((item) => item.id === chapter.chapter.id); if (found !== undefined) setChapter({ ...chapter, chapter: found }); }
    catch (cause) { setError(errorText(cause)); }
  }, [chapter, project, refreshProject, requestText]);

  const deleteChapter = useCallback(async (): Promise<void> => {
    if (project === null || chapter === null) return;
    if (manifestChapters.length <= 1) { setError("作品には少なくとも1つの章・場面が必要です。"); return; }
    if (!window.confirm(`「${chapter.chapter.title}」を削除します。直前に保存点を作成します。よろしいですか？`)) return;
    try {
      await saveNow();
      await window.novelLens.createCheckpoint(project.root, `「${chapter.chapter.title}」削除前`);
      const oldIndex = activeIndex;
      await window.novelLens.deleteChapter(project.root, chapter.chapter.id);
      const refreshed = await refreshProject();
      const next = refreshed?.manifest.chapters[Math.max(0, Math.min(oldIndex, (refreshed?.manifest.chapters.length ?? 1) - 1))];
      if (next !== undefined) {
        const restoredSession = openEditorTab(await window.novelLens.readEditorSession(project.root), next.id);
        setEditorSession(restoredSession);
        const loaded = await window.novelLens.readChapter(project.root, next.id);
        await displayChapter(project.root, loaded, restoredSession.groups[0]?.tabs.find((item) => item.chapterId === next.id));
      }
    } catch (cause) { setError(errorText(cause)); }
  }, [activeIndex, chapter, displayChapter, manifestChapters.length, project, refreshProject, saveNow]);

  const runSearch = useCallback(async (): Promise<void> => {
    if (project === null || searchQuery.trim().length === 0) { setSearchHits([]); return; }
    try { await saveNow(); setSearchHits(await window.novelLens.search(project.root, searchQuery.trim())); }
    catch (cause) { setError(errorText(cause)); }
  }, [project, saveNow, searchQuery]);

  const loadCheckpoints = useCallback(async (): Promise<void> => {
    if (project === null) return;
    try { setCheckpoints(await window.novelLens.listCheckpoints(project.root)); }
    catch (cause) { setError(errorText(cause)); }
  }, [project]);

  useEffect(() => {
    const historySlot = slotOf(userSettings.layout, "history");
    if (historySlot !== null && !userSettings.layout.zenMode && userSettings.layout.slots[historySlot].visible && userSettings.layout.slots[historySlot].activeView === "history") void loadCheckpoints();
  }, [loadCheckpoints, userSettings.layout]);

  const createCheckpoint = useCallback(async (): Promise<void> => {
    if (project === null) return;
    const subject = await requestText({
      title: "保存点を作る",
      label: "保存点の名前",
      initialValue: "ここまでの改稿",
      confirmLabel: "保存点を作る"
    });
    if (subject === null || subject.trim().length === 0) return;
    try { await saveNow(); await window.novelLens.createCheckpoint(project.root, subject.trim()); await loadCheckpoints(); setNotice("保存点を作成しました。"); }
    catch (cause) { setError(errorText(cause)); }
  }, [loadCheckpoints, project, requestText, saveNow]);

  const restoreCheckpoint = useCallback(async (entry: CheckpointEntry): Promise<void> => {
    if (project === null || !window.confirm(`保存点「${entry.subject}」へ戻します。現在の状態は復元前の保存点として残します。`)) return;
    try {
      await saveNow();
      const restored = await window.novelLens.restoreCheckpoint(project.root, entry.commit);
      setProject(restored);
      const desired = restored.manifest.chapters.find((item) => item.id === activeChapterId) ?? restored.manifest.chapters[0];
      if (desired !== undefined) {
        const restoredSession = openEditorTab(await window.novelLens.readEditorSession(restored.root), desired.id);
        setEditorSession(restoredSession);
        const loaded = await window.novelLens.readChapter(restored.root, desired.id);
        await displayChapter(restored.root, loaded, restoredSession.groups[0]?.tabs.find((item) => item.chapterId === desired.id));
      }
      await loadCheckpoints();
      setNotice("保存点から復元しました。");
    } catch (cause) { setError(errorText(cause)); }
  }, [activeChapterId, displayChapter, loadCheckpoints, project, saveNow]);

  const createVariation = useCallback(async (): Promise<void> => {
    if (project === null) return;
    try { await saveNow(); const path = await window.novelLens.createVariation(project.root); if (path !== null) setNotice(`別案を作成しました: ${path}`); }
    catch (cause) { setError(errorText(cause)); }
  }, [project, saveNow]);

  const updateProjectSettings = useCallback(async (patch: ProjectSettings): Promise<void> => {
    if (project === null) return;
    try { setProject(await window.novelLens.updateSettings(project.root, patch)); }
    catch (cause) { setError(errorText(cause)); }
  }, [project]);

  const resetProjectSetting = useCallback(async (key: "writingMode" | "theme" | "canvasBackground" | "canvasText" | "font" | "fontSize" | "lineHeight" | "width"): Promise<void> => {
    if (project === null) return;
    try { setProject(await window.novelLens.resetProjectSetting(project.root, key)); }
    catch (cause) { setError(errorText(cause)); throw cause; }
  }, [project]);

  const updateUserSettings = useCallback(async (patch: UserSettingsPatch): Promise<void> => {
    try {
      const next = await window.novelLens.updateUserSettings(patch);
      setUserSettings(next);
      if (patch.ai?.defaultProvider !== undefined) setProvider(next.ai.defaultProvider);
      if (patch.ai?.codexModel !== undefined) setModelId(next.ai.codexModel);
      else if (patch.ai?.openaiModel !== undefined) setModelId(next.ai.openaiModel);
    } catch (cause) { setError(errorText(cause)); throw cause; }
  }, []);

  const toggleColorTheme = useCallback((): void => {
    void updateUserSettings({ appearance: { colorTheme: colorTheme === "dark" ? "default" : "dark" } });
  }, [colorTheme, updateUserSettings]);

  const commitLayout = useCallback((layout: LayoutPreferences, announcement?: string): void => {
    void updateUserSettings({ layout });
    if (announcement !== undefined) setLayoutAnnouncement(announcement);
  }, [updateUserSettings]);

  const revealView = useCallback((view: ViewId): void => {
    setSettingsOpen(false);
    const slot = slotOf(userSettings.layout, view);
    if (slot === null) return;
    commitLayout({
      ...userSettings.layout,
      zenMode: false,
      slots: {
        ...userSettings.layout.slots,
        [slot]: { ...userSettings.layout.slots[slot], visible: true, activeView: view }
      }
    });
  }, [commitLayout, userSettings.layout]);

  const toggleView = useCallback((view: ViewId): void => {
    const slot = slotOf(userSettings.layout, view);
    if (slot === null) return;
    const slotState = userSettings.layout.slots[slot];
    if (userSettings.layout.zenMode || !slotState.visible || slotState.activeView !== view) {
      revealView(view);
      return;
    }
    commitLayout({
      ...userSettings.layout,
      slots: { ...userSettings.layout.slots, [slot]: { ...slotState, visible: false } }
    });
  }, [commitLayout, revealView, userSettings.layout]);

  const beginPaneResize = useCallback((slot: SlotId, event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const owner = event.currentTarget;
    const pointerId = event.pointerId;
    const layout = userSettings.layout;
    const startX = event.clientX;
    const startY = event.clientY;
    const startValue = layout.slots[slot].size;
    let latest = startValue;
    let finished = false;
    const onMove = (moveEvent: PointerEvent): void => {
      if (slot === "bottom") latest = Math.max(LAYOUT_LIMITS.bottom.min, Math.min(LAYOUT_LIMITS.bottom.max, startValue - (moveEvent.clientY - startY)));
      else {
        const direction = sideOf(slot, layout) === "left" ? 1 : -1;
        const limits = LAYOUT_LIMITS[slot];
        latest = Math.max(limits.min, Math.min(limits.max, startValue + (moveEvent.clientX - startX) * direction));
      }
      setUserSettings((current) => ({
        ...current,
        layout: {
          ...current.layout,
          slots: { ...current.layout.slots, [slot]: { ...current.layout.slots[slot], size: latest } }
        }
      }));
    };
    const finish = (commit: boolean): void => {
      if (finished) return;
      finished = true;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
      owner.removeEventListener("lostpointercapture", onLostCapture);
      document.body.classList.remove("is-resizing");
      if (owner.hasPointerCapture?.(pointerId)) owner.releasePointerCapture(pointerId);
      if (commit) void updateUserSettings({ layout: { slots: { [slot]: { size: latest } } } });
      else setUserSettings((current) => ({ ...current, layout: { ...current.layout, slots: { ...current.layout.slots, [slot]: { ...current.layout.slots[slot], size: startValue } } } }));
    };
    const onUp = (): void => finish(true);
    const onCancel = (): void => finish(false);
    const onLostCapture = (): void => finish(false);
    document.body.classList.remove("is-docking");
    document.body.classList.add("is-resizing");
    try { owner.setPointerCapture(pointerId); } catch { /* window listeners remain the fallback */ }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);
    owner.addEventListener("lostpointercapture", onLostCapture);
  }, [updateUserSettings, userSettings.layout]);

  const detectDropTarget = useCallback((x: number, y: number): DropTarget => {
    const element = document.elementFromPoint(x, y) as HTMLElement | null;
    const exactTab = element?.closest<HTMLElement>("[data-view-tab]");
    if (exactTab !== null && exactTab !== undefined) {
      const slotElement = exactTab.closest<HTMLElement>("[data-slot-id]");
      if (slotElement !== null) {
        const slot = slotElement.dataset["slotId"] as SlotId;
        const tabs = [...slotElement.querySelectorAll<HTMLElement>("[data-view-tab]")];
        const index = tabs.filter((tab) => x > tab.getBoundingClientRect().left + tab.getBoundingClientRect().width / 2).length;
        return { kind: "slot-tab", slot, index };
      }
    }
    const workspace = workspaceRef.current?.getBoundingClientRect();
    if (workspace === undefined) return { kind: "reject" };
    if (x <= workspace.left + 92) return { kind: "side-edge", side: "left" };
    if (x >= workspace.right - 92) return { kind: "side-edge", side: "right" };
    const slotElement = element?.closest<HTMLElement>("[data-slot-id]");
    if (slotElement !== null && slotElement !== undefined) {
      const slot = slotElement.dataset["slotId"] as SlotId;
      const tabs = [...slotElement.querySelectorAll<HTMLElement>("[data-view-tab]")];
      const index = tabs.filter((tab) => x > tab.getBoundingClientRect().left + tab.getBoundingClientRect().width / 2).length;
      return { kind: "slot-tab", slot, index };
    }
    const editor = workspaceRef.current?.querySelector<HTMLElement>("[data-editor-pane]")?.getBoundingClientRect();
    if (editor !== undefined && x >= editor.left && x <= editor.right && y >= workspace.bottom - 76) return { kind: "bottom-edge" };
    return { kind: "reject" };
  }, []);

  const beginDockDrag = useCallback((view: ViewId, event: ReactPointerEvent<HTMLElement>): void => {
    if (isComposing || event.button !== 0) return;
    const owner = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let started = false;
    let finished = false;
    const onMove = (moveEvent: PointerEvent): void => {
      if (!started && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 6) return;
      if (!started) {
        started = true;
        suppressDockClickRef.current = true;
        document.body.classList.remove("is-resizing");
        document.body.classList.add("is-docking");
      }
      const next: DockDragState = { view, x: moveEvent.clientX, y: moveEvent.clientY, target: detectDropTarget(moveEvent.clientX, moveEvent.clientY) };
      dockSessionRef.current = next;
      setDockDrag(next);
    };
    const finish = (apply: boolean): void => {
      if (finished) return;
      finished = true;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
      owner.removeEventListener("lostpointercapture", onLostCapture);
      document.body.classList.remove("is-docking");
      if (owner.hasPointerCapture?.(pointerId)) owner.releasePointerCapture(pointerId);
      const session = dockSessionRef.current;
      dockSessionRef.current = null;
      setDockDrag(null);
      if (apply && session !== null && session.target.kind !== "reject") {
        const next = applyDropTarget(userSettings.layout, session.view, session.target);
        commitLayout(next, `${VIEW_LABELS[session.view]}を移動しました`);
      }
      if (started) window.setTimeout(() => { suppressDockClickRef.current = false; }, 0);
    };
    const onUp = (): void => finish(true);
    const onCancel = (): void => finish(false);
    const onLostCapture = (): void => finish(false);
    try { owner.setPointerCapture(pointerId); } catch { /* window listeners remain the fallback */ }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);
    owner.addEventListener("lostpointercapture", onLostCapture);
  }, [commitLayout, detectDropTarget, isComposing, userSettings.layout]);

  const openViewMenu = useCallback((view: ViewId, x: number, y: number): void => {
    setViewMenu({ view, x: Math.min(x, window.innerWidth - 220), y: Math.min(y, window.innerHeight - 270) });
  }, []);

  const handleViewMenuKey = useCallback((view: ViewId, event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      viewMenuOriginRef.current = event.currentTarget;
      const rect = event.currentTarget.getBoundingClientRect();
      openViewMenu(view, rect.left + 12, rect.bottom + 4);
    }
  }, [openViewMenu]);

  const openSettings = useCallback((category: SettingsCategory = "general"): void => {
    setSettingsCategory(category);
    setSettingsOpen(true);
  }, []);

  const refreshConnections = useCallback(async (): Promise<void> => {
    try { setConnections(await window.novelLens.connectionStatus()); }
    catch (cause) { setError(errorText(cause)); }
  }, []);

  const connectOpenAI = useCallback(async (key: string): Promise<void> => {
    try { setConnections(await window.novelLens.connectOpenAI(key)); }
    catch (cause) { await refreshConnections(); throw cause; }
  }, [refreshConnections]);

  const disconnectOpenAI = useCallback(async (): Promise<void> => {
    setConnections(await window.novelLens.disconnectOpenAI());
  }, []);

  const loginCodex = useCallback(async (): Promise<void> => {
    try { setConnections(await window.novelLens.loginCodex()); }
    catch (cause) { await refreshConnections(); throw cause; }
  }, [refreshConnections]);

  const logoutCodex = useCallback(async (): Promise<void> => {
    setConnections(await window.novelLens.logoutCodex());
  }, []);

  const refreshCodexModels = useCallback(async (): Promise<void> => {
    setConnections(await window.novelLens.refreshCodexModels());
  }, []);

  const loginGitHub = useCallback(async (): Promise<void> => {
    try { setConnections(await window.novelLens.loginGitHub()); }
    catch (cause) { await refreshConnections(); throw cause; }
  }, [refreshConnections]);

  const checkUpdates = useCallback(async (): Promise<void> => {
    setUpdateStatus(await window.novelLens.checkForUpdates());
  }, []);

  const resetKeybindings = useCallback(async (): Promise<void> => {
    setUserSettings(await window.novelLens.resetKeybindings());
  }, []);

  const openExternalPage = useCallback(async (page: "chatgpt" | "openai-api-keys" | "github-cli" | "github-applications" | "latest-release"): Promise<void> => {
    try { await window.novelLens.openExternalPage(page); }
    catch (cause) { setError(errorText(cause)); }
  }, []);

  const installUpdate = useCallback(async (): Promise<void> => {
    try {
      await saveNow();
      setUpdateStatus(await window.novelLens.installUpdate());
    }
    catch (cause) { setError(errorText(cause)); }
  }, [saveNow]);

  const openUpdatePage = useCallback(async (): Promise<void> => {
    try { await window.novelLens.openUpdatePage(); }
    catch (cause) { setError(errorText(cause)); }
  }, []);

  const invokeLens = useCallback(async (): Promise<void> => {
    if (project === null || scopeChapters.length === 0 || !scopeApproved) return;
    const query = lensQuery.trim();
    if (query.length === 0) return;
    setLensBusy(true); setError(null); setNotice(null);
    try {
      await saveNow();
      const inputs = await Promise.all(scopeChapters.map(async (item) => ({ id: item.id, title: item.title, order: item.order, text: (await window.novelLens.readChapter(project.root, item.id)).text })));
      const userMessage: LensMessage = { sender: "author", text: query, createdAt: new Date().toISOString() };
      const conversation = [...threads[role], userMessage];
      const result = await window.novelLens.runLens({ role, query, chapters: inputs, provider, modelId: provider === "mock" ? "offline-mock-v0.1" : modelId, conversation });
      setLensResult(result);
      const responseText = [result.summary, ...result.findings.map((finding) => `・${finding.title}: ${finding.observation}`)].join("\n");
      setThreads((current) => ({ ...current, [role]: [...conversation, { sender: "lens", text: responseText, createdAt: new Date().toISOString() }] }));
      setLensQuery("");
    } catch (cause) { setError(errorText(cause)); }
    finally { setLensBusy(false); }
  }, [lensQuery, modelId, project, provider, role, saveNow, scopeApproved, scopeChapters, threads]);

  const jumpToFinding = useCallback(async (finding: LensFinding): Promise<void> => {
    if (finding.chapterId === null || finding.startUtf16 === null || finding.endUtf16 === null || finding.anchorStatus !== "attached") return;
    await loadChapter(finding.chapterId, { start: finding.startUtf16, end: finding.endUtf16 });
  }, [loadChapter]);

  useEffect(() => window.novelLens.onMenuAction((action) => {
    if (action === "file.new") void createProject();
    else if (action === "file.open") void openProject();
    else if (action === "file.save") void saveNow();
    else if (action === "history.checkpoint") void createCheckpoint();
    else if (action === "file.export") void exportProject();
    else if (action === "view.settings") openSettings("general");
    else if (action === "view.settings.appearance") openSettings("appearance");
    else if (action === "view.settings.layout") openSettings("layout");
    else if (action === "view.settings.editor") openSettings("editor");
    else if (action === "view.settings.ai") openSettings("ai");
    else if (action === "view.settings.accounts") openSettings("accounts");
    else if (action === "view.settings.keyboard") openSettings("keyboard");
    else if (action === "view.settings.updates") openSettings("updates");
    else if (action === "view.outline") revealView("outline");
    else if (action === "view.search") revealView("search");
    else if (action === "view.lens") revealView("lens");
    else if (action === "view.history") revealView("history");
    else if (action === "view.zen") commitLayout({ ...userSettings.layout, zenMode: !userSettings.layout.zenMode });
    else if (action === "layout.reset") commitLayout(defaultLayout(), "レイアウトを既定へ戻しました");
    else if (action === "updates.check") { openSettings("updates"); void checkUpdates(); }
  }), [checkUpdates, commitLayout, createCheckpoint, createProject, exportProject, openProject, openSettings, revealView, saveNow, userSettings.layout]);

  const flushBeforeClose = useCallback(async (): Promise<void> => {
    if (project !== null) {
      const captured = captureEditorView();
      await window.novelLens.writeEditorSession(project.root, captured);
      if (activeChapterId !== null && text !== savedText && savedVersionRef.current.length > 0) {
        await window.novelLens.writeRecoveryDraft(project.root, currentDraftInput(activeChapterId, text, savedVersionRef.current));
      }
    }
    await saveNow();
    await saveQueueRef.current;
  }, [activeChapterId, captureEditorView, currentDraftInput, project, saveNow, savedText, text]);

  useEffect(() => window.novelLens.onBeforeClose(flushBeforeClose), [flushBeforeClose]);

  const layout = userSettings.layout;
  const slotVisible = (slot: SlotId): boolean => !layout.zenMode && layout.slots[slot].visible && layout.slots[slot].views.length > 0;
  const activityVisible = !layout.zenMode && layout.activityBarVisible;
  type WorkbenchArea = "activity" | "primary" | "editor" | "secondary";
  const leftAreas: WorkbenchArea[] = [];
  const rightAreas: WorkbenchArea[] = [];
  if (slotVisible("primary")) (sideOf("primary", layout) === "left" ? leftAreas : rightAreas).push("primary");
  if (slotVisible("secondary")) (sideOf("secondary", layout) === "left" ? leftAreas : rightAreas).push("secondary");
  if (rightAreas.includes("primary") && rightAreas.includes("secondary")) rightAreas.reverse();
  const columnAreas: WorkbenchArea[] = [
    ...(!activityVisible || layout.activityBar !== "left" ? [] : ["activity" as const]),
    ...leftAreas,
    "editor",
    ...rightAreas,
    ...(!activityVisible || layout.activityBar !== "right" ? [] : ["activity" as const])
  ];
  const columnFor = (area: WorkbenchArea): number => columnAreas.indexOf(area) + 1;
  const bottomVisible = slotVisible("bottom");
  const contentColumnNumbers = columnAreas.flatMap((area, index) => area === "activity" ? [] : [index + 1]);
  const justifiedBottomColumn = `${Math.min(...contentColumnNumbers)} / ${Math.max(...contentColumnNumbers) + 1}`;
  let livePrimarySize = layout.slots.primary.size;
  let liveSecondarySize = layout.slots.secondary.size;
  const widthBudget = Math.max(0, viewport.width - (activityVisible ? 52 : 0) - 430);
  let widthOverflow = (slotVisible("primary") ? livePrimarySize : 0) + (slotVisible("secondary") ? liveSecondarySize : 0) - widthBudget;
  if (widthOverflow > 0 && slotVisible("secondary")) {
    const shrink = Math.min(widthOverflow, Math.max(0, liveSecondarySize - LAYOUT_LIMITS.secondary.min));
    liveSecondarySize -= shrink;
    widthOverflow -= shrink;
  }
  if (widthOverflow > 0 && slotVisible("primary")) livePrimarySize -= Math.min(widthOverflow, Math.max(0, livePrimarySize - LAYOUT_LIMITS.primary.min));
  const workspaceHeight = workspaceRef.current?.clientHeight ?? viewport.height - 64;
  const liveBottomSize = Math.max(0, Math.min(layout.slots.bottom.size, workspaceHeight - EDITOR_SCROLL_MIN_HEIGHT - 98));
  const workspaceStyle = {
    gridTemplateColumns: columnAreas.map((area) => area === "activity" ? "var(--nl-activity, 52px)" : area === "primary" ? `${livePrimarySize}px` : area === "secondary" ? `${liveSecondarySize}px` : "minmax(430px, 1fr)").join(" "),
    gridTemplateRows: bottomVisible
      ? layout.bottomPanelMaximized ? "0 minmax(200px, 1fr)" : `minmax(240px, 1fr) ${liveBottomSize}px`
      : "minmax(240px, 1fr)"
  } as CSSProperties;
  const shellStyle = {
    "--editor-font": editorFont,
    "--editor-width": `${editorWidth}px`,
    "--editor-line-height": editorLineHeight,
    "--editor-font-size": `${editorFontSize}px`
  } as CSSProperties;

  const promptDialog = textPrompt === null ? null : <TextPrompt
    key={textPrompt.id}
    request={textPrompt}
    onCancel={() => finishTextPrompt(null)}
    onSubmit={(value) => finishTextPrompt(value)}
  />;

  const settingsOverlay = settingsOpen ? <SettingsView
    category={settingsCategory}
    setCategory={setSettingsCategory}
    settings={userSettings}
    project={project}
    appInfo={appInfo}
    connections={connections}
    updateStatus={updateStatus}
    onClose={() => setSettingsOpen(false)}
    onUpdateUser={updateUserSettings}
    onUpdateProject={updateProjectSettings}
    onResetProjectSetting={resetProjectSetting}
    onRefreshConnections={refreshConnections}
    onLoginCodex={loginCodex}
    onLogoutCodex={logoutCodex}
    onRefreshCodexModels={refreshCodexModels}
    onConnectOpenAI={connectOpenAI}
    onDisconnectOpenAI={disconnectOpenAI}
    onLoginGitHub={loginGitHub}
    onResetKeybindings={resetKeybindings}
    onCheckUpdates={checkUpdates}
    onInstallUpdate={installUpdate}
    onOpenUpdatePage={openUpdatePage}
    onOpenExternal={openExternalPage}
  /> : null;

  if (project === null) return <div className={shellClass} style={shellStyle}>
    <Welcome appInfo={appInfo} busy={busy} error={error} colorTheme={colorTheme} onToggleTheme={toggleColorTheme} onCreate={createProject} onOpen={openProject} onSettings={() => openSettings("appearance")} />
    {promptDialog}
    {settingsOverlay}
  </div>;

  const selectViewInSlot = (slot: SlotId, view: ViewId): void => {
    commitLayout({
      ...layout,
      slots: { ...layout.slots, [slot]: { ...layout.slots[slot], activeView: view, visible: true } }
    });
  };

  const renderView = (view: ViewId): ReactNode => {
    if (view === "outline") return <div className="outline-content">
      <div className="pane-heading"><div
        className="pane-title-drag dock-handle"
        onPointerDown={(event) => beginDockDrag("outline", event)}
        onContextMenu={(event) => { event.preventDefault(); openViewMenu("outline", event.clientX, event.clientY); }}
        onKeyDown={(event) => handleViewMenuKey("outline", event)}
        tabIndex={0}
      ><span className="eyebrow">MANUSCRIPT</span><h2>章・場面</h2></div><div className="pane-tools"><button className="icon-button import-button" title="TXT / Markdownを取り込む" onClick={importDocuments}><AppIcon name="import" /></button><button className="icon-button" title="章・場面を追加" onClick={addChapter}><AppIcon name="add" /></button></div></div>
      <nav className="chapter-list" aria-label="章・場面">
        {manifestChapters.map((item) => <button key={item.id} className={item.id === activeChapterId ? "chapter active" : "chapter"} onClick={() => void loadChapter(item.id)} disabled={busy}>
          <span className="chapter-order">{String(item.order + 1).padStart(2, "0")}</span><span>{item.title}</span>
        </button>)}
      </nav>
      <div className="outline-footer"><code title={project.root}>{project.root}</code><span>Markdown正本</span></div>
    </div>;
    if (view === "lens") return <LensPanel
      role={role} setRole={setRole} provider={provider} setProvider={(next) => { setProvider(next); setModelId(next === "codex" ? userSettings.ai.codexModel : next === "openai" ? userSettings.ai.openaiModel : "offline-mock-v0.1"); }} modelId={modelId} setModelId={(value) => { setModelId(value); if (provider === "codex") void updateUserSettings({ ai: { codexModel: value } }); }} codexModels={connections.codex.models} codexConnected={connections.codex.connected} openAIConnected={connections.openai.connected} onOpenSettings={() => openSettings("ai")}
      query={lensQuery} setQuery={setLensQuery} scopeMode={scopeMode} setScopeMode={setScopeMode} scopeTitles={scopeChapters.map((item) => item.title)}
      approved={scopeApproved} setApproved={setScopeApproved} thread={threads[role]} result={lensResult?.role === role ? lensResult : null}
      running={lensBusy} onRun={invokeLens} onClear={() => { setThreads((current) => ({ ...current, [role]: [] })); setLensResult(null); }} onFinding={jumpToFinding}
    />;
    if (view === "search") return <SearchPanel query={searchQuery} setQuery={setSearchQuery} hits={searchHits} onSearch={runSearch} onHit={(hit) => void loadChapter(hit.chapterId, hit)} />;
    return <HistoryPanel entries={checkpoints} onCreate={createCheckpoint} onRestore={restoreCheckpoint} onVariation={createVariation} />;
  };

  const renderSlot = (slotId: SlotId): ReactNode => {
    if (!slotVisible(slotId)) return null;
    const slot = layout.slots[slotId];
    const activeView = slot.activeView ?? slot.views[0] ?? null;
    const bottom = slotId === "bottom";
    const physicalSide = bottom ? null : sideOf(slotId, layout);
    const activeDrop = dockDrag?.target.kind === "slot-tab" && dockDrag.target.slot === slotId;
    return <aside
      className={`view-slot ${slotId === "primary" ? "outline-pane" : "inspector-pane"} slot-${slotId} ${bottom ? "dock-bottom" : `dock-${physicalSide}`} ${bottom && layout.bottomPanelMaximized ? "is-maximized" : ""} ${activeDrop ? "dock-target-active" : ""}`}
      style={{
        gridColumn: bottom ? layout.bottomPanelAlignment === "justify" ? justifiedBottomColumn : columnFor("editor") : columnFor(slotId),
        gridRow: bottom ? 2 : bottomVisible && layout.bottomPanelAlignment === "justify" ? 1 : "1 / -1"
      }}
      data-slot-id={slotId}
    >
      {!(bottom && layout.bottomPanelMaximized) && <div className={`pane-resizer ${bottom ? "horizontal edge-top" : `vertical edge-${physicalSide === "left" ? "right" : "left"}`}`} onPointerDown={(event) => beginPaneResize(slotId, event)} />}
      <div className="view-tabbar" role="tablist" aria-label={`${slotId}パネル`}>
        <div className="view-tabs-scroll">{slot.views.map((view) => <button
          key={view}
          type="button"
          role="tab"
          aria-selected={activeView === view}
          className={`view-tab ${activeView === view ? "active" : ""}`}
          data-view-tab={view}
          title={`${VIEW_LABELS[view]} — ドラッグまたは右クリックで移動`}
          onClick={() => { if (!suppressDockClickRef.current) selectViewInSlot(slotId, view); }}
          onPointerDown={(event) => beginDockDrag(view, event)}
          onContextMenu={(event: ReactMouseEvent<HTMLButtonElement>) => { event.preventDefault(); openViewMenu(view, event.clientX, event.clientY); }}
          onKeyDown={(event) => handleViewMenuKey(view, event)}
        ><span className="view-tab-grip" aria-hidden="true">⠿</span><AppIcon name={view === "outline" ? "files" : view} size={14} />{VIEW_LABELS[view]}</button>)}</div>
        <div className="view-tab-actions">
          {bottom && <button type="button" className="view-tab-action" aria-label={layout.bottomPanelMaximized ? "下部パネルを元の高さへ戻す" : "下部パネルを最大化"} title={layout.bottomPanelMaximized ? "元の高さへ戻す" : "最大化"} onClick={() => commitLayout({ ...layout, bottomPanelMaximized: !layout.bottomPanelMaximized })}><AppIcon name="focus" size={15} /></button>}
          {activeView !== null && <button type="button" className="view-tab-action" aria-label="パネル操作" title="パネル操作" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); openViewMenu(activeView, rect.right - 216, rect.bottom + 4); }}>…</button>}
          <button type="button" className="view-tab-action" aria-label="パネルを閉じる" title="パネルを閉じる" onClick={() => commitLayout({ ...layout, bottomPanelMaximized: bottom ? false : layout.bottomPanelMaximized, slots: { ...layout.slots, [slotId]: { ...slot, visible: false } } }, "パネルを閉じました")}><AppIcon name="close" size={15} /></button>
        </div>
      </div>
      <div className="view-slot-body">{activeView === null ? null : renderView(activeView)}</div>
    </aside>;
  };

  const menuSlot = viewMenu === null ? null : slotOf(layout, viewMenu.view);
  const moveMenuView = (destination: PhysicalSide | "bottom"): void => {
    if (viewMenu === null) return;
    commitLayout(placeViewOnSide(layout, viewMenu.view, destination), `${VIEW_LABELS[viewMenu.view]}を${destination === "left" ? "左" : destination === "right" ? "右" : "下部"}へ移動しました`);
    setViewMenu(null);
  };
  const moveMenuPanel = (side: PhysicalSide): void => {
    if (viewMenu === null || menuSlot === null || menuSlot === "bottom") return;
    commitLayout(moveSlotToSide(layout, menuSlot, side), `${VIEW_LABELS[viewMenu.view]}のパネルを${side === "left" ? "左" : "右"}へ移動しました`);
    setViewMenu(null);
  };
  const reorderMenuView = (delta: -1 | 1): void => {
    if (viewMenu === null || menuSlot === null) return;
    const views = layout.slots[menuSlot].views;
    const current = views.indexOf(viewMenu.view);
    if (current < 0) return;
    commitLayout(moveView(layout, viewMenu.view, menuSlot, Math.max(0, Math.min(views.length - 1, current + delta))), `${VIEW_LABELS[viewMenu.view]}のタブ順を変更しました`);
    setViewMenu(null);
  };
  const toggleSlotVisibility = (slot: SlotId): void => {
    const current = layout.slots[slot];
    if (!current.visible && current.views.length === 0) {
      const preferred: ViewId = slot === "primary" ? "outline" : slot === "secondary" ? "lens" : layout.slots.secondary.activeView ?? "history";
      commitLayout({ ...moveView(layout, preferred, slot), zenMode: false });
      return;
    }
    commitLayout({
      ...layout,
      zenMode: false,
      bottomPanelMaximized: slot === "bottom" && current.visible ? false : layout.bottomPanelMaximized,
      slots: { ...layout.slots, [slot]: { ...current, visible: !current.visible } }
    });
  };

  return <div className={shellClass} style={shellStyle}><div className={`app ${layout.zenMode ? "zen-mode" : ""}`}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><AppIcon name="logo" size={22} /></span><div><b>Novel Lens</b><button className="project-title" onClick={renameProject} title="作品名を変更">{project.manifest.title}</button></div></div>
      <div className="top-actions">
        <button className="ghost action-with-icon" onClick={createCheckpoint} title="現在の状態を保存点にする"><AppIcon name="checkpoint" />保存点</button>
        <button className="ghost action-with-icon" onClick={exportProject} title="Markdownを書き出す"><AppIcon name="export" />書き出し</button>
        <button className={`icon-button top-icon ${layout.zenMode ? "active" : ""}`} onClick={() => commitLayout({ ...layout, zenMode: !layout.zenMode })} aria-label="集中モード" title="集中モード"><AppIcon name="focus" /></button>
        <div className="layout-menu-anchor">
          <button className={`icon-button top-icon ${layoutMenuOpen ? "active" : ""}`} onClick={() => setLayoutMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={layoutMenuOpen} aria-label="レイアウトを変更" title="レイアウト"><AppIcon name="layout" /></button>
          {layoutMenuOpen && <div className="layout-quick-menu" role="menu">
            <strong>WORKBENCH LAYOUT</strong>
            <div className="layout-menu-section"><span>表示</span>
              <button role="menuitemcheckbox" aria-checked={layout.activityBarVisible} onClick={() => commitLayout({ ...layout, activityBarVisible: !layout.activityBarVisible, zenMode: false })}><b>{layout.activityBarVisible ? "✓" : ""}</b>アクティビティバー</button>
              {(["primary", "secondary", "bottom"] as const).map((slot) => <button key={slot} role="menuitemcheckbox" aria-checked={layout.slots[slot].visible} onClick={() => toggleSlotVisibility(slot)}><b>{layout.slots[slot].visible ? "✓" : ""}</b>{slot === "primary" ? "メインパネル" : slot === "secondary" ? "補助パネル" : "下部パネル"}</button>)}
            </div>
            <div className="layout-menu-section"><span>アクティビティバーの位置</span><div className="layout-segmented"><button className={layout.activityBar === "left" ? "active" : ""} onClick={() => commitLayout({ ...layout, activityBar: "left", activityBarVisible: true, zenMode: false })}>左</button><button className={layout.activityBar === "right" ? "active" : ""} onClick={() => commitLayout({ ...layout, activityBar: "right", activityBarVisible: true, zenMode: false })}>右</button></div></div>
            <div className="layout-menu-section"><span>下部パネル</span><div className="layout-segmented"><button className={layout.bottomPanelAlignment === "editor" ? "active" : ""} onClick={() => commitLayout({ ...layout, bottomPanelAlignment: "editor" })}>本文幅</button><button className={layout.bottomPanelAlignment === "justify" ? "active" : ""} onClick={() => commitLayout({ ...layout, bottomPanelAlignment: "justify" })}>全幅</button></div><button role="menuitemcheckbox" aria-checked={layout.bottomPanelMaximized} disabled={!layout.slots.bottom.visible} onClick={() => commitLayout({ ...layout, bottomPanelMaximized: !layout.bottomPanelMaximized })}><b>{layout.bottomPanelMaximized ? "✓" : ""}</b>最大化</button></div>
            <span className="menu-separator" /><button role="menuitem" onClick={() => { commitLayout(defaultLayout(), "レイアウトを既定へ戻しました"); setLayoutMenuOpen(false); }}><b>↺</b>既定に戻す</button>
          </div>}
        </div>
        <span className={`save-indicator ${saveState}`}>{saveState === "saved" ? "保存済み" : saveState === "saving" ? "保存中…" : saveState === "dirty" ? "未保存" : "保存エラー"}</span>
      </div>
    </header>

    {(error !== null || notice !== null) && <div className={`banner ${error !== null ? "error" : "notice"}`} role="status"><span>{error ?? notice}</span><button aria-label="閉じる" onClick={clearMessages}><AppIcon name="close" /></button></div>}
    {recoveryConflict !== null && <div className="recovery-banner" role="alert">
      <div><b>未保存の復旧ドラフトがあります</b><span>保存済み本文が別に更新されているため、自動では上書きしません。</span></div>
      <button className="secondary" onClick={useRecoveryDraft}>復旧ドラフトを開く</button>
      <button className="ghost" onClick={() => void discardRecoveryDraft()}>保存済み本文を維持</button>
    </div>}

    <div className="workspace" ref={workspaceRef} style={workspaceStyle}>
      {activityVisible && <aside className={`activity-bar activity-${layout.activityBar}`} style={{ gridColumn: columnFor("activity"), gridRow: "1 / -1" }} aria-label="表示切り替え">
        <div className="activity-main">
          {VIEW_IDS.map((view) => {
            const slot = slotOf(layout, view);
            const active = slot !== null && layout.slots[slot].visible && layout.slots[slot].activeView === view;
            return <button
              key={view}
              className={`activity-button ${active ? "active" : ""}`}
              onClick={() => { if (!suppressDockClickRef.current) toggleView(view); }}
              onPointerDown={(event) => beginDockDrag(view, event)}
              onContextMenu={(event) => { event.preventDefault(); openViewMenu(view, event.clientX, event.clientY); }}
              onKeyDown={(event) => handleViewMenuKey(view, event)}
              title={`${VIEW_LABELS[view]}（ドラッグで移動）`}
              aria-label={VIEW_LABELS[view]}
            ><AppIcon name={view === "outline" ? "files" : view} /></button>;
          })}
        </div>
        <div className="activity-foot"><button className="activity-button" onClick={() => openSettings("general")} title="設定"><AppIcon name="settings" /></button></div>
      </aside>}

      {renderSlot("primary")}
      {renderSlot("secondary")}

      <main data-editor-pane className={`editor-pane manuscript-${theme} ${writingMode === "vertical-rl" ? "vertical" : "horizontal"}`} style={{ gridColumn: columnFor("editor"), gridRow: 1, "--ms-bg": manuscriptPalette.background, "--ms-text": manuscriptPalette.text, "--ms-line": manuscriptPalette.line } as CSSProperties}>
        <div className="editor-tabs" role="tablist" aria-label="開いている章">
          {(editorSession.groups.find((group) => group.id === editorSession.activeGroupId)?.tabs ?? []).map((tabState) => {
            const item = manifestChapters.find((candidate) => candidate.id === tabState.chapterId);
            if (item === undefined) return null;
            const active = item.id === activeChapterId;
            return <div className={`editor-tab ${active ? "active" : ""}`} key={item.id} role="presentation">
              <button role="tab" aria-selected={active} onClick={() => void loadChapter(item.id)} title={item.title}><span>{item.title}</span>{active && saveState !== "saved" ? <i aria-label="未保存">●</i> : null}</button>
              <button className="editor-tab-close" aria-label={`${item.title}を閉じる`} title="閉じる" onClick={() => void closeChapterTab(item.id)}><AppIcon name="close" /></button>
            </div>;
          })}
        </div>
        <div className="editor-toolbar">
          <div><span className="eyebrow">{writingMode === "vertical-rl" ? "VERTICAL WRITING" : "WRITING"}</span><h1>{chapter?.chapter.title ?? "章を選択"}</h1></div>
          <div className="editor-actions"><details className="editor-more"><summary aria-label="章の操作" title="章の操作">…</summary><div className="editor-more-menu"><button disabled={activeIndex <= 0} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void moveChapter(-1); }}>前へ移動</button><button disabled={activeIndex < 0 || activeIndex >= manifestChapters.length - 1} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void moveChapter(1); }}>後ろへ移動</button><button onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void renameChapter(); }}>名前を変更</button><button className="danger-text" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void deleteChapter(); }}>章を削除</button></div></details></div>
        </div>
        <div className="editor-scroll">
          <textarea
            ref={editorRef}
            aria-label="小説本文"
            className="manuscript-editor"
            value={text}
            spellCheck={false}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onChange={(event) => { textRef.current = event.target.value; setText(event.target.value); }}
            onSelect={recordEditorView}
            onScroll={recordEditorView}
            onBlur={() => { recordEditorView(); void saveNow(); }}
            disabled={chapter === null}
            placeholder="ここから物語を書き始めます。"
          />
        </div>
        <footer className="statusbar"><span>{stats.charactersNoWhitespace.toLocaleString()}字</span><span>{stats.lines.toLocaleString()}行</span><span>{stats.words.toLocaleString()}語</span><select aria-label="原稿の配色" value={theme} onChange={(event) => void updateProjectSettings({ theme: event.target.value as ManuscriptTheme })}>{Object.entries(MANUSCRIPT_THEME_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button onClick={() => void updateProjectSettings({ writingMode: writingMode === "vertical-rl" ? "horizontal" : "vertical-rl" })} title="横書きと縦書きを切り替える">{writingMode === "vertical-rl" ? "縦書き" : "横書き"}</button></footer>
      </main>

      {renderSlot("bottom")}
      {dockDrag !== null && <div className="dock-layer" aria-hidden="true">
        <span className={`dock-target side-left ${dockDrag.target.kind === "side-edge" && dockDrag.target.side === "left" ? "active" : ""}`}>左</span>
        <span className={`dock-target side-right ${dockDrag.target.kind === "side-edge" && dockDrag.target.side === "right" ? "active" : ""}`}>右</span>
        <span className={`dock-target bottom ${dockDrag.target.kind === "bottom-edge" ? "active" : ""}`}>下部</span>
        <span className="dock-ghost" style={{ transform: `translate(${dockDrag.x + 14}px, ${dockDrag.y + 14}px)` }}>{VIEW_LABELS[dockDrag.view]}</span>
      </div>}
    </div>
    <span className="layout-announcement" aria-live="polite">{layoutAnnouncement}</span>
  </div>{promptDialog}{settingsOverlay}{viewMenu !== null && <div
    ref={viewMenuRef}
    className="view-context-menu"
    role="menu"
    style={{ left: viewMenu.x, top: viewMenu.y }}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); setViewMenu(null); return; }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1 + items.length) % items.length : (current - 1 + items.length) % items.length;
      items[next]?.focus();
    }}
  >
    <strong>{VIEW_LABELS[viewMenu.view]}</strong>
    <button role="menuitem" onClick={() => moveMenuView("left")}>このビューを左へ</button>
    <button role="menuitem" onClick={() => moveMenuView("right")}>このビューを右へ</button>
    <button role="menuitem" onClick={() => moveMenuView("bottom")}>このビューを下部へ</button>
    <span className="menu-separator" />
    <button role="menuitem" disabled={menuSlot === "bottom"} onClick={() => moveMenuPanel("left")}>このパネルを左へ</button>
    <button role="menuitem" disabled={menuSlot === "bottom"} onClick={() => moveMenuPanel("right")}>このパネルを右へ</button>
    <button role="menuitem" onClick={() => reorderMenuView(-1)}>タブを左へ</button>
    <button role="menuitem" onClick={() => reorderMenuView(1)}>タブを右へ</button>
    <span className="menu-separator" />
    {menuSlot === "bottom" && <button role="menuitemcheckbox" aria-checked={layout.bottomPanelMaximized} onClick={() => { commitLayout({ ...layout, bottomPanelMaximized: !layout.bottomPanelMaximized }); setViewMenu(null); }}>{layout.bottomPanelMaximized ? "下部パネルを元の高さへ" : "下部パネルを最大化"}</button>}
    {menuSlot === "bottom" && <button role="menuitem" onClick={() => { commitLayout({ ...layout, bottomPanelAlignment: layout.bottomPanelAlignment === "editor" ? "justify" : "editor" }); setViewMenu(null); }}>{layout.bottomPanelAlignment === "editor" ? "下部パネルを全幅へ" : "下部パネルを本文幅へ"}</button>}
    {menuSlot !== null && <button role="menuitem" onClick={() => { const slot = layout.slots[menuSlot]; commitLayout({ ...layout, bottomPanelMaximized: menuSlot === "bottom" ? false : layout.bottomPanelMaximized, slots: { ...layout.slots, [menuSlot]: { ...slot, visible: false } } }, "パネルを閉じました"); setViewMenu(null); }}>パネルを閉じる</button>}
    <span className="menu-separator" />
    <button role="menuitem" onClick={() => { commitLayout(defaultLayout(), "レイアウトを既定へ戻しました"); setViewMenu(null); }}>既定レイアウトへ戻す</button>
  </div>}</div>;
}

function TextPrompt({ request, onCancel, onSubmit }: { request: TextPromptRequest; onCancel: () => void; onSubmit: (value: string) => void }): ReactNode {
  const [value, setValue] = useState(request.initialValue);

  return <div className="prompt-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <form
      className="prompt-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`prompt-title-${request.id}`}
      onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}
      onSubmit={(event) => { event.preventDefault(); if (value.trim().length > 0) onSubmit(value.trim()); }}
    >
      <span className="eyebrow">NOVEL LENS</span>
      <h2 id={`prompt-title-${request.id}`}>{request.title}</h2>
      <label>{request.label}<input autoFocus maxLength={200} value={value} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setValue(event.target.value)} /></label>
      <div className="prompt-actions"><button type="button" className="secondary" onClick={onCancel}>キャンセル</button><button type="submit" className="primary" disabled={value.trim().length === 0}>{request.confirmLabel}</button></div>
    </form>
  </div>;
}

function Welcome({ appInfo, busy, error, colorTheme, onToggleTheme, onCreate, onOpen, onSettings }: { appInfo: AppInfo | null; busy: boolean; error: string | null; colorTheme: "default" | "light" | "dark"; onToggleTheme: () => void; onCreate: () => void; onOpen: () => void; onSettings: () => void }): ReactNode {
  return <main className="welcome">
    <header className="welcome-header">
      <div className="welcome-brand"><AppIcon name="logo" size={30} tile /><span><b>Novel Lens</b><small>Writing workspace</small></span></div>
      <div className="welcome-header-actions"><button className="icon-button" onClick={onToggleTheme} title="配色を切り替える"><AppIcon name={colorTheme === "dark" ? "sun" : "moon"} /></button><button className="icon-button" onClick={onSettings} title="設定"><AppIcon name="settings" /></button></div>
    </header>

    <section className="welcome-hero">
      <div className="welcome-copy-block">
        <p className="eyebrow">01 / LOCAL-FIRST WRITING WORKSPACE</p>
        <h1>物語を、<br /><span>書く。</span></h1>
        <p className="welcome-copy">余計なものを脇へ置き、本文を真ん中に。Markdownの原稿、章立て、保存点、必要なときだけ呼べる読み手を、ひとつの静かな机にまとめました。</p>
        {error !== null && <p className="welcome-error">{error}</p>}
        <div className="welcome-actions">
          <button className="home-action" disabled={busy} onClick={onCreate}><span className="home-action-number">01</span><span className="home-action-icon"><AppIcon name="new" /></span><span><b>新しい作品</b><small>空白から物語を始める</small></span><span className="action-arrow">↗</span></button>
          <button className="home-action" disabled={busy} onClick={onOpen}><span className="home-action-number">02</span><span className="home-action-icon"><AppIcon name="open" /></span><span><b>作品を開く</b><small>既存のフォルダーを選択</small></span><span className="action-arrow">→</span></button>
          <button className="home-action" onClick={onSettings}><span className="home-action-number">03</span><span className="home-action-icon"><AppIcon name="layout" /></span><span><b>作業環境を整える</b><small>テーマとパネル配置を変える</small></span><span className="action-arrow">→</span></button>
        </div>
      </div>

      <aside className="welcome-art" aria-hidden="true">
        <span className="welcome-art-index">NOVEL LENS / 2026</span>
        <div className="welcome-art-mark"><AppIcon name="logo" size={196} tile /></div>
        <p>THE MANUSCRIPT<br />BELONGS TO THE AUTHOR.</p>
        <span className="welcome-art-side">LOCAL / MARKDOWN / PRIVATE</span>
      </aside>
    </section>

    <footer className="welcome-footer"><div className="welcome-features"><span><AppIcon name="edit" /> 縦書き・横書き</span><span><AppIcon name="checkpoint" /> 自動保存と保存点</span><span><AppIcon name="lens" /> 根拠付きAIレンズ</span></div><small>Novel Lens {appInfo?.version ?? ""} · {appInfo?.platform ?? "desktop"}</small></footer>
  </main>;
}

interface LensPanelProps {
  role: RoleId; setRole: (role: RoleId) => void; provider: LensProviderId; setProvider: (provider: LensProviderId) => void;
  modelId: string; setModelId: (value: string) => void; codexModels: CodexModelOption[]; codexConnected: boolean; openAIConnected: boolean; onOpenSettings: () => void;
  query: string; setQuery: (value: string) => void; scopeMode: ScopeMode; setScopeMode: (value: ScopeMode) => void;
  scopeTitles: string[]; approved: boolean; setApproved: (value: boolean) => void; thread: LensMessage[]; result: LensRunResult | null;
  running: boolean; onRun: () => void; onClear: () => void; onFinding: (finding: LensFinding) => void;
}

function LensPanel(props: LensPanelProps): ReactNode {
  const definition = getRole(props.role);
  return <div className="inspector-content lens-panel">
    <div className="section-head"><div><span className="eyebrow">SYNTHETIC READER</span><h2>編集レンズ</h2></div>{props.thread.length > 0 && <button className="text-button" onClick={props.onClear}>会話を消す</button>}</div>
    <div className="role-grid">{ROLE_IDS.map((id) => <button key={id} className={props.role === id ? "role active" : "role"} title={getRole(id).description} onClick={() => props.setRole(id)}>{getRole(id).label}</button>)}</div>
    <p className="role-description">{definition.description}</p>

    {props.thread.length > 0 && <div className="thread" aria-label={`${definition.label}との会話`}>{props.thread.map((message, index) => <div key={`${message.createdAt}-${index}`} className={`message ${message.sender}`}><b>{message.sender === "author" ? "あなた" : definition.label}</b><p>{message.text}</p></div>)}</div>}

    {props.result !== null && <div className="finding-list"><div className="coverage">{props.result.coverage.chapterCount}章・{props.result.coverage.characterCount.toLocaleString()}字を確認</div>{props.result.findings.map((finding) => <article className={`finding priority-${finding.priority}`} key={finding.id}>
      <div className="finding-meta"><span>{finding.priority}</span><span>{finding.anchorStatus === "attached" ? "根拠確認済み" : finding.anchorStatus === "ambiguous" ? "引用が複数" : "引用未確認"}</span></div>
      <h3>{finding.title}</h3><p>{finding.observation}</p><p className="effect">読者への影響: {finding.readerEffect}</p>
      <button className="quote" disabled={finding.anchorStatus !== "attached"} onClick={() => props.onFinding(finding)}>「{finding.quote}」<small>{finding.chapterTitle ?? "原文へ接続できません"}</small></button>
    </article>)}</div>}

    <label>質問<textarea rows={4} value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder={DEFAULT_QUERY} /></label>
    <div className="form-row"><label>接続<select value={props.provider} onChange={(event) => props.setProvider(event.target.value as LensProviderId)}><option value="codex">ChatGPT（Codex枠）</option><option value="mock">Offline Mock</option><option value="openai">OpenAI API</option></select></label><label>範囲<select value={props.scopeMode} onChange={(event) => props.setScopeMode(event.target.value as ScopeMode)}><option value="current">現在の章だけ</option><option value="through-current">現在の章まで</option><option value="all">全章</option></select></label></div>
    {props.provider === "codex" && <div className="lens-connection"><label>モデル<select value={props.modelId} onChange={(event) => props.setModelId(event.target.value)}>{props.codexModels.length === 0 && <option value={props.modelId}>{props.modelId}</option>}{props.codexModels.map((model) => <option key={model.id} value={model.id}>{model.displayName}{model.id === "gpt-5.6-luna" ? "（節約）" : ""}</option>)}</select></label><div className="lens-connection-state"><span className={props.codexConnected ? "connected" : "disconnected"}>{props.codexConnected ? "ChatGPT接続済み" : "ChatGPT未接続"}</span><button className="text-button" onClick={props.onOpenSettings}>接続設定を開く</button></div></div>}
    {props.provider === "openai" && <div className="lens-connection"><label>Model ID<input value={props.modelId} onChange={(event) => props.setModelId(event.target.value)} /></label><div className="lens-connection-state"><span className={props.openAIConnected ? "connected" : "disconnected"}>{props.openAIConnected ? "OpenAI接続済み" : "OpenAI未接続"}</span><button className="text-button" onClick={props.onOpenSettings}>接続設定を開く</button></div></div>}
    <details className="scope-preview" open><summary>送信範囲: {props.scopeTitles.length}章</summary><ul>{props.scopeTitles.map((title) => <li key={title}>{title}</li>)}</ul><p>未選択章、設定画面、履歴、ファイルパスは送信しません。</p></details>
    <label className="check"><input type="checkbox" checked={props.approved} onChange={(event) => props.setApproved(event.target.checked)} /> 表示された章だけを送信することを確認しました</label>
    <button className="primary full" disabled={props.running || !props.approved || props.query.trim().length === 0 || (props.provider === "codex" && !props.codexConnected) || (props.provider === "openai" && !props.openAIConnected)} onClick={props.onRun}>{props.running ? "検証しながら読んでいます…" : `${definition.label}に聞く`}</button>
    <p className="privacy-note">本文の生成・書換え・自動適用は行いません。会話と認証情報はprojectへ保存しません。</p>
  </div>;
}

function SearchPanel({ query, setQuery, hits, onSearch, onHit }: { query: string; setQuery: (value: string) => void; hits: SearchHit[]; onSearch: () => void; onHit: (hit: SearchHit) => void }): ReactNode {
  return <div className="inspector-content"><span className="eyebrow">FULL TEXT</span><h2>作品内検索</h2><div className="search-box"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSearch(); }} placeholder="語句を入力" /><button onClick={onSearch}>検索</button></div><p className="result-count">{hits.length}件</p><div className="search-results">{hits.map((hit, index) => <button key={`${hit.chapterId}-${hit.start}-${index}`} onClick={() => onHit(hit)}><b>{hit.title}</b><p>{hit.excerpt}</p></button>)}</div></div>;
}

function HistoryPanel({ entries, onCreate, onRestore, onVariation }: { entries: CheckpointEntry[]; onCreate: () => void; onRestore: (entry: CheckpointEntry) => void; onVariation: () => void }): ReactNode {
  return <div className="inspector-content"><span className="eyebrow">RECOVERY</span><h2>保存点と別案</h2><p className="muted">Gitを知らなくても、節目へ戻れます。復元前の状態も自動で残します。</p><div className="history-actions"><button className="primary" onClick={onCreate}>保存点を作る</button><button className="secondary" onClick={onVariation}>別案を複製</button></div><div className="history-list">{entries.length === 0 ? <p className="empty">保存点はまだありません。</p> : entries.map((entry) => <article key={entry.commit}><div><b>{entry.subject}</b><small>{formatDate(entry.authoredAt)}</small></div><button className="text-button" onClick={() => onRestore(entry)}>ここへ戻る</button></article>)}</div></div>;
}
