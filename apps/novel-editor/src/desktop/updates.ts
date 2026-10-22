import type { UpdateStatus } from "../shared/types.js";

import { httpRequest, openExternalUrl } from "./ipc.js";

export const LATEST_RELEASE_PAGE = "https://github.com/Hum1Tab/kohon/releases/latest";
const LATEST_RELEASE_API = "https://api.github.com/repos/Hum1Tab/kohon/releases/latest";

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

function allowedReleaseUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("最新版のURLを確認できません。");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || !/^\/Hum1Tab\/kohon\/releases\/(?:latest|tag\/[^/]+)$/u.test(url.pathname)) {
    throw new Error("最新版のURLを確認できません。");
  }
  return url.toString();
}

interface LatestRelease {
  tag_name?: unknown;
  html_url?: unknown;
}

export class UpdateService {
  private status: UpdateStatus;
  private checkInFlight: Promise<UpdateStatus> | null = null;

  constructor(
    private readonly currentVersion: string,
    private readonly onStatus: (status: UpdateStatus) => void = () => undefined
  ) {
    this.status = {
      state: "idle",
      currentVersion,
      latestVersion: null,
      checkedAt: null,
      downloadUrl: null,
      assetName: null,
      progress: null,
      releaseUrl: LATEST_RELEASE_PAGE,
      message: "更新はまだ確認していません。"
    };
  }

  snapshot(): UpdateStatus {
    return { ...this.status };
  }

  check(): Promise<UpdateStatus> {
    if (this.checkInFlight !== null) return this.checkInFlight;
    this.checkInFlight = this.performCheck().finally(() => { this.checkInFlight = null; });
    return this.checkInFlight;
  }

  async install(): Promise<UpdateStatus> {
    if (this.status.state !== "available") {
      await this.openPage();
      return this.snapshot();
    }
    await this.openPage();
    this.set({
      ...this.status,
      state: "installing",
      progress: null,
      message: this.status.downloadUrl === null
        ? "Releaseページを開きました。新しいversionを取得してください。"
        : "Releaseページを開きました。installerを取得して更新してください。"
    });
    return this.snapshot();
  }

  async openPage(): Promise<void> {
    const target = this.status.releaseUrl;
    await openExternalUrl(allowedReleaseUrl(target));
  }

  private async performCheck(): Promise<UpdateStatus> {
    this.set({ ...this.status, state: "checking", progress: null, message: "GitHub Releasesで最新版を確認しています…" });
    try {
      const response = await httpRequest({
        method: "GET",
        url: LATEST_RELEASE_API,
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `KOHON/${this.currentVersion}`,
          "X-GitHub-Api-Version": "2022-11-28"
        },
        timeoutMs: 20_000
      });
      if (response.status !== 200) throw new Error(`GitHub Releasesを確認できませんでした（HTTP ${response.status}）。`);
      const release = JSON.parse(response.body) as LatestRelease;
      if (typeof release.tag_name !== "string" || versionTuple(release.tag_name) === null) throw new Error("最新版のversionを確認できません。");
      const releaseUrl = allowedReleaseUrl(release.html_url);
      const latestVersion = release.tag_name.replace(/^v/u, "");
      const checkedAt = new Date().toISOString();
      if (compareVersions(latestVersion, this.currentVersion) <= 0) {
        this.set({
          state: "current",
          currentVersion: this.currentVersion,
          latestVersion,
          checkedAt,
          downloadUrl: null,
          assetName: null,
          progress: null,
          releaseUrl,
          message: "最新版を使用しています。"
        });
      } else {
        this.set({
          state: "available",
          currentVersion: this.currentVersion,
          latestVersion,
          checkedAt,
          downloadUrl: releaseUrl,
          assetName: null,
          progress: null,
          releaseUrl,
          message: "新しいversionがあります。Releaseページからinstallerを取得してください。"
        });
      }
    } catch (error) {
      this.set({
        ...this.status,
        state: "error",
        checkedAt: new Date().toISOString(),
        progress: null,
        message: error instanceof Error ? error.message : "更新を確認できませんでした。"
      });
    }
    return this.snapshot();
  }

  private set(status: UpdateStatus): void {
    this.status = status;
    this.onStatus(this.snapshot());
  }
}
