import { createHash } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import type { UpdateStatus } from "../shared/types.js";

const LATEST_RELEASE_API = "https://api.github.com/repos/Hum1Tab/kohon/releases/latest";
export const LATEST_RELEASE_PAGE = "https://github.com/Hum1Tab/kohon/releases/latest";
const MAX_INSTALLER_BYTES = 512 * 1024 * 1024;

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size?: number | null;
  digest?: string | null;
}

interface LatestRelease { tag_name: string; html_url: string; assets: ReleaseAsset[] }

function versionTuple(value: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/u.exec(value);
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(left: string, right: string): number {
  const a = versionTuple(left);
  const b = versionTuple(right);
  if (a === null || b === null) throw new Error("Release versionの形式を確認できません。");
  for (let index = 0; index < 3; index += 1) {
    const difference = a[index]! - b[index]!;
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function isAllowedReleaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" && /^\/Hum1Tab\/kohon\/releases\/(?:latest|tag\/[^/]+|download\/[^/]+\/[^/]+)$/u.test(url.pathname);
  } catch { return false; }
}

function isAllowedDownloadResponse(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return (url.hostname === "github.com" && url.pathname.startsWith("/Hum1Tab/kohon/releases/download/"))
      || url.hostname === "release-assets.githubusercontent.com";
  } catch { return false; }
}

function installerPatterns(platform: NodeJS.Platform, architecture: string): RegExp[] {
  const arch = architecture === "arm64" ? "arm64" : architecture === "x64" ? "x64" : null;
  if (arch === null) return [];
  if (platform === "win32") return [new RegExp(`windows-${arch}-setup\\.exe$`, "iu")];
  if (platform === "darwin") return [new RegExp(`mac-${arch}\\.dmg$`, "iu"), /mac-universal\.dmg$/iu];
  if (platform === "linux" && arch === "x64") return [/linux-(?:x86_64|x64)\.AppImage$/u, /linux-(?:amd64|x64)\.deb$/u];
  if (platform === "linux") return [new RegExp(`linux-${arch}\\.AppImage$`, "u"), new RegExp(`linux-${arch}\\.deb$`, "u")];
  return [];
}

export function chooseInstallerAsset(assets: readonly ReleaseAsset[], platform: NodeJS.Platform, architecture: string): ReleaseAsset | null {
  for (const pattern of installerPatterns(platform, architecture)) {
    const match = assets.find((asset) => pattern.test(asset.name) && basename(asset.name) === asset.name && isAllowedReleaseUrl(asset.browser_download_url));
    if (match !== undefined) return { ...match };
  }
  return null;
}

export function chooseInstaller(assets: readonly ReleaseAsset[], platform: NodeJS.Platform, architecture: string): string | null {
  return chooseInstallerAsset(assets, platform, architecture)?.browser_download_url ?? null;
}

export function installerLaunchArguments(platform: NodeJS.Platform): string[] {
  return platform === "win32" ? ["/S", "--updated", "--force-run"] : [];
}

export function isWindowsPortable(platform: NodeJS.Platform, environment: NodeJS.ProcessEnv): boolean {
  return platform === "win32" && typeof environment["PORTABLE_EXECUTABLE_FILE"] === "string" && environment["PORTABLE_EXECUTABLE_FILE"].length > 0;
}

function checksumName(platform: NodeJS.Platform, architecture: string): string | null {
  const arch = architecture === "arm64" ? "arm64" : architecture === "x64" ? "x64" : null;
  if (arch === null) return null;
  const label = platform === "win32" ? "windows" : platform === "darwin" ? "macos" : platform === "linux" ? "linux" : null;
  return label === null ? null : `SHA256SUMS-${label}-${arch}.txt`;
}

function chooseChecksumAsset(assets: readonly ReleaseAsset[], platform: NodeJS.Platform, architecture: string): ReleaseAsset | null {
  const name = checksumName(platform, architecture);
  const match = name === null ? undefined : assets.find((asset) => asset.name === name && isAllowedReleaseUrl(asset.browser_download_url));
  return match === undefined ? null : { ...match };
}

function parseLatestRelease(value: unknown): LatestRelease {
  if (typeof value !== "object" || value === null) throw new Error("GitHub Releaseの応答を確認できません。");
  const source = value as Record<string, unknown>;
  if (typeof source["tag_name"] !== "string" || versionTuple(source["tag_name"]) === null) throw new Error("最新版のversionを確認できません。");
  if (typeof source["html_url"] !== "string" || !isAllowedReleaseUrl(source["html_url"])) throw new Error("最新版のURLを確認できません。");
  const assets = Array.isArray(source["assets"]) ? source["assets"].flatMap((entry): ReleaseAsset[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const asset = entry as Record<string, unknown>;
    if (typeof asset["name"] !== "string" || typeof asset["browser_download_url"] !== "string") return [];
    const size = typeof asset["size"] === "number" && Number.isSafeInteger(asset["size"]) && asset["size"] > 0 ? asset["size"] : null;
    const digest = typeof asset["digest"] === "string" ? asset["digest"] : null;
    return [{ name: asset["name"], browser_download_url: asset["browser_download_url"], size, digest }];
  }) : [];
  return { tag_name: source["tag_name"], html_url: source["html_url"], assets };
}

function digestValue(value: string | null | undefined): string | null {
  const match = /^sha256:([a-f0-9]{64})$/iu.exec(value ?? "");
  return match?.[1]?.toLowerCase() ?? null;
}

export function checksumForAsset(contents: string, assetName: string): string | null {
  for (const line of contents.split(/\r?\n/u)) {
    const match = /^([a-f0-9]{64})\s+\*?(.+)$/iu.exec(line.trim());
    if (match !== null && match[2] === assetName) return match[1]!.toLowerCase();
  }
  return null;
}

export class UpdateManager {
  private status: UpdateStatus;
  private selectedAsset: ReleaseAsset | null = null;
  private checksumAsset: ReleaseAsset | null = null;
  private downloadedPath: string | null = null;
  private checkInFlight: Promise<UpdateStatus> | null = null;
  private installInFlight: Promise<UpdateStatus> | null = null;

  constructor(
    private readonly currentVersion: string,
    private readonly platform: NodeJS.Platform,
    private readonly architecture: string,
    private readonly onStatus: (status: UpdateStatus) => void,
    private readonly downloadDirectory = join(tmpdir(), "KOHON-updates")
  ) {
    this.status = { state: "idle", currentVersion, latestVersion: null, checkedAt: null, downloadUrl: null, assetName: null, progress: null, releaseUrl: LATEST_RELEASE_PAGE, message: "更新はまだ確認していません。" };
  }

  snapshot(): UpdateStatus { return { ...this.status }; }

  check(): Promise<UpdateStatus> {
    if (this.checkInFlight !== null) return this.checkInFlight;
    this.checkInFlight = this.performCheck().finally(() => { this.checkInFlight = null; });
    return this.checkInFlight;
  }

  install(launcher: (path: string) => Promise<string>): Promise<UpdateStatus> {
    if (this.installInFlight !== null) return this.installInFlight;
    this.installInFlight = this.performInstall(launcher).finally(() => { this.installInFlight = null; });
    return this.installInFlight;
  }

  private async performCheck(): Promise<UpdateStatus> {
    this.set({ ...this.status, state: "checking", progress: null, message: "GitHub Releasesで最新版を確認しています…" });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(LATEST_RELEASE_API, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": `KOHON/${this.currentVersion}`, "X-GitHub-Api-Version": "2022-11-28" },
        redirect: "error",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`GitHub Releasesを確認できませんでした（HTTP ${response.status}）。`);
      const release = parseLatestRelease(await response.json());
      const latestVersion = release.tag_name.replace(/^v/u, "");
      const checkedAt = new Date().toISOString();
      this.selectedAsset = null;
      this.checksumAsset = null;
      this.downloadedPath = null;
      if (compareVersions(latestVersion, this.currentVersion) <= 0) {
        this.set({ state: "current", currentVersion: this.currentVersion, latestVersion, checkedAt, downloadUrl: null, assetName: null, progress: null, releaseUrl: release.html_url, message: "最新版を使用しています。" });
      } else {
        this.selectedAsset = chooseInstallerAsset(release.assets, this.platform, this.architecture);
        this.checksumAsset = chooseChecksumAsset(release.assets, this.platform, this.architecture);
        const downloadUrl = this.selectedAsset?.browser_download_url ?? null;
        this.set({ state: "available", currentVersion: this.currentVersion, latestVersion, checkedAt, downloadUrl, assetName: this.selectedAsset?.name ?? null, progress: null, releaseUrl: release.html_url, message: downloadUrl === null ? "新しいversionがあります。Releaseページから取得できます。" : "新しいversionがあります。ダウンロード後にSHA-256を照合してinstallerを起動できます。" });
      }
      return this.snapshot();
    } catch (error) {
      const message = controller.signal.aborted ? "更新確認が時間切れになりました。" : error instanceof Error ? error.message : "更新を確認できませんでした。";
      this.set({ ...this.status, state: "error", checkedAt: new Date().toISOString(), progress: null, message });
      return this.snapshot();
    } finally { clearTimeout(timer); }
  }

  private async expectedDigest(asset: ReleaseAsset): Promise<string> {
    const direct = digestValue(asset.digest);
    if (direct !== null) return direct;
    if (this.checksumAsset === null) throw new Error("installerのSHA-256検証情報がReleaseにありません。");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(this.checksumAsset.browser_download_url, { redirect: "follow", signal: controller.signal });
      if (!response.ok || !isAllowedDownloadResponse(response.url)) throw new Error("ReleaseのSHA-256検証情報を取得できませんでした。");
      const contents = await response.text();
      if (contents.length > 256_000) throw new Error("ReleaseのSHA-256検証情報が大きすぎます。");
      const digest = checksumForAsset(contents, asset.name);
      if (digest === null) throw new Error("installerのSHA-256をReleaseで確認できません。");
      return digest;
    } finally { clearTimeout(timer); }
  }

  private async download(): Promise<UpdateStatus> {
    const asset = this.selectedAsset;
    if (asset === null) return this.snapshot();
    const expected = await this.expectedDigest(asset);
    await mkdir(this.downloadDirectory, { recursive: true });
    const finalPath = join(this.downloadDirectory, asset.name);
    const temporary = `${finalPath}.part-${process.pid}`;
    await rm(temporary, { force: true });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10 * 60_000);
    this.set({ ...this.status, state: "downloading", progress: 0, message: `${asset.name} をダウンロードしています…` });
    try {
      const response = await fetch(asset.browser_download_url, {
        headers: { "User-Agent": `KOHON/${this.currentVersion}` },
        redirect: "follow",
        signal: controller.signal
      });
      if (!response.ok || response.body === null || !isAllowedDownloadResponse(response.url)) throw new Error("installerを安全なGitHub Releaseから取得できませんでした。");
      const headerSize = Number(response.headers.get("content-length"));
      const declaredSize = asset.size ?? (Number.isFinite(headerSize) && headerSize > 0 ? headerSize : null);
      if (declaredSize !== null && declaredSize > MAX_INSTALLER_BYTES) throw new Error("installerのsizeが許容上限を超えています。");
      const handle = await open(temporary, "w", 0o700);
      const hash = createHash("sha256");
      const reader = response.body.getReader();
      let received = 0;
      let lastProgress = -1;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          received += chunk.value.byteLength;
          if (received > MAX_INSTALLER_BYTES) throw new Error("installerのsizeが許容上限を超えています。");
          hash.update(chunk.value);
          await handle.write(chunk.value);
          if (declaredSize !== null) {
            const progress = Math.min(100, Math.floor(received * 100 / declaredSize));
            if (progress !== lastProgress) {
              lastProgress = progress;
              this.set({ ...this.status, progress, message: `${asset.name} をダウンロードしています… ${progress}%` });
            }
          }
        }
        await handle.sync();
      } finally {
        reader.releaseLock();
        await handle.close();
      }
      if (asset.size !== null && asset.size !== undefined && received !== asset.size) throw new Error("installerのsizeがRelease情報と一致しません。");
      this.set({ ...this.status, state: "verifying", progress: 100, message: "ダウンロードしたinstallerのSHA-256を照合しています…" });
      if (hash.digest("hex") !== expected) throw new Error("installerのSHA-256がRelease情報と一致しません。ファイルは削除しました。");
      await rm(finalPath, { force: true });
      await rename(temporary, finalPath);
      this.downloadedPath = finalPath;
      this.set({ ...this.status, state: "ready", progress: 100, message: "installerの検証が完了しました。起動します…" });
      return this.snapshot();
    } catch (error) {
      await rm(temporary, { force: true });
      const message = controller.signal.aborted ? "installerのダウンロードが時間切れになりました。" : error instanceof Error ? error.message : "installerを取得できませんでした。";
      this.set({ ...this.status, state: "error", progress: null, message });
      return this.snapshot();
    } finally { clearTimeout(timer); }
  }

  private async performInstall(launcher: (path: string) => Promise<string>): Promise<UpdateStatus> {
    try {
      if (this.status.state === "available") await this.download();
      if (this.status.state !== "ready" || this.downloadedPath === null) return this.snapshot();
      const installer = this.downloadedPath;
      this.set({ ...this.status, state: "installing", message: this.platform === "win32" ? "アプリを終了して更新を適用します…" : "installerを起動しています…" });
      const launchError = await launcher(installer);
      if (launchError.length > 0) throw new Error(`installerを起動できませんでした: ${launchError}`);
      this.set({ ...this.status, state: "installing", message: this.platform === "win32" ? "更新中です。完了後に自動で再起動します。" : "installerを起動しました。OSの案内に従って更新してください。" });
      return this.snapshot();
    } catch (error) {
      this.set({ ...this.status, state: "error", progress: null, message: error instanceof Error ? error.message : "installerを起動できませんでした。" });
      return this.snapshot();
    }
  }

  private set(status: UpdateStatus): void {
    this.status = status;
    this.onStatus(this.snapshot());
  }
}
