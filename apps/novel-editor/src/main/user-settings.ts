import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

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

async function atomicWrite(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "w", 0o600);
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try { await rename(temporary, path); }
  catch (error) { await rm(temporary, { force: true }); throw error; }
}

export class UserSettingsStore {
  private value: UserSettings = defaultUserSettings();

  constructor(private readonly filePath: string) {}

  async load(): Promise<UserSettings> {
    try {
      this.value = sanitizeUserSettings(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) this.value = defaultUserSettings();
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
    await atomicWrite(this.filePath, serializeUserSettings(this.value));
    return this.current();
  }

  async resetKeybindings(): Promise<UserSettings> {
    this.value = { ...this.value, keybindings: defaultKeybindings() };
    await atomicWrite(this.filePath, serializeUserSettings(this.value));
    return this.current();
  }
}
