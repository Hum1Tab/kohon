import { constants } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const MIGRATED_FILES = ["settings.json", "openai-credential.bin"] as const;

async function regularFile(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function migrateLegacyUserData(currentDirectory: string, legacyDirectories: readonly string[]): Promise<string[]> {
  const current = resolve(currentDirectory);
  const copied: string[] = [];
  for (const legacyDirectory of legacyDirectories) {
    const legacy = resolve(legacyDirectory);
    if (legacy === current) continue;
    for (const file of MIGRATED_FILES) {
      const source = join(legacy, file);
      const destination = join(current, file);
      if (!await regularFile(source) || await regularFile(destination)) continue;
      await mkdir(current, { recursive: true });
      try {
        await copyFile(source, destination, constants.COPYFILE_EXCL);
        copied.push(basename(destination));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
  }
  return copied;
}
