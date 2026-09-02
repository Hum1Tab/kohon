import type { RoleId } from "@novel-lens/editor-core";
import type { Chapter, ProjectManifest, ProjectSettings } from "@novel-lens/project-store";
import type { AppCommandId, UserSettings, UserSettingsPatch } from "./settings.js";
import type { EditorSessionState } from "./editor-session.js";

export type { Chapter, ProjectManifest, ProjectSettings, RoleId };
export type { AppCommandId, UserSettings, UserSettingsPatch } from "./settings.js";
export type { EditorSessionState } from "./editor-session.js";

export interface ProjectSummary {
  root: string;
  manifest: ProjectManifest;
}

export interface ImportedDocumentSummary {
  project: ProjectSummary;
  importedChapterIds: string[];
}

export interface ChapterDocument {
  chapter: Chapter;
  text: string;
  version: string;
}

export interface ChapterSaveResult {
  version: string;
}

export interface RecoveryDraftInput {
  chapterId: string;
  text: string;
  baseVersion: string;
  selectionStart: number;
  selectionEnd: number;
  scrollTop: number;
  scrollLeft: number;
}

export interface RecoveryDraft extends RecoveryDraftInput {
  schemaVersion: 1;
  updatedAt: string;
}

export interface RecoveryDraftResult {
  draft: RecoveryDraft;
  canonicalVersion: string;
  conflict: boolean;
}

export interface SearchHit {
  chapterId: string;
  title: string;
  start: number;
  end: number;
  excerpt: string;
}

export interface ProjectReplaceResult {
  count: number;
  chapterCount: number;
}

export interface CheckpointEntry {
  commit: string;
  authoredAt: string;
  subject: string;
}

export type LensProviderId = "mock" | "codex" | "openai";

export interface LensMessage {
  sender: "author" | "lens";
  text: string;
  createdAt: string;
}

export interface LensChapterInput {
  id: string;
  title: string;
  order: number;
  text: string;
}

export interface LensRunInput {
  role: RoleId;
  query: string;
  chapters: LensChapterInput[];
  provider: LensProviderId;
  modelId: string;
  conversation: LensMessage[];
}

export interface LensFinding {
  id: string;
  title: string;
  observation: string;
  readerEffect: string;
  quote: string;
  chapterId: string | null;
  chapterTitle: string | null;
  anchorStatus: "attached" | "ambiguous" | "missing";
  startUtf16: number | null;
  endUtf16: number | null;
  priority: "high" | "medium" | "low";
}

export interface LensRunResult {
  role: RoleId;
  summary: string;
  findings: LensFinding[];
  coverage: { chapterCount: number; characterCount: number; chapterTitles: string[] };
  provider: LensProviderId;
  modelId: string;
}

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
}

export interface OpenAIConnectionStatus {
  connected: boolean;
  state: "disconnected" | "checking" | "connected" | "error";
  storage: "none" | "memory" | "os";
  message: string;
  verifiedAt: string | null;
}

export interface CodexModelOption {
  id: string;
  displayName: string;
  isDefault: boolean;
}

export interface CodexConnectionStatus {
  installed: boolean;
  connected: boolean;
  state: "unavailable" | "starting" | "signed-out" | "authenticating" | "connected" | "error";
  message: string;
  email: string | null;
  planType: string | null;
  models: CodexModelOption[];
  modelsUpdatedAt: string | null;
  usedPercent: number | null;
  resetsAt: number | null;
}

export interface GitHubConnectionStatus {
  cliInstalled: boolean;
  connected: boolean;
  state: "unavailable" | "disconnected" | "connecting" | "connected" | "error";
  message: string;
}

export interface ConnectionStatus {
  codex: CodexConnectionStatus;
  openai: OpenAIConnectionStatus;
  github: GitHubConnectionStatus;
}

export interface UpdateStatus {
  state: "idle" | "checking" | "current" | "available" | "downloading" | "verifying" | "ready" | "installing" | "error";
  currentVersion: string;
  latestVersion: string | null;
  checkedAt: string | null;
  downloadUrl: string | null;
  assetName: string | null;
  progress: number | null;
  releaseUrl: string;
  message: string;
}

export interface NovelLensApi {
  appInfo(): Promise<AppInfo>;
  getUserSettings(): Promise<UserSettings>;
  updateUserSettings(patch: UserSettingsPatch): Promise<UserSettings>;
  resetKeybindings(): Promise<UserSettings>;
  setKeybindingRecording(active: boolean): Promise<void>;
  createProject(title: string): Promise<ProjectSummary | null>;
  openProject(): Promise<ProjectSummary | null>;
  refreshProject(root: string): Promise<ProjectSummary>;
  readChapter(root: string, chapterId: string): Promise<ChapterDocument>;
  saveChapter(root: string, chapterId: string, text: string): Promise<ChapterSaveResult>;
  readEditorSession(root: string): Promise<EditorSessionState>;
  writeEditorSession(root: string, session: EditorSessionState): Promise<EditorSessionState>;
  readRecoveryDraft(root: string, chapterId: string): Promise<RecoveryDraftResult | null>;
  writeRecoveryDraft(root: string, draft: RecoveryDraftInput): Promise<void>;
  clearRecoveryDraft(root: string, chapterId: string): Promise<void>;
  createChapter(root: string, title: string): Promise<Chapter>;
  importDocuments(root: string): Promise<ImportedDocumentSummary | null>;
  renameChapter(root: string, chapterId: string, title: string): Promise<void>;
  reorderChapters(root: string, chapterIds: string[]): Promise<ProjectSummary>;
  renameProject(root: string, title: string): Promise<ProjectSummary>;
  deleteChapter(root: string, chapterId: string): Promise<void>;
  updateSettings(root: string, settings: ProjectSettings): Promise<ProjectSummary>;
  resetProjectSetting(root: string, key: "writingMode" | "theme" | "canvasBackground" | "canvasText" | "font" | "fontSize" | "lineHeight" | "width"): Promise<ProjectSummary>;
  search(root: string, query: string, caseSensitive?: boolean): Promise<SearchHit[]>;
  replaceProjectText(root: string, query: string, replacement: string, caseSensitive: boolean): Promise<ProjectReplaceResult>;
  createCheckpoint(root: string, subject: string): Promise<{ created: boolean; commit: string | null }>;
  listCheckpoints(root: string): Promise<CheckpointEntry[]>;
  restoreCheckpoint(root: string, commit: string): Promise<ProjectSummary>;
  createVariation(root: string): Promise<string | null>;
  exportMarkdown(root: string): Promise<string | null>;
  runLens(input: LensRunInput): Promise<LensRunResult>;
  connectionStatus(): Promise<ConnectionStatus>;
  loginCodex(): Promise<ConnectionStatus>;
  logoutCodex(): Promise<ConnectionStatus>;
  refreshCodexModels(): Promise<ConnectionStatus>;
  connectOpenAI(apiKey: string): Promise<ConnectionStatus>;
  disconnectOpenAI(): Promise<ConnectionStatus>;
  loginGitHub(): Promise<ConnectionStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  installUpdate(): Promise<UpdateStatus>;
  openUpdatePage(): Promise<void>;
  openExternalPage(page: "chatgpt" | "openai-api-keys" | "github-cli" | "github-applications" | "latest-release"): Promise<void>;
  onMenuAction(listener: (action: AppCommandId) => void): () => void;
  onConnectionStatus(listener: (status: ConnectionStatus) => void): () => void;
  onUpdateStatus(listener: (status: UpdateStatus) => void): () => void;
  onBeforeClose(listener: () => void | Promise<void>): () => void;
}

declare global {
  interface Window {
    novelLens: NovelLensApi;
  }
}
