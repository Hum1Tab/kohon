import type { CodexConnectionStatus, CodexModelOption, CodexRuntimeStatus } from "../shared/types.js";
import { DEFAULT_CODEX_MODEL } from "../shared/codex-model.js";

import { command, listenEvent, type CodexProcessInfo } from "./ipc.js";

type JsonRecord = Record<string, unknown>;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface NotificationWaiter {
  method: string;
  predicate: (params: JsonRecord) => boolean;
  resolve: (params: JsonRecord) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface ActiveTurn {
  threadId: string;
  turnId: string | null;
  modelId: string;
  text: string;
  resolve: (value: { text: string; modelId: string }) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function bundledRuntimeStatus(): CodexRuntimeStatus {
  return {
    automatic: false,
    state: "current",
    currentVersion: null,
    latestVersion: null,
    checkedAt: null,
    message: "Codex runtimeはKOHONに同梱されています。"
  };
}

const EMPTY_STATUS: CodexConnectionStatus = {
  runtime: bundledRuntimeStatus(),
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

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** JSON-RPC client for the bundled Codex app-server process owned by Rust. */
export class CodexAppServer {
  private started = false;
  private startPromise: Promise<void> | null = null;
  private generation = 0;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly waiters = new Set<NotificationWaiter>();
  private readonly turns = new Map<string, ActiveTurn>();
  private lastStderr = "";
  private modelsPromise: Promise<void> | null = null;
  private modelsRefreshedAt = 0;
  private status: CodexConnectionStatus = { ...EMPTY_STATUS, models: [] };
  private readonly listenersReady: Promise<void>;

  constructor(
    private readonly clientVersion: string,
    private readonly onStatus: (status: CodexConnectionStatus) => void,
    private readonly openExternal: (url: string) => Promise<void>
  ) {
    this.listenersReady = Promise.all([
      listenEvent<{ generation: number; line: string }>("codex://line", (payload) => {
        if (payload.generation !== this.generation) return;
        this.handleLine(payload.line);
      }),
      listenEvent<{ generation: number; line: string }>("codex://stderr", (payload) => {
        if (payload.generation !== this.generation) return;
        this.lastStderr = `${this.lastStderr}${payload.line}\n`.slice(-2000);
      }),
      listenEvent<{ generation: number; code: number | null; success: boolean }>("codex://exit", (payload) => {
        if (payload.generation !== this.generation || !this.started) return;
        const detail = this.lastStderr.trim() || `Codex App Serverが終了しました（${payload.code ?? -1}）。`;
        this.handleExit(new Error(detail));
      })
    ]).then(() => undefined);
  }

  snapshot(): CodexConnectionStatus {
    return {
      ...this.status,
      models: this.status.models.map((model) => ({
        ...model,
        ...(model.supportedReasoningEfforts === undefined ? {} : { supportedReasoningEfforts: [...model.supportedReasoningEfforts] })
      }))
    };
  }

  async refresh(): Promise<CodexConnectionStatus> {
    try {
      await this.start();
      await this.refreshAccount();
    } catch (error) {
      if (this.status.state !== "unavailable") {
        this.update({ state: "error", connected: false, message: error instanceof Error ? error.message : "Codexへ接続できませんでした。" });
      }
    }
    return this.snapshot();
  }

  async login(): Promise<CodexConnectionStatus> {
    await this.start();
    this.update({ state: "authenticating", connected: false, message: "ブラウザでChatGPTログインを完了してください。" });
    const response = record(await this.request("account/login/start", {
      type: "chatgpt",
      useHostedLoginSuccessPage: true,
      appBrand: "chatgpt"
    }, 30_000));
    const loginId = stringValue(response["loginId"]);
    const authUrl = stringValue(response["authUrl"]);
    if (loginId === null || authUrl === null) throw new Error("ChatGPTログインURLを取得できませんでした。");
    const completion = this.waitFor("account/login/completed", (params) => params["loginId"] === loginId, 10 * 60_000);
    await this.openExternal(authUrl);
    const result = await completion;
    if (result["success"] !== true) throw new Error(stringValue(result["error"]) ?? "ChatGPTログインを完了できませんでした。");
    await this.refreshAccount();
    return this.snapshot();
  }

  async logout(): Promise<CodexConnectionStatus> {
    await this.start();
    await this.request("account/logout", {}, 30_000);
    this.update({
      connected: false,
      state: "signed-out",
      message: "ChatGPTからログアウトしました。",
      email: null,
      planType: null,
      models: [],
      modelsUpdatedAt: null,
      usedPercent: null,
      resetsAt: null
    });
    return this.snapshot();
  }

  async refreshModels(): Promise<CodexConnectionStatus> {
    await this.start();
    await this.loadModels();
    return this.snapshot();
  }

  configureRuntimeUpdates(_enabled: boolean): void {
    // The Codex runtime ships with KOHON and is updated with the application.
  }

  async checkRuntimeUpdates(): Promise<CodexConnectionStatus> {
    this.update({
      runtime: {
        ...bundledRuntimeStatus(),
        state: "current",
        checkedAt: new Date().toISOString(),
        message: "Codex runtimeはKOHONに同梱されています。アプリの更新と一緒に更新されます。"
      }
    });
    return this.snapshot();
  }

  async run(modelId: string, prompt: string, outputSchema: JsonRecord): Promise<{ text: string; modelId: string }> {
    await this.start();
    if (!this.status.connected) await this.refreshAccount();
    if (!this.status.connected) throw new Error("設定からChatGPTへログインしてください。");
    if (Date.now() - this.modelsRefreshedAt > 5 * 60_000 || !this.status.models.some((model) => model.id === modelId)) await this.loadModels();
    const selected = this.status.models.find((model) => model.id === modelId);
    if (selected === undefined) throw new Error(`選択したCodexモデル「${modelId}」を利用できません。設定でモデル一覧を確認してください。`);
    const effort = selected.supportedReasoningEfforts?.includes("low") ? "low" : selected.defaultReasoningEffort;
    const threadResponse = record(await this.request("thread/start", {
      model: selected.id,
      cwd: undefined,
      approvalPolicy: "never",
      sandbox: "read-only",
      serviceName: "kohon"
    }, 30_000));
    const threadId = stringValue(record(threadResponse["thread"])["id"]);
    if (threadId === null) throw new Error("Codexの会話を開始できませんでした。");
    const completion = new Promise<{ text: string; modelId: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.turns.delete(threadId);
        void this.request("turn/interrupt", { threadId }, 10_000).catch(() => undefined);
        reject(new Error("Codexが時間内に応答しませんでした。"));
      }, 180_000);
      this.turns.set(threadId, { threadId, turnId: null, modelId: selected.id, text: "", resolve, reject, timer });
    });
    try {
      const turnResponse = record(await this.request("turn/start", {
        threadId,
        input: [{ type: "text", text: prompt }],
        model: selected.id,
        ...(effort === undefined ? {} : { effort }),
        approvalPolicy: "never",
        outputSchema
      }, 30_000));
      const turn = this.turns.get(threadId);
      if (turn !== undefined) turn.turnId = stringValue(record(turnResponse["turn"])["id"]);
      return await completion;
    } catch (error) {
      this.finishTurn(threadId, error instanceof Error ? error : new Error("Codexの実行を開始できませんでした。"));
      void this.deleteThread(threadId);
      return await completion;
    }
  }

  stop(): void {
    this.started = false;
    this.startPromise = null;
    this.generation = 0;
    void command<void>("codex_stop").catch(() => undefined);
    const error = new Error("Codex App Serverを終了しました。");
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.waiters.clear();
    for (const turn of this.turns.values()) {
      clearTimeout(turn.timer);
      turn.reject(error);
    }
    this.turns.clear();
  }

  private start(): Promise<void> {
    if (this.startPromise !== null) return this.startPromise;
    if (this.started) return Promise.resolve();
    this.startPromise = this.performStart().finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  private async performStart(): Promise<void> {
    await this.listenersReady;
    this.lastStderr = "";
    this.update({ installed: false, connected: false, state: "starting", message: "Codex App Serverを起動しています…" });
    let info: CodexProcessInfo;
    try {
      info = await command<CodexProcessInfo>("codex_start", { clientVersion: this.clientVersion });
    } catch (error) {
      this.update({
        installed: false,
        connected: false,
        state: "unavailable",
        message: error instanceof Error ? error.message : "Codex実行環境が見つかりません。KOHONを再インストールしてください。"
      });
      throw error;
    }
    if (!info.installed) {
      this.update({ installed: false, connected: false, state: "unavailable", message: "Codex実行環境が見つかりません。KOHONを再インストールしてください。" });
      throw new Error(this.status.message);
    }
    this.started = true;
    this.generation = info.generation;
    this.update({ installed: true, connected: false, state: "starting", message: "Codex App Serverへ接続しています…" });
    try {
      await this.request("initialize", { clientInfo: { name: "kohon", title: "KOHON", version: this.clientVersion } }, 30_000);
      this.notify("initialized", {});
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  private request(method: string, params: JsonRecord, timeoutMs: number): Promise<unknown> {
    if (!this.started) return Promise.reject(new Error("Codex App Serverへ接続していません。"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codexの${method}が時間切れになりました。`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      void command<void>("codex_write", { line: JSON.stringify({ method, id, params }) }).catch((error: unknown) => {
        const pending = this.pending.get(id);
        if (pending === undefined) return;
        this.pending.delete(id);
        clearTimeout(pending.timer);
        pending.reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private notify(method: string, params: JsonRecord): void {
    if (!this.started) return;
    void command<void>("codex_write", { line: JSON.stringify({ method, params }) }).catch(() => undefined);
  }

  private handleLine(line: string): void {
    let message: JsonRecord;
    try { message = record(JSON.parse(line)); }
    catch { return; }
    const id = typeof message["id"] === "number" ? message["id"] : null;
    const method = stringValue(message["method"]);
    if (id !== null && method !== null) {
      this.handleServerRequest(id, method);
      return;
    }
    if (id !== null) {
      const pending = this.pending.get(id);
      if (pending === undefined) return;
      this.pending.delete(id);
      clearTimeout(pending.timer);
      const error = record(message["error"]);
      if (Object.keys(error).length > 0) pending.reject(new Error(stringValue(error["message"]) ?? "Codex requestが失敗しました。"));
      else pending.resolve(message["result"]);
      return;
    }
    if (method !== null) this.handleNotification(method, record(message["params"]));
  }

  private handleServerRequest(id: number, method: string): void {
    if (!this.started) return;
    let response: JsonRecord;
    if (method === "item/permissions/requestApproval") response = { id, result: { permissions: {}, scope: "turn" } };
    else if (method.includes("requestApproval")) response = { id, result: { decision: "decline" } };
    else response = { id, error: { code: -32601, message: "KOHON does not expose interactive Codex tools." } };
    void command<void>("codex_write", { line: JSON.stringify(response) }).catch(() => undefined);
  }

  private handleNotification(method: string, params: JsonRecord): void {
    for (const waiter of [...this.waiters]) {
      if (waiter.method !== method || !waiter.predicate(params)) continue;
      this.waiters.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(params);
    }
    if (method === "account/updated") void this.refreshAccount().catch(() => undefined);
    if (method === "item/completed") {
      const item = record(params["item"]);
      if (item["type"] === "agentMessage") {
        const turn = this.findTurn(params);
        const text = stringValue(item["text"]);
        if (turn !== undefined && text !== null && (item["phase"] === "final_answer" || item["phase"] === undefined || item["phase"] === null)) turn.text = text;
      }
    }
    if (method === "turn/completed") {
      const turn = this.findTurn(params);
      if (turn === undefined) return;
      const result = record(params["turn"]);
      const status = stringValue(result["status"]);
      if (status === "completed" && turn.text.length > 0) this.finishTurn(turn.threadId);
      else {
        const error = record(result["error"]);
        this.finishTurn(turn.threadId, new Error(stringValue(error["message"]) ?? "Codexが回答を完了できませんでした。"));
      }
      void this.deleteThread(turn.threadId);
    }
  }

  private findTurn(params: JsonRecord): ActiveTurn | undefined {
    const threadId = stringValue(params["threadId"]);
    if (threadId !== null) return this.turns.get(threadId);
    const turnId = stringValue(params["turnId"]) ?? stringValue(record(params["turn"])["id"]);
    return turnId === null ? undefined : [...this.turns.values()].find((turn) => turn.turnId === turnId);
  }

  private finishTurn(threadId: string, error?: Error): void {
    const turn = this.turns.get(threadId);
    if (turn === undefined) return;
    this.turns.delete(threadId);
    clearTimeout(turn.timer);
    if (error !== undefined) turn.reject(error);
    else turn.resolve({ text: turn.text, modelId: turn.modelId });
  }

  private async deleteThread(threadId: string): Promise<void> {
    await this.request("thread/delete", { threadId }, 15_000).catch(() => undefined);
  }

  private waitFor(method: string, predicate: (params: JsonRecord) => boolean, timeoutMs: number): Promise<JsonRecord> {
    return new Promise((resolve, reject) => {
      const waiter: NotificationWaiter = {
        method,
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error("ChatGPTログインが時間切れになりました。"));
        }, timeoutMs)
      };
      this.waiters.add(waiter);
    });
  }

  private async refreshAccount(): Promise<void> {
    const result = record(await this.request("account/read", { refreshToken: true }, 30_000));
    const account = record(result["account"]);
    if (account["type"] !== "chatgpt") {
      const apiKeyMode = account["type"] === "apiKey";
      this.update({
        installed: true,
        connected: false,
        state: "signed-out",
        message: apiKeyMode ? "CodexはAPIキー認証中です。Codex枠を使うにはChatGPTでログインしてください。" : "ChatGPTへログインしていません。",
        email: null,
        planType: null,
        models: [],
        modelsUpdatedAt: null,
        usedPercent: null,
        resetsAt: null
      });
      return;
    }
    this.update({
      installed: true,
      connected: true,
      state: "connected",
      message: "ChatGPTのCodex利用枠へ接続済みです。",
      email: stringValue(account["email"]),
      planType: stringValue(account["planType"])
    });
    await Promise.all([this.loadModels(), this.loadRateLimits()]);
  }

  private async loadModels(): Promise<void> {
    if (this.modelsPromise !== null) return this.modelsPromise;
    this.modelsPromise = this.performLoadModels().finally(() => { this.modelsPromise = null; });
    return this.modelsPromise;
  }

  private async performLoadModels(): Promise<void> {
    const models: CodexModelOption[] = [];
    let cursor: string | null = null;
    const seenCursors = new Set<string>();
    do {
      const params: JsonRecord = { limit: 100, includeHidden: false };
      if (cursor !== null) params["cursor"] = cursor;
      const result = record(await this.request("model/list", params, 30_000));
      const data = Array.isArray(result["data"]) ? result["data"] : [];
      for (const raw of data) {
        const model = record(raw);
        const id = stringValue(model["model"]) ?? stringValue(model["id"]);
        if (id === null || model["hidden"] === true) continue;
        const modalities = Array.isArray(model["inputModalities"]) ? model["inputModalities"] : ["text", "image"];
        if (!modalities.includes("text")) continue;
        const efforts = Array.isArray(model["supportedReasoningEfforts"]) ? model["supportedReasoningEfforts"].flatMap((entry) => {
          const value = stringValue(record(entry)["reasoningEffort"]);
          return value === null ? [] : [value];
        }) : undefined;
        const defaultEffort = stringValue(model["defaultReasoningEffort"]);
        models.push({
          id,
          displayName: stringValue(model["displayName"]) ?? id,
          isDefault: model["isDefault"] === true,
          ...(efforts === undefined ? {} : { supportedReasoningEfforts: efforts }),
          ...(defaultEffort === null ? {} : { defaultReasoningEffort: defaultEffort })
        });
      }
      cursor = stringValue(result["nextCursor"]);
      if (cursor !== null) {
        if (seenCursors.has(cursor) || seenCursors.size >= 100) throw new Error("モデル一覧のページを取得できませんでした。");
        seenCursors.add(cursor);
      }
    } while (cursor !== null);
    const unique = [...new Map(models.map((model) => [model.id, model])).values()];
    unique.sort((left, right) => left.id === DEFAULT_CODEX_MODEL ? -1 : right.id === DEFAULT_CODEX_MODEL ? 1 : left.displayName.localeCompare(right.displayName));
    this.modelsRefreshedAt = Date.now();
    this.update({ models: unique, modelsUpdatedAt: new Date().toISOString() });
  }

  private async loadRateLimits(): Promise<void> {
    try {
      const result = record(await this.request("account/rateLimits/read", {}, 30_000));
      const primary = record(record(result["rateLimits"])["primary"]);
      this.update({
        usedPercent: typeof primary["usedPercent"] === "number" ? primary["usedPercent"] : null,
        resetsAt: typeof primary["resetsAt"] === "number" ? primary["resetsAt"] : null
      });
    } catch {
      this.update({ usedPercent: null, resetsAt: null });
    }
  }

  private handleExit(error: Error): void {
    this.started = false;
    this.startPromise = null;
    this.update({ connected: false, state: "error", message: error.message.slice(0, 500) || "Codex App Serverが終了しました。" });
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.waiters.clear();
    for (const turn of this.turns.values()) {
      clearTimeout(turn.timer);
      turn.reject(error);
    }
    this.turns.clear();
  }

  private update(patch: Partial<CodexConnectionStatus>): void {
    this.status = { ...this.status, ...patch };
    this.onStatus(this.snapshot());
  }
}
