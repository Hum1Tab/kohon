import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join } from "node:path";
import { createInterface, type Interface } from "node:readline";

import type { CodexConnectionStatus, CodexModelOption } from "../shared/types.js";

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

const EMPTY_STATUS: CodexConnectionStatus = {
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

function unpackedPath(path: string): string {
  return path.includes("app.asar") ? path.replace("app.asar", "app.asar.unpacked") : path;
}

function platformPackage(): { packageName: string; triple: string; executable: string } | null {
  if (process.platform === "win32" && process.arch === "x64") return { packageName: "@openai/codex-win32-x64", triple: "x86_64-pc-windows-msvc", executable: "codex.exe" };
  if (process.platform === "win32" && process.arch === "arm64") return { packageName: "@openai/codex-win32-arm64", triple: "aarch64-pc-windows-msvc", executable: "codex.exe" };
  if (process.platform === "darwin" && process.arch === "x64") return { packageName: "@openai/codex-darwin-x64", triple: "x86_64-apple-darwin", executable: "codex" };
  if (process.platform === "darwin" && process.arch === "arm64") return { packageName: "@openai/codex-darwin-arm64", triple: "aarch64-apple-darwin", executable: "codex" };
  if (process.platform === "linux" && process.arch === "x64") return { packageName: "@openai/codex-linux-x64", triple: "x86_64-unknown-linux-musl", executable: "codex" };
  if (process.platform === "linux" && process.arch === "arm64") return { packageName: "@openai/codex-linux-arm64", triple: "aarch64-unknown-linux-musl", executable: "codex" };
  return null;
}

function bundledExecutable(): string | null {
  const target = platformPackage();
  if (target === null) return null;
  try {
    const runtimeRequire = createRequire(__filename);
    const codexPackageJson = runtimeRequire.resolve("@openai/codex/package.json");
    const codexRequire = createRequire(codexPackageJson);
    const platformPackageJson = codexRequire.resolve(`${target.packageName}/package.json`);
    const candidate = unpackedPath(join(dirname(platformPackageJson), "vendor", target.triple, "bin", target.executable));
    return existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function installedExecutable(): string | null {
  const executableName = process.platform === "win32" ? "codex.exe" : "codex";
  const bundled = bundledExecutable();
  if (bundled !== null) return bundled;
  for (const entry of (process.env["PATH"] ?? "").split(delimiter).filter(Boolean)) {
    const candidate = join(entry, executableName);
    if (existsSync(candidate)) return candidate;
  }
  if (process.platform === "win32" && process.env["LOCALAPPDATA"]) {
    const binRoot = join(process.env["LOCALAPPDATA"], "OpenAI", "Codex", "bin");
    if (existsSync(binRoot)) {
      const candidates = readdirSync(binRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(binRoot, entry.name, executableName))
        .filter((path) => existsSync(path))
        .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
      if (candidates[0] !== undefined) return candidates[0];
    }
  }
  return null;
}

export class CodexAppServer {
  private child: ChildProcessWithoutNullStreams | null = null;
  private reader: Interface | null = null;
  private startPromise: Promise<void> | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly waiters = new Set<NotificationWaiter>();
  private readonly turns = new Map<string, ActiveTurn>();
  private lastStderr = "";
  private status: CodexConnectionStatus = { ...EMPTY_STATUS };

  constructor(
    private readonly clientVersion: string,
    private readonly scratchDirectory: string,
    private readonly onStatus: (status: CodexConnectionStatus) => void
  ) {
    mkdirSync(scratchDirectory, { recursive: true });
  }

  snapshot(): CodexConnectionStatus {
    return { ...this.status, models: this.status.models.map((model) => ({ ...model })) };
  }

  async refresh(): Promise<CodexConnectionStatus> {
    try {
      await this.start();
      await this.refreshAccount();
    } catch (error) {
      if (this.status.state !== "unavailable") this.update({ state: "error", connected: false, message: error instanceof Error ? error.message : "Codexへ接続できませんでした。" });
    }
    return this.snapshot();
  }

  async login(openExternal: (url: string) => Promise<void>): Promise<CodexConnectionStatus> {
    await this.start();
    this.update({ state: "authenticating", connected: false, message: "ブラウザでChatGPTログインを完了してください。" });
    const response = record(await this.request("account/login/start", { type: "chatgpt", useHostedLoginSuccessPage: true, appBrand: "chatgpt" }, 30_000));
    const loginId = stringValue(response["loginId"]);
    const authUrl = stringValue(response["authUrl"]);
    if (loginId === null || authUrl === null) throw new Error("ChatGPTログインURLを取得できませんでした。");
    const completion = this.waitFor("account/login/completed", (params) => params["loginId"] === loginId, 10 * 60_000);
    await openExternal(authUrl);
    const result = await completion;
    if (result["success"] !== true) throw new Error(stringValue(result["error"]) ?? "ChatGPTログインを完了できませんでした。");
    await this.refreshAccount();
    return this.snapshot();
  }

  async logout(): Promise<CodexConnectionStatus> {
    await this.start();
    await this.request("account/logout", {}, 30_000);
    this.update({ connected: false, state: "signed-out", message: "ChatGPTからログアウトしました。", email: null, planType: null, models: [], modelsUpdatedAt: null, usedPercent: null, resetsAt: null });
    return this.snapshot();
  }

  async refreshModels(): Promise<CodexConnectionStatus> {
    await this.start();
    await this.loadModels();
    return this.snapshot();
  }

  async run(modelId: string, prompt: string, outputSchema: JsonRecord): Promise<{ text: string; modelId: string }> {
    await this.start();
    if (!this.status.connected) await this.refreshAccount();
    if (!this.status.connected) throw new Error("設定からChatGPTへログインしてください。");
    if (this.status.models.length === 0) await this.loadModels();
    const selected = this.status.models.find((model) => model.id === modelId)
      ?? this.status.models.find((model) => model.id === "gpt-5.6-luna")
      ?? this.status.models.find((model) => model.isDefault)
      ?? this.status.models[0];
    if (selected === undefined) throw new Error("このアカウントで利用できるCodexモデルがありません。");
    const threadResponse = record(await this.request("thread/start", {
      model: selected.id,
      cwd: this.scratchDirectory,
      approvalPolicy: "never",
      sandbox: "readOnly",
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
        effort: "low",
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly", access: { type: "restricted", includePlatformDefaults: true, readableRoots: [] } },
        outputSchema
      }, 30_000));
      const turn = this.turns.get(threadId);
      if (turn !== undefined) turn.turnId = stringValue(record(turnResponse["turn"])["id"]);
      return await completion;
    } catch (error) {
      this.finishTurn(threadId, error instanceof Error ? error : new Error("Codexの実行を開始できませんでした。"));
      void this.deleteThread(threadId);
      throw error;
    }
  }

  stop(): void {
    this.reader?.close();
    this.reader = null;
    this.child?.kill();
    this.child = null;
    this.startPromise = null;
    const error = new Error("Codex App Serverを終了しました。");
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
    for (const turn of this.turns.values()) {
      clearTimeout(turn.timer);
      turn.reject(error);
    }
    this.turns.clear();
  }

  private start(): Promise<void> {
    if (this.startPromise !== null) return this.startPromise;
    if (this.child !== null) return Promise.resolve();
    this.startPromise = this.performStart().finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  private async performStart(): Promise<void> {
    const executable = installedExecutable();
    if (executable === null) {
      this.update({ installed: false, connected: false, state: "unavailable", message: "Codex実行環境が見つかりません。KOHONを再インストールしてください。" });
      throw new Error(this.status.message);
    }
    this.update({ installed: true, connected: false, state: "starting", message: "Codex App Serverを起動しています…" });
    const child = spawn(executable, ["app-server"], {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" }
    });
    this.child = child;
    this.reader = createInterface({ input: child.stdout });
    this.reader.on("line", (line) => this.handleLine(line));
    child.stderr.on("data", (chunk: Buffer) => { this.lastStderr = `${this.lastStderr}${chunk.toString("utf8")}`.slice(-2000); });
    child.once("error", (error) => this.handleExit(error));
    child.once("close", (code) => this.handleExit(new Error(this.lastStderr.trim() || `Codex App Serverが終了しました（${code ?? -1}）。`)));
    try {
      await this.request("initialize", { clientInfo: { name: "kohon", title: "KOHON", version: this.clientVersion } }, 30_000);
      this.notify("initialized", {});
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  private request(method: string, params: JsonRecord, timeoutMs: number): Promise<unknown> {
    const child = this.child;
    if (child === null || child.stdin.destroyed) return Promise.reject(new Error("Codex App Serverへ接続していません。"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codexの${method}が時間切れになりました。`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ method, id, params })}\n`);
    });
  }

  private notify(method: string, params: JsonRecord): void {
    const child = this.child;
    if (child !== null && !child.stdin.destroyed) child.stdin.write(`${JSON.stringify({ method, params })}\n`);
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
    const child = this.child;
    if (child === null || child.stdin.destroyed) return;
    if (method === "item/permissions/requestApproval") child.stdin.write(`${JSON.stringify({ id, result: { permissions: {}, scope: "turn" } })}\n`);
    else if (method.includes("requestApproval")) child.stdin.write(`${JSON.stringify({ id, result: { decision: "decline" } })}\n`);
    else child.stdin.write(`${JSON.stringify({ id, error: { code: -32601, message: "KOHON does not expose interactive Codex tools." } })}\n`);
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
    const models: CodexModelOption[] = [];
    let cursor: string | null = null;
    do {
      const params: JsonRecord = { limit: 100, includeHidden: false };
      if (cursor !== null) params["cursor"] = cursor;
      const result = record(await this.request("model/list", params, 30_000));
      const data = Array.isArray(result["data"]) ? result["data"] : [];
      for (const raw of data) {
        const model = record(raw);
        const id = stringValue(model["id"]) ?? stringValue(model["model"]);
        if (id === null || model["hidden"] === true) continue;
        const modalities = Array.isArray(model["inputModalities"]) ? model["inputModalities"] : ["text", "image"];
        if (!modalities.includes("text")) continue;
        models.push({ id, displayName: stringValue(model["displayName"]) ?? id, isDefault: model["isDefault"] === true });
      }
      cursor = stringValue(result["nextCursor"]);
    } while (cursor !== null);
    const unique = [...new Map(models.map((model) => [model.id, model])).values()];
    unique.sort((left, right) => left.id === "gpt-5.6-luna" ? -1 : right.id === "gpt-5.6-luna" ? 1 : left.displayName.localeCompare(right.displayName));
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
    if (this.child === null) return;
    this.child = null;
    this.reader?.close();
    this.reader = null;
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
