import { FileSystemError, type CopyTreeOptions, type ProjectFs, type RemoveOptions } from "@kohon/project-store";

import { command } from "./ipc.js";

function projectFsError(error: unknown): FileSystemError {
  const message = error instanceof Error ? error.message : String(error);
  const match = /^([A-Z][A-Z0-9_]*):/u.exec(message.trim());
  return new FileSystemError(message, match?.[1] ?? "EIO");
}

async function guard<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw projectFsError(error);
  }
}

/** Project filesystem backed by KOHON's capability-scoped Rust commands. */
export class TauriProjectFs implements ProjectFs {
  readText(path: string): Promise<string> {
    return guard(() => command<string>("fs_read_text", { path }));
  }

  writeText(path: string, text: string): Promise<void> {
    return guard(() => command<void>("fs_write_text", { path, text }));
  }

  writeTextAtomic(path: string, text: string): Promise<void> {
    return guard(() => command<void>("fs_write_text_atomic", { path, text }));
  }

  mkdir(path: string): Promise<void> {
    return guard(() => command<void>("fs_mkdir", { path }));
  }

  readDir(path: string): Promise<string[]> {
    return guard(() => command<string[]>("fs_read_dir", { path }));
  }

  remove(path: string, options?: RemoveOptions): Promise<void> {
    return guard(() => command<void>("fs_remove", {
      path,
      recursive: options?.recursive ?? false,
      force: options?.force ?? true
    }));
  }

  copyTree(source: string, destination: string, options?: CopyTreeOptions): Promise<void> {
    return guard(() => command<void>("fs_copy_tree", {
      source,
      destination,
      excludeRootNames: options?.excludeRootNames === undefined ? undefined : [...options.excludeRootNames]
    }));
  }

  exists(path: string): Promise<boolean> {
    return guard(() => command<boolean>("fs_exists", { path }));
  }

  realpath(path: string): Promise<string> {
    return guard(() => command<string>("fs_realpath", { path }));
  }
}

export const projectFs = new TauriProjectFs();
