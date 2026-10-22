import type {
  CodexConnectionStatus,
  ConnectionStatus,
  GitHubConnectionStatus,
  OpenAIConnectionStatus
} from "../shared/types.js";

import { CodexAppServer } from "./codex.js";
import { command, httpRequest, type GitHubStatusPayload } from "./ipc.js";

interface StoredOpenAI {
  version: 1;
  apiKey: string;
  verifiedAt: string;
}

const CREDENTIAL_SERVICE = "openai-api-key";

function parseStoredOpenAI(value: string | null): StoredOpenAI | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return null;
    const source = parsed as Record<string, unknown>;
    if (source["version"] !== 1) return null;
    if (typeof source["apiKey"] !== "string" || !/^\S{20,512}$/u.test(source["apiKey"])) return null;
    if (typeof source["verifiedAt"] !== "string" || !Number.isFinite(Date.parse(source["verifiedAt"]))) return null;
    return { version: 1, apiKey: source["apiKey"], verifiedAt: source["verifiedAt"] };
  } catch {
    return null;
  }
}

function githubStatus(payload: GitHubStatusPayload): GitHubConnectionStatus {
  return {
    cliInstalled: payload.cliInstalled,
    connected: payload.connected,
    state: payload.state,
    message: payload.message
  };
}

export class ConnectionManager {
  private codex: CodexAppServer | null = null;
  private codexStatus: CodexConnectionStatus = {
    runtime: {
      automatic: false,
      state: "current",
      currentVersion: null,
      latestVersion: null,
      checkedAt: null,
      message: "Codex runtimeはKOHONに同梱されています。"
    },
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
  private credentialAvailable = false;
  private openAIStatus: OpenAIConnectionStatus = {
    connected: false,
    state: "disconnected",
    storage: "none",
    message: "OpenAI APIは未接続です。",
    verifiedAt: null
  };
  private githubStatus: GitHubConnectionStatus = {
    cliInstalled: false,
    connected: false,
    state: "unavailable",
    message: "GitHub CLIの状態をまだ確認していません。"
  };
  private githubLoginInFlight: Promise<ConnectionStatus> | null = null;

  constructor(private readonly onStatus: (status: ConnectionStatus) => void = () => undefined) {}

  initializeCodex(clientVersion: string, openExternal: (url: string) => Promise<void>, automaticUpdates = false): ConnectionStatus {
    this.codex = new CodexAppServer(clientVersion, (status) => {
      this.codexStatus = status;
      this.emit();
    }, openExternal);
    this.codex.configureRuntimeUpdates(automaticUpdates);
    void this.codex.refresh().then((status) => { this.codexStatus = status; this.emit(); });
    return this.emit();
  }

  async initializeOpenAI(): Promise<ConnectionStatus> {
    this.credentialAvailable = await command<boolean>("credential_available").catch(() => false);
    if (!this.credentialAvailable) {
      this.openAIStatus = {
        connected: false,
        state: "disconnected",
        storage: "none",
        message: "OSの暗号化ストレージを利用できないため、接続時はこの起動中だけ保持します。",
        verifiedAt: null
      };
      return this.emit();
    }
    try {
      const stored = parseStoredOpenAI(await command<string | null>("credential_get", { service: CREDENTIAL_SERVICE }));
      if (stored === null) {
        this.openAIStatus = { connected: false, state: "disconnected", storage: "none", message: "OpenAI APIは未接続です。", verifiedAt: null };
      } else {
        this.openAIKey = stored.apiKey;
        this.openAIStatus = {
          connected: true,
          state: "connected",
          storage: "os",
          message: "OSの暗号化ストレージからOpenAI API接続を復元しました。",
          verifiedAt: stored.verifiedAt
        };
      }
    } catch (error) {
      this.openAIKey = null;
      this.openAIStatus = {
        connected: false,
        state: "error",
        storage: "none",
        message: error instanceof Error ? error.message : "OpenAI API接続を復元できませんでした。",
        verifiedAt: null
      };
    }
    return this.emit();
  }

  statusSnapshot(): ConnectionStatus {
    return {
      codex: { ...this.codexStatus, models: this.codexStatus.models.map((model) => ({ ...model })) },
      openai: { ...this.openAIStatus },
      github: { ...this.githubStatus }
    };
  }

  async refreshStatus(): Promise<ConnectionStatus> {
    const [github, codex] = await Promise.all([this.probeGitHub(), this.codex?.refresh()]);
    this.githubStatus = github;
    if (codex !== undefined) this.codexStatus = codex;
    return this.emit();
  }

  async loginCodex(): Promise<ConnectionStatus> {
    if (this.codex === null) throw new Error("Codex接続をまだ初期化できません。");
    this.codexStatus = await this.codex.login();
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

  configureCodexRuntimeUpdates(enabled: boolean): void {
    this.codex?.configureRuntimeUpdates(enabled);
  }

  async checkCodexRuntimeUpdates(): Promise<ConnectionStatus> {
    if (this.codex === null) throw new Error("Codex接続をまだ初期化できません。");
    this.codexStatus = await this.codex.checkRuntimeUpdates();
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
    try {
      const response = await httpRequest({
        method: "GET",
        url: "https://api.openai.com/v1/models",
        headers: { Authorization: `Bearer ${candidate}` },
        timeoutMs: 20_000
      });
      if (response.status === 401 || response.status === 403) throw new Error("OpenAI APIキーまたはproject権限を確認してください。");
      if (response.status < 200 || response.status >= 300) throw new Error(`OpenAI APIへ接続できませんでした（HTTP ${response.status}）。`);
      this.openAIKey = candidate;
      const verifiedAt = new Date().toISOString();
      let storage: OpenAIConnectionStatus["storage"] = "memory";
      let message = "OpenAI APIへ接続済みです。この起動中だけ保持します。";
      if (this.credentialAvailable) {
        try {
          await command<void>("credential_set", {
            service: CREDENTIAL_SERVICE,
            value: JSON.stringify({ version: 1, apiKey: candidate, verifiedAt })
          });
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
      const message = error instanceof Error ? error.message : "OpenAI APIへ接続できませんでした。";
      this.openAIStatus = { connected: false, state: "error", storage: "none", message, verifiedAt: null };
      this.emit();
      throw new Error(message);
    }
  }

  async disconnectOpenAI(): Promise<ConnectionStatus> {
    this.openAIKey = null;
    await command<void>("credential_delete", { service: CREDENTIAL_SERVICE }).catch(() => undefined);
    this.openAIStatus = { connected: false, state: "disconnected", storage: "none", message: "OpenAI API接続と保存済みキーを削除しました。", verifiedAt: null };
    return this.emit();
  }

  requireOpenAIKey(): string {
    if (this.openAIKey === null) throw new Error("設定からOpenAI APIを接続してください。");
    return this.openAIKey;
  }

  loginGitHub(): Promise<ConnectionStatus> {
    if (this.githubLoginInFlight !== null) return this.githubLoginInFlight;
    this.githubStatus = {
      cliInstalled: true,
      connected: false,
      state: "connecting",
      message: "ブラウザでGitHubへのログインを完了してください。device codeはclipboardへコピーされます。"
    };
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
      const result = await command<GitHubStatusPayload>("gh_login");
      this.githubStatus = githubStatus(result);
      return this.emit();
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitHubログインを完了できませんでした。";
      const unavailable = /見つかりません/u.test(message);
      this.githubStatus = {
        cliInstalled: !unavailable,
        connected: false,
        state: unavailable ? "unavailable" : "error",
        message
      };
      this.emit();
      throw new Error(message);
    }
  }

  private async probeGitHub(): Promise<GitHubConnectionStatus> {
    try {
      return githubStatus(await command<GitHubStatusPayload>("gh_status"));
    } catch {
      return { cliInstalled: false, connected: false, state: "error", message: "GitHub CLIの認証状態を確認できません。" };
    }
  }

  private emit(): ConnectionStatus {
    const snapshot = this.statusSnapshot();
    this.onStatus(snapshot);
    return snapshot;
  }
}
