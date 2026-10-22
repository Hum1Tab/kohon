import { isAbsolutePath, isNotFoundError, joinPath } from "@kohon/project-store";
import {
  defaultKeybindings,
  defaultUserSettings,
  mergeUserSettings,
  sanitizeUserSettings,
  serializeUserSettings,
  validateKeybindings,
  type UserSettings,
  type UserSettingsPatch
} from "../shared/settings.js";
import type { RecentProject } from "../shared/types.js";

import type { ProjectFs } from "@kohon/project-store";

async function readTextIfPresent(fs: ProjectFs, path: string): Promise<string | null> {
  try {
    return await fs.readText(path);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export class DesktopSettingsStore {
  private value: UserSettings = defaultUserSettings();

  constructor(private readonly fs: ProjectFs, private readonly filePath: string) {}

  async load(): Promise<UserSettings> {
    try {
      const stored = await readTextIfPresent(this.fs, this.filePath);
      if (stored !== null) this.value = sanitizeUserSettings(JSON.parse(stored));
    } catch {
      this.value = defaultUserSettings();
    }
    return structuredClone(this.value);
  }

  current(): UserSettings {
    return structuredClone(this.value);
  }

  async update(patch: UserSettingsPatch): Promise<UserSettings> {
    const bindings = { ...this.value.keybindings, ...patch.keybindings };
    validateKeybindings(bindings);
    this.value = mergeUserSettings(this.value, patch);
    await this.fs.writeTextAtomic(this.filePath, serializeUserSettings(this.value));
    return this.current();
  }

  async resetKeybindings(): Promise<UserSettings> {
    this.value = { ...this.value, keybindings: defaultKeybindings() };
    await this.fs.writeTextAtomic(this.filePath, serializeUserSettings(this.value));
    return this.current();
  }
}

const RECENT_LIMIT = 6;

export class DesktopRecentProjectsStore {
  private entries: RecentProject[] = [];

  constructor(private readonly fs: ProjectFs, private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const stored = await readTextIfPresent(this.fs, this.filePath);
      if (stored === null) return;
      const raw: unknown = JSON.parse(stored);
      if (!Array.isArray(raw)) return;
      const seen = new Set<string>();
      this.entries = raw.filter((item): item is RecentProject => {
        if (typeof item !== "object" || item === null) return false;
        const source = item as Record<string, unknown>;
        if (typeof source["root"] !== "string" || !isAbsolutePath(source["root"])) return false;
        if (typeof source["title"] !== "string" || typeof source["lastOpenedAt"] !== "string") return false;
        if (!Number.isFinite(Date.parse(source["lastOpenedAt"]))) return false;
        if (seen.has(source["root"])) return false;
        seen.add(source["root"]);
        return true;
      }).slice(0, RECENT_LIMIT).map((entry) => ({
        root: entry.root,
        title: entry.title.slice(0, 200),
        lastOpenedAt: entry.lastOpenedAt
      }));
    } catch {
      this.entries = [];
    }
  }

  list(): RecentProject[] {
    return structuredClone(this.entries);
  }

  has(root: unknown): root is string {
    return typeof root === "string" && this.entries.some((entry) => entry.root === root);
  }

  async remember(root: string, title: string): Promise<void> {
    if (!isAbsolutePath(root)) throw new Error("Recent project path must be absolute");
    this.entries = [{ root, title, lastOpenedAt: new Date().toISOString() }, ...this.entries.filter((entry) => entry.root !== root)].slice(0, RECENT_LIMIT);
    await this.fs.writeTextAtomic(this.filePath, `${JSON.stringify(this.entries, null, 2)}\n`);
  }
}

export function settingsPath(dataDir: string): string {
  return joinPath(dataDir, "settings.json");
}

export function recentProjectsPath(dataDir: string): string {
  return joinPath(dataDir, "recent-projects.json");
}
