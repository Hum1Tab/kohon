import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import type { RecentProject } from "../shared/types.js";

const LIMIT = 6;

/** Only main-process paths explicitly selected by the user enter this registry. */
export class RecentProjectsStore {
  private entries: RecentProject[] = [];
  private writes: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const raw: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!Array.isArray(raw)) return;
      const seen = new Set<string>();
      this.entries = raw.filter((item): item is RecentProject => {
        if (typeof item !== "object" || item === null || typeof item.root !== "string" || !isAbsolute(item.root) || typeof item.title !== "string" || typeof item.lastOpenedAt !== "string" || !Number.isFinite(Date.parse(item.lastOpenedAt)) || seen.has(item.root)) return false;
        seen.add(item.root);
        return true;
      }).slice(0, LIMIT).map(({ root, title, lastOpenedAt }) => ({ root, title: title.slice(0, 200), lastOpenedAt }));
    } catch { this.entries = []; }
  }

  list(): RecentProject[] { return structuredClone(this.entries); }

  has(root: unknown): root is string {
    return typeof root === "string" && this.entries.some((entry) => entry.root === root);
  }

  remember(root: string, title: string): Promise<void> {
    if (!isAbsolute(root)) return Promise.reject(new Error("Recent project path must be absolute"));
    this.entries = [{ root, title, lastOpenedAt: new Date().toISOString() }, ...this.entries.filter((entry) => entry.root !== root)].slice(0, LIMIT);
    const json = JSON.stringify(this.entries, null, 2);
    const write = this.writes.catch(() => undefined).then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.tmp`;
      await writeFile(temporary, json, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, this.filePath);
    });
    this.writes = write;
    return write;
  }
}
