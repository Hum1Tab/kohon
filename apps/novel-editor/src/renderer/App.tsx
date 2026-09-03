import { textStats, type TextStats } from "@kohon/editor-core";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { isHexColor, resolveManuscriptPalette, type ManuscriptTheme } from "../shared/editor-theme.js";
import { applyRecoveryDraft, beginSave, createEditorBuffers, dismissRecoveryConflict, editBuffer, loadBuffer, pruneBuffers, saveFailed, saveSucceeded, type EditorBuffersState } from "../shared/editor-buffers.js";
import { closeEditorGroup, closeEditorTab, defaultEditorSession, moveEditorTab, openEditorTab, splitEditor, updateEditorTabView, type EditorGroupId, type EditorSessionState, type EditorTabState } from "../shared/editor-session.js";
import { findLiteralMatches, replaceAllLiteral, replaceTextMatch } from "../shared/editor-find.js";
import { clearTextHistory, createEditorHistory, recordTextEdit, redoTextEdit, undoTextEdit, type EditOrigin, type TextSelection } from "../shared/editor-history.js";
import { annotateSelectionAsTateChuYoko, insertParagraphIndent, isTateChuYokoCandidate, normalizeSelectedPunctuation, wrapSelectionWithBouten, wrapSelectionWithJapaneseQuotes, wrapSelectionWithRuby, type JapaneseInputResult, type TextareaSelection } from "../shared/japanese-input.js";
import {
  applyLayoutPreset,
  COMMAND_DEFINITIONS,
  defaultLayout,
  defaultUserSettings,
  EDITOR_SCROLL_MIN_HEIGHT,
  LAYOUT_LIMITS,
  moveSlotToSide,
  moveView,
  placeViewOnSide,
  formatKeybinding,
  sideOf,
  slotOf,
  VIEW_IDS,
  type LayoutPreferences,
  type AppCommandId,
  type PhysicalSide,
  type SlotId,
  type UserSettingsPatch,
  type ViewId
} from "../shared/settings.js";
import type {
  AppInfo,
  ChapterDocument,
  ChapterKind,
  ChapterMetadata,
  CheckpointEntry,
  CodexModelOption,
  ConnectionStatus,
  LensFinding,
  LensMessage,
  LensProviderId,
  LensRunResult,
  LensScopeMode,
  NoteDocument,
  NoteMeta,
  ProjectSettings,
  ProjectDiff,
  ProjectSummary,
  RecoveryDraftResult,
  ReviewLedgerEntry,
  ReviewStatus,
  RoleId,
  SearchHit,
  UpdateStatus
} from "../shared/types.js";
import { defaultChapterTitle, defaultSceneTitle } from "../shared/chapter-title.js";
import { commandCategory, commandLabel, resolveAppLocale, uiText } from "../shared/locale.js";
import { SettingsView, type SettingsCategory } from "./SettingsView.js";
import { AppIcon } from "./AppIcon.js";
import { QuickAccess, type QuickAccessItem } from "./QuickAccess.js";
import { EditorPane } from "./EditorPane.js";
import { ChapterMetadataPanel, DEFAULT_QUERY, EMPTY_THREADS, HistoryPanel, LensPanel, OutlineNotes, SearchPanel, TextPrompt, Welcome, type NoteDraft, type SaveState, type TextPromptOptions, type TextPromptRequest } from "./Panels.js";
import { LocaleProvider } from "./LocaleContext.js";

type QuickAccessMode = "commands" | "chapters";
type EditorTabDragState = { groupId: EditorGroupId; chapterId: string };
type EditorTabDropState = { groupId: EditorGroupId; index: number };
type EditorInputSnapshot = { groupId: EditorGroupId; chapterId: string; text: string; selection: TextSelection; origin?: EditOrigin };
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

const DEFAULT_CONNECTIONS: ConnectionStatus = {
  codex: { installed: false, connected: false, state: "unavailable", message: "Codex実行環境をまだ確認していません。", email: null, planType: null, models: [], modelsUpdatedAt: null, usedPercent: null, resetsAt: null },
  openai: { connected: false, state: "disconnected", storage: "none", message: "OpenAI APIは未接続です。", verifiedAt: null },
  github: { cliInstalled: false, connected: false, state: "unavailable", message: "GitHub CLIの状態をまだ確認していません。" }
};

function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+': Error:\s*/u, "").slice(0, 500);
}

function settingNumber(settings: ProjectSettings, key: string, fallback: number): number {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function draftFromNote(document: NoteDocument): NoteDraft {
  return { id: document.note.id, title: document.note.title, kind: document.note.kind, chapterIds: [...document.note.chapterIds], text: document.text };
}

function noteDraftMatches(document: NoteDocument | null, draft: NoteDraft | null): boolean {
  return document !== null && draft !== null && document.note.id === draft.id && document.note.title === draft.title.trim() && document.note.kind === draft.kind && document.text === draft.text && document.note.chapterIds.length === draft.chapterIds.length && document.note.chapterIds.every((id, index) => id === draft.chapterIds[index]);
}

export function App(): ReactNode {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [userSettings, setUserSettings] = useState(defaultUserSettings);
  const locale = resolveAppLocale(userSettings.general.language, window.navigator.language);
  const t = useCallback((japanese: string) => uiText(locale, japanese), [locale]);
  const viewLabel = useCallback((view: ViewId) => t(VIEW_LABELS[view]), [t]);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>("general");
  const [connections, setConnections] = useState<ConnectionStatus>(DEFAULT_CONNECTIONS);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [editorSession, setEditorSession] = useState<EditorSessionState>(() => defaultEditorSession());
  const [editorBuffers, setEditorBuffers] = useState<EditorBuffersState>(() => createEditorBuffers());
  const [editorStats, setEditorStats] = useState<Record<string, TextStats>>({});
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
  const [searchReplacement, setSearchReplacement] = useState("");
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchRun, setSearchRun] = useState<{ query: string; caseSensitive: boolean } | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointEntry[]>([]);
  const [historyDiff, setHistoryDiff] = useState<ProjectDiff | null>(null);
  const [role, setRole] = useState<RoleId>("first-reader");
  const [provider, setProvider] = useState<LensProviderId>("mock");
  const [modelId, setModelId] = useState("gpt-5.6-luna");
  const [lensQuery, setLensQuery] = useState(() => uiText(resolveAppLocale(defaultUserSettings().general.language, window.navigator.language), DEFAULT_QUERY));
  const [scopeMode, setScopeMode] = useState<LensScopeMode>("through-current");
  const [scopeApproved, setScopeApproved] = useState(false);
  const [threads, setThreads] = useState<Record<RoleId, LensMessage[]>>(EMPTY_THREADS);
  const [lensResult, setLensResult] = useState<LensRunResult | null>(null);
  const [reviewFindings, setReviewFindings] = useState<ReviewLedgerEntry[]>([]);
  const [lensBusy, setLensBusy] = useState(false);
  const [textPrompt, setTextPrompt] = useState<TextPromptRequest | null>(null);
  const [quickAccessMode, setQuickAccessMode] = useState<QuickAccessMode | null>(null);
  const [quickAccessQuery, setQuickAccessQuery] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [replaceVisible, setReplaceVisible] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [findMatchIndex, setFindMatchIndex] = useState(-1);
  const [editorTabDrag, setEditorTabDrag] = useState<EditorTabDragState | null>(null);
  const [editorTabDrop, setEditorTabDrop] = useState<EditorTabDropState | null>(null);
  const [chapterDragId, setChapterDragId] = useState<string | null>(null);
  const [chapterDropIndex, setChapterDropIndex] = useState<number | null>(null);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [activeNote, setActiveNote] = useState<NoteDocument | null>(null);
  const [noteDraft, setNoteDraft] = useState<NoteDraft | null>(null);
  const [noteSaveState, setNoteSaveState] = useState<SaveState>("saved");
  const [showAllNotes, setShowAllNotes] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const editorRefs = useRef<Partial<Record<EditorGroupId, HTMLTextAreaElement>>>({});
  const textRef = useRef("");
  const editorBuffersRef = useRef(editorBuffers);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const queuedSaveRef = useRef(new Map<string, string>());
  const sessionHydratedRootRef = useRef<string | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const viewMenuOriginRef = useRef<HTMLElement | null>(null);
  const dockSessionRef = useRef<DockDragState | null>(null);
  const suppressDockClickRef = useRef(false);
  const promptResolverRef = useRef<((value: string | null) => void) | null>(null);
  const promptSequenceRef = useRef(0);
  const activeNoteRef = useRef<NoteDocument | null>(null);
  const noteDraftRef = useRef<NoteDraft | null>(null);
  const noteSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const editorHistoryRef = useRef(createEditorHistory());
  const pendingInputRef = useRef<EditorInputSnapshot | null>(null);
  const compositionRef = useRef<EditorInputSnapshot | null>(null);
  const skipCompositionInputRef = useRef<{ chapterId: string; text: string } | null>(null);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = "KOHON";
  }, [locale]);

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
    void window.kohon.appInfo().then(setAppInfo).catch(() => undefined);
    void window.kohon.connectionStatus().then(setConnections).catch(() => undefined);
    void window.kohon.getUserSettings().then((loaded) => {
      setUserSettings(loaded);
      setProvider(loaded.ai.defaultProvider);
      setModelId(loaded.ai.defaultProvider === "openai" ? loaded.ai.openaiModel : loaded.ai.codexModel);
    }).catch(() => undefined);
    const removeUpdateListener = window.kohon.onUpdateStatus(setUpdateStatus);
    const removeConnectionListener = window.kohon.onConnectionStatus(setConnections);
    return () => { removeUpdateListener(); removeConnectionListener(); };
  }, []);

  useEffect(() => {
    if (provider !== "codex" || connections.codex.models.length === 0) return;
    if (connections.codex.models.some((model) => model.id === modelId)) return;
    const fallback = connections.codex.models.find((model) => model.id === "gpt-5.6-luna") ?? connections.codex.models.find((model) => model.isDefault) ?? connections.codex.models[0];
    if (fallback === undefined) return;
    setModelId(fallback.id);
    void window.kohon.updateUserSettings({ ai: { codexModel: fallback.id } }).then(setUserSettings).catch(() => undefined);
  }, [connections.codex.models, modelId, provider]);

  const manifestChapters = useMemo(() => [...(project?.manifest.chapters ?? [])].sort((a, b) => a.order - b.order), [project]);
  const activeEditorGroup = editorSession.groups.find((group) => group.id === editorSession.activeGroupId) ?? editorSession.groups[0];
  const activeChapterId = activeEditorGroup?.activeChapterId ?? null;
  const activeBuffer = activeChapterId === null ? undefined : editorBuffers.buffers[activeChapterId];
  const chapter: ChapterDocument | null = activeBuffer === undefined ? null : { chapter: activeBuffer.chapter, text: activeBuffer.text, version: activeBuffer.version };
  const text = activeBuffer?.text ?? "";
  const savedText = activeBuffer?.savedText ?? "";
  const saveState: SaveState = activeBuffer?.saveState ?? "saved";
  const recoveryConflict = activeBuffer?.recoveryConflict ?? null;
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
  const findMatches = useMemo(() => findLiteralMatches(text, findQuery, caseSensitive), [caseSensitive, findQuery, text]);
  const commandItems = useMemo<QuickAccessItem[]>(() => COMMAND_DEFINITIONS.map((command) => ({ id: command.id, label: commandLabel(command, locale), description: commandCategory(command, locale), shortcut: uiText(locale, formatKeybinding(userSettings.keybindings[command.id])) })), [locale, userSettings.keybindings]);
  const chapterItems = useMemo<QuickAccessItem[]>(() => manifestChapters.map((item) => ({ id: item.id, label: item.title, description: `${String(item.order + 1).padStart(2, "0")} / ${t("章・場面")}` })), [manifestChapters, t]);
  const colorTheme = userSettings.appearance.colorTheme === "system" ? (systemDark ? "dark" : "default") : userSettings.appearance.colorTheme;
  const shellClass = `app-shell ui-${colorTheme} accent-${userSettings.appearance.accent} density-${userSettings.appearance.density}`;

  const previousLocaleRef = useRef(locale);
  useEffect(() => {
    const previousLocale = previousLocaleRef.current;
    if (previousLocale !== locale) {
      setLensQuery((current) => current === uiText(previousLocale, DEFAULT_QUERY) ? uiText(locale, DEFAULT_QUERY) : current);
      previousLocaleRef.current = locale;
    }
  }, [locale]);

  useEffect(() => {
    if (writingMode !== "vertical-rl") return;
    const frame = window.requestAnimationFrame(() => {
      for (const editor of Object.values(editorRefs.current)) {
        if (editor === undefined) continue;
        editor.scrollLeft = editor.scrollWidth;
        if (editor.parentElement !== null) editor.parentElement.scrollLeft = editor.parentElement.scrollWidth;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeChapterId, editorSession.groups.length, editorWidth, viewport.width, writingMode]);

  const scopeChapters = useMemo(() => {
    if (activeIndex < 0) return [];
    if (scopeMode === "current") return [manifestChapters[activeIndex]!];
    if (scopeMode === "through-current") return manifestChapters.slice(0, activeIndex + 1);
    return manifestChapters;
  }, [activeIndex, manifestChapters, scopeMode]);

  useEffect(() => { setScopeApproved(false); }, [role, scopeMode, activeChapterId, project?.root]);

  useEffect(() => { setFindMatchIndex((current) => findMatches.length === 0 ? -1 : Math.min(current, findMatches.length - 1)); }, [findMatches.length]);

  useEffect(() => { textRef.current = text; }, [text]);
  useEffect(() => { editorBuffersRef.current = editorBuffers; }, [editorBuffers]);
  useEffect(() => { activeNoteRef.current = activeNote; }, [activeNote]);
  useEffect(() => { noteDraftRef.current = noteDraft; }, [noteDraft]);
  useEffect(() => { editorRef.current = editorRefs.current[editorSession.activeGroupId] ?? null; }, [editorSession.activeGroupId, editorSession.groups.length]);

  useEffect(() => {
    const inputs = Object.entries(editorBuffers.buffers).map(([chapterId, buffer]) => [chapterId, buffer.text] as const);
    const timer = window.setTimeout(() => {
      setEditorStats(Object.fromEntries(inputs.map(([chapterId, value]) => [chapterId, textStats(value)])));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [editorBuffers.buffers]);

  const updateBufferText = useCallback((chapterId: string, value: string): void => {
    setEditorBuffers((current) => {
      const next = editBuffer(current, chapterId, value);
      editorBuffersRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (project === null || sessionHydratedRootRef.current !== project.root) return;
    const timer = window.setTimeout(() => {
      void window.kohon.writeEditorSession(project.root, editorSession).catch((cause) => setError(errorText(cause)));
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
    const preferredGroup = editorSession.groups.find((group) => group.id === editorSession.activeGroupId && group.activeChapterId === chapterId)
      ?? editorSession.groups.find((group) => group.activeChapterId === chapterId);
    const editor = preferredGroup === undefined ? null : editorRefs.current[preferredGroup.id] ?? null;
    return {
      chapterId,
      text: value,
      baseVersion,
      selectionStart: editor?.selectionStart ?? 0,
      selectionEnd: editor?.selectionEnd ?? 0,
      scrollTop: editor?.scrollTop ?? 0,
      scrollLeft: editor?.scrollLeft ?? 0
    };
  }, [editorSession]);

  const saveChapterBuffer = useCallback(async (chapterId: string): Promise<void> => {
    if (project === null) return;
    const buffer = editorBuffersRef.current.buffers[chapterId];
    if (buffer === undefined || buffer.text === buffer.savedText) return;
    const snapshot = { root: project.root, chapterId, text: buffer.text };
    const queueKey = `${snapshot.root}\u0000${snapshot.chapterId}`;
    if (queuedSaveRef.current.get(queueKey) === snapshot.text) return saveQueueRef.current;
    queuedSaveRef.current.set(queueKey, snapshot.text);
    setEditorBuffers((current) => beginSave(current, chapterId));
    const operation = saveQueueRef.current.catch(() => undefined).then(async () => {
      try {
        const result = await window.kohon.saveChapter(snapshot.root, snapshot.chapterId, snapshot.text);
        const latest = editorBuffersRef.current.buffers[chapterId];
        setEditorBuffers((current) => saveSucceeded(current, chapterId, { text: snapshot.text, version: result.version }));
        if (latest === undefined || latest.text === snapshot.text) {
          await window.kohon.clearRecoveryDraft(snapshot.root, snapshot.chapterId);
        } else {
          await window.kohon.writeRecoveryDraft(snapshot.root, currentDraftInput(snapshot.chapterId, latest.text, result.version));
        }
      } catch (cause) {
        setEditorBuffers((current) => saveFailed(current, chapterId));
        setError(errorText(cause));
        throw cause;
      } finally {
        if (queuedSaveRef.current.get(queueKey) === snapshot.text) queuedSaveRef.current.delete(queueKey);
      }
    });
    saveQueueRef.current = operation;
    return operation;
  }, [currentDraftInput, project]);

  const saveActiveNote = useCallback(async (): Promise<void> => {
    if (project === null) return;
    const document = activeNoteRef.current;
    const currentDraft = noteDraftRef.current;
    if (document === null || currentDraft === null || noteDraftMatches(document, currentDraft)) return;
    const snapshot = { ...currentDraft, title: currentDraft.title.trim(), chapterIds: [...currentDraft.chapterIds] };
    if (snapshot.title.length === 0) { const message = t("メモのタイトルを入力してください。"); setNoteSaveState("error"); setError(message); throw new Error(message); }
    setNoteSaveState("saving");
    const operation = noteSaveQueueRef.current.catch(() => undefined).then(async () => {
      try {
        const saved = await window.kohon.saveNote(project.root, snapshot.id, snapshot.title, snapshot.kind, snapshot.chapterIds, snapshot.text);
        activeNoteRef.current = saved;
        setActiveNote(saved);
        setNotes((current) => current.map((note) => note.id === saved.note.id ? saved.note : note));
        const latest = noteDraftRef.current;
        const unchanged = latest !== null && latest.id === snapshot.id && latest.title.trim() === snapshot.title && latest.kind === snapshot.kind && latest.text === snapshot.text && latest.chapterIds.length === snapshot.chapterIds.length && latest.chapterIds.every((id, index) => id === snapshot.chapterIds[index]);
        if (unchanged) { const clean = draftFromNote(saved); noteDraftRef.current = clean; setNoteDraft(clean); setNoteSaveState("saved"); }
        else setNoteSaveState("dirty");
      } catch (cause) { setNoteSaveState("error"); setError(errorText(cause)); throw cause; }
    });
    noteSaveQueueRef.current = operation;
    return operation;
  }, [project, t]);

  const saveNow = useCallback(async (): Promise<void> => {
    if (activeChapterId !== null) await saveChapterBuffer(activeChapterId);
  }, [activeChapterId, saveChapterBuffer]);

  const saveAllBuffers = useCallback(async (): Promise<void> => {
    await Promise.all([saveActiveNote(), ...Object.keys(editorBuffersRef.current.buffers).map((chapterId) => saveChapterBuffer(chapterId))]);
    await saveQueueRef.current;
    await noteSaveQueueRef.current;
  }, [saveActiveNote, saveChapterBuffer]);

  useEffect(() => {
    if (text === savedText) return;
    if (isComposing || project === null || activeChapterId === null || recoveryConflict?.draft.chapterId === activeChapterId) return;
    const timer = window.setTimeout(() => { void saveNow(); }, userSettings.general.autoSaveDelayMs);
    return () => window.clearTimeout(timer);
  }, [activeChapterId, isComposing, project, recoveryConflict, saveNow, saveState, savedText, text, userSettings.general.autoSaveDelayMs]);

  useEffect(() => {
    if (noteDraftMatches(activeNote, noteDraft) || noteDraft === null || activeNote === null) return;
    setNoteSaveState("dirty");
    const timer = window.setTimeout(() => { void saveActiveNote().catch(() => undefined); }, userSettings.general.autoSaveDelayMs);
    return () => window.clearTimeout(timer);
  }, [activeNote, noteDraft, saveActiveNote, userSettings.general.autoSaveDelayMs]);

  useEffect(() => {
    if (project === null || activeChapterId === null || text === savedText || activeBuffer === undefined || activeBuffer.version.length === 0 || isComposing || recoveryConflict?.draft.chapterId === activeChapterId) return;
    const timer = window.setTimeout(() => {
      void window.kohon.writeRecoveryDraft(project.root, currentDraftInput(activeChapterId, text, activeBuffer.version)).catch((cause) => setError(errorText(cause)));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [activeBuffer, activeChapterId, currentDraftInput, isComposing, project, recoveryConflict, savedText, text]);

  const focusRange = useCallback((start: number, end: number): void => {
    window.setTimeout(() => {
      const editor = editorRef.current;
      if (editor === null) return;
      editor.focus();
      editor.setSelectionRange(start, end);
    }, 60);
  }, []);

  const commitActiveTextEdit = useCallback((nextText: string, selectionAfter: TextSelection, origin: EditOrigin): void => {
    if (activeChapterId === null) return;
    const editor = editorRef.current;
    const beforeText = editor?.value ?? editorBuffersRef.current.buffers[activeChapterId]?.text ?? "";
    const selectionBefore = editor === null
      ? { start: beforeText.length, end: beforeText.length }
      : { start: editor.selectionStart, end: editor.selectionEnd };
    editorHistoryRef.current = recordTextEdit(editorHistoryRef.current, {
      chapterId: activeChapterId,
      beforeText,
      afterText: nextText,
      selectionBefore,
      selectionAfter,
      origin,
      timestamp: Date.now()
    });
    textRef.current = nextText;
    updateBufferText(activeChapterId, nextText);
    setEditorSession((current) => updateEditorTabView(current, current.activeGroupId, activeChapterId, { selectionStart: selectionAfter.start, selectionEnd: selectionAfter.end }));
    focusRange(selectionAfter.start, selectionAfter.end);
  }, [activeChapterId, focusRange, updateBufferText]);

  const stepEditorHistory = useCallback((direction: "undo" | "redo"): void => {
    const editor = editorRef.current;
    if (isComposing || compositionRef.current !== null || activeChapterId === null || editor === null) return;
    if (document.activeElement !== editor) {
      document.execCommand(direction);
      return;
    }
    const result = direction === "undo"
      ? undoTextEdit(editorHistoryRef.current, activeChapterId)
      : redoTextEdit(editorHistoryRef.current, activeChapterId);
    if (result.edit === null) return;
    editorHistoryRef.current = result.history;
    const nextText = direction === "undo" ? result.edit.beforeText : result.edit.afterText;
    const selection = direction === "undo" ? result.edit.selectionBefore : result.edit.selectionAfter;
    textRef.current = nextText;
    updateBufferText(activeChapterId, nextText);
    setEditorSession((current) => updateEditorTabView(current, current.activeGroupId, activeChapterId, { selectionStart: selection.start, selectionEnd: selection.end }));
    focusRange(selection.start, selection.end);
  }, [activeChapterId, focusRange, isComposing, updateBufferText]);

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

  const openEditorFind = useCallback((showReplace: boolean): void => {
    if (isComposing || chapter === null) return;
    const editor = editorRef.current;
    const selected = editor === null ? "" : editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (selected.length > 0 && selected.length <= 200) setFindQuery(selected);
    setSettingsOpen(false);
    setQuickAccessMode(null);
    setReplaceVisible(showReplace);
    setFindOpen(true);
  }, [chapter, isComposing]);

  const closeEditorFind = useCallback((): void => {
    setFindOpen(false);
    setReplaceVisible(false);
    window.requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const moveFindMatch = useCallback((delta: -1 | 1): void => {
    if (findMatches.length === 0) return;
    const nextIndex = findMatchIndex < 0 ? (delta === 1 ? 0 : findMatches.length - 1) : (findMatchIndex + delta + findMatches.length) % findMatches.length;
    setFindMatchIndex(nextIndex);
    const match = findMatches[nextIndex]!;
    focusRange(match.start, match.end);
  }, [findMatchIndex, findMatches, focusRange]);

  const replaceCurrentMatch = useCallback((): void => {
    if (isComposing || findMatches.length === 0) return;
    const match = findMatches[Math.max(0, Math.min(findMatchIndex, findMatches.length - 1))]!;
    const result = replaceTextMatch(text, match, replacement);
    commitActiveTextEdit(result.text, { start: result.caret, end: result.caret }, "find-replace");
  }, [commitActiveTextEdit, findMatchIndex, findMatches, isComposing, replacement, text]);

  const replaceEveryMatch = useCallback((): void => {
    if (isComposing || findQuery.length === 0) return;
    const result = replaceAllLiteral(text, findQuery, replacement, caseSensitive);
    if (result.count === 0) return;
    const caret = Math.min(editorRef.current?.selectionStart ?? 0, result.text.length);
    commitActiveTextEdit(result.text, { start: caret, end: caret }, "find-replace");
    setFindMatchIndex(-1);
    setNotice(locale === "en" ? `Replaced ${result.count} occurrence${result.count === 1 ? "" : "s"}.` : `${result.count}件を置換しました。`);
  }, [caseSensitive, commitActiveTextEdit, findQuery, isComposing, locale, replacement, text]);

  const displayChapter = useCallback(async (root: string, next: ChapterDocument, view?: EditorTabState, range?: { start: number; end: number }, restoreView = true): Promise<void> => {
    let recovery: RecoveryDraftResult | null = null;
    try { recovery = await window.kohon.readRecoveryDraft(root, next.chapter.id); }
    catch (cause) { setError(errorText(cause)); }
    const recovered = recovery !== null && !recovery.conflict;
    const displayedText = recovery !== null && !recovery.conflict ? recovery.draft.text : next.text;
    if (restoreView) textRef.current = displayedText;
    setEditorBuffers((current) => loadBuffer(current, { chapter: next.chapter, text: displayedText, savedText: next.text, version: next.version, saveState: recovered ? "dirty" : "saved", recoveryConflict: recovery?.conflict ? recovery : null }));
    if (recovered) setNotice(locale === "en" ? `Recovered unsaved changes for “${next.chapter.title}”.` : `「${next.chapter.title}」の未保存内容を復旧しました。`);
    else if (recovery?.conflict) setNotice(locale === "en" ? `A recovery draft for “${next.chapter.title}” conflicts with saved content.` : `「${next.chapter.title}」に保存内容と競合する復旧ドラフトがあります。`);
    if (restoreView) {
      if (range !== undefined) focusRange(range.start, range.end);
      else restoreEditorView(recovered ? recovery?.draft : view);
    }
  }, [focusRange, locale, restoreEditorView]);

  const reloadOpenBuffers = useCallback(async (root: string, sessionState: EditorSessionState): Promise<void> => {
    editorHistoryRef.current = createEditorHistory();
    pendingInputRef.current = null;
    compositionRef.current = null;
    skipCompositionInputRef.current = null;
    setIsComposing(false);
    setEditorBuffers(createEditorBuffers());
    const activeGroup = sessionState.groups.find((group) => group.id === sessionState.activeGroupId) ?? sessionState.groups[0];
    const loaded = new Set<string>();
    for (const group of sessionState.groups) {
      if (group.activeChapterId === null || loaded.has(group.activeChapterId)) continue;
      loaded.add(group.activeChapterId);
      const document = await window.kohon.readChapter(root, group.activeChapterId);
      await displayChapter(root, document, group.tabs.find((item) => item.chapterId === group.activeChapterId), undefined, group.id === activeGroup?.id);
    }
  }, [displayChapter]);

  const loadChapter = useCallback(async (chapterId: string, range?: { start: number; end: number }, groupId: EditorGroupId = editorSession.activeGroupId): Promise<void> => {
    if (project === null) return;
    await saveNow();
    clearMessages();
    setBusy(true);
    try {
      const nextSession = openEditorTab(captureEditorView(), chapterId, groupId);
      setEditorSession(nextSession);
      const group = nextSession.groups.find((item) => item.id === groupId);
      const view = group?.tabs.find((item) => item.chapterId === chapterId);
      const existing = editorBuffersRef.current.buffers[chapterId];
      if (existing !== undefined) {
        textRef.current = existing.text;
        if (range !== undefined) focusRange(range.start, range.end); else restoreEditorView(view);
      } else {
        const next = await window.kohon.readChapter(project.root, chapterId);
        await displayChapter(project.root, next, view, range);
      }
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }, [captureEditorView, clearMessages, displayChapter, editorSession.activeGroupId, focusRange, project, restoreEditorView, saveNow]);

  const adoptProject = useCallback(async (next: ProjectSummary | null): Promise<void> => {
    if (next === null) return;
    const restoredSession = await window.kohon.readEditorSession(next.root);
    let restoredReviews: ReviewLedgerEntry[] = [];
    let restoredNotes: NoteMeta[] = [];
    let reviewWarning: string | null = null;
    try { restoredReviews = await window.kohon.listReviewFindings(next.root); }
    catch (cause) { reviewWarning = `${t("指摘台帳を読み込めませんでした。本文はそのまま編集できます。")} ${errorText(cause)}`; }
    try { restoredNotes = await window.kohon.listNotes(next.root); }
    catch (cause) { reviewWarning = `${reviewWarning === null ? "" : `${reviewWarning} `}${t("作業メモを読み込めませんでした。本文はそのまま編集できます。")} ${errorText(cause)}`; }
    sessionHydratedRootRef.current = next.root;
    setProject(next);
    setEditorSession(restoredSession);
    setEditorBuffers(createEditorBuffers());
    setThreads(EMPTY_THREADS());
    setLensResult(null);
    setReviewFindings(restoredReviews);
    setNotes(restoredNotes);
    setActiveNote(null); activeNoteRef.current = null;
    setNoteDraft(null); noteDraftRef.current = null;
    setNoteSaveState("saved");
    setShowAllNotes(false);
    setSearchHits([]);
    setCheckpoints([]);
    setHistoryDiff(null);
    setError(reviewWarning);
    setNotice(locale === "en" ? `Opened “${next.manifest.title}”.` : `「${next.manifest.title}」を開きました。`);
    const first = [...next.manifest.chapters].sort((a, b) => a.order - b.order)[0];
    if (first === undefined) {
      textRef.current = "";
      setEditorBuffers(createEditorBuffers());
      return;
    }
    await reloadOpenBuffers(next.root, restoredSession);
  }, [locale, reloadOpenBuffers, t]);

  const recordEditorView = useCallback((groupId: EditorGroupId, chapterId: string, editor: HTMLTextAreaElement): void => {
    setEditorSession((current) => updateEditorTabView(current, groupId, chapterId, { selectionStart: editor.selectionStart, selectionEnd: editor.selectionEnd, scrollTop: editor.scrollTop, scrollLeft: editor.scrollLeft }));
  }, []);

  const closeChapterTab = useCallback(async (chapterId: string, groupId: EditorGroupId): Promise<void> => {
    if (project === null) return;
    await saveChapterBuffer(chapterId);
    const captured = groupId === editorSession.activeGroupId ? captureEditorView() : editorSession;
    let nextSession = closeEditorTab(captured, groupId, chapterId);
    if (nextSession.groups.length > 1 && nextSession.groups.find((group) => group.id === groupId)?.tabs.length === 0) nextSession = closeEditorGroup(nextSession, groupId);
    setEditorSession(nextSession);
    const referenced = nextSession.groups.flatMap((item) => item.tabs.map((tabState) => tabState.chapterId));
    setEditorBuffers((current) => pruneBuffers(current, referenced));
    const nextGroup = nextSession.groups.find((item) => item.id === nextSession.activeGroupId) ?? nextSession.groups[0];
    const nextId = nextGroup?.activeChapterId ?? null;
    if (nextId === null) {
      textRef.current = "";
      return;
    }
    if (editorBuffersRef.current.buffers[nextId] !== undefined) return;
    const loaded = await window.kohon.readChapter(project.root, nextId);
    const nextView = nextGroup?.tabs.find((item) => item.chapterId === nextId);
    await displayChapter(project.root, loaded, nextView);
  }, [captureEditorView, displayChapter, editorSession, project, saveChapterBuffer]);

  const activateEditorGroup = useCallback((groupId: EditorGroupId): void => {
    if (groupId === editorSession.activeGroupId) return;
    const captured = captureEditorView();
    const next = { ...captured, activeGroupId: groupId };
    setEditorSession(next);
    const chapterId = next.groups.find((group) => group.id === groupId)?.activeChapterId;
    if (chapterId !== null && chapterId !== undefined) textRef.current = editorBuffersRef.current.buffers[chapterId]?.text ?? "";
    editorRef.current = editorRefs.current[groupId] ?? null;
  }, [captureEditorView, editorSession.activeGroupId]);

  const splitActiveEditor = useCallback((direction: "right" | "down"): void => {
    if (activeChapterId === null) return;
    const next = splitEditor(captureEditorView(), direction, activeChapterId);
    setEditorSession(next);
    window.requestAnimationFrame(() => editorRefs.current[next.activeGroupId]?.focus());
  }, [activeChapterId, captureEditorView]);

  const closeActiveEditorGroup = useCallback(async (): Promise<void> => {
    if (editorSession.groups.length < 2) return;
    const currentGroup = editorSession.groups.find((group) => group.id === editorSession.activeGroupId);
    if (currentGroup === undefined) return;
    await Promise.all(currentGroup.tabs.map((tabState) => saveChapterBuffer(tabState.chapterId)));
    const next = closeEditorGroup(captureEditorView(), currentGroup.id);
    setEditorSession(next);
    const referenced = next.groups.flatMap((group) => group.tabs.map((tabState) => tabState.chapterId));
    setEditorBuffers((current) => pruneBuffers(current, referenced));
  }, [captureEditorView, editorSession, saveChapterBuffer]);

  const useRecoveryDraft = useCallback((): void => {
    if (recoveryConflict === null) return;
    const draft = recoveryConflict.draft;
    textRef.current = draft.text;
    editorHistoryRef.current = clearTextHistory(editorHistoryRef.current, draft.chapterId);
    if (activeChapterId !== null) setEditorBuffers((current) => applyRecoveryDraft(current, activeChapterId));
    restoreEditorView(draft);
    setNotice(t("復旧ドラフトを本文へ戻しました。自動保存します。"));
  }, [activeChapterId, recoveryConflict, restoreEditorView, t]);

  const discardRecoveryDraft = useCallback(async (): Promise<void> => {
    if (project === null || recoveryConflict === null) return;
    try {
      await window.kohon.clearRecoveryDraft(project.root, recoveryConflict.draft.chapterId);
      setEditorBuffers((current) => dismissRecoveryConflict(current, recoveryConflict.draft.chapterId));
      setNotice(t("復旧ドラフトを破棄し、現在の保存内容を維持しました。"));
    } catch (cause) { setError(errorText(cause)); }
  }, [project, recoveryConflict, t]);

  const createProject = useCallback(async (): Promise<void> => {
    const title = await requestText({
      title: t("新しい作品を作る"),
      label: t("作品名"),
      initialValue: t("新しい小説"),
      confirmLabel: t("保存場所を選ぶ")
    });
    if (title === null || title.trim().length === 0) return;
    await saveAllBuffers(); clearMessages(); setBusy(true);
    try { await adoptProject(await window.kohon.createProject(title.trim())); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }, [adoptProject, clearMessages, requestText, saveAllBuffers, t]);

  const openProject = useCallback(async (): Promise<void> => {
    await saveAllBuffers(); clearMessages(); setBusy(true);
    try { await adoptProject(await window.kohon.openProject()); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }, [adoptProject, clearMessages, saveAllBuffers]);

  const exportProject = useCallback(async (): Promise<void> => {
    if (project === null) return;
    try { await saveAllBuffers(); const path = await window.kohon.exportMarkdown(project.root); if (path !== null) setNotice(locale === "en" ? `Exported Markdown: ${path}` : `Markdownを書き出しました: ${path}`); }
    catch (cause) { setError(errorText(cause)); }
  }, [locale, project, saveAllBuffers]);

  const exportText = useCallback(async (): Promise<void> => {
    if (project === null) return;
    try { await saveAllBuffers(); const path = await window.kohon.exportText(project.root); if (path !== null) setNotice(locale === "en" ? `Exported TXT: ${path}` : `TXTを書き出しました: ${path}`); }
    catch (cause) { setError(errorText(cause)); }
  }, [locale, project, saveAllBuffers]);

  const refreshProject = useCallback(async (): Promise<ProjectSummary | null> => {
    if (project === null) return null;
    const refreshed = await window.kohon.refreshProject(project.root);
    setProject(refreshed);
    return refreshed;
  }, [project]);

  const addChapter = useCallback(async (kind: ChapterKind = "chapter"): Promise<void> => {
    if (project === null) return;
    const ordinal = manifestChapters.filter((item) => (item.kind ?? "chapter") === kind).length + 1;
    const title = await requestText({
      title: t(kind === "scene" ? "場面を追加" : "章を追加"),
      label: t("タイトル"),
      initialValue: kind === "scene" ? defaultSceneTitle(ordinal, locale) : defaultChapterTitle(ordinal, locale),
      confirmLabel: t("追加する")
    });
    if (title === null || title.trim().length === 0) return;
    try { await saveNow(); const created = await window.kohon.createChapter(project.root, title.trim(), kind); await refreshProject(); await loadChapter(created.id); }
    catch (cause) { setError(errorText(cause)); }
  }, [loadChapter, locale, manifestChapters, project, refreshProject, requestText, saveNow, t]);

  const importDocuments = useCallback(async (): Promise<void> => {
    if (project === null) return;
    try {
      await saveAllBuffers();
      const imported = await window.kohon.importDocuments(project.root);
      if (imported === null) return;
      setProject(imported.project);
      const firstId = imported.importedChapterIds[0];
      if (firstId !== undefined) await loadChapter(firstId);
      setNotice(locale === "en" ? `Imported ${imported.importedChapterIds.length} file${imported.importedChapterIds.length === 1 ? "" : "s"}.` : `${imported.importedChapterIds.length}件のファイルを取り込みました。`);
    } catch (cause) { setError(errorText(cause)); }
  }, [loadChapter, locale, project, saveAllBuffers]);

  const moveChapterById = useCallback(async (chapterId: string, delta: -1 | 1): Promise<void> => {
    if (project === null) return;
    const index = manifestChapters.findIndex((item) => item.id === chapterId);
    if (index < 0) return;
    const destination = index + delta;
    if (destination < 0 || destination >= manifestChapters.length) return;
    const ids = manifestChapters.map((item) => item.id);
    const current = ids[index]!;
    ids[index] = ids[destination]!;
    ids[destination] = current;
    try { setProject(await window.kohon.reorderChapters(project.root, ids)); }
    catch (cause) { setError(errorText(cause)); }
  }, [manifestChapters, project]);

  const moveChapter = useCallback(async (delta: -1 | 1): Promise<void> => {
    if (activeChapterId !== null) await moveChapterById(activeChapterId, delta);
  }, [activeChapterId, moveChapterById]);

  const dropChapter = useCallback(async (boundaryIndex: number): Promise<void> => {
    if (project === null || chapterDragId === null) return;
    const ids = manifestChapters.map((item) => item.id);
    const sourceIndex = ids.indexOf(chapterDragId);
    if (sourceIndex < 0) return;
    ids.splice(sourceIndex, 1);
    const insertionIndex = Math.max(0, Math.min(ids.length, boundaryIndex > sourceIndex ? boundaryIndex - 1 : boundaryIndex));
    ids.splice(insertionIndex, 0, chapterDragId);
    setChapterDragId(null); setChapterDropIndex(null);
    if (ids.every((id, index) => id === manifestChapters[index]?.id)) return;
    try { setProject(await window.kohon.reorderChapters(project.root, ids)); }
    catch (cause) { setError(errorText(cause)); }
  }, [chapterDragId, manifestChapters, project]);

  const updateNoteDraft = useCallback((patch: Partial<Omit<NoteDraft, "id">>): void => {
    const current = noteDraftRef.current;
    if (current === null) return;
    const next = { ...current, ...patch };
    noteDraftRef.current = next;
    setNoteDraft(next);
    setNoteSaveState("dirty");
  }, []);

  const openNote = useCallback(async (id: string): Promise<void> => {
    if (project === null) return;
    try {
      await saveActiveNote();
      const document = await window.kohon.readNote(project.root, id);
      const draft = draftFromNote(document);
      activeNoteRef.current = document; noteDraftRef.current = draft;
      setActiveNote(document); setNoteDraft(draft); setNoteSaveState("saved");
    } catch (cause) { setError(errorText(cause)); }
  }, [project, saveActiveNote]);

  const createNote = useCallback(async (): Promise<void> => {
    if (project === null) return;
    const title = await requestText({ title: t("作業メモを追加"), label: t("タイトル"), initialValue: t("新しいメモ"), confirmLabel: t("追加する") });
    if (title === null) return;
    try {
      await saveActiveNote();
      const document = await window.kohon.createNote(project.root, title, "memo", activeChapterId === null ? [] : [activeChapterId]);
      const draft = draftFromNote(document);
      activeNoteRef.current = document; noteDraftRef.current = draft;
      setNotes((current) => [...current, document.note]); setActiveNote(document); setNoteDraft(draft); setNoteSaveState("saved");
    } catch (cause) { setError(errorText(cause)); }
  }, [activeChapterId, project, requestText, saveActiveNote, t]);

  const toggleCurrentChapterPin = useCallback((): void => {
    if (activeChapterId === null || noteDraftRef.current === null) return;
    const pinned = noteDraftRef.current.chapterIds.includes(activeChapterId);
    updateNoteDraft({ chapterIds: pinned ? noteDraftRef.current.chapterIds.filter((id) => id !== activeChapterId) : [...noteDraftRef.current.chapterIds, activeChapterId] });
  }, [activeChapterId, updateNoteDraft]);

  const setActiveNoteArchived = useCallback(async (archived: boolean): Promise<void> => {
    if (project === null || activeNoteRef.current === null) return;
    try {
      await saveActiveNote();
      const updated = await window.kohon.setNoteArchived(project.root, activeNoteRef.current.note.id, archived);
      setNotes(updated);
      const note = updated.find((candidate) => candidate.id === activeNoteRef.current?.note.id);
      if (note !== undefined && activeNoteRef.current !== null) { const document = { ...activeNoteRef.current, note }; activeNoteRef.current = document; setActiveNote(document); }
    } catch (cause) { setError(errorText(cause)); }
  }, [project, saveActiveNote]);

  const renameProject = useCallback(async (): Promise<void> => {
    if (project === null) return;
    const title = await requestText({
      title: t("作品名を変更"),
      label: t("作品名"),
      initialValue: project.manifest.title,
      confirmLabel: t("変更する")
    });
    if (title === null || title.trim().length === 0 || title.trim() === project.manifest.title) return;
    try { setProject(await window.kohon.renameProject(project.root, title.trim())); }
    catch (cause) { setError(errorText(cause)); }
  }, [project, requestText, t]);

  const renameChapter = useCallback(async (): Promise<void> => {
    if (project === null || chapter === null) return;
    const title = await requestText({
      title: t("章・場面の名前を変更"),
      label: t("タイトル"),
      initialValue: chapter.chapter.title,
      confirmLabel: t("変更する")
    });
    if (title === null || title.trim().length === 0 || title.trim() === chapter.chapter.title) return;
    try { await window.kohon.renameChapter(project.root, chapter.chapter.id, title.trim()); const refreshed = await refreshProject(); const found = refreshed?.manifest.chapters.find((item) => item.id === chapter.chapter.id); if (found !== undefined) setEditorBuffers((current) => { const buffer = current.buffers[found.id]; return buffer === undefined ? current : loadBuffer(current, { chapter: found, text: buffer.text, savedText: buffer.savedText, version: buffer.version, saveState: buffer.saveState, recoveryConflict: buffer.recoveryConflict }); }); }
    catch (cause) { setError(errorText(cause)); }
  }, [chapter, project, refreshProject, requestText, t]);

  const saveChapterMetadata = useCallback(async (metadata: ChapterMetadata): Promise<void> => {
    if (project === null || activeChapterId === null) return;
    try {
      const refreshed = await window.kohon.updateChapterMetadata(project.root, activeChapterId, metadata);
      const found = refreshed.manifest.chapters.find((item) => item.id === activeChapterId);
      setProject(refreshed);
      if (found !== undefined) setEditorBuffers((current) => {
        const buffer = current.buffers[found.id];
        return buffer === undefined ? current : loadBuffer(current, { chapter: found, text: buffer.text, savedText: buffer.savedText, version: buffer.version, saveState: buffer.saveState, recoveryConflict: buffer.recoveryConflict });
      });
      setNotice(t("章・場面情報を保存しました。"));
    } catch (cause) { setError(errorText(cause)); throw cause; }
  }, [activeChapterId, project, t]);

  const deleteChapter = useCallback(async (): Promise<void> => {
    if (project === null || chapter === null) return;
    if (manifestChapters.length <= 1) { setError(t("作品には少なくとも1つの章・場面が必要です。")); return; }
    if (!window.confirm(locale === "en" ? `Delete “${chapter.chapter.title}”? A checkpoint will be created first.` : `「${chapter.chapter.title}」を削除します。直前に保存点を作成します。よろしいですか？`)) return;
    try {
      await saveNow();
      await window.kohon.createCheckpoint(project.root, locale === "en" ? `Before deleting “${chapter.chapter.title}”` : `「${chapter.chapter.title}」削除前`);
      const oldIndex = activeIndex;
      await window.kohon.deleteChapter(project.root, chapter.chapter.id);
      editorHistoryRef.current = clearTextHistory(editorHistoryRef.current, chapter.chapter.id);
      const refreshed = await refreshProject();
      const next = refreshed?.manifest.chapters[Math.max(0, Math.min(oldIndex, (refreshed?.manifest.chapters.length ?? 1) - 1))];
      if (next !== undefined) {
        const restoredSession = openEditorTab(await window.kohon.readEditorSession(project.root), next.id);
        setEditorSession(restoredSession);
        const referenced = restoredSession.groups.flatMap((item) => item.tabs.map((tabState) => tabState.chapterId));
        setEditorBuffers((current) => pruneBuffers(current, referenced));
        const loaded = await window.kohon.readChapter(project.root, next.id);
        await displayChapter(project.root, loaded, restoredSession.groups[0]?.tabs.find((item) => item.chapterId === next.id));
      }
    } catch (cause) { setError(errorText(cause)); }
  }, [activeIndex, chapter, displayChapter, locale, manifestChapters.length, project, refreshProject, saveNow, t]);

  const splitCurrentChapter = useCallback(async (): Promise<void> => {
    if (project === null || chapter === null) return;
    const editor = editorRef.current;
    const offset = editor?.selectionStart ?? 0;
    if (offset <= 0 || offset >= chapter.text.length) { setError(t("本文の途中へカーソルを置いてください。")); return; }
    const sceneNumber = manifestChapters.filter((item) => item.kind === "scene").length + 1;
    const title = await requestText({ title: t("カーソル位置で場面を分割"), label: t("新しい場面のタイトル"), initialValue: defaultSceneTitle(sceneNumber, locale), confirmLabel: t("分割する") });
    if (title === null) return;
    try {
      await saveAllBuffers();
      await window.kohon.createCheckpoint(project.root, locale === "en" ? `Before splitting “${chapter.chapter.title}”` : `「${chapter.chapter.title}」場面分割前`);
      const captured = captureEditorView();
      const result = await window.kohon.splitChapter(project.root, chapter.chapter.id, offset, title);
      const nextSession = openEditorTab(captured, result.created.id, captured.activeGroupId);
      setProject(result.project); setEditorSession(nextSession);
      await reloadOpenBuffers(project.root, nextSession);
      setNotes(await window.kohon.listNotes(project.root));
      setReviewFindings(await window.kohon.listReviewFindings(project.root));
      setCheckpoints(await window.kohon.listCheckpoints(project.root));
      setNotice(locale === "en" ? `Split into “${result.created.title}”.` : `「${result.created.title}」へ分割しました。`);
    } catch (cause) { setError(errorText(cause)); }
  }, [captureEditorView, chapter, locale, manifestChapters, project, reloadOpenBuffers, requestText, saveAllBuffers, t]);

  const mergeCurrentChapterIntoPrevious = useCallback(async (): Promise<void> => {
    if (project === null || chapter === null || activeIndex <= 0) return;
    const target = manifestChapters[activeIndex - 1]!;
    if (!window.confirm(locale === "en" ? `Merge “${chapter.chapter.title}” into the previous “${target.title}”? A checkpoint will be created first.` : `「${chapter.chapter.title}」を前の「${target.title}」へ結合します。実行前の保存点は自動で残します。`)) return;
    try {
      await saveAllBuffers();
      const targetBefore = await window.kohon.readChapter(project.root, target.id);
      await window.kohon.createCheckpoint(project.root, locale === "en" ? `Before merging “${chapter.chapter.title}”` : `「${chapter.chapter.title}」結合前`);
      let nextSession = captureEditorView();
      const sourceGroupId = nextSession.activeGroupId;
      const result = await window.kohon.mergeChapterIntoPrevious(project.root, chapter.chapter.id);
      for (const group of [...nextSession.groups]) nextSession = closeEditorTab(nextSession, group.id, chapter.chapter.id);
      nextSession = openEditorTab(nextSession, result.target.id, sourceGroupId);
      setProject(result.project); setEditorSession(nextSession);
      await reloadOpenBuffers(project.root, nextSession);
      focusRange(targetBefore.text.length, targetBefore.text.length);
      setNotes(await window.kohon.listNotes(project.root));
      setReviewFindings(await window.kohon.listReviewFindings(project.root));
      setCheckpoints(await window.kohon.listCheckpoints(project.root));
      setNotice(locale === "en" ? `Merged into “${result.target.title}”.` : `「${result.target.title}」へ結合しました。`);
    } catch (cause) { setError(errorText(cause)); }
  }, [activeIndex, captureEditorView, chapter, focusRange, locale, manifestChapters, project, reloadOpenBuffers, saveAllBuffers]);

  const runSearch = useCallback(async (): Promise<void> => {
    if (project === null || searchQuery.trim().length === 0) { setSearchHits([]); return; }
    try { const query = searchQuery.trim(); await saveAllBuffers(); setSearchHits(await window.kohon.search(project.root, query, searchCaseSensitive)); setSearchRun({ query, caseSensitive: searchCaseSensitive }); }
    catch (cause) { setError(errorText(cause)); }
  }, [project, saveAllBuffers, searchCaseSensitive, searchQuery]);

  const replaceAcrossProject = useCallback(async (): Promise<void> => {
    if (project === null || searchQuery.trim().length === 0 || searchHits.length === 0 || searchRun?.query !== searchQuery.trim() || searchRun.caseSensitive !== searchCaseSensitive) return;
    const chapterCount = new Set(searchHits.map((hit) => hit.chapterId)).size;
    if (!window.confirm(locale === "en" ? `Replace ${searchHits.length} occurrence${searchHits.length === 1 ? "" : "s"} across ${chapterCount} chapter${chapterCount === 1 ? "" : "s"}? A checkpoint will be created first.` : `${chapterCount}章の${searchHits.length}件を置換します。実行前の保存点は自動で作成されます。よろしいですか？`)) return;
    try {
      await saveAllBuffers();
      const result = await window.kohon.replaceProjectText(project.root, searchQuery.trim(), searchReplacement, searchCaseSensitive);
      await reloadOpenBuffers(project.root, editorSession);
      setSearchHits(await window.kohon.search(project.root, searchQuery.trim(), searchCaseSensitive));
      setNotice(locale === "en" ? `Replaced ${result.count} occurrence${result.count === 1 ? "" : "s"} across ${result.chapterCount} chapter${result.chapterCount === 1 ? "" : "s"}.` : `${result.chapterCount}章の${result.count}件を置換しました。`);
    } catch (cause) { setError(errorText(cause)); }
  }, [editorSession, locale, project, reloadOpenBuffers, saveAllBuffers, searchCaseSensitive, searchHits, searchQuery, searchReplacement, searchRun]);

  const loadCheckpoints = useCallback(async (): Promise<void> => {
    if (project === null) return;
    try { setCheckpoints(await window.kohon.listCheckpoints(project.root)); }
    catch (cause) { setError(errorText(cause)); }
  }, [project]);

  useEffect(() => {
    const historySlot = slotOf(userSettings.layout, "history");
    if (historySlot !== null && !userSettings.layout.zenMode && userSettings.layout.slots[historySlot].visible && userSettings.layout.slots[historySlot].activeView === "history") void loadCheckpoints();
  }, [loadCheckpoints, userSettings.layout]);

  const createCheckpoint = useCallback(async (): Promise<void> => {
    if (project === null) return;
    const subject = await requestText({
      title: t("保存点を作る"),
      label: t("保存点の名前"),
      initialValue: t("ここまでの改稿"),
      confirmLabel: t("保存点を作る")
    });
    if (subject === null || subject.trim().length === 0) return;
    try { await saveAllBuffers(); await window.kohon.createCheckpoint(project.root, subject.trim()); await loadCheckpoints(); setNotice(t("保存点を作成しました。")); }
    catch (cause) { setError(errorText(cause)); }
  }, [loadCheckpoints, project, requestText, saveAllBuffers, t]);

  const compareCurrentCheckpoint = useCallback(async (entry: CheckpointEntry): Promise<void> => {
    if (project === null) return;
    try { await saveAllBuffers(); setHistoryDiff(await window.kohon.compareCurrentToCheckpoint(project.root, entry.commit)); }
    catch (cause) { setError(errorText(cause)); }
  }, [project, saveAllBuffers]);

  const compareCheckpointPair = useCallback(async (leftCommit: string, rightCommit: string): Promise<void> => {
    if (project === null || leftCommit === rightCommit) return;
    try { setHistoryDiff(await window.kohon.compareCheckpoints(project.root, leftCommit, rightCommit)); }
    catch (cause) { setError(errorText(cause)); }
  }, [project]);

  const restoreCheckpoint = useCallback(async (entry: CheckpointEntry): Promise<void> => {
    if (project === null || !window.confirm(locale === "en" ? `Restore checkpoint “${entry.subject}”? The current state will be kept as a checkpoint.` : `保存点「${entry.subject}」へ戻します。現在の状態は復元前の保存点として残します。`)) return;
    try {
      await saveAllBuffers();
      const restored = await window.kohon.restoreCheckpoint(project.root, entry.commit);
      editorHistoryRef.current = createEditorHistory();
      setProject(restored);
      setEditorBuffers(createEditorBuffers());
      const desired = restored.manifest.chapters.find((item) => item.id === activeChapterId) ?? restored.manifest.chapters[0];
      if (desired !== undefined) {
        const restoredSession = openEditorTab(await window.kohon.readEditorSession(restored.root), desired.id);
        setEditorSession(restoredSession);
        const activeGroup = restoredSession.groups.find((group) => group.id === restoredSession.activeGroupId) ?? restoredSession.groups[0];
        const loaded = await window.kohon.readChapter(restored.root, desired.id);
        await displayChapter(restored.root, loaded, activeGroup?.tabs.find((item) => item.chapterId === desired.id));
        for (const group of restoredSession.groups) {
          if (group.id === activeGroup?.id || group.activeChapterId === null || group.activeChapterId === desired.id) continue;
          const background = await window.kohon.readChapter(restored.root, group.activeChapterId);
          await displayChapter(restored.root, background, group.tabs.find((item) => item.chapterId === group.activeChapterId), undefined, false);
        }
      }
      await loadCheckpoints();
      setNotice(t("保存点から復元しました。"));
    } catch (cause) { setError(errorText(cause)); }
  }, [activeChapterId, displayChapter, loadCheckpoints, locale, project, saveAllBuffers, t]);

  const restoreCheckpointChapter = useCallback(async (commit: string, chapterId: string, title: string): Promise<void> => {
    if (project === null || !window.confirm(locale === "en" ? `Restore only “${title}” from the selected checkpoint? Other chapters will not change, and the current project will be checkpointed first.` : `「${title}」だけを選択した保存点へ戻します。他の章は変更しません。復元前の全体状態も自動で残します。`)) return;
    try {
      await saveAllBuffers();
      const restored = await window.kohon.restoreCheckpointChapter(project.root, commit, chapterId);
      setProject(restored);
      await reloadOpenBuffers(restored.root, editorSession);
      setReviewFindings(await window.kohon.listReviewFindings(restored.root));
      setCheckpoints(await window.kohon.listCheckpoints(restored.root));
      setHistoryDiff(await window.kohon.compareCurrentToCheckpoint(restored.root, commit));
      setNotice(locale === "en" ? `Restored only “${title}” from the checkpoint.` : `「${title}」だけを保存点から復元しました。`);
    } catch (cause) { setError(errorText(cause)); }
  }, [editorSession, locale, project, reloadOpenBuffers, saveAllBuffers]);

  const createVariation = useCallback(async (): Promise<void> => {
    if (project === null) return;
    try { await saveAllBuffers(); const path = await window.kohon.createVariation(project.root); if (path !== null) setNotice(locale === "en" ? `Created variation: ${path}` : `別案を作成しました: ${path}`); }
    catch (cause) { setError(errorText(cause)); }
  }, [locale, project, saveAllBuffers]);

  const updateProjectSettings = useCallback(async (patch: ProjectSettings): Promise<void> => {
    if (project === null) return;
    try { setProject(await window.kohon.updateSettings(project.root, patch)); }
    catch (cause) { setError(errorText(cause)); }
  }, [project]);

  const resetProjectSetting = useCallback(async (key: "writingMode" | "theme" | "canvasBackground" | "canvasText" | "font" | "fontSize" | "lineHeight" | "width"): Promise<void> => {
    if (project === null) return;
    try { setProject(await window.kohon.resetProjectSetting(project.root, key)); }
    catch (cause) { setError(errorText(cause)); throw cause; }
  }, [project]);

  const updateUserSettings = useCallback(async (patch: UserSettingsPatch): Promise<void> => {
    try {
      const next = await window.kohon.updateUserSettings(patch);
      setUserSettings(next);
      if (patch.ai?.defaultProvider !== undefined) setProvider(next.ai.defaultProvider);
      if (patch.ai?.codexModel !== undefined) setModelId(next.ai.codexModel);
      else if (patch.ai?.openaiModel !== undefined) setModelId(next.ai.openaiModel);
    } catch (cause) { setError(errorText(cause)); throw cause; }
  }, []);

  const toggleColorTheme = useCallback((): void => {
    void updateUserSettings({ appearance: { colorTheme: colorTheme === "dark" ? "light" : "dark" } });
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

  const resizePaneFromKeyboard = useCallback((slot: SlotId, event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const layout = userSettings.layout;
    const limits = LAYOUT_LIMITS[slot];
    const current = layout.slots[slot].size;
    let next: number | null = null;

    if (event.key === "Home") next = limits.min;
    else if (event.key === "End") next = limits.max;
    else if (slot === "bottom" && (event.key === "ArrowUp" || event.key === "ArrowDown")) next = current + (event.key === "ArrowUp" ? 10 : -10);
    else if (slot !== "bottom" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      const growingDirection = sideOf(slot, layout) === "left" ? "ArrowRight" : "ArrowLeft";
      next = current + (event.key === growingDirection ? 10 : -10);
    }
    if (next === null) return;

    event.preventDefault();
    const size = Math.max(limits.min, Math.min(limits.max, next));
    commitLayout({
      ...layout,
      slots: { ...layout.slots, [slot]: { ...layout.slots[slot], size } }
    }, locale === "en" ? `Panel resized to ${Math.round(size)} pixels` : `パネルのサイズを${Math.round(size)}ピクセルに変更しました`);
  }, [commitLayout, locale, userSettings.layout]);

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
        commitLayout(next, locale === "en" ? `Moved ${viewLabel(session.view)}` : `${VIEW_LABELS[session.view]}を移動しました`);
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
  }, [commitLayout, detectDropTarget, isComposing, locale, userSettings.layout, viewLabel]);

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
    try { setConnections(await window.kohon.connectionStatus()); }
    catch (cause) { setError(errorText(cause)); }
  }, []);

  const connectOpenAI = useCallback(async (key: string): Promise<void> => {
    try { setConnections(await window.kohon.connectOpenAI(key)); }
    catch (cause) { await refreshConnections(); throw cause; }
  }, [refreshConnections]);

  const disconnectOpenAI = useCallback(async (): Promise<void> => {
    setConnections(await window.kohon.disconnectOpenAI());
  }, []);

  const loginCodex = useCallback(async (): Promise<void> => {
    try { setConnections(await window.kohon.loginCodex()); }
    catch (cause) { await refreshConnections(); throw cause; }
  }, [refreshConnections]);

  const logoutCodex = useCallback(async (): Promise<void> => {
    setConnections(await window.kohon.logoutCodex());
  }, []);

  const refreshCodexModels = useCallback(async (): Promise<void> => {
    setConnections(await window.kohon.refreshCodexModels());
  }, []);

  const loginGitHub = useCallback(async (): Promise<void> => {
    try { setConnections(await window.kohon.loginGitHub()); }
    catch (cause) { await refreshConnections(); throw cause; }
  }, [refreshConnections]);

  const checkUpdates = useCallback(async (): Promise<void> => {
    setUpdateStatus(await window.kohon.checkForUpdates());
  }, []);

  const resetKeybindings = useCallback(async (): Promise<void> => {
    setUserSettings(await window.kohon.resetKeybindings());
  }, []);

  const openExternalPage = useCallback(async (page: "chatgpt" | "openai-api-keys" | "github-cli" | "github-applications" | "latest-release"): Promise<void> => {
    try { await window.kohon.openExternalPage(page); }
    catch (cause) { setError(errorText(cause)); }
  }, []);

  const installUpdate = useCallback(async (): Promise<void> => {
    try {
      await saveAllBuffers();
      setUpdateStatus(await window.kohon.installUpdate());
    }
    catch (cause) { setError(errorText(cause)); }
  }, [saveAllBuffers]);

  const openUpdatePage = useCallback(async (): Promise<void> => {
    try { await window.kohon.openUpdatePage(); }
    catch (cause) { setError(errorText(cause)); }
  }, []);

  const invokeLens = useCallback(async (): Promise<void> => {
    if (project === null || scopeChapters.length === 0 || !scopeApproved) return;
    const query = lensQuery.trim();
    if (query.length === 0) return;
    setLensBusy(true); setError(null); setNotice(null);
    try {
      await saveAllBuffers();
      const userMessage: LensMessage = { sender: "author", text: query, createdAt: new Date().toISOString() };
      const conversation = [...threads[role], userMessage];
      const result = await window.kohon.runLens({ root: project.root, role, query, scope: scopeMode, cutoffChapterId: scopeMode === "all" ? null : activeChapterId, approvedChapterIds: scopeChapters.map((item) => item.id), provider, modelId: provider === "mock" ? "offline-mock-v0.1" : modelId, conversation });
      setLensResult(result);
      if (result.ledgerStored === false) setError(`${t("AIの回答は表示できますが、指摘台帳へ保存できませんでした。")} ${result.ledgerMessage ?? ""}`);
      else {
        try { setReviewFindings(await window.kohon.listReviewFindings(project.root)); }
        catch (cause) { setError(`${t("AIの回答は表示できますが、指摘台帳を読み込めませんでした。")} ${errorText(cause)}`); }
      }
      const responseText = [result.summary, ...result.findings.map((finding) => `・${finding.title}: ${finding.observation}`)].join("\n");
      setThreads((current) => ({ ...current, [role]: [...conversation, { sender: "lens", text: responseText, createdAt: new Date().toISOString() }] }));
      setLensQuery("");
    } catch (cause) { setError(errorText(cause)); }
    finally { setLensBusy(false); }
  }, [activeChapterId, lensQuery, modelId, project, provider, role, saveAllBuffers, scopeApproved, scopeChapters, scopeMode, t, threads]);

  const jumpToFinding = useCallback(async (finding: LensFinding): Promise<void> => {
    if (finding.chapterId === null || finding.startUtf16 === null || finding.endUtf16 === null || finding.anchorStatus !== "attached") return;
    await loadChapter(finding.chapterId, { start: finding.startUtf16, end: finding.endUtf16 });
  }, [loadChapter]);

  const jumpToReviewFinding = useCallback(async (finding: ReviewLedgerEntry): Promise<void> => {
    if (finding.anchorStatus !== "attached" || finding.anchor.offset === null) return;
    await loadChapter(finding.chapterId, { start: finding.anchor.offset, end: finding.anchor.offset + finding.exactQuote.length });
  }, [loadChapter]);

  useEffect(() => {
    if (project === null || saveState !== "saved") return;
    const lensSlot = slotOf(userSettings.layout, "lens");
    if (lensSlot === null || userSettings.layout.zenMode || !userSettings.layout.slots[lensSlot].visible || userSettings.layout.slots[lensSlot].activeView !== "lens") return;
    void window.kohon.listReviewFindings(project.root).then(setReviewFindings).catch((cause) => setError(errorText(cause)));
  }, [activeBuffer?.version, project, saveState, userSettings.layout]);

  const updateReviewStatus = useCallback(async (id: string, status: ReviewStatus): Promise<void> => {
    if (project === null) return;
    try { setReviewFindings(await window.kohon.setReviewFindingStatus(project.root, id, status)); }
    catch (cause) { setError(errorText(cause)); }
  }, [project]);

  const recheckReview = useCallback(async (id: string): Promise<void> => {
    if (project === null) return;
    try { setReviewFindings(await window.kohon.recheckReviewFinding(project.root, id)); }
    catch (cause) { setError(errorText(cause)); }
  }, [project]);

  const openQuickAccess = useCallback((mode: QuickAccessMode): void => {
    if (isComposing) return;
    setSettingsOpen(false);
    setViewMenu(null);
    setLayoutMenuOpen(false);
    setQuickAccessQuery("");
    setQuickAccessMode(mode);
  }, [isComposing]);

  const applyJapaneseInput = useCallback((transform: (input: TextareaSelection) => JapaneseInputResult, requireSelection = false): void => {
    const editor = editorRef.current;
    if (isComposing || activeChapterId === null || editor === null) return;
    if (requireSelection && editor.selectionStart === editor.selectionEnd) { setError(t("本文の対象範囲を選択してください。")); return; }
    const result = transform({ text: editor.value, selectionStart: editor.selectionStart, selectionEnd: editor.selectionEnd });
    commitActiveTextEdit(result.nextText, { start: result.nextSelectionStart, end: result.nextSelectionEnd }, "japanese-helper");
  }, [activeChapterId, commitActiveTextEdit, isComposing, t]);

  const insertRuby = useCallback(async (): Promise<void> => {
    const editor = editorRef.current;
    if (isComposing || editor === null) return;
    if (editor.selectionStart === editor.selectionEnd) { setError(t("ルビを付ける本文を選択してください。")); return; }
    const reading = await requestText({ title: t("ルビを付ける"), label: t("読み"), initialValue: "", confirmLabel: t("ルビを付ける") });
    if (reading === null) return;
    if (/[\r\n《》]/u.test(reading)) { setError(t("読みには改行や《 》を使えません。")); return; }
    applyJapaneseInput((input) => wrapSelectionWithRuby(input, reading.trim()), true);
  }, [applyJapaneseInput, isComposing, requestText, t]);

  const annotateTateChuYoko = useCallback((): void => {
    const editor = editorRef.current;
    if (isComposing || editor === null) return;
    const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (!isTateChuYokoCandidate(selected)) { setError(t("縦中横にする半角英数字を2〜3文字選択してください。")); return; }
    applyJapaneseInput(annotateSelectionAsTateChuYoko, true);
  }, [applyJapaneseInput, isComposing, t]);

  const moveActiveEditorTab = useCallback((delta: -1 | 1): void => {
    setEditorSession((current) => {
      const group = current.groups.find((candidate) => candidate.id === current.activeGroupId);
      if (group?.activeChapterId === null || group?.activeChapterId === undefined) return current;
      const index = group.tabs.findIndex((tabState) => tabState.chapterId === group.activeChapterId);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= group.tabs.length) return current;
      return moveEditorTab(current, group.id, group.activeChapterId, group.id, target);
    });
  }, []);

  const moveActiveEditorTabToOtherGroup = useCallback((): void => {
    setEditorSession((current) => {
      const source = current.groups.find((candidate) => candidate.id === current.activeGroupId);
      if (source?.activeChapterId === null || source?.activeChapterId === undefined) return current;
      const prepared = current.groups.length === 1 ? splitEditor(current, "right", source.activeChapterId) : current;
      const target = prepared.groups.find((group) => group.id !== source.id);
      if (target === undefined) return current;
      return moveEditorTab(prepared, source.id, source.activeChapterId, target.id, target.tabs.length);
    });
  }, []);

  const executeCommand = useCallback((action: AppCommandId): void => {
    if (isComposing) return;
    setQuickAccessMode(null);
    if (action === "file.new") void createProject();
    else if (action === "file.open") void openProject();
    else if (action === "file.save") void saveAllBuffers();
    else if (action === "workbench.commandPalette") openQuickAccess("commands");
    else if (action === "workbench.quickOpen") openQuickAccess("chapters");
    else if (action === "editor.find") openEditorFind(false);
    else if (action === "editor.replace") openEditorFind(true);
    else if (action === "editor.undo") stepEditorHistory("undo");
    else if (action === "editor.redo") stepEditorHistory("redo");
    else if (action === "editor.splitRight") splitActiveEditor("right");
    else if (action === "editor.splitDown") splitActiveEditor("down");
    else if (action === "editor.closeGroup") void closeActiveEditorGroup();
    else if (action === "editor.ruby") void insertRuby();
    else if (action === "editor.emphasis") applyJapaneseInput(wrapSelectionWithBouten, true);
    else if (action === "editor.normalizePunctuation") applyJapaneseInput(normalizeSelectedPunctuation, true);
    else if (action === "editor.indentedParagraph") applyJapaneseInput(insertParagraphIndent);
    else if (action === "editor.japaneseQuotes") applyJapaneseInput(wrapSelectionWithJapaneseQuotes);
    else if (action === "editor.tateChuYoko") annotateTateChuYoko();
    else if (action === "editor.moveTabLeft") moveActiveEditorTab(-1);
    else if (action === "editor.moveTabRight") moveActiveEditorTab(1);
    else if (action === "editor.moveTabToOtherGroup") moveActiveEditorTabToOtherGroup();
    else if (action === "editor.splitScene") void splitCurrentChapter();
    else if (action === "editor.mergePrevious") void mergeCurrentChapterIntoPrevious();
    else if (action === "history.checkpoint") void createCheckpoint();
    else if (action === "file.export") void exportProject();
    else if (action === "file.exportText") void exportText();
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
    else if (action === "layout.reset") commitLayout(defaultLayout(), t("レイアウトを既定へ戻しました"));
    else if (action === "updates.check") { openSettings("updates"); void checkUpdates(); }
  }, [annotateTateChuYoko, applyJapaneseInput, checkUpdates, closeActiveEditorGroup, commitLayout, createCheckpoint, createProject, exportProject, exportText, insertRuby, isComposing, mergeCurrentChapterIntoPrevious, moveActiveEditorTab, moveActiveEditorTabToOtherGroup, openEditorFind, openProject, openQuickAccess, openSettings, revealView, saveAllBuffers, splitActiveEditor, splitCurrentChapter, stepEditorHistory, t, userSettings.layout]);

  const chooseQuickAccessItem = useCallback((item: QuickAccessItem): void => {
    const mode = quickAccessMode;
    setQuickAccessMode(null);
    if (mode === "commands") executeCommand(item.id as AppCommandId);
    else if (mode === "chapters") void loadChapter(item.id);
  }, [executeCommand, loadChapter, quickAccessMode]);

  useEffect(() => window.kohon.onMenuAction(executeCommand), [executeCommand]);

  const flushBeforeClose = useCallback(async (): Promise<void> => {
    if (project !== null) {
      const captured = captureEditorView();
      await window.kohon.writeEditorSession(project.root, captured);
      const buffers = Object.values(editorBuffersRef.current.buffers);
      for (const buffer of buffers) {
        if (buffer.text !== buffer.savedText && buffer.version.length > 0) await window.kohon.writeRecoveryDraft(project.root, currentDraftInput(buffer.chapter.id, buffer.text, buffer.version));
      }
      await Promise.all([saveActiveNote(), ...buffers.map((buffer) => saveChapterBuffer(buffer.chapter.id))]);
    }
    await saveQueueRef.current;
    await noteSaveQueueRef.current;
  }, [captureEditorView, currentDraftInput, project, saveActiveNote, saveChapterBuffer]);

  useEffect(() => window.kohon.onBeforeClose(flushBeforeClose), [flushBeforeClose]);

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
  const workspaceHeight = workspaceRef.current?.clientHeight ?? viewport.height - 52;
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

  const quickAccessOverlay = quickAccessMode === null ? null : <QuickAccess
    title={t(quickAccessMode === "commands" ? "コマンド パレット" : "章をクイック オープン")}
    placeholder={t(quickAccessMode === "commands" ? "実行する操作を入力" : "章・場面の名前を入力")}
    query={quickAccessQuery}
    items={quickAccessMode === "commands" ? commandItems : chapterItems}
    onQuery={setQuickAccessQuery}
    onChoose={chooseQuickAccessItem}
    onClose={() => setQuickAccessMode(null)}
  />;

  if (project === null) return <LocaleProvider locale={locale}><div className={shellClass} style={shellStyle}>
    <Welcome appInfo={appInfo} busy={busy} error={error} colorTheme={colorTheme} onToggleTheme={toggleColorTheme} onCreate={createProject} onOpen={openProject} onSettings={() => openSettings("appearance")} />
    {promptDialog}
    {settingsOverlay}
    {quickAccessOverlay}
  </div></LocaleProvider>;

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
        title={t("ドラッグで移動。Shift+F10で配置メニュー")}
      ><span className="eyebrow">MANUSCRIPT</span><h2>{t("章・場面")}</h2></div><div className="pane-tools"><button className="icon-button import-button" title={t("TXT / Markdownを取り込む")} aria-label={t("TXTまたはMarkdownを取り込む")} onClick={importDocuments}><AppIcon name="import" /></button><button className="outline-add-button" title={t("章を追加")} onClick={() => void addChapter("chapter")}>{t("＋章")}</button><button className="outline-add-button" title={t("場面を追加")} onClick={() => void addChapter("scene")}>{t("＋場面")}</button></div></div>
      <nav className="chapter-list" aria-label={t("章・場面")} onDragOver={(event) => { if (event.target !== event.currentTarget || chapterDragId === null) return; event.preventDefault(); setChapterDropIndex(manifestChapters.length); }} onDrop={(event) => { if (event.target !== event.currentTarget) return; event.preventDefault(); void dropChapter(manifestChapters.length); }}>
        {manifestChapters.map((item, index) => {
          const kind = item.kind ?? "chapter";
          const dropClass = chapterDropIndex === index ? "drop-before" : chapterDropIndex === index + 1 ? "drop-after" : "";
          return <button key={item.id} aria-current={item.id === activeChapterId ? "page" : undefined} className={`${item.id === activeChapterId ? "chapter active" : "chapter"} ${kind === "scene" ? "scene" : ""} ${item.id === chapterDragId ? "drag-source" : ""} ${dropClass}`} onClick={() => void loadChapter(item.id)} disabled={busy} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); setChapterDragId(item.id); setChapterDropIndex(null); }} onDragEnd={() => { setChapterDragId(null); setChapterDropIndex(null); }} onDragOver={(event) => { if (chapterDragId === null) return; event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setChapterDropIndex(event.clientY < rect.top + rect.height / 2 ? index : index + 1); }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); void dropChapter(event.clientY < rect.top + rect.height / 2 ? index : index + 1); }} onKeyDown={(event) => { if (!event.altKey || !event.shiftKey) return; if (event.key === "ArrowUp") { event.preventDefault(); void moveChapterById(item.id, -1); } else if (event.key === "ArrowDown") { event.preventDefault(); void moveChapterById(item.id, 1); } }} title={locale === "en" ? `${t(kind === "scene" ? "場面" : "章")}. Drag or press Alt+Shift+↑/↓ to move` : `${kind === "scene" ? "場面" : "章"}。ドラッグ、または Alt+Shift+↑/↓ で移動`}>
            <span className="chapter-order">{String(item.order + 1).padStart(2, "0")}</span><span>{item.title}</span>{kind === "scene" && <small className="chapter-kind">{t("場面")}</small>}
          </button>;
        })}
      </nav>
      {chapter !== null && <ChapterMetadataPanel key={`${chapter.chapter.id}:${JSON.stringify(chapter.chapter.metadata ?? {})}`} chapter={chapter.chapter} onSave={saveChapterMetadata} />}
      <OutlineNotes notes={notes} activeChapterId={activeChapterId} activeNote={activeNote} draft={noteDraft} saveState={noteSaveState} showAll={showAllNotes} onShowAll={setShowAllNotes} onCreate={createNote} onOpen={openNote} onDraft={updateNoteDraft} onTogglePin={toggleCurrentChapterPin} onSave={saveActiveNote} onArchive={setActiveNoteArchived} />
      <div className="outline-footer"><code title={project.root}>{project.root}</code><span>{t("Markdown正本")}</span></div>
    </div>;
    if (view === "lens") return <LensPanel
      role={role} setRole={setRole} provider={provider} setProvider={(next) => { setProvider(next); setModelId(next === "codex" ? userSettings.ai.codexModel : next === "openai" ? userSettings.ai.openaiModel : "offline-mock-v0.1"); }} modelId={modelId} setModelId={(value) => { setModelId(value); if (provider === "codex") void updateUserSettings({ ai: { codexModel: value } }); }} codexModels={connections.codex.models} codexConnected={connections.codex.connected} openAIConnected={connections.openai.connected} onOpenSettings={() => openSettings("ai")}
      query={lensQuery} setQuery={setLensQuery} scopeMode={scopeMode} setScopeMode={setScopeMode} scopeTitles={scopeChapters.map((item) => item.title)}
      approved={scopeApproved} setApproved={setScopeApproved} thread={threads[role]} result={lensResult?.role === role ? lensResult : null}
      running={lensBusy} onRun={invokeLens} onClear={() => { setThreads((current) => ({ ...current, [role]: [] })); setLensResult(null); }} onFinding={jumpToFinding}
      reviews={reviewFindings} onReview={jumpToReviewFinding} onReviewStatus={updateReviewStatus} onReviewRecheck={recheckReview}
    />;
    if (view === "search") return <SearchPanel query={searchQuery} setQuery={(value) => { setSearchQuery(value); setSearchHits([]); setSearchRun(null); }} replacement={searchReplacement} setReplacement={setSearchReplacement} caseSensitive={searchCaseSensitive} setCaseSensitive={(value) => { setSearchCaseSensitive(value); setSearchHits([]); setSearchRun(null); }} hits={searchHits} previewReady={searchRun?.query === searchQuery.trim() && searchRun.caseSensitive === searchCaseSensitive} onSearch={runSearch} onReplace={replaceAcrossProject} onHit={(hit) => void loadChapter(hit.chapterId, hit)} />;
    return <HistoryPanel entries={checkpoints} diff={historyDiff} onCreate={createCheckpoint} onCompareCurrent={compareCurrentCheckpoint} onComparePair={compareCheckpointPair} onRestore={restoreCheckpoint} onRestoreChapter={restoreCheckpointChapter} onVariation={createVariation} />;
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
      {!(bottom && layout.bottomPanelMaximized) && <div
        className={`pane-resizer ${bottom ? "horizontal edge-top" : `vertical edge-${physicalSide === "left" ? "right" : "left"}`}`}
        role="separator"
        tabIndex={0}
        aria-label={locale === "en" ? `Resize ${activeView === null ? "panel" : viewLabel(activeView)}` : `${activeView === null ? "パネル" : VIEW_LABELS[activeView]}のサイズを変更`}
        aria-orientation={bottom ? "horizontal" : "vertical"}
        aria-valuemin={LAYOUT_LIMITS[slotId].min}
        aria-valuemax={LAYOUT_LIMITS[slotId].max}
        aria-valuenow={Math.round(slot.size)}
        onPointerDown={(event) => beginPaneResize(slotId, event)}
        onKeyDown={(event) => resizePaneFromKeyboard(slotId, event)}
      />}
      <div className="view-tabbar" role="tablist" aria-label={`${slotId} ${t("パネル")}`}>
        <div className="view-tabs-scroll">{slot.views.map((view) => <button
          key={view}
          type="button"
          role="tab"
          aria-selected={activeView === view}
          aria-controls={`view-panel-${slotId}`}
          tabIndex={activeView === view ? 0 : -1}
          className={`view-tab ${activeView === view ? "active" : ""}`}
          data-view-tab={view}
          title={`${viewLabel(view)} — ${t("ドラッグまたは右クリックで移動")}`}
          onClick={() => { if (!suppressDockClickRef.current) selectViewInSlot(slotId, view); }}
          onPointerDown={(event) => beginDockDrag(view, event)}
          onContextMenu={(event: ReactMouseEvent<HTMLButtonElement>) => { event.preventDefault(); openViewMenu(view, event.clientX, event.clientY); }}
          onKeyDown={(event) => handleViewMenuKey(view, event)}
        ><span className="view-tab-grip" aria-hidden="true">⠿</span><AppIcon name={view === "outline" ? "files" : view} size={14} />{viewLabel(view)}</button>)}</div>
        <div className="view-tab-actions">
          {bottom && <button type="button" className="view-tab-action" aria-label={t(layout.bottomPanelMaximized ? "下部パネルを元の高さへ戻す" : "下部パネルを最大化")} title={t(layout.bottomPanelMaximized ? "元の高さへ戻す" : "最大化")} onClick={() => commitLayout({ ...layout, bottomPanelMaximized: !layout.bottomPanelMaximized })}><AppIcon name="focus" size={15} /></button>}
          {activeView !== null && <button type="button" className="view-tab-action" aria-label={t("パネル操作")} title={t("配置とパネル操作")} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); openViewMenu(activeView, rect.right - 216, rect.bottom + 4); }}><AppIcon name="more" size={15} /></button>}
          <button type="button" className="view-tab-action" aria-label={t("パネルを閉じる")} title={t("パネルを閉じる")} onClick={() => commitLayout({ ...layout, bottomPanelMaximized: bottom ? false : layout.bottomPanelMaximized, slots: { ...layout.slots, [slotId]: { ...slot, visible: false } } }, t("パネルを閉じました"))}><AppIcon name="close" size={15} /></button>
        </div>
      </div>
      <div className="view-slot-body" id={`view-panel-${slotId}`} role="tabpanel" aria-label={activeView === null ? t("空のパネル") : viewLabel(activeView)}>{activeView === null ? null : renderView(activeView)}</div>
    </aside>;
  };

  const menuSlot = viewMenu === null ? null : slotOf(layout, viewMenu.view);
  const moveMenuView = (destination: PhysicalSide | "bottom"): void => {
    if (viewMenu === null) return;
    commitLayout(placeViewOnSide(layout, viewMenu.view, destination), locale === "en" ? `Moved ${viewLabel(viewMenu.view)} to ${destination === "left" ? "the left" : destination === "right" ? "the right" : "the bottom"}` : `${VIEW_LABELS[viewMenu.view]}を${destination === "left" ? "左" : destination === "right" ? "右" : "下部"}へ移動しました`);
    setViewMenu(null);
  };
  const moveMenuPanel = (side: PhysicalSide): void => {
    if (viewMenu === null || menuSlot === null || menuSlot === "bottom") return;
    commitLayout(moveSlotToSide(layout, menuSlot, side), locale === "en" ? `Moved the ${viewLabel(viewMenu.view)} panel to the ${side}` : `${VIEW_LABELS[viewMenu.view]}のパネルを${side === "left" ? "左" : "右"}へ移動しました`);
    setViewMenu(null);
  };
  const reorderMenuView = (delta: -1 | 1): void => {
    if (viewMenu === null || menuSlot === null) return;
    const views = layout.slots[menuSlot].views;
    const current = views.indexOf(viewMenu.view);
    if (current < 0) return;
    commitLayout(moveView(layout, viewMenu.view, menuSlot, Math.max(0, Math.min(views.length - 1, current + delta))), locale === "en" ? `Reordered the ${viewLabel(viewMenu.view)} tab` : `${VIEW_LABELS[viewMenu.view]}のタブ順を変更しました`);
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

  const beginEditorTabDrag = (groupId: EditorGroupId, chapterId: string, event: ReactDragEvent<HTMLDivElement>): void => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", chapterId);
    setEditorTabDrag({ groupId, chapterId });
    setEditorTabDrop(null);
  };
  const editorTabDropIndex = (event: ReactDragEvent<HTMLDivElement>, index: number): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2 ? index : index + 1;
  };
  const dropEditorTab = (groupId: EditorGroupId, index: number): void => {
    if (editorTabDrag === null) return;
    setEditorSession((current) => {
      const source = current.groups.find((group) => group.id === editorTabDrag.groupId);
      const sourceIndex = source?.tabs.findIndex((tabState) => tabState.chapterId === editorTabDrag.chapterId) ?? -1;
      const targetIndex = editorTabDrag.groupId === groupId && sourceIndex >= 0 && index > sourceIndex ? index - 1 : index;
      return moveEditorTab(current, editorTabDrag.groupId, editorTabDrag.chapterId, groupId, targetIndex);
    });
    setEditorTabDrag(null);
    setEditorTabDrop(null);
  };

  const beginEditorComposition = useCallback((groupId: EditorGroupId, chapterId: string, editor: HTMLTextAreaElement): void => {
    activateEditorGroup(groupId);
    pendingInputRef.current = null;
    skipCompositionInputRef.current = null;
    compositionRef.current = {
      groupId,
      chapterId,
      text: editor.value,
      selection: { start: editor.selectionStart, end: editor.selectionEnd }
    };
    setIsComposing(true);
  }, [activateEditorGroup]);

  const finishEditorComposition = useCallback((groupId: EditorGroupId, chapterId: string, editor: HTMLTextAreaElement): void => {
    const started = compositionRef.current;
    compositionRef.current = null;
    pendingInputRef.current = null;
    setIsComposing(false);
    if (started === null || started.groupId !== groupId || started.chapterId !== chapterId) return;
    const selectionAfter = { start: editor.selectionStart, end: editor.selectionEnd };
    editorHistoryRef.current = recordTextEdit(editorHistoryRef.current, {
      chapterId,
      beforeText: started.text,
      afterText: editor.value,
      selectionBefore: started.selection,
      selectionAfter,
      origin: "ime-commit",
      timestamp: Date.now()
    });
    skipCompositionInputRef.current = { chapterId, text: editor.value };
    textRef.current = editor.value;
    updateBufferText(chapterId, editor.value);
    setEditorSession((current) => updateEditorTabView(current, groupId, chapterId, { selectionStart: selectionAfter.start, selectionEnd: selectionAfter.end }));
  }, [updateBufferText]);

  const captureEditorInput = useCallback((groupId: EditorGroupId, chapterId: string, editor: HTMLTextAreaElement, nativeComposing: boolean, inputType: string): void => {
    if (nativeComposing || compositionRef.current !== null) return;
    skipCompositionInputRef.current = null;
    pendingInputRef.current = {
      groupId,
      chapterId,
      text: editor.value,
      selection: { start: editor.selectionStart, end: editor.selectionEnd },
      origin: inputType === "insertText" || inputType.startsWith("deleteContent") ? "typing" : "input"
    };
  }, []);

  const changeEditorText = useCallback((groupId: EditorGroupId, chapterId: string, editor: HTMLTextAreaElement, groupActive: boolean): void => {
    const skipped = skipCompositionInputRef.current;
    if (skipped?.chapterId === chapterId && skipped.text === editor.value) {
      skipCompositionInputRef.current = null;
      if (groupActive) textRef.current = editor.value;
      updateBufferText(chapterId, editor.value);
      return;
    }
    const composing = compositionRef.current;
    if (composing?.groupId === groupId && composing.chapterId === chapterId) {
      if (groupActive) textRef.current = editor.value;
      updateBufferText(chapterId, editor.value);
      return;
    }
    const pending = pendingInputRef.current;
    pendingInputRef.current = null;
    const beforeText = pending?.groupId === groupId && pending.chapterId === chapterId
      ? pending.text
      : editorBuffersRef.current.buffers[chapterId]?.text ?? "";
    const selectionBefore = pending?.groupId === groupId && pending.chapterId === chapterId
      ? pending.selection
      : { start: Math.min(editor.selectionStart, beforeText.length), end: Math.min(editor.selectionEnd, beforeText.length) };
    editorHistoryRef.current = recordTextEdit(editorHistoryRef.current, {
      chapterId,
      beforeText,
      afterText: editor.value,
      selectionBefore,
      selectionAfter: { start: editor.selectionStart, end: editor.selectionEnd },
      origin: pending?.origin ?? "input",
      timestamp: Date.now()
    });
    if (groupActive) textRef.current = editor.value;
    updateBufferText(chapterId, editor.value);
  }, [updateBufferText]);

  const renderEditorGroup = (group: EditorSessionState["groups"][number]): ReactNode => {
    const groupChapterId = group.activeChapterId;
    const buffer = groupChapterId === null ? undefined : editorBuffers.buffers[groupChapterId];
    const groupActive = group.id === editorSession.activeGroupId;
    const groupIndex = manifestChapters.findIndex((item) => item.id === groupChapterId);
    const groupStats = groupChapterId === null ? undefined : editorStats[groupChapterId];
    return <EditorPane key={group.id} group={group} groupActive={groupActive} groupCount={editorSession.groups.length} groupChapterId={groupChapterId} groupIndex={groupIndex} buffer={buffer} buffers={editorBuffers.buffers} groupStats={groupStats} manifestChapters={manifestChapters} theme={theme} writingMode={writingMode} manuscriptPalette={manuscriptPalette} findOpen={findOpen} replaceVisible={replaceVisible} findQuery={findQuery} replacement={replacement} caseSensitive={caseSensitive} findMatchCount={findMatches.length} findMatchIndex={findMatchIndex} editorTabDrag={editorTabDrag} editorTabDrop={editorTabDrop} editorRefs={editorRefs} editorRef={editorRef} onActivate={() => activateEditorGroup(group.id)} onTabDropOver={(groupId, index, event) => { if (editorTabDrag === null) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setEditorTabDrop({ groupId, index }); }} onTabDrop={(groupId, index, event) => { event.preventDefault(); event.stopPropagation(); dropEditorTab(groupId, index); }} onDropIndex={editorTabDropIndex} onBeginTabDrag={beginEditorTabDrag} onEndTabDrag={() => { setEditorTabDrag(null); setEditorTabDrop(null); }} onLoadChapter={(chapterId, groupId) => void loadChapter(chapterId, undefined, groupId)} onMoveTab={(groupId, chapterId, target) => setEditorSession((current) => moveEditorTab(current, groupId, chapterId, groupId, target))} onCloseTab={(chapterId, groupId) => void closeChapterTab(chapterId, groupId)} onFindQuery={(value) => { setFindQuery(value); setFindMatchIndex(-1); }} onFindReplacement={setReplacement} onToggleReplace={() => setReplaceVisible((visible) => !visible)} onToggleCase={() => { setCaseSensitive((value) => !value); setFindMatchIndex(-1); }} onPrevious={() => moveFindMatch(-1)} onNext={() => moveFindMatch(1)} onReplace={replaceCurrentMatch} onReplaceAll={replaceEveryMatch} onCloseFind={closeEditorFind} onSplit={splitActiveEditor} onCloseGroup={() => void closeActiveEditorGroup()} onMoveChapter={(delta) => void moveChapter(delta)} onSplitChapter={() => void splitCurrentChapter()} onMergeChapter={() => void mergeCurrentChapterIntoPrevious()} onRenameChapter={() => void renameChapter()} onDeleteChapter={() => void deleteChapter()} onCaptureInput={captureEditorInput} onCompositionStart={beginEditorComposition} onCompositionEnd={finishEditorComposition} onChange={changeEditorText} onHistory={stepEditorHistory} compositionRef={compositionRef} onSelection={recordEditorView} onBlur={(groupId, chapterId, editor) => { if (pendingInputRef.current?.groupId === groupId) pendingInputRef.current = null; recordEditorView(groupId, chapterId, editor); void saveChapterBuffer(chapterId); }} onSave={() => void saveAllBuffers()} onTheme={(value) => void updateProjectSettings({ theme: value })} onWritingMode={() => void updateProjectSettings({ writingMode: writingMode === "vertical-rl" ? "horizontal" : "vertical-rl" })} />;
  };
  return <LocaleProvider locale={locale}><div className={shellClass} style={shellStyle}><div className={`app ${layout.zenMode ? "zen-mode" : ""}`}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><AppIcon name="logo" size={22} /></span><div><b>KOHON</b><button className="project-title" onClick={renameProject} title={t("作品名を変更")}>{project.manifest.title}</button></div></div>
      <button type="button" className="top-command" onClick={() => openQuickAccess("commands")} title={t("コマンド パレットを開く")}><AppIcon name="search" size={15} /><span>{t("操作を検索")}</span><kbd>{t(formatKeybinding(userSettings.keybindings["workbench.commandPalette"]))}</kbd></button>
      <div className="top-actions">
        <button className="ghost action-with-icon" onClick={createCheckpoint} title={t("現在の状態を保存点にする")}><AppIcon name="checkpoint" />{t("保存点")}</button>
        <button className="ghost action-with-icon" onClick={exportProject} title={t("Markdownを書き出す")}><AppIcon name="export" />{t("書き出し")}</button>
        <button className={`icon-button top-icon ${layout.zenMode ? "active" : ""}`} onClick={() => commitLayout({ ...layout, zenMode: !layout.zenMode })} aria-label={t("集中モード")} title={t("集中モード")}><AppIcon name="focus" /></button>
        <div className="layout-menu-anchor">
          <button className={`icon-button top-icon ${layoutMenuOpen ? "active" : ""}`} onClick={() => setLayoutMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={layoutMenuOpen} aria-label={t("レイアウトを変更")} title={t("レイアウト")}><AppIcon name="layout" /></button>
          {layoutMenuOpen && <div className="layout-quick-menu" role="menu">
            <strong>{t("作業レイアウト")}</strong>
            <div className="layout-menu-section"><span>{t("すぐ切り替える")}</span><div className="layout-preset-grid">
              <button type="button" role="menuitem" onClick={() => { commitLayout(applyLayoutPreset(layout, "writing"), t("執筆レイアウトへ切り替えました")); setLayoutMenuOpen(false); }}>{t("執筆")}</button>
              <button type="button" role="menuitem" onClick={() => { commitLayout(applyLayoutPreset(layout, "review"), t("推敲レイアウトへ切り替えました")); setLayoutMenuOpen(false); }}>{t("推敲")}</button>
              <button type="button" role="menuitem" onClick={() => { commitLayout(applyLayoutPreset(layout, "compare"), t("比較レイアウトへ切り替えました")); setLayoutMenuOpen(false); }}>{t("比較")}</button>
            </div></div>
            <div className="layout-menu-section"><span>{t("表示")}</span>
              <button role="menuitemcheckbox" aria-checked={layout.activityBarVisible} onClick={() => commitLayout({ ...layout, activityBarVisible: !layout.activityBarVisible, zenMode: false })}><b>{layout.activityBarVisible ? "✓" : ""}</b>{t("アクティビティバー")}</button>
              {(["primary", "secondary", "bottom"] as const).map((slot) => <button key={slot} role="menuitemcheckbox" aria-checked={layout.slots[slot].visible} onClick={() => toggleSlotVisibility(slot)}><b>{layout.slots[slot].visible ? "✓" : ""}</b>{t(slot === "primary" ? "メインパネル" : slot === "secondary" ? "補助パネル" : "下部パネル")}</button>)}
            </div>
            <div className="layout-menu-section"><span>{t("アクティビティバーの位置")}</span><div className="layout-segmented"><button className={layout.activityBar === "left" ? "active" : ""} onClick={() => commitLayout({ ...layout, activityBar: "left", activityBarVisible: true, zenMode: false })}>{t("左")}</button><button className={layout.activityBar === "right" ? "active" : ""} onClick={() => commitLayout({ ...layout, activityBar: "right", activityBarVisible: true, zenMode: false })}>{t("右")}</button></div></div>
            <div className="layout-menu-section"><span>{t("下部パネル")}</span><div className="layout-segmented"><button className={layout.bottomPanelAlignment === "editor" ? "active" : ""} onClick={() => commitLayout({ ...layout, bottomPanelAlignment: "editor" })}>{t("本文幅")}</button><button className={layout.bottomPanelAlignment === "justify" ? "active" : ""} onClick={() => commitLayout({ ...layout, bottomPanelAlignment: "justify" })}>{t("全幅")}</button></div><button role="menuitemcheckbox" aria-checked={layout.bottomPanelMaximized} disabled={!layout.slots.bottom.visible} onClick={() => commitLayout({ ...layout, bottomPanelMaximized: !layout.bottomPanelMaximized })}><b>{layout.bottomPanelMaximized ? "✓" : ""}</b>{t("最大化")}</button></div>
            <span className="menu-separator" /><button role="menuitem" onClick={() => { commitLayout(defaultLayout(), t("レイアウトを既定へ戻しました")); setLayoutMenuOpen(false); }}><b>↺</b>{t("既定に戻す")}</button>
          </div>}
        </div>
      </div>
    </header>

    {(error !== null || notice !== null) && <div className={`banner ${error !== null ? "error" : "notice"}`} role="status"><span>{error ?? notice}</span><button aria-label={t("閉じる")} onClick={clearMessages}><AppIcon name="close" /></button></div>}
    {recoveryConflict !== null && <div className="recovery-banner" role="alert">
      <div><b>{t("未保存の復旧ドラフトがあります")}</b><span>{t("保存済み本文が別に更新されているため、自動では上書きしません。")}</span></div>
      <button className="secondary" onClick={useRecoveryDraft}>{t("復旧ドラフトを開く")}</button>
      <button className="ghost" onClick={() => void discardRecoveryDraft()}>{t("保存済み本文を維持")}</button>
    </div>}

    <div className="workspace" ref={workspaceRef} style={workspaceStyle}>
      {activityVisible && <aside className={`activity-bar activity-${layout.activityBar}`} style={{ gridColumn: columnFor("activity"), gridRow: "1 / -1" }} aria-label={t("表示切り替え")}>
        <div className="activity-main">
          {VIEW_IDS.map((view) => {
            const slot = slotOf(layout, view);
            const active = slot !== null && layout.slots[slot].visible && layout.slots[slot].activeView === view;
            return <button
              key={view}
              className={`activity-button ${active ? "active" : ""}`}
              aria-pressed={active}
              onClick={() => { if (!suppressDockClickRef.current) toggleView(view); }}
              onPointerDown={(event) => beginDockDrag(view, event)}
              onContextMenu={(event) => { event.preventDefault(); openViewMenu(view, event.clientX, event.clientY); }}
              onKeyDown={(event) => handleViewMenuKey(view, event)}
              title={`${viewLabel(view)} (${t("ドラッグで移動")})`}
              aria-label={viewLabel(view)}
            ><AppIcon name={view === "outline" ? "files" : view} /><span className="activity-label" aria-hidden="true">{viewLabel(view)}</span></button>;
          })}
        </div>
        <div className="activity-foot"><button className="activity-button" onClick={() => openSettings("general")} title={t("設定")} aria-label={t("設定を開く")}><AppIcon name="settings" /><span className="activity-label" aria-hidden="true">{t("設定")}</span></button></div>
      </aside>}

      {renderSlot("primary")}
      {renderSlot("secondary")}

      <section data-editor-pane className={`editor-groups split-${editorSession.split}`} style={{ gridColumn: columnFor("editor"), gridRow: 1 }} aria-label={t("本文エディター")}>
        {editorSession.groups.map(renderEditorGroup)}
      </section>

      {renderSlot("bottom")}
      {dockDrag !== null && <div className="dock-layer" aria-hidden="true">
        <span className={`dock-target side-left ${dockDrag.target.kind === "side-edge" && dockDrag.target.side === "left" ? "active" : ""}`}>{t("左")}</span>
        <span className={`dock-target side-right ${dockDrag.target.kind === "side-edge" && dockDrag.target.side === "right" ? "active" : ""}`}>{t("右")}</span>
        <span className={`dock-target bottom ${dockDrag.target.kind === "bottom-edge" ? "active" : ""}`}>{t("下部")}</span>
        <span className="dock-ghost" style={{ transform: `translate(${dockDrag.x + 14}px, ${dockDrag.y + 14}px)` }}>{viewLabel(dockDrag.view)}</span>
      </div>}
    </div>
    <span className="layout-announcement" aria-live="polite">{layoutAnnouncement}</span>
  </div>{promptDialog}{settingsOverlay}{quickAccessOverlay}{viewMenu !== null && <div
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
    <strong>{viewLabel(viewMenu.view)}</strong>
    <button role="menuitem" onClick={() => moveMenuView("left")}>{t("このビューを左へ")}</button>
    <button role="menuitem" onClick={() => moveMenuView("right")}>{t("このビューを右へ")}</button>
    <button role="menuitem" onClick={() => moveMenuView("bottom")}>{t("このビューを下部へ")}</button>
    <span className="menu-separator" />
    <button role="menuitem" disabled={menuSlot === "bottom"} onClick={() => moveMenuPanel("left")}>{t("このパネルを左へ")}</button>
    <button role="menuitem" disabled={menuSlot === "bottom"} onClick={() => moveMenuPanel("right")}>{t("このパネルを右へ")}</button>
    <button role="menuitem" onClick={() => reorderMenuView(-1)}>{t("タブを左へ")}</button>
    <button role="menuitem" onClick={() => reorderMenuView(1)}>{t("タブを右へ")}</button>
    <span className="menu-separator" />
    {menuSlot === "bottom" && <button role="menuitemcheckbox" aria-checked={layout.bottomPanelMaximized} onClick={() => { commitLayout({ ...layout, bottomPanelMaximized: !layout.bottomPanelMaximized }); setViewMenu(null); }}>{t(layout.bottomPanelMaximized ? "下部パネルを元の高さへ" : "下部パネルを最大化")}</button>}
    {menuSlot === "bottom" && <button role="menuitem" onClick={() => { commitLayout({ ...layout, bottomPanelAlignment: layout.bottomPanelAlignment === "editor" ? "justify" : "editor" }); setViewMenu(null); }}>{t(layout.bottomPanelAlignment === "editor" ? "下部パネルを全幅へ" : "下部パネルを本文幅へ")}</button>}
    {menuSlot !== null && <button role="menuitem" onClick={() => { const slot = layout.slots[menuSlot]; commitLayout({ ...layout, bottomPanelMaximized: menuSlot === "bottom" ? false : layout.bottomPanelMaximized, slots: { ...layout.slots, [menuSlot]: { ...slot, visible: false } } }, t("パネルを閉じました")); setViewMenu(null); }}>{t("パネルを閉じる")}</button>}
    <span className="menu-separator" />
    <button role="menuitem" onClick={() => { commitLayout(defaultLayout(), t("レイアウトを既定へ戻しました")); setViewMenu(null); }}>{t("既定レイアウトへ戻す")}</button>
  </div>}</div></LocaleProvider>;
}
