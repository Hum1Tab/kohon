import { diffTextLines, type DiffHunk } from "./diff.js";
import { emptyStoryMap, validateStoryMap, type StoryMap } from "./story-map.js";
export * from "./story-map.js";
import { isEmptyChapterMetadata, mergeChapterMetadata, validateChapterMetadata, type ChapterMetadata } from "./chapter-metadata.js";
import { archiveNote as archiveNoteMeta, createNoteIndex, createNoteMeta, parseNoteIndex, serializeNoteIndex, unarchiveNote, updateNoteMeta, type NoteIndex, type NoteKind, type NoteMeta } from "./notes.js";
import { calculateReviewAnchor, createReviewFinding, createReviewLedger, parseReviewLedger, recheckReviewFinding as markReviewFindingStale, serializeReviewLedger, updateReviewFindingStatus, updateReviewAuthorNote, type ReviewLedger, type ReviewLedgerEntry, type ReviewScope, type ReviewStatus } from "./review-ledger.js";
import { isNotFoundError, type ProjectFs } from "./fs.js";
import { sha256Hex } from "./hash.js";
import { randomUUID } from "./random.js";
import { joinPath, normalizePath, pathKey, resolveManagedPath } from "./path.js";

export { FileSystemError, errorCode, isAlreadyExistsError, isNotFoundError } from "./fs.js";
export type { CopyTreeOptions, ProjectFs, RemoveOptions } from "./fs.js";
export { sha256Hex } from "./hash.js";
export { randomUUID } from "./random.js";
export { basenamePath, dirnamePath, extnamePath, isAbsolutePath, isPathInside, joinPath, normalizePath, pathKey, resolveManagedPath } from "./path.js";
export type { DiffHunk, DiffLine, DiffLineKind, TextDiff } from "./diff.js";
export type { ReviewAnchor, ReviewAnchorStatus, ReviewFindingDetails, ReviewLedger, ReviewLedgerEntry, ReviewScope, ReviewStatus } from "./review-ledger.js";
export type { NoteIndex, NoteKind, NoteMeta } from "./notes.js";
export type { ChapterMetadata, ChapterStatus } from "./chapter-metadata.js";

export interface HistoryEntry { commit: string; authoredAt: string; subject: string }

export type ChapterKind = "chapter" | "scene";
export interface Chapter { id: string; title: string; file: string; order: number; kind?: ChapterKind; metadata?: ChapterMetadata }
export interface ProjectSettings { writingMode?: "horizontal" | "vertical-rl"; font?: string; width?: number; lineHeight?: number; [key: string]: unknown }
export interface ProjectManifest { schemaVersion: 1; title: string; chapters: Chapter[]; settings: ProjectSettings }
export interface SearchResult { chapterId: string; title: string; file: string; start: number; end: number; excerpt: string }
export type ChapterDiffStatus = "added" | "removed" | "changed" | "same";
export interface ChapterDiff { chapterId: string; title: string; status: ChapterDiffStatus; leftVersion: string | null; rightVersion: string | null; additions: number; removals: number; hunks: DiffHunk[]; truncated: boolean }
export interface ProjectDiff { left: string; right: string; chapters: ChapterDiff[]; summary: { added: number; removed: number; changed: number; same: number; additions: number; removals: number; truncated: boolean } }
export interface AppendReviewFindingInput { role: string; provider?: string; model?: string; scope: ReviewScope; cutoffChapter?: string; checkpoint?: string; sourceVersionHash: string; sourceText: string; chapterId: string; findingTitle: string; findingBody: string; severity?: string; exactQuote: string }
export interface NoteDocument { note: NoteMeta; text: string }
export const PROJECT_MANIFEST = "kohon.json";
export const LEGACY_PROJECT_MANIFEST = "novel-lens.json";
const MANUSCRIPT = "manuscript";
const INTERNAL = ".novel-editor";
const HISTORY = `${INTERNAL}/history`;
const RECOVERY = `${INTERNAL}/recovery`;
const SESSION = `${INTERNAL}/session.json`;
const REVIEWS = `${INTERNAL}/reviews/ledger.json`;

const safeId = (value: string): boolean => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/u.test(value);

function assertPath(root: string, path: string): string {
  return resolveManagedPath(root, path);
}

function validChapterMetadata(value: unknown): boolean {
  if (value === undefined) return true;
  validateChapterMetadata(value);
  return true;
}

function validate(manifest: ProjectManifest): void {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.chapters) || !manifest.chapters.every((chapter) => safeId(chapter.id) && chapter.file === `${MANUSCRIPT}/${chapter.id}.md` && Number.isInteger(chapter.order) && (chapter.kind === undefined || chapter.kind === "chapter" || chapter.kind === "scene") && validChapterMetadata(chapter.metadata))) throw new Error("invalid project manifest");
}

function versionOf(text: string): string {
  return sha256Hex(text);
}

async function readJsonIfPresent(path: string, fs: ProjectFs): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readText(path)) as unknown;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

function literalMatches(text: string, query: string, caseSensitive: boolean): { start: number; end: number }[] {
  if (query.length === 0) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(escaped, caseSensitive ? "gu" : "giu");
  return [...text.matchAll(pattern)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
}

function replaceLiteral(text: string, matches: readonly { start: number; end: number }[], replacement: string): string {
  let cursor = 0;
  const parts: string[] = [];
  for (const match of matches) {
    parts.push(text.slice(cursor, match.start), replacement);
    cursor = match.end;
  }
  parts.push(text.slice(cursor));
  return parts.join("");
}

async function manifestPath(root: string, fs: ProjectFs): Promise<string> {
  const current = await readJsonIfPresent(assertPath(root, PROJECT_MANIFEST), fs);
  if (current !== null) return PROJECT_MANIFEST;
  const legacy = await readJsonIfPresent(assertPath(root, LEGACY_PROJECT_MANIFEST), fs);
  return legacy === null ? PROJECT_MANIFEST : LEGACY_PROJECT_MANIFEST;
}

async function load(root: string, fs: ProjectFs): Promise<ProjectManifest> {
  const name = await manifestPath(root, fs);
  const manifest = JSON.parse(await fs.readText(assertPath(root, name))) as ProjectManifest;
  validate(manifest);
  return manifest;
}

async function saveManifest(root: string, manifest: ProjectManifest, fs: ProjectFs): Promise<void> {
  validate(manifest);
  await fs.writeTextAtomic(assertPath(root, await manifestPath(root, fs)), `${JSON.stringify(manifest, null, 2)}\n`);
}

interface SnapshotData { manifest: ProjectManifest; files: Record<string, string>; storyMap?: StoryMap }

function validateSnapshot(value: unknown): SnapshotData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid checkpoint");
  const source = value as Record<string, unknown>;
  const manifest = source["manifest"] as ProjectManifest;
  validate(manifest);
  if (typeof source["files"] !== "object" || source["files"] === null || Array.isArray(source["files"])) throw new Error("invalid checkpoint");
  const files = source["files"] as Record<string, unknown>;
  const checked: Record<string, string> = {};
  for (const chapter of manifest.chapters) {
    const text = files[chapter.file];
    if (typeof text !== "string") throw new Error("invalid checkpoint");
    checked[chapter.file] = text;
  }
  return { manifest, files: checked, ...(source["storyMap"] === undefined ? {} : { storyMap: validateStoryMap(source["storyMap"]) }) };
}

async function readSnapshot(root: string, commit: string, fs: ProjectFs): Promise<SnapshotData> {
  if (!/^[0-9-]+-[a-z0-9]+$/iu.test(commit)) throw new Error("invalid snapshot id");
  return validateSnapshot(JSON.parse(await fs.readText(assertPath(root, `${HISTORY}/${commit}.json`))) as unknown);
}

async function currentSnapshot(root: string, fs: ProjectFs): Promise<SnapshotData> {
  const manifest = await load(root, fs);
  const files: Record<string, string> = {};
  for (const chapter of manifest.chapters) files[chapter.file] = await fs.readText(assertPath(root, chapter.file));
  return { manifest, files };
}

function compareSnapshotData(leftLabel: string, left: SnapshotData, rightLabel: string, right: SnapshotData): ProjectDiff {
  const leftById = new Map(left.manifest.chapters.map((chapter) => [chapter.id, chapter]));
  const rightById = new Map(right.manifest.chapters.map((chapter) => [chapter.id, chapter]));
  const orderedIds = [...right.manifest.chapters, ...left.manifest.chapters]
    .sort((first, second) => first.order - second.order)
    .map((chapter) => chapter.id)
    .filter((id, index, all) => all.indexOf(id) === index);
  let remainingLines = 4_000;
  const chapters: ChapterDiff[] = orderedIds.map((chapterId) => {
    const leftChapter = leftById.get(chapterId);
    const rightChapter = rightById.get(chapterId);
    const leftText = leftChapter === undefined ? null : left.files[leftChapter.file]!;
    const rightText = rightChapter === undefined ? null : right.files[rightChapter.file]!;
    const status: ChapterDiffStatus = leftText === null ? "added" : rightText === null ? "removed" : leftText === rightText ? "same" : "changed";
    const textDiff = status === "same" ? { hunks: [], additions: 0, removals: 0, truncated: false } : diffTextLines(leftText ?? "", rightText ?? "", 3, remainingLines);
    remainingLines = Math.max(0, remainingLines - textDiff.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0));
    return {
      chapterId,
      title: rightChapter?.title ?? leftChapter?.title ?? chapterId,
      status,
      leftVersion: leftText === null ? null : versionOf(leftText),
      rightVersion: rightText === null ? null : versionOf(rightText),
      ...textDiff
    };
  });
  return {
    left: leftLabel,
    right: rightLabel,
    chapters,
    summary: {
      added: chapters.filter((chapter) => chapter.status === "added").length,
      removed: chapters.filter((chapter) => chapter.status === "removed").length,
      changed: chapters.filter((chapter) => chapter.status === "changed").length,
      same: chapters.filter((chapter) => chapter.status === "same").length,
      additions: chapters.reduce((sum, chapter) => sum + chapter.additions, 0),
      removals: chapters.reduce((sum, chapter) => sum + chapter.removals, 0),
      truncated: chapters.some((chapter) => chapter.truncated)
    }
  };
}

const storyWrites = new Map<string, Promise<unknown>>();
const reviewWrites = new Map<string, Promise<unknown>>();

async function queueReviewWrite<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const key = pathKey(root);
  const previous = reviewWrites.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  reviewWrites.set(key, next);
  try { return await next; }
  finally { if (reviewWrites.get(key) === next) reviewWrites.delete(key); }
}

async function queueStoryWrite<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const key = pathKey(root);
  const previous = storyWrites.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  storyWrites.set(key, next);
  try { return await next; }
  finally { if (storyWrites.get(key) === next) storyWrites.delete(key); }
}

/**
 * Project persistence with an injected filesystem. The desktop renderer uses a
 * Tauri adapter while Node tests and tooling use NodeProjectFs.
 */
export class ProjectStore {
  constructor(public readonly root: string, public readonly fs: ProjectFs) {}

  static async create(root: string, title: string, fs: ProjectFs): Promise<ProjectStore> {
    await fs.mkdir(joinPath(root, MANUSCRIPT));
    const store = new ProjectStore(normalizePath(root), fs);
    await saveManifest(store.root, { schemaVersion: 1, title: title.trim() || "Untitled", chapters: [], settings: {} }, fs);
    return store;
  }

  async readStoryMap(): Promise<StoryMap> {
    await load(this.root, this.fs);
    const raw = await readJsonIfPresent(assertPath(this.root, "notes/story-map.json"), this.fs);
    return raw === null ? emptyStoryMap() : validateStoryMap(raw);
  }

  async saveStoryMap(value: unknown, expectedRevision: number): Promise<StoryMap> {
    const map = validateStoryMap(value);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) throw new Error("invalid story map revision");
    return queueStoryWrite(this.root, async () => {
      const previous = await this.readStoryMap();
      if (previous.revision !== expectedRevision) throw new Error("物語マップが別の画面で更新されています。変更を退避して作品を開き直してください。");
      const saved = { ...map, revision: previous.revision + 1 };
      await this.fs.mkdir(assertPath(this.root, "notes"));
      await this.fs.writeTextAtomic(assertPath(this.root, "notes/story-map.json"), `${JSON.stringify(saved, null, 2)}\n`);
      return saved;
    });
  }

  async manifest(): Promise<ProjectManifest> { return load(this.root, this.fs); }
  async open(): Promise<ProjectManifest> { return this.manifest(); }

  async readChapter(id: string): Promise<string> {
    const manifest = await load(this.root, this.fs);
    const chapter = manifest.chapters.find((candidate) => candidate.id === id);
    if (!chapter) throw new Error("chapter not found");
    return this.fs.readText(assertPath(this.root, chapter.file));
  }

  async readChapterWithVersion(id: string): Promise<{ text: string; version: string }> {
    const text = await this.readChapter(id);
    return { text, version: versionOf(text) };
  }

  async saveChapter(id: string, text: string): Promise<string> {
    const manifest = await load(this.root, this.fs);
    const chapter = manifest.chapters.find((candidate) => candidate.id === id);
    if (!chapter) throw new Error("chapter not found");
    await this.fs.writeTextAtomic(assertPath(this.root, chapter.file), text);
    return versionOf(text);
  }

  async readEditorSession(): Promise<unknown | null> {
    await load(this.root, this.fs);
    try { return await readJsonIfPresent(assertPath(this.root, SESSION), this.fs); }
    catch (error) { if (error instanceof SyntaxError) return null; throw error; }
  }

  async writeEditorSession(session: unknown): Promise<void> {
    await load(this.root, this.fs);
    await this.fs.mkdir(assertPath(this.root, INTERNAL));
    await this.fs.writeTextAtomic(assertPath(this.root, SESSION), `${JSON.stringify(session, null, 2)}\n`);
  }

  async readRecoveryDraft(id: string): Promise<unknown | null> {
    const manifest = await load(this.root, this.fs);
    if (!manifest.chapters.some((chapter) => chapter.id === id)) throw new Error("chapter not found");
    return readJsonIfPresent(assertPath(this.root, `${RECOVERY}/${id}.json`), this.fs);
  }

  async writeRecoveryDraft(id: string, draft: unknown): Promise<void> {
    const manifest = await load(this.root, this.fs);
    if (!manifest.chapters.some((chapter) => chapter.id === id)) throw new Error("chapter not found");
    await this.fs.mkdir(assertPath(this.root, RECOVERY));
    await this.fs.writeTextAtomic(assertPath(this.root, `${RECOVERY}/${id}.json`), `${JSON.stringify(draft, null, 2)}\n`);
  }

  async clearRecoveryDraft(id: string): Promise<void> {
    if (!safeId(id)) throw new Error("invalid chapter id");
    await this.fs.remove(assertPath(this.root, `${RECOVERY}/${id}.json`));
  }

  async createChapter(title: string, text = "", kind: ChapterKind = "chapter"): Promise<Chapter> {
    const manifest = await load(this.root, this.fs);
    if (kind !== "chapter" && kind !== "scene") throw new Error("invalid chapter kind");
    const id = `chapter-${randomUUID().slice(0, 12)}`;
    const chapter: Chapter = { id, title: title.trim() || id, file: `${MANUSCRIPT}/${id}.md`, order: manifest.chapters.length, kind };
    manifest.chapters.push(chapter);
    await this.fs.writeTextAtomic(assertPath(this.root, chapter.file), text);
    await saveManifest(this.root, manifest, this.fs);
    return chapter;
  }

  async renameChapter(id: string, title: string): Promise<void> {
    const manifest = await load(this.root, this.fs);
    const chapter = manifest.chapters.find((candidate) => candidate.id === id);
    if (!chapter) throw new Error("chapter not found");
    chapter.title = title.trim() || chapter.title;
    await saveManifest(this.root, manifest, this.fs);
  }

  async updateChapterMetadata(id: string, metadata: ChapterMetadata): Promise<Chapter> {
    const manifest = await load(this.root, this.fs);
    const chapter = manifest.chapters.find((candidate) => candidate.id === id);
    if (!chapter) throw new Error("chapter not found");
    const normalized = validateChapterMetadata(metadata);
    if (isEmptyChapterMetadata(normalized)) delete chapter.metadata;
    else chapter.metadata = normalized;
    await saveManifest(this.root, manifest, this.fs);
    return { ...chapter };
  }

  async reorderChapters(ids: readonly string[]): Promise<void> {
    const manifest = await load(this.root, this.fs);
    if (ids.length !== manifest.chapters.length || new Set(ids).size !== ids.length || ids.some((id) => !manifest.chapters.some((chapter) => chapter.id === id))) throw new Error("invalid chapter order");
    const byId = new Map(manifest.chapters.map((chapter) => [chapter.id, chapter]));
    manifest.chapters = ids.map((id, order) => ({ ...byId.get(id)!, order }));
    await saveManifest(this.root, manifest, this.fs);
  }

  async renameProject(title: string): Promise<void> {
    const manifest = await load(this.root, this.fs);
    const next = title.trim();
    if (next.length === 0 || next.length > 200) throw new Error("invalid project title");
    manifest.title = next;
    await saveManifest(this.root, manifest, this.fs);
  }

  async deleteChapter(id: string): Promise<void> {
    const manifest = await load(this.root, this.fs);
    const index = manifest.chapters.findIndex((chapter) => chapter.id === id);
    if (index < 0) throw new Error("chapter not found");
    const chapter = manifest.chapters[index]!;
    await this.replaceNoteChapterPin(id, null);
    manifest.chapters.splice(index, 1);
    manifest.chapters.forEach((entry, order) => { entry.order = order; });
    await saveManifest(this.root, manifest, this.fs);
    await this.fs.remove(assertPath(this.root, chapter.file));
    await this.clearRecoveryDraft(id);
  }

  async updateSettings(settings: ProjectSettings): Promise<void> {
    const manifest = await load(this.root, this.fs);
    manifest.settings = { ...manifest.settings, ...settings };
    delete (manifest.settings as Record<string, unknown>)["apiKey"];
    await saveManifest(this.root, manifest, this.fs);
  }

  async resetSetting(key: "writingMode" | "theme" | "canvasBackground" | "canvasText" | "font" | "fontSize" | "lineHeight" | "width"): Promise<void> {
    const manifest = await load(this.root, this.fs);
    delete manifest.settings[key];
    await saveManifest(this.root, manifest, this.fs);
  }

  async search(query: string, caseSensitive = true): Promise<SearchResult[]> {
    const manifest = await load(this.root, this.fs);
    const out: SearchResult[] = [];
    for (const chapter of manifest.chapters) {
      const text = await this.fs.readText(assertPath(this.root, chapter.file));
      for (const match of literalMatches(text, query, caseSensitive)) out.push({ chapterId: chapter.id, title: chapter.title, file: chapter.file, start: match.start, end: match.end, excerpt: text.slice(Math.max(0, match.start - 40), match.end + 40) });
    }
    return out;
  }

  async replaceAll(query: string, replacement: string, caseSensitive = true): Promise<{ count: number; chapterCount: number }> {
    const manifest = await load(this.root, this.fs);
    let count = 0;
    let chapterCount = 0;
    for (const chapter of manifest.chapters) {
      const path = assertPath(this.root, chapter.file);
      const text = await this.fs.readText(path);
      const matches = literalMatches(text, query, caseSensitive);
      if (matches.length === 0) continue;
      await this.fs.writeTextAtomic(path, replaceLiteral(text, matches, replacement));
      count += matches.length;
      chapterCount += 1;
    }
    return { count, chapterCount };
  }

  async checkpoint(subject: string): Promise<{ created: boolean; commit: string | null }> {
    const manifest = await load(this.root, this.fs);
    await this.fs.mkdir(assertPath(this.root, HISTORY));
    const files: Record<string, string> = {};
    for (const chapter of manifest.chapters) files[chapter.file] = await this.fs.readText(assertPath(this.root, chapter.file));
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.fs.writeTextAtomic(assertPath(this.root, `${HISTORY}/${id}.json`), `${JSON.stringify({ id, authoredAt: new Date().toISOString(), subject, manifest, files, storyMap: await this.readStoryMap() })}\n`);
    return { created: true, commit: id };
  }

  async history(limit = 50): Promise<HistoryEntry[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("invalid history limit");
    try {
      const names = (await this.fs.readDir(assertPath(this.root, HISTORY))).filter((name) => name.endsWith(".json")).sort().reverse().slice(0, limit);
      return await Promise.all(names.map(async (name) => {
        const value = JSON.parse(await this.fs.readText(assertPath(this.root, `${HISTORY}/${name}`))) as { id: string; authoredAt: string; subject: string };
        return { commit: value.id, authoredAt: value.authoredAt, subject: value.subject };
      }));
    } catch { return []; }
  }

  async compareCurrentToCheckpoint(commit: string): Promise<ProjectDiff> {
    return compareSnapshotData(commit, await readSnapshot(this.root, commit, this.fs), "current", await currentSnapshot(this.root, this.fs));
  }

  async compareCheckpoints(leftCommit: string, rightCommit: string): Promise<ProjectDiff> {
    return compareSnapshotData(leftCommit, await readSnapshot(this.root, leftCommit, this.fs), rightCommit, await readSnapshot(this.root, rightCommit, this.fs));
  }

  async reviewLedger(): Promise<ReviewLedger> {
    await load(this.root, this.fs);
    try { return parseReviewLedger(await this.fs.readText(assertPath(this.root, REVIEWS))); }
    catch (error) { if (isNotFoundError(error)) return createReviewLedger(); throw error; }
  }

  private async saveReviewLedger(ledger: ReviewLedger): Promise<void> {
    await this.fs.mkdir(assertPath(this.root, `${INTERNAL}/reviews`));
    await this.fs.writeTextAtomic(assertPath(this.root, REVIEWS), serializeReviewLedger(ledger));
  }

  async setReviewAuthorNote(id: string, note: string): Promise<ReviewLedgerEntry[]> {
    return queueReviewWrite(this.root, async () => {
      const ledger = updateReviewAuthorNote(await this.reviewLedger(), id, note);
      await this.saveReviewLedger(ledger);
      return ledger.entries;
    });
  }

  async appendReviewFindings(inputs: readonly AppendReviewFindingInput[]): Promise<ReviewLedger> {
    return queueReviewWrite(this.root, async () => {
      const manifest = await load(this.root, this.fs);
      const current = await this.reviewLedger();
      if (current.entries.length + inputs.length > 10_000) throw new Error("review ledger limit reached");
      const createdAt = new Date().toISOString();
      const additions: ReviewLedgerEntry[] = [];
      for (const input of inputs) {
        const chapter = manifest.chapters.find((candidate) => candidate.id === input.chapterId);
        if (chapter === undefined) throw new Error("chapter not found");
        if (versionOf(input.sourceText) !== input.sourceVersionHash) throw new Error("invalid review source version");
        const canonicalText = await this.fs.readText(assertPath(this.root, chapter.file));
        const canonicalVersion = versionOf(canonicalText);
        const sourceAnchor = calculateReviewAnchor(input.sourceText, input.exactQuote);
        const canonicalAnchor = canonicalVersion === input.sourceVersionHash ? calculateReviewAnchor(canonicalText, input.exactQuote) : null;
        additions.push(createReviewFinding({
          id: `review-${randomUUID()}`,
          role: input.role,
          ...(input.provider === undefined ? {} : { provider: input.provider }),
          ...(input.model === undefined ? {} : { model: input.model }),
          scope: input.scope,
          ...(input.cutoffChapter === undefined ? {} : { cutoffChapter: input.cutoffChapter }),
          ...(input.checkpoint === undefined ? {} : { checkpoint: input.checkpoint }),
          manuscriptVersionHash: input.sourceVersionHash,
          chapterId: chapter.id,
          file: chapter.file,
          title: chapter.title,
          findingTitle: input.findingTitle,
          findingBody: input.findingBody,
          ...(input.severity === undefined ? {} : { severity: input.severity }),
          exactQuote: input.exactQuote,
          anchor: canonicalAnchor?.anchor ?? sourceAnchor.anchor,
          anchorStatus: canonicalAnchor?.anchorStatus ?? "stale",
          createdAt
        }));
      }
      const ledger = createReviewLedger([...additions, ...current.entries]);
      await this.saveReviewLedger(ledger);
      return ledger;
    });
  }

  async listReviewFindings(): Promise<ReviewLedgerEntry[]> {
    return queueReviewWrite(this.root, async () => {
      const ledger = await this.reviewLedger();
      const versions = new Map<string, string>();
      let changed = false;
      const entries: ReviewLedgerEntry[] = [];
      for (const entry of ledger.entries) {
        let version = versions.get(entry.chapterId);
        if (version === undefined) {
          try { version = versionOf(await this.readChapter(entry.chapterId)); }
          catch { version = "missing"; }
          versions.set(entry.chapterId, version);
        }
        const next = version === entry.manuscriptVersionHash || entry.anchorStatus === "stale" ? entry : markReviewFindingStale(entry, version);
        if (next !== entry) changed = true;
        entries.push(next);
      }
      if (changed) await this.saveReviewLedger(createReviewLedger(entries));
      return entries;
    });
  }

  async setReviewFindingStatus(id: string, status: ReviewStatus): Promise<ReviewLedgerEntry[]> {
    return queueReviewWrite(this.root, async () => {
      const ledger = updateReviewFindingStatus(await this.reviewLedger(), id, status);
      await this.saveReviewLedger(ledger);
      return ledger.entries;
    });
  }

  async recheckReviewFinding(id: string): Promise<ReviewLedgerEntry[]> {
    return queueReviewWrite(this.root, async () => {
      const ledger = await this.reviewLedger();
      let found = false;
      const entries: ReviewLedgerEntry[] = [];
      for (const entry of ledger.entries) {
        if (entry.id !== id) { entries.push(entry); continue; }
        found = true;
        const text = await this.readChapter(entry.chapterId);
        const version = versionOf(text);
        const calculated = calculateReviewAnchor(text, entry.exactQuote);
        entries.push({ ...entry, manuscriptVersionHash: version, anchor: calculated.anchor, anchorStatus: calculated.anchorStatus, updatedAt: new Date().toISOString() });
      }
      if (!found) throw new Error("review finding not found");
      const next = createReviewLedger(entries);
      await this.saveReviewLedger(next);
      return next.entries;
    });
  }

  async noteIndex(): Promise<NoteIndex> {
    await load(this.root, this.fs);
    try { return parseNoteIndex(await this.fs.readText(assertPath(this.root, "notes/index.json"))); }
    catch (error) { if (isNotFoundError(error)) return createNoteIndex(); throw error; }
  }

  private async saveNoteIndex(index: NoteIndex): Promise<void> {
    await this.fs.mkdir(assertPath(this.root, "notes"));
    await this.fs.writeTextAtomic(assertPath(this.root, "notes/index.json"), serializeNoteIndex(index));
  }

  private async validateNoteChapterIds(chapterIds: readonly string[]): Promise<void> {
    const manifest = await load(this.root, this.fs);
    const known = new Set(manifest.chapters.map((chapter) => chapter.id));
    if (new Set(chapterIds).size !== chapterIds.length || chapterIds.some((id) => !known.has(id))) throw new Error("invalid note chapter pins");
  }

  async listNotes(): Promise<NoteMeta[]> {
    return [...(await this.noteIndex()).notes].sort((left, right) => left.order - right.order);
  }

  async readNote(id: string): Promise<NoteDocument> {
    if (!safeId(id)) throw new Error("invalid note id");
    const note = (await this.noteIndex()).notes.find((candidate) => candidate.id === id);
    if (note === undefined) throw new Error("note not found");
    return { note, text: await this.fs.readText(assertPath(this.root, note.file)) };
  }

  async createNote(title: string, kind: NoteKind, chapterIds: readonly string[], text = ""): Promise<NoteDocument> {
    await this.validateNoteChapterIds(chapterIds);
    const index = await this.noteIndex();
    const order = index.notes.reduce((maximum, note) => Math.max(maximum, note.order), -1) + 1;
    const note = createNoteMeta({ title, kind, chapterIds, order });
    await this.fs.mkdir(assertPath(this.root, "notes"));
    await this.fs.writeTextAtomic(assertPath(this.root, note.file), text);
    await this.saveNoteIndex(createNoteIndex([...index.notes, note]));
    return { note, text };
  }

  async saveNote(id: string, title: string, kind: NoteKind, chapterIds: readonly string[], text: string): Promise<NoteDocument> {
    await this.validateNoteChapterIds(chapterIds);
    const index = await this.noteIndex();
    const current = index.notes.find((note) => note.id === id);
    if (current === undefined) throw new Error("note not found");
    const note = updateNoteMeta(current, { title, kind, chapterIds });
    await this.fs.writeTextAtomic(assertPath(this.root, note.file), text);
    await this.saveNoteIndex(createNoteIndex(index.notes.map((candidate) => candidate.id === id ? note : candidate)));
    return { note, text };
  }

  async setNoteArchived(id: string, archived: boolean): Promise<NoteMeta[]> {
    const index = await this.noteIndex();
    let found = false;
    const notes = index.notes.map((note) => {
      if (note.id !== id) return note;
      found = true;
      return archived ? archiveNoteMeta(note) : unarchiveNote(note);
    });
    if (!found) throw new Error("note not found");
    const next = createNoteIndex(notes);
    await this.saveNoteIndex(next);
    return [...next.notes].sort((left, right) => left.order - right.order);
  }

  private async replaceNoteChapterPin(sourceId: string, targetId: string | null): Promise<void> {
    const index = await this.noteIndex();
    let changed = false;
    const notes = index.notes.map((note) => {
      if (!note.chapterIds.includes(sourceId)) return note;
      changed = true;
      const chapterIds = [...new Set(note.chapterIds.flatMap((id) => id === sourceId ? (targetId === null ? [] : [targetId]) : [id]))];
      return updateNoteMeta(note, { chapterIds });
    });
    if (changed) await this.saveNoteIndex(createNoteIndex(notes));
  }

  async splitChapter(id: string, offset: number, title: string): Promise<Chapter> {
    const manifest = await load(this.root, this.fs);
    const index = manifest.chapters.findIndex((chapter) => chapter.id === id);
    if (index < 0) throw new Error("chapter not found");
    const source = manifest.chapters[index]!;
    const text = await this.fs.readText(assertPath(this.root, source.file));
    const leftCode = text.charCodeAt(offset - 1);
    const rightCode = text.charCodeAt(offset);
    if (!Number.isInteger(offset) || offset <= 0 || offset >= text.length || (leftCode >= 0xD800 && leftCode <= 0xDBFF && rightCode >= 0xDC00 && rightCode <= 0xDFFF)) throw new Error("invalid chapter split");
    const createdId = `chapter-${randomUUID().slice(0, 12)}`;
    const created: Chapter = { id: createdId, title: title.trim() || createdId, file: `${MANUSCRIPT}/${createdId}.md`, order: index + 1, kind: "scene" };
    await this.fs.writeTextAtomic(assertPath(this.root, created.file), text.slice(offset));
    manifest.chapters.splice(index + 1, 0, created);
    manifest.chapters.forEach((chapter, order) => { chapter.order = order; });
    await saveManifest(this.root, manifest, this.fs);
    await this.fs.writeTextAtomic(assertPath(this.root, source.file), text.slice(0, offset));
    return created;
  }

  async mergeChapterIntoPrevious(sourceId: string): Promise<Chapter> {
    const manifest = await load(this.root, this.fs);
    const sourceIndex = manifest.chapters.findIndex((chapter) => chapter.id === sourceId);
    if (sourceIndex <= 0) throw new Error("chapter cannot be merged");
    const source = manifest.chapters[sourceIndex]!;
    const target = manifest.chapters[sourceIndex - 1]!;
    const metadata = mergeChapterMetadata(target.metadata, source.metadata);
    const [targetText, sourceText] = await Promise.all([
      this.fs.readText(assertPath(this.root, target.file)),
      this.fs.readText(assertPath(this.root, source.file))
    ]);
    const separator = targetText.length === 0 || sourceText.length === 0 || /[\r\n]$/u.test(targetText) || /^[\r\n]/u.test(sourceText) ? "" : "\n\n";
    await this.replaceNoteChapterPin(source.id, target.id);
    await this.fs.writeTextAtomic(assertPath(this.root, target.file), `${targetText}${separator}${sourceText}`);
    if (metadata === undefined) delete target.metadata;
    else target.metadata = metadata;
    manifest.chapters.splice(sourceIndex, 1);
    manifest.chapters.forEach((chapter, order) => { chapter.order = order; });
    await saveManifest(this.root, manifest, this.fs);
    await this.fs.remove(assertPath(this.root, source.file));
    await this.clearRecoveryDraft(source.id);
    return { ...target, order: sourceIndex - 1 };
  }

  async restore(commit: string): Promise<void> {
    const snapshot = await readSnapshot(this.root, commit, this.fs);
    await this.checkpoint(`Safety checkpoint before restore ${commit}`);
    const current = await load(this.root, this.fs);
    const wanted = new Set(Object.keys(snapshot.files));
    for (const chapter of current.chapters) if (!wanted.has(chapter.file)) await this.fs.remove(assertPath(this.root, chapter.file));
    for (const [file, text] of Object.entries(snapshot.files)) await this.fs.writeTextAtomic(assertPath(this.root, file), text);
    await saveManifest(this.root, snapshot.manifest, this.fs);
    if (snapshot.storyMap !== undefined) {
      const currentMap = await this.readStoryMap();
      await this.saveStoryMap(snapshot.storyMap, currentMap.revision);
    }
  }

  async restoreChapter(commit: string, chapterId: string): Promise<Chapter> {
    const snapshot = await readSnapshot(this.root, commit, this.fs);
    const source = snapshot.manifest.chapters.find((chapter) => chapter.id === chapterId);
    if (source === undefined) throw new Error("chapter not found in checkpoint");
    await this.checkpoint(`Safety checkpoint before restoring ${source.title}`);
    const current = await load(this.root, this.fs);
    const existingIndex = current.chapters.findIndex((chapter) => chapter.id === chapterId);
    const order = existingIndex >= 0 ? current.chapters[existingIndex]!.order : Math.min(source.order, current.chapters.length);
    const restored: Chapter = { ...source, order };
    await this.fs.writeTextAtomic(assertPath(this.root, restored.file), snapshot.files[source.file]!);
    if (existingIndex >= 0) current.chapters[existingIndex] = restored;
    else current.chapters.splice(order, 0, restored);
    current.chapters.forEach((chapter, index) => { chapter.order = index; });
    await saveManifest(this.root, current, this.fs);
    await this.clearRecoveryDraft(chapterId);
    return { ...restored, order: current.chapters.findIndex((chapter) => chapter.id === restored.id) };
  }

  async createVariation(dir: string): Promise<void> {
    await this.fs.copyTree(this.root, dir, { excludeRootNames: [INTERNAL] });
  }

  async exportMarkdown(): Promise<string> {
    const manifest = await load(this.root, this.fs);
    const parts: string[] = [];
    for (const chapter of [...manifest.chapters].sort((first, second) => first.order - second.order)) parts.push(`# ${chapter.title}\n\n${await this.readChapter(chapter.id)}`);
    return `${parts.join("\n\n---\n\n")}\n`;
  }

  async exportText(): Promise<string> {
    const manifest = await load(this.root, this.fs);
    const parts: string[] = [];
    for (const chapter of [...manifest.chapters].sort((first, second) => first.order - second.order)) parts.push(`${chapter.title}\n\n${(await this.readChapter(chapter.id)).replace(/[\r\n]+$/u, "")}`);
    return `${parts.join("\n\n\n")}\n`;
  }
}
