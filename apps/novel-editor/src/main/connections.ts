import { spawn } from "node:child_process";
import { join } from "node:path";

import type { CodexConnectionStatus, ConnectionStatus, GitHubConnectionStatus, OpenAIConnectionStatus } from "../shared/types.js";
import { CodexAppServer } from "./codex-app-server.js";
import { SecureCredentialStore } from "./secure-credentials.js";

interface ProcessResult { exitCode: number; timedOut: boolean }
class MissingGitHubCliError extends Error {}

function runCommand(executable: string, args: readonly string[], timeoutMs: number, onOutput?: (text: string) => void): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GH_PAGER: "cat", NO_COLOR: "1" }
    });
    child.stdout.on("data", (chunk: Buffer) => onOutput?.(chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => onOutput?.(chunk.toString("utf8")));
    let settled = false;
    const finish = (value: ProcessResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ exitCode: -1, timedOut: true });
    }, timeoutMs);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => finish({ exitCode: code ?? -1, timedOut: false }));
  });
}

export class ConnectionManager {
  private codex: CodexAppServer | null = null;
  private codexStatus: CodexConnectionStatus = {
    installed: false,
    connected: false,
    state: "unavailable",
    message: "Codex実行環境をまだ確認していません。",
    email: null,
    planType: null,
    models: [],
    modelsUpdatedAt: null,
    usedPercent: null,
    resetsAt: null
  };
  private openAIKey: string | null = null;
  private openAIStatus: OpenAIConnectionStatus = {
    connected: false,
    state: "disconnected",
    storage: "none",
    message: "OpenAI APIは未接続です。",
    verifiedAt: null
  };
  private credentialStore: SecureCredentialStore | null = null;
  private githubStatus: GitHubConnectionStatus = {
    cliInstalled: false,
    connected: false,
    state: "unavailable",
    message: "GitHub CLIの状態をまだ確認していません。"
  };
  private githubLoginInFlight: Promise<ConnectionStatus> | null = null;
  private githubExecutable: string | null = null;

  constructor(private readonly onStatus: (status: ConnectionStatus) => void = () => undefined) {}

  initializeCodex(clientVersion: string, scratchDirectory: string): ConnectionStatus {
    this.codex = new CodexAppServer(clientVersion, scratchDirectory, (status) => {
      this.codexStatus = status;
      this.emit();
    });
    void this.codex.refresh().then((status) => { this.codexStatus = status; this.emit(); });
    return this.emit();
  }

  async initializeOpenAI(store: SecureCredentialStore): Promise<ConnectionStatus> {
    this.credentialStore = store;
    if (!store.available()) {
      this.openAIStatus = { connected: false, state: "disconnected", storage: "none", message: "OSの暗号化ストレージを利用できないため、接続時はこの起動中だけ保持します。", verifiedAt: null };
      return this.emit();
    }
    try {
      const stored = await store.loadOpenAI();
      if (stored === null) {
        this.openAIStatus = { connected: false, state: "disconnected", storage: "none", message: "OpenAI APIは未接続です。", verifiedAt: null };
      } else {
        this.openAIKey = stored.apiKey;
        this.openAIStatus = { connected: true, state: "connected", storage: "os", message: "OSの暗号化ストレージからOpenAI API接続を復元しました。", verifiedAt: stored.verifiedAt };
      }
    } catch (error) {
      this.openAIKey = null;
      this.openAIStatus = { connected: false, state: "error", storage: "none", message: error instanceof Error ? error.message : "OpenAI API接続を復元できませんでした。", verifiedAt: null };
    }
    return this.emit();
  }

  statusSnapshot(): ConnectionStatus {
    return { codex: { ...this.codexStatus, models: this.codexStatus.models.map((model) => ({ ...model })) }, openai: { ...this.openAIStatus }, github: { ...this.githubStatus } };
  }

  async refreshStatus(): Promise<ConnectionStatus> {
    const [github, codex] = await Promise.all([this.probeGitHub(), this.codex?.refresh()]);
    this.githubStatus = github;
    if (codex !== undefined) this.codexStatus = codex;
    return this.emit();
  }

  async loginCodex(openExternal: (url: string) => Promise<void>): Promise<ConnectionStatus> {
    if (this.codex === null) throw new Error("Codex接続をまだ初期化できません。");
    this.codexStatus = await this.codex.login(openExternal);
    return this.emit();
  }

  async logoutCodex(): Promise<ConnectionStatus> {
    if (this.codex === null) throw new Error("Codex接続をまだ初期化できません。");
    this.codexStatus = await this.codex.logout();
    return this.emit();
  }

  async refreshCodexModels(): Promise<ConnectionStatus> {
    if (this.codex === null) throw new Error("Codex接続をまだ初期化できません。");
    this.codexStatus = await this.codex.refreshModels();
    return this.emit();
  }

  runCodex(modelId: string, prompt: string, outputSchema: Record<string, unknown>): Promise<{ text: string; modelId: string }> {
    if (this.codex === null) throw new Error("Codex接続をまだ初期化できません。");
    return this.codex.run(modelId, prompt, outputSchema);
  }

  async connectOpenAI(apiKey: string): Promise<ConnectionStatus> {
    const candidate = apiKey.trim();
    if (!/^\S{20,512}$/u.test(candidate)) throw new Error("OpenAI APIキーの形式を確認してください。");
    this.openAIStatus = { connected: false, state: "checking", storage: "none", message: "OpenAI APIへの接続を確認しています…", verifiedAt: null };
    this.emit();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${candidate}` },
        redirect: "error",
        signal: controller.signal
      });
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403) throw new Error("OpenAI APIキーまたはproject権限を確認してください。");
      if (!response.ok) throw new Error(`OpenAI APIへ接続できませんでした（HTTP ${response.status}）。`);
      this.openAIKey = candidate;
      const verifiedAt = new Date().toISOString();
      let storage: OpenAIConnectionStatus["storage"] = "memory";
      let message = "OpenAI APIへ接続済みです。この起動中だけ保持します。";
      if (this.credentialStore?.available()) {
        try {
          await this.credentialStore.saveOpenAI({ apiKey: candidate, verifiedAt });
          storage = "os";
          message = "OpenAI APIへ接続済みです。キーはOSの暗号化ストレージへ保存しました。";
        } catch {
          message = "OpenAI APIへ接続済みです。OSへ保存できなかったため、この起動中だけ保持します。";
        }
      }
      this.openAIStatus = { connected: true, state: "connected", storage, message, verifiedAt };
      return this.emit();
    } catch (error) {
      this.openAIKey = null;
      const message = controller.signal.aborted ? "OpenAI APIへの接続確認が時間切れになりました。" : error instanceof Error ? error.message : "OpenAI APIへ接続できませんでした。";
      this.openAIStatus = { connected: false, state: "error", storage: "none", message, verifiedAt: null };
      this.emit();
      throw new Error(message);
    } finally {
      clearTimeout(timer);
    }
  }

  async disconnectOpenAI(): Promise<ConnectionStatus> {
    this.openAIKey = null;
    await this.credentialStore?.removeOpenAI();
    this.openAIStatus = { connected: false, state: "disconnected", storage: "none", message: "OpenAI API接続と保存済みキーを削除しました。", verifiedAt: null };
    return this.emit();
  }

  requireOpenAIKey(): string {
    if (this.openAIKey === null) throw new Error("設定からOpenAI APIを接続してください。");
    return this.openAIKey;
  }

  loginGitHub(): Promise<ConnectionStatus> {
    if (this.githubLoginInFlight !== null) return this.githubLoginInFlight;
    this.githubStatus = { cliInstalled: true, connected: false, state: "connecting", message: "ブラウザでGitHubへのログインを完了してください。device codeはclipboardへコピーされます。" };
    this.emit();
    this.githubLoginInFlight = this.performGitHubLogin().finally(() => { this.githubLoginInFlight = null; });
    return this.githubLoginInFlight;
  }

  clear(): void {
    this.openAIKey = null;
    this.codex?.stop();
  }

  private async performGitHubLogin(): Promise<ConnectionStatus> {
    try {
      const executable = this.githubExecutable ?? await this.resolveGitHubCli();
      if (executable === null) throw new MissingGitHubCliError("GitHub CLIが見つかりません。");
      let rollingOutput = "";
      let shownCode: string | null = null;
      const result = await runCommand(executable, ["auth", "login", "--web", "--clipboard", "--hostname", "github.com", "--git-protocol", "https", "--skip-ssh-key"], 10 * 60_000, (chunk) => {
        rollingOutput = `${rollingOutput}${chunk}`.slice(-500);
        const code = /\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/u.exec(rollingOutput)?.[0] ?? null;
        if (code !== null && code !== shownCode) {
          shownCode = code;
          this.githubStatus = { cliInstalled: true, connected: false, state: "connecting", message: `GitHubのdevice code: ${code}（clipboardにもコピー済み）` };
          this.emit();
        }
      });
      if (result.timedOut) throw new Error("GitHubログインが時間切れになりました。もう一度お試しください。");
      if (result.exitCode !== 0) throw new Error("GitHubログインを完了できませんでした。");
      this.githubStatus = await this.probeGitHub();
      return this.emit();
    } catch (error) {
      const unavailable = error instanceof MissingGitHubCliError || (error instanceof Error && "code" in error && error.code === "ENOENT");
      const message = unavailable ? "GitHub CLIが見つかりません。先に公式GitHub CLIをinstallしてください。" : error instanceof Error ? error.message : "GitHubログインを完了できませんでした。";
      this.githubStatus = { cliInstalled: !unavailable, connected: false, state: unavailable ? "unavailable" : "error", message };
      this.emit();
      throw new Error(message);
    }
  }

  private async probeGitHub(): Promise<GitHubConnectionStatus> {
    try {
      const executable = await this.resolveGitHubCli();
      if (executable === null) return { cliInstalled: false, connected: false, state: "unavailable", message: "GitHub CLIが見つかりません。" };
      this.githubExecutable = executable;
      const auth = await runCommand(executable, ["auth", "status", "--active", "--hostname", "github.com"], 20_000);
      if (auth.exitCode === 0) return { cliInstalled: true, connected: true, state: "connected", message: "利用者のGitHub CLI認証へ接続済みです。KOHONはtokenを読みません。" };
      return { cliInstalled: true, connected: false, state: "disconnected", message: "GitHub CLIはinstall済みですが、github.comへ未ログインです。" };
    } catch (error) {
      const unavailable = error instanceof Error && "code" in error && error.code === "ENOENT";
      return { cliInstalled: !unavailable, connected: false, state: unavailable ? "unavailable" : "error", message: unavailable ? "GitHub CLIが見つかりません。" : "GitHub CLIの認証状態を確認できません。" };
    }
  }

  private async resolveGitHubCli(): Promise<string | null> {
    const candidates = [
      this.githubExecutable,
      "gh",
      process.platform === "win32" && process.env["ProgramFiles"] ? join(process.env["ProgramFiles"], "GitHub CLI", "gh.exe") : null,
      process.platform === "win32" && process.env["LOCALAPPDATA"] ? join(process.env["LOCALAPPDATA"], "Programs", "GitHub CLI", "gh.exe") : null,
      process.platform === "darwin" ? "/opt/homebrew/bin/gh" : null,
      process.platform === "darwin" ? "/usr/local/bin/gh" : null,
      process.platform === "linux" ? "/usr/bin/gh" : null,
      process.platform === "linux" ? "/usr/local/bin/gh" : null,
      process.platform === "linux" ? "/home/linuxbrew/.linuxbrew/bin/gh" : null
    ].filter((candidate, index, all): candidate is string => candidate !== null && all.indexOf(candidate) === index);
    for (const candidate of candidates) {
      try {
        const version = await runCommand(candidate, ["--version"], 10_000);
        if (version.exitCode === 0) return candidate;
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) continue;
      }
    }
    return null;
  }

  private emit(): ConnectionStatus {
    const snapshot = this.statusSnapshot();
    this.onStatus(snapshot);
    return snapshot;
  }
}
