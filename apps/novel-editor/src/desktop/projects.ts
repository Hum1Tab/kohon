import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  LEGACY_PROJECT_MANIFEST,
  PROJECT_MANIFEST,
  ProjectStore,
  basenamePath,
  dirnamePath,
  extnamePath,
  joinPath,
  pathKey,
  type Chapter,
  type ChapterKind,
  type ChapterMetadata,
  type NoteKind,
  type ProjectDiff,
  type ProjectSettings,
  type ReviewStatus,
  type StoryMap
} from "@kohon/project-store";

import { defaultChapterTitle } from "../shared/chapter-title.js";
import { sanitizeEditorSession } from "../shared/editor-session.js";
import { resolveLensScope } from "../shared/lens-scope.js";
import { buildReviewBrief } from "../shared/review-brief.js";
import type { AppLocale } from "../shared/locale.js";
import type {
  ChapterDocument,
  ChapterMergeResult,
  ChapterSaveResult,
  ChapterSplitResult,
  CheckpointEntry,
  ImportedDocumentSummary,
  LensRunInput,
  ProjectReplaceResult,
  ProjectSummary as SharedProjectSummary,
  RecentProject,
  RecoveryDraft,
  RecoveryDraftInput,
  RecoveryDraftResult,
  SearchHit
} from "../shared/types.js";

import { runLens, type LensExecutionInput } from "./lens.js";
import type { ConnectionManager } from "./connections.js";
import { command, type AppPaths, type FileText } from "./ipc.js";
import type { DesktopRecentProjectsStore } from "./stores.js";
import { projectFs } from "./tauri-fs.js";

type ProjectFs = typeof projectFs;

/** Accept only the six-digit hex colors the project canvas settings can round-trip. */
function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value);
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
  return {
    schemaVersion: 1,
    chapterId: expectedChapterId,
    text,
    baseVersion,
    updatedAt,
    selectionStart,
    selectionEnd,
    scrollTop: offset("scrollTop", 1_000_000_000),
    scrollLeft: offset("scrollLeft", 1_000_000_000)
  };
}

function recoveryDraftForWrite(value: unknown): RecoveryDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("復旧ドラフトを保存できません。");
  const source = value as Record<string, unknown>;
  if (typeof source["chapterId"] !== "string") throw new Error("章IDが不正です。");
  return recoveryDraftFrom({ ...source, schemaVersion: 1, updatedAt: new Date().toISOString() }, source["chapterId"]);
}

function suggestedFolderName(title: string, fallback: string): string {
  return title.replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "-").replace(/[. ]+$/u, "").trim() || fallback;
}

export class ProjectService {
  private readonly allowedRoots = new Set<string>();

  constructor(
    private readonly options: {
      paths: AppPaths;
      fs: ProjectFs;
      recent: DesktopRecentProjectsStore;
      connections: ConnectionManager;
      locale: () => AppLocale;
      text: (japanese: string) => string;
    }
  ) {}

  private get fs(): ProjectFs {
    return this.options.fs;
  }

  async readStoryMap(root: string): Promise<StoryMap> {
    return (await this.storeFor(root)).readStoryMap();
  }

  async saveStoryMap(root: string, map: StoryMap, revision: number): Promise<StoryMap> {
    if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) throw new Error("invalid story map revision");
    return (await this.storeFor(root)).saveStoryMap(map, revision);
  }

  async createProject(title: string): Promise<SharedProjectSummary | null> {
    if (typeof title !== "string" || title.trim().length === 0 || title.length > 200) throw new Error("作品名は1〜200文字で入力してください。");
    const selected = await saveDialog({
      title: this.options.text("新しい作品フォルダーの保存場所を選択"),
      defaultPath: joinPath(this.options.paths.documentsDir, suggestedFolderName(title.trim(), this.options.text("新しい小説"))),
      canCreateDirectories: true
    });
    if (selected === null || selected.length === 0) return null;
    const requested = selected;
    await command<string>("external_allow_root", { path: requested, create: false }).catch(() => requested);
    if (await this.fs.exists(requested)) {
      const entries = await this.fs.readDir(requested);
      if (entries.length > 0) throw new Error("空ではないフォルダーには新規projectを作成できません。");
    }
    const root = await command<string>("project_create_root", { path: requested });
    this.allowedRoots.add(pathKey(root));
    const store = await ProjectStore.create(root, title.trim(), this.fs);
    await store.createChapter(defaultChapterTitle(1, this.options.locale()), "");
    await store.checkpoint(this.options.locale() === "ja" ? "最初の保存点" : "Initial checkpoint");
    const project = await this.summary(store);
    await this.options.recent.remember(project.root, project.manifest.title).catch(() => undefined);
    return project;
  }

  async openProject(): Promise<SharedProjectSummary | null> {
    const selected = await openDialog({
      title: this.options.locale() === "en"
        ? `Select ${PROJECT_MANIFEST} or ${LEGACY_PROJECT_MANIFEST} inside the project folder`
        : `作品フォルダー内の ${PROJECT_MANIFEST} または ${LEGACY_PROJECT_MANIFEST} を選択`,
      defaultPath: this.options.paths.documentsDir,
      multiple: false,
      directory: false,
      filters: [{
        name: this.options.locale() === "en"
          ? `KOHON Project (${PROJECT_MANIFEST} / ${LEGACY_PROJECT_MANIFEST})`
          : `KOHON作品 (${PROJECT_MANIFEST} / ${LEGACY_PROJECT_MANIFEST})`,
        extensions: ["json"]
      }]
    });
    const selectedPath = Array.isArray(selected) ? selected[0] : selected;
    if (selectedPath === null || selectedPath === undefined) return null;
    const name = basenamePath(selectedPath);
    if (name !== PROJECT_MANIFEST && name !== LEGACY_PROJECT_MANIFEST) {
      throw new Error(`作品フォルダー内の ${PROJECT_MANIFEST} または ${LEGACY_PROJECT_MANIFEST} を選択してください。`);
    }
    const root = await command<string>("project_add_root", { path: dirnamePath(selectedPath) });
    this.allowedRoots.add(pathKey(root));
    const store = new ProjectStore(root, this.fs);
    await store.open();
    const project = await this.summary(store);
    await this.options.recent.remember(project.root, project.manifest.title).catch(() => undefined);
    return project;
  }

  recentProjects(): RecentProject[] {
    return this.options.recent.list();
  }

  async openRecentProject(root: unknown): Promise<SharedProjectSummary> {
    if (!this.options.recent.has(root)) throw new Error(this.options.text("最近の作品に登録されていません。作品を開くから選択してください。"));
    const canonical = await this.fs.realpath(root);
    if (pathKey(canonical) !== pathKey(root)) throw new Error(this.options.text("作品の保存先が変わりました。作品を開くから選択してください。"));
    const allowed = await command<string>("project_add_root", { path: canonical });
    this.allowedRoots.add(pathKey(allowed));
    const store = new ProjectStore(allowed, this.fs);
    await store.open();
    const project = await this.summary(store);
    await this.options.recent.remember(project.root, project.manifest.title).catch(() => undefined);
    return project;
  }

  async refreshProject(root: string): Promise<SharedProjectSummary> {
    return this.summary(await this.storeFor(root));
  }

  async readChapter(root: string, chapterId: string): Promise<ChapterDocument> {
    if (typeof chapterId !== "string") throw new Error("章IDが不正です。");
    const store = await this.storeFor(root);
    const manifest = await store.manifest();
    const chapter = manifest.chapters.find((item) => item.id === chapterId);
    if (chapter === undefined) throw new Error("chapter not found");
    const document = await store.readChapterWithVersion(chapterId);
    return { chapter, ...document };
  }

  async saveChapter(root: string, chapterId: string, text: string): Promise<ChapterSaveResult> {
    if (typeof chapterId !== "string" || typeof text !== "string" || text.length > 10_000_000) throw new Error("保存する本文を確認してください。");
    return { version: await (await this.storeFor(root)).saveChapter(chapterId, text) };
  }

  async readEditorSession(root: string): Promise<ReturnType<typeof sanitizeEditorSession>> {
    const store = await this.storeFor(root);
    const manifest = await store.manifest();
    const session = sanitizeEditorSession(await store.readEditorSession(), manifest.chapters.map((chapter) => chapter.id));
    await store.writeEditorSession(session);
    return session;
  }

  async writeEditorSession(root: string, session: unknown): Promise<ReturnType<typeof sanitizeEditorSession>> {
    const store = await this.storeFor(root);
    const manifest = await store.manifest();
    const sanitized = sanitizeEditorSession(session, manifest.chapters.map((chapter) => chapter.id));
    await store.writeEditorSession(sanitized);
    return sanitized;
  }

  async readRecoveryDraft(root: string, chapterId: string): Promise<RecoveryDraftResult | null> {
    if (typeof chapterId !== "string") throw new Error("章IDが不正です。");
    const store = await this.storeFor(root);
    const stored = await store.readRecoveryDraft(chapterId);
    if (stored === null) return null;
    const draft = recoveryDraftFrom(stored, chapterId);
    const canonical = await store.readChapterWithVersion(chapterId);
    if (draft.text === canonical.text) {
      await store.clearRecoveryDraft(chapterId);
      return null;
    }
    return { draft, canonicalVersion: canonical.version, conflict: draft.baseVersion !== canonical.version };
  }

  async writeRecoveryDraft(root: string, input: RecoveryDraftInput): Promise<void> {
    const draft = recoveryDraftForWrite(input);
    await (await this.storeFor(root)).writeRecoveryDraft(draft.chapterId, draft);
  }

  async clearRecoveryDraft(root: string, chapterId: string): Promise<void> {
    if (typeof chapterId !== "string") throw new Error("章IDが不正です。");
    await (await this.storeFor(root)).clearRecoveryDraft(chapterId);
  }

  async createChapter(root: string, title: string, kind?: ChapterKind): Promise<Chapter> {
    if (typeof title !== "string" || title.trim().length === 0 || title.length > 200) throw new Error("章タイトルを確認してください。");
    if (kind !== undefined && kind !== "chapter" && kind !== "scene") throw new Error("章・場面の種類を確認してください。");
    return (await this.storeFor(root)).createChapter(title, "", kind ?? "chapter");
  }

  async splitChapter(root: string, chapterId: string, offset: number, title: string): Promise<ChapterSplitResult> {
    if (typeof chapterId !== "string" || !Number.isInteger(offset) || typeof title !== "string" || title.trim().length === 0 || title.length > 200) throw new Error("場面の分割位置を確認してください。");
    const store = await this.storeFor(root);
    const created = await store.splitChapter(chapterId, offset, title);
    return { project: await this.summary(store), created };
  }

  async mergeChapterIntoPrevious(root: string, chapterId: string): Promise<ChapterMergeResult> {
    if (typeof chapterId !== "string") throw new Error("結合する章・場面を確認してください。");
    const store = await this.storeFor(root);
    const target = await store.mergeChapterIntoPrevious(chapterId);
    return { project: await this.summary(store), target };
  }

  async importDocuments(root: string): Promise<ImportedDocumentSummary | null> {
    const store = await this.storeFor(root);
    const selected = await openDialog({
      title: this.options.text("TXT / Markdownを章・場面として取り込む"),
      multiple: true,
      directory: false,
      filters: [{ name: "Text / Markdown", extensions: ["txt", "md", "markdown"] }]
    });
    const paths = Array.isArray(selected) ? selected : selected === null ? [] : [selected];
    if (paths.length === 0) return null;
    const files = await command<FileText[]>("read_external_text_files", { paths });
    const importedChapterIds: string[] = [];
    for (const file of files) {
      const extension = extnamePath(file.name);
      const created = await store.createChapter(extension.length > 0 ? file.name.slice(0, -extension.length) : file.name, file.text.replace(/^\uFEFF/u, ""));
      importedChapterIds.push(created.id);
    }
    return { project: await this.summary(store), importedChapterIds };
  }

  async renameChapter(root: string, chapterId: string, title: string): Promise<void> {
    if (typeof chapterId !== "string" || typeof title !== "string" || title.trim().length === 0 || title.length > 200) throw new Error("章タイトルを確認してください。");
    await (await this.storeFor(root)).renameChapter(chapterId, title);
  }

  async updateChapterMetadata(root: string, chapterId: string, metadata: ChapterMetadata): Promise<SharedProjectSummary> {
    if (typeof chapterId !== "string" || typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) throw new Error("章・場面情報を確認してください。");
    const store = await this.storeFor(root);
    await store.updateChapterMetadata(chapterId, metadata);
    return this.summary(store);
  }

  async reorderChapters(root: string, chapterIds: string[]): Promise<SharedProjectSummary> {
    if (!Array.isArray(chapterIds) || chapterIds.some((id) => typeof id !== "string")) throw new Error("章順を確認できません。");
    const store = await this.storeFor(root);
    await store.reorderChapters(chapterIds);
    return this.summary(store);
  }

  async renameProject(root: string, title: string): Promise<SharedProjectSummary> {
    if (typeof title !== "string") throw new Error("作品名を確認してください。");
    const store = await this.storeFor(root);
    await store.renameProject(title);
    const project = await this.summary(store);
    await this.options.recent.remember(project.root, project.manifest.title).catch(() => undefined);
    return project;
  }

  async deleteChapter(root: string, chapterId: string): Promise<void> {
    if (typeof chapterId !== "string") throw new Error("章IDが不正です。");
    await (await this.storeFor(root)).deleteChapter(chapterId);
  }

  async updateSettings(root: string, settings: ProjectSettings): Promise<SharedProjectSummary> {
    if (typeof settings !== "object" || settings === null) throw new Error("設定を確認してください。");
    const source = settings as Record<string, unknown>;
    const safe: ProjectSettings = {};
    if (source["writingMode"] === "horizontal" || source["writingMode"] === "vertical-rl") safe.writingMode = source["writingMode"];
    if (typeof source["font"] === "string" && source["font"].length <= 200) safe.font = source["font"];
    if (typeof source["width"] === "number" && source["width"] >= 480 && source["width"] <= 1600) safe.width = source["width"];
    if (typeof source["lineHeight"] === "number" && source["lineHeight"] >= 1.2 && source["lineHeight"] <= 3) safe.lineHeight = source["lineHeight"];
    if (typeof source["fontSize"] === "number" && source["fontSize"] >= 12 && source["fontSize"] <= 36) safe["fontSize"] = source["fontSize"];
    if (source["theme"] === "paper" || source["theme"] === "sepia" || source["theme"] === "gray" || source["theme"] === "dark" || source["theme"] === "custom") safe["theme"] = source["theme"];
    const canvasBackground = source["canvasBackground"];
    if (isHexColor(canvasBackground)) safe["canvasBackground"] = canvasBackground.toLowerCase();
    const canvasText = source["canvasText"];
    if (canvasText === null) safe["canvasText"] = null;
    else if (isHexColor(canvasText)) safe["canvasText"] = canvasText.toLowerCase();
    const store = await this.storeFor(root);
    await store.updateSettings(safe);
    return this.summary(store);
  }

  async resetProjectSetting(root: string, key: "writingMode" | "theme" | "canvasBackground" | "canvasText" | "font" | "fontSize" | "lineHeight" | "width"): Promise<SharedProjectSummary> {
    const allowed = new Set(["writingMode", "theme", "canvasBackground", "canvasText", "font", "fontSize", "lineHeight", "width"]);
    if (typeof key !== "string" || !allowed.has(key)) throw new Error("設定項目を確認してください。");
    const store = await this.storeFor(root);
    await store.resetSetting(key);
    return this.summary(store);
  }

  async search(root: string, query: string, caseSensitive = false): Promise<SearchHit[]> {
    if (typeof query !== "string" || query.trim().length === 0 || query.length > 500) return [];
    return (await (await this.storeFor(root)).search(query, caseSensitive === true)).map(({ chapterId, title, start, end, excerpt }) => ({ chapterId, title, start, end, excerpt }));
  }

  async replaceProjectText(root: string, query: string, replacement: string, caseSensitive: boolean): Promise<ProjectReplaceResult> {
    if (typeof query !== "string" || query.trim().length === 0 || query.length > 500 || typeof replacement !== "string" || replacement.length > 10_000 || typeof caseSensitive !== "boolean") throw new Error("置換する文字を確認してください。");
    const store = await this.storeFor(root);
    await store.checkpoint(`作品全体の置換前: ${query.slice(0, 80)}`);
    return store.replaceAll(query, replacement, caseSensitive);
  }

  async createCheckpoint(root: string, subject: string): Promise<{ created: boolean; commit: string | null }> {
    if (typeof subject !== "string" || subject.trim().length === 0 || subject.length > 200) throw new Error("保存点の名前を確認してください。");
    return (await this.storeFor(root)).checkpoint(subject.trim());
  }

  async listCheckpoints(root: string): Promise<CheckpointEntry[]> {
    return (await this.storeFor(root)).history(100);
  }

  async compareCurrentToCheckpoint(root: string, commit: string): Promise<ProjectDiff> {
    if (typeof commit !== "string") throw new Error("保存点を確認できません。");
    return (await this.storeFor(root)).compareCurrentToCheckpoint(commit);
  }

  async compareCheckpoints(root: string, leftCommit: string, rightCommit: string): Promise<ProjectDiff> {
    if (typeof leftCommit !== "string" || typeof rightCommit !== "string") throw new Error("保存点を確認できません。");
    return (await this.storeFor(root)).compareCheckpoints(leftCommit, rightCommit);
  }

  async restoreCheckpoint(root: string, commit: string): Promise<SharedProjectSummary> {
    if (typeof commit !== "string") throw new Error("保存点を確認できません。");
    const store = await this.storeFor(root);
    await store.restore(commit);
    return this.summary(store);
  }

  async restoreCheckpointChapter(root: string, commit: string, chapterId: string): Promise<SharedProjectSummary> {
    if (typeof commit !== "string" || typeof chapterId !== "string") throw new Error("保存点の章を確認できません。");
    const store = await this.storeFor(root);
    await store.restoreChapter(commit, chapterId);
    return this.summary(store);
  }

  async createVariation(root: string): Promise<string | null> {
    const store = await this.storeFor(root);
    const selected = await saveDialog({
      title: this.options.text("別案を新しいフォルダーへ作成"),
      defaultPath: joinPath(dirnamePath(store.root), `${basenamePath(store.root)}-別案`),
      canCreateDirectories: true
    });
    if (selected === null || selected.length === 0) return null;
    await command<string>("external_allow_target", { path: selected });
    await store.createVariation(selected);
    return selected;
  }

  async exportMarkdown(root: string): Promise<string | null> {
    const store = await this.storeFor(root);
    const selected = await saveDialog({
      title: this.options.text("作品を結合Markdownとして書き出す"),
      defaultPath: joinPath(dirnamePath(store.root), `${basenamePath(store.root)}.md`),
      filters: [{ name: "Markdown", extensions: ["md"] }]
    });
    if (selected === null || selected.length === 0) return null;
    await command<string>("external_allow_target", { path: selected });
    await this.fs.writeText(selected, await store.exportMarkdown());
    return selected;
  }

  async exportText(root: string): Promise<string | null> {
    const store = await this.storeFor(root);
    const selected = await saveDialog({
      title: this.options.text("作品を結合テキストとして書き出す"),
      defaultPath: joinPath(dirnamePath(store.root), `${basenamePath(store.root)}.txt`),
      filters: [{ name: "Text", extensions: ["txt"] }]
    });
    if (selected === null || selected.length === 0) return null;
    await command<string>("external_allow_target", { path: selected });
    await this.fs.writeText(selected, await store.exportText());
    return selected;
  }

  /** Write a self-contained, quote-anchored review brief for any AI reviewer. */
  async exportReviewBrief(root: string): Promise<string | null> {
    const store = await this.storeFor(root);
    const selected = await saveDialog({
      title: this.options.text("査読ブリーフを書き出す"),
      defaultPath: joinPath(dirnamePath(store.root), `${basenamePath(store.root)}-review-brief.md`),
      filters: [{ name: "Markdown", extensions: ["md"] }]
    });
    if (selected === null || selected.length === 0) return null;
    await command<string>("external_allow_target", { path: selected });
    const manifest = await store.manifest();
    const chapters = await Promise.all(manifest.chapters.map(async (chapter) => ({
      id: chapter.id,
      title: chapter.title,
      ...(chapter.kind === undefined ? {} : { kind: chapter.kind }),
      text: await store.readChapter(chapter.id)
    })));
    const notes = await Promise.all((await store.listNotes()).map(async (note) => ({
      title: note.title,
      kind: note.kind,
      text: (await store.readNote(note.id)).text
    })));
    const findings = (await store.listReviewFindings()).map((entry) => ({
      role: entry.role,
      title: entry.finding?.title ?? "無題の指摘",
      status: entry.status,
      quote: entry.exactQuote,
      chapterTitle: entry.title
    }));
    await this.fs.writeText(selected, buildReviewBrief({ projectTitle: manifest.title, chapters, notes, findings }));
    return selected;
  }

  async runLens(input: LensRunInput) {
    if (typeof input !== "object" || input === null) throw new Error("AI requestを確認してください。");
    const source = input as LensRunInput;
    if (typeof source.root !== "string" || !Array.isArray(source.approvedChapterIds) || source.approvedChapterIds.some((id) => typeof id !== "string")) throw new Error("AIへ渡す章を確認してください。");
    const store = await this.storeFor(source.root);
    const manifest = await store.manifest();
    const expected = resolveLensScope(manifest.chapters, source.scope, source.cutoffChapterId, source.approvedChapterIds);
    const chapters = await Promise.all(expected.map(async (chapter) => ({ ...chapter, ...(await store.readChapterWithVersion(chapter.id)) })));
    const request: LensExecutionInput = {
      role: source.role,
      query: source.query,
      scope: source.scope,
      cutoffChapterId: source.cutoffChapterId,
      chapters,
      provider: source.provider,
      modelId: source.modelId,
      conversation: source.conversation
    };
    if (request.provider === "openai") request.apiKey = this.options.connections.requireOpenAIKey();
    const result = await runLens(request, (modelId, prompt, outputSchema) => this.options.connections.runCodex(modelId, prompt, outputSchema));
    const sources = new Map(request.chapters.map((chapter) => [chapter.id, chapter]));
    try {
      await store.appendReviewFindings(result.findings.flatMap((finding) => {
        if (finding.chapterId === null || finding.quote.length === 0) return [];
        const chapter = sources.get(finding.chapterId);
        if (chapter === undefined) return [];
        return [{
          role: result.role,
          provider: result.provider,
          model: result.modelId,
          scope: request.scope,
          ...(request.cutoffChapterId === null ? {} : { cutoffChapter: request.cutoffChapterId }),
          sourceVersionHash: chapter.version,
          sourceText: chapter.text,
          chapterId: chapter.id,
          findingTitle: finding.title,
          findingBody: `${finding.observation}\n\n読者への影響: ${finding.readerEffect}`,
          severity: finding.priority,
          exactQuote: finding.quote
        }];
      }));
      return { ...result, ledgerStored: true };
    } catch (error) {
      return { ...result, ledgerStored: false, ledgerMessage: error instanceof Error ? error.message : "指摘を保存できませんでした。" };
    }
  }

  async listReviewFindings(root: string) {
    return (await this.storeFor(root)).listReviewFindings();
  }

  async setReviewFindingStatus(root: string, id: string, status: ReviewStatus) {
    if (typeof id !== "string" || id.length > 100 || (status !== "open" && status !== "resolved" && status !== "ignored")) throw new Error("指摘の状態を確認してください。");
    return (await this.storeFor(root)).setReviewFindingStatus(id, status);
  }

  async recheckReviewFinding(root: string, id: string) {
    if (typeof id !== "string" || id.length > 100) throw new Error("指摘を確認してください。");
    return (await this.storeFor(root)).recheckReviewFinding(id);
  }

  async setReviewAuthorNote(root: string, id: string, note: string) {
    if (typeof id !== "string" || id.length === 0 || id.length > 100 || typeof note !== "string" || note.length > 4000) throw new Error("判断メモは4,000文字以内で入力してください。");
    return (await this.storeFor(root)).setReviewAuthorNote(id, note);
  }

  async listNotes(root: string) {
    return (await this.storeFor(root)).listNotes();
  }

  async readNote(root: string, id: string) {
    if (typeof id !== "string" || id.length > 100) throw new Error("メモを確認してください。");
    return (await this.storeFor(root)).readNote(id);
  }

  async createNote(root: string, title: string, kind: NoteKind, chapterIds: string[]) {
    if (typeof title !== "string" || title.trim().length === 0 || title.length > 200 || (kind !== "character" && kind !== "place" && kind !== "world" && kind !== "plot" && kind !== "memo") || !Array.isArray(chapterIds) || chapterIds.length > 200 || chapterIds.some((id) => typeof id !== "string")) throw new Error("メモの内容を確認してください。");
    return (await this.storeFor(root)).createNote(title, kind, chapterIds, "");
  }

  async saveNote(root: string, id: string, title: string, kind: NoteKind, chapterIds: string[], text: string) {
    if (typeof id !== "string" || id.length > 100 || typeof title !== "string" || title.trim().length === 0 || title.length > 200 || (kind !== "character" && kind !== "place" && kind !== "world" && kind !== "plot" && kind !== "memo") || !Array.isArray(chapterIds) || chapterIds.length > 200 || chapterIds.some((chapterId) => typeof chapterId !== "string") || typeof text !== "string" || text.length > 2_000_000) throw new Error("メモの内容を確認してください。");
    return (await this.storeFor(root)).saveNote(id, title, kind, chapterIds, text);
  }

  async setNoteArchived(root: string, id: string, archived: boolean) {
    if (typeof id !== "string" || id.length > 100 || typeof archived !== "boolean") throw new Error("メモを確認してください。");
    return (await this.storeFor(root)).setNoteArchived(id, archived);
  }

  private async storeFor(requestedRoot: unknown): Promise<ProjectStore> {
    if (typeof requestedRoot !== "string") throw new Error("project pathが不正です。");
    const canonical = await this.fs.realpath(requestedRoot);
    if (!this.allowedRoots.has(pathKey(canonical))) throw new Error("この起動中に開いたprojectではありません。");
    return new ProjectStore(canonical, this.fs);
  }

  private async summary(store: ProjectStore): Promise<SharedProjectSummary> {
    return { root: store.root, manifest: await store.manifest() };
  }
}
