import { cp, mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

export interface HistoryEntry { commit: string; authoredAt: string; subject: string }

export interface Chapter { id: string; title: string; file: string; order: number }
export interface ProjectSettings { writingMode?: "horizontal" | "vertical-rl"; font?: string; width?: number; lineHeight?: number; [key: string]: unknown }
export interface ProjectManifest { schemaVersion: 1; title: string; chapters: Chapter[]; settings: ProjectSettings }
export interface SearchResult { chapterId: string; title: string; file: string; start: number; end: number; excerpt: string }
const MANIFEST = "novel-lens.json"; const MANUSCRIPT = "manuscript"; const INTERNAL = ".novel-editor"; const HISTORY = `${INTERNAL}/history`;
const safeId = (v: string) => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/.test(v);
function assertPath(root: string, p: string): string { const r = resolve(root, p); if (r !== resolve(root) && !r.startsWith(resolve(root) + "/") && !r.startsWith(resolve(root) + "\\")) throw new Error("managed path boundary violation"); return r; }
function validate(m: ProjectManifest): void { if (m.schemaVersion !== 1 || !Array.isArray(m.chapters) || !m.chapters.every(c => safeId(c.id) && c.file === `${MANUSCRIPT}/${c.id}.md` && Number.isInteger(c.order))) throw new Error("invalid project manifest"); }
async function atomic(path: string, data: string): Promise<void> { const tmp = `${path}.tmp-${process.pid}-${Date.now()}`; const handle = await open(tmp, "w"); try { await handle.writeFile(data, "utf8"); await handle.sync(); } finally { await handle.close(); } await rename(tmp, path); }
async function load(root: string): Promise<ProjectManifest> { const m = JSON.parse(await readFile(assertPath(root, MANIFEST), "utf8")) as ProjectManifest; validate(m); return m; }
async function saveManifest(root: string, m: ProjectManifest): Promise<void> { validate(m); await atomic(assertPath(root, MANIFEST), JSON.stringify(m, null, 2) + "\n"); }

export class ProjectStore {
  constructor(public readonly root: string) {}
  static async create(root: string, title: string): Promise<ProjectStore> { await mkdir(join(root, MANUSCRIPT), { recursive: true }); const s = new ProjectStore(resolve(root)); await saveManifest(s.root, { schemaVersion: 1, title: title.trim() || "Untitled", chapters: [], settings: {} }); return s; }
  async manifest(): Promise<ProjectManifest> { return load(this.root); }
  async open(): Promise<ProjectManifest> { return this.manifest(); }
  async readChapter(id: string): Promise<string> { const m = await load(this.root); const c = m.chapters.find(x => x.id === id); if (!c) throw new Error("chapter not found"); return readFile(assertPath(this.root, c.file), "utf8"); }
  async saveChapter(id: string, text: string): Promise<void> { const m = await load(this.root); const c = m.chapters.find(x => x.id === id); if (!c) throw new Error("chapter not found"); await atomic(assertPath(this.root, c.file), text); }
  async createChapter(title: string, text = ""): Promise<Chapter> { const m = await load(this.root); const id = `chapter-${randomUUID().slice(0, 12)}`; const c = { id, title: title.trim() || id, file: `${MANUSCRIPT}/${id}.md`, order: m.chapters.length }; m.chapters.push(c); await atomic(assertPath(this.root, c.file), text); await saveManifest(this.root, m); return c; }
  async renameChapter(id: string, title: string): Promise<void> { const m = await load(this.root); const c = m.chapters.find(x => x.id === id); if (!c) throw new Error("chapter not found"); c.title = title.trim() || c.title; await saveManifest(this.root, m); }
  async reorderChapters(ids: readonly string[]): Promise<void> { const m = await load(this.root); if (ids.length !== m.chapters.length || new Set(ids).size !== ids.length || ids.some(id => !m.chapters.some(c => c.id === id))) throw new Error("invalid chapter order"); const byId = new Map(m.chapters.map(c => [c.id, c])); m.chapters = ids.map((id, order) => ({ ...byId.get(id)!, order })); await saveManifest(this.root, m); }
  async renameProject(title: string): Promise<void> { const m = await load(this.root); const next = title.trim(); if (next.length === 0 || next.length > 200) throw new Error("invalid project title"); m.title = next; await saveManifest(this.root, m); }
  async deleteChapter(id: string): Promise<void> { const m = await load(this.root); const i = m.chapters.findIndex(x => x.id === id); if (i < 0) throw new Error("chapter not found"); const c = m.chapters[i]!; m.chapters.splice(i, 1); m.chapters.forEach((x, n) => x.order = n); await saveManifest(this.root, m); await rm(assertPath(this.root, c.file)); }
  async updateSettings(settings: ProjectSettings): Promise<void> { const m = await load(this.root); m.settings = { ...m.settings, ...settings }; delete (m.settings as Record<string, unknown>)["apiKey"]; await saveManifest(this.root, m); }
  async resetSetting(key: "writingMode" | "theme" | "canvasBackground" | "canvasText" | "font" | "fontSize" | "lineHeight" | "width"): Promise<void> { const m = await load(this.root); delete m.settings[key]; await saveManifest(this.root, m); }
  async search(query: string): Promise<SearchResult[]> { const m = await load(this.root); const out: SearchResult[] = []; for (const c of m.chapters) { const t = await readFile(assertPath(this.root, c.file), "utf8"); let at = 0; while ((at = t.indexOf(query, at)) >= 0) { out.push({ chapterId: c.id, title: c.title, file: c.file, start: at, end: at + query.length, excerpt: t.slice(Math.max(0, at - 40), at + query.length + 40) }); at += Math.max(1, query.length); } } return out; }
  async checkpoint(subject: string): Promise<{ created: boolean; commit: string | null }> {
    const m = await load(this.root); await mkdir(assertPath(this.root, HISTORY), { recursive: true });
    const files: Record<string, string> = {}; for (const c of m.chapters) files[c.file] = await readFile(assertPath(this.root, c.file), "utf8");
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await atomic(assertPath(this.root, `${HISTORY}/${id}.json`), JSON.stringify({ id, authoredAt: new Date().toISOString(), subject, manifest: m, files }) + "\n");
    return { created: true, commit: id };
  }
  async history(limit = 50): Promise<HistoryEntry[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("invalid history limit");
    try { const names = (await readdir(assertPath(this.root, HISTORY))).filter(n => n.endsWith(".json")).sort().reverse().slice(0, limit); return await Promise.all(names.map(async n => { const x = JSON.parse(await readFile(assertPath(this.root, `${HISTORY}/${n}`), "utf8")) as { id: string; authoredAt: string; subject: string }; return { commit: x.id, authoredAt: x.authoredAt, subject: x.subject }; })); } catch { return []; }
  }
  async restore(commit: string): Promise<void> {
    if (!/^[0-9-]+-[a-z0-9]+$/i.test(commit)) throw new Error("invalid snapshot id");
    const snapshot = JSON.parse(await readFile(assertPath(this.root, `${HISTORY}/${commit}.json`), "utf8")) as { manifest: ProjectManifest; files: Record<string, string> };
    validate(snapshot.manifest); await this.checkpoint(`Safety checkpoint before restore ${commit}`);
    const current = await load(this.root); const wanted = new Set(Object.keys(snapshot.files));
    for (const c of current.chapters) if (!wanted.has(c.file)) await rm(assertPath(this.root, c.file), { force: true });
    for (const [file, text] of Object.entries(snapshot.files)) await atomic(assertPath(this.root, file), text);
    await saveManifest(this.root, snapshot.manifest);
  }
  async createVariation(dir: string): Promise<void> { await cp(this.root, dir, { recursive: true, force: false, errorOnExist: true, filter: s => !s.includes(`${resolve(this.root)}\\${INTERNAL}`) && !s.endsWith(`${resolve(this.root)}/${INTERNAL}`) }); }
  async exportMarkdown(): Promise<string> { const m = await load(this.root); const parts: string[] = []; for (const c of [...m.chapters].sort((a,b) => a.order-b.order)) parts.push(`# ${c.title}\n\n${await this.readChapter(c.id)}`); return parts.join("\n\n---\n\n") + "\n"; }
}
