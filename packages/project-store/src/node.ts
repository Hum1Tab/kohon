import { cp, mkdir, open, readFile, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";

import { FileSystemError, type CopyTreeOptions, type ProjectFs, type RemoveOptions } from "./fs.js";
import { ProjectStore } from "./index.js";
import { normalizePath } from "./path.js";

function nodeError(error: unknown): FileSystemError {
  const code = typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : "EIO";
  return new FileSystemError(error instanceof Error ? error.message : String(error), code);
}

export class NodeProjectFs implements ProjectFs {
  async readText(path: string): Promise<string> {
    try { return await readFile(path, "utf8"); }
    catch (error) { throw nodeError(error); }
  }

  async writeText(path: string, text: string): Promise<void> {
    try {
      await mkdir(dirname(path), { recursive: true });
      await open(path, "w", 0o600).then(async (handle) => { try { await handle.writeFile(text, "utf8"); } finally { await handle.close(); } });
    } catch (error) { throw nodeError(error); }
  }

  async writeTextAtomic(path: string, text: string): Promise<void> {
    try {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
      const handle = await open(temporary, "w", 0o600);
      try { await handle.writeFile(text, "utf8"); await handle.sync(); }
      finally { await handle.close(); }
      try { await rename(temporary, path); }
      catch (error) { await rm(temporary, { force: true }); throw error; }
    } catch (error) { throw nodeError(error); }
  }

  async mkdir(path: string): Promise<void> {
    try { await mkdir(path, { recursive: true }); }
    catch (error) { throw nodeError(error); }
  }

  async readDir(path: string): Promise<string[]> {
    try { return await readdir(path); }
    catch (error) { throw nodeError(error); }
  }

  async remove(path: string, options?: RemoveOptions): Promise<void> {
    try { await rm(path, { force: options?.force ?? true, recursive: options?.recursive ?? false }); }
    catch (error) { throw nodeError(error); }
  }

  async copyTree(source: string, destination: string, options?: CopyTreeOptions): Promise<void> {
    const excluded = new Set(options?.excludeRootNames ?? []);
    try {
      await cp(source, destination, {
        recursive: true,
        force: false,
        errorOnExist: true,
        filter: (candidate) => candidate !== source && !(dirname(candidate) === source && excluded.has(candidate.slice(source.length + 1)))
      });
    } catch (error) { throw nodeError(error); }
  }

  async exists(path: string): Promise<boolean> {
    try { await stat(path); return true; }
    catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT") return false;
      throw nodeError(error);
    }
  }

  async realpath(path: string): Promise<string> {
    try { return await realpath(path); }
    catch (error) { throw nodeError(error); }
  }
}

/** Convenience store for Node tests, CLI tooling and legacy migrations. */
export class NodeProjectStore extends ProjectStore {
  constructor(root: string) {
    super(normalizePath(root), new NodeProjectFs());
  }

  static override async create(root: string, title: string): Promise<NodeProjectStore> {
    const created = await ProjectStore.create(root, title, new NodeProjectFs());
    return new NodeProjectStore(created.root);
  }
}
