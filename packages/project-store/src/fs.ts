/** Filesystem boundary used by ProjectStore. Implementations exist for Node and Tauri. */
export interface RemoveOptions {
  recursive?: boolean;
  force?: boolean;
}

export interface CopyTreeOptions {
  /** Directory names skipped at the source root, for example the internal history folder. */
  excludeRootNames?: readonly string[];
}

export interface ProjectFs {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  writeTextAtomic(path: string, text: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  readDir(path: string): Promise<string[]>;
  remove(path: string, options?: RemoveOptions): Promise<void>;
  copyTree(source: string, destination: string, options?: CopyTreeOptions): Promise<void>;
  exists(path: string): Promise<boolean>;
  realpath(path: string): Promise<string>;
}

export class FileSystemError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "FileSystemError";
  }
}

export function errorCode(error: unknown): string | null {
  if (error instanceof FileSystemError) return error.code;
  if (typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string") return (error as { code: string }).code;
  return null;
}

export function isNotFoundError(error: unknown): boolean {
  return errorCode(error) === "ENOENT";
}

export function isAlreadyExistsError(error: unknown): boolean {
  return errorCode(error) === "EEXIST";
}
