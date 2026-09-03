import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

import { safeStorage } from "electron";

export interface StoredOpenAICredential {
  apiKey: string;
  verifiedAt: string;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function atomicWrite(path: string, value: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "w", 0o600);
  try {
    await handle.writeFile(value);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try { await rename(temporary, path); }
  catch (error) { await rm(temporary, { force: true }); throw error; }
}

/** Stores one OpenAI credential in the current OS user's protected secret store. */
export class SecureCredentialStore {
  constructor(private readonly filePath: string) {}

  available(): boolean {
    if (!safeStorage.isEncryptionAvailable()) return false;
    return process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text";
  }

  async loadOpenAI(): Promise<StoredOpenAICredential | null> {
    if (!this.available()) return null;
    try {
      const decoded = JSON.parse(safeStorage.decryptString(await readFile(this.filePath))) as unknown;
      if (typeof decoded !== "object" || decoded === null) return null;
      const value = decoded as Record<string, unknown>;
      if (value["version"] !== 1 || typeof value["apiKey"] !== "string" || typeof value["verifiedAt"] !== "string") return null;
      if (!/^\S{20,512}$/u.test(value["apiKey"]) || !Number.isFinite(Date.parse(value["verifiedAt"]))) return null;
      return { apiKey: value["apiKey"], verifiedAt: value["verifiedAt"] };
    } catch (error) {
      if (isMissing(error)) return null;
      throw new Error("OSの保護領域にあるOpenAI APIキーを読み込めませんでした。");
    }
  }

  async saveOpenAI(value: StoredOpenAICredential): Promise<void> {
    if (!this.available()) throw new Error("この環境ではOSの暗号化ストレージを利用できません。");
    const encrypted = safeStorage.encryptString(JSON.stringify({ version: 1, ...value }));
    await atomicWrite(this.filePath, encrypted);
  }

  async removeOpenAI(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}
