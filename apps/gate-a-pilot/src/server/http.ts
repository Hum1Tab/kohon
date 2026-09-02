import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { GateAError } from "@kohon/core";

import { SessionManager, type ConsentInput, type ImportFileInput, type PrepareInput, type RatingInput } from "./session.js";

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; font-src 'self'";
const JSON_LIMIT = 30_000_000;

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

function securityHeaders(response: ServerResponse): void {
  response.setHeader("Content-Security-Policy", CSP);
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.setHeader("Cache-Control", "no-store");
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  securityHeaders(response);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > JSON_LIMIT) throw new GateAError("INVALID_REQUEST", "requestが大き過ぎます。");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch (cause) {
    throw new GateAError("INVALID_REQUEST", "JSON requestを読めません。", { cause });
  }
}

export interface RequestHandlerOptions {
  staticRoot: string;
  sessionToken: string;
  csrfToken: string;
  expectedHost: () => string;
  manager: SessionManager;
}

export function createRequestHandler(options: RequestHandlerOptions): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    void route(request, response, options).catch((cause: unknown) => {
      const error = cause instanceof GateAError ? cause : new GateAError("PROVIDER_ERROR", "予期しないエラーで処理を停止しました。", { cause });
      sendJson(response, error.code === "INVALID_REQUEST" ? 400 : error.code === "PROVIDER_AUTH" ? 401 : 422, { error: { code: error.code, message: error.safeMessage } });
    });
  };
}

async function route(request: IncomingMessage, response: ServerResponse, options: RequestHandlerOptions): Promise<void> {
  if (request.headers.host !== options.expectedHost()) {
    sendJson(response, 421, { error: { code: "BOUNDARY_VIOLATION", message: "Host headerを確認できません。" } });
    return;
  }
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${options.expectedHost()}`);
  if (url.pathname.startsWith("/api/")) {
    if (request.headers["x-session-token"] !== options.sessionToken) {
      sendJson(response, 401, { error: { code: "INVALID_SESSION", message: "この起動セッションではありません。" } });
      return;
    }
    if (method !== "GET") {
      if (request.headers.origin !== `http://${options.expectedHost()}` || request.headers["x-csrf-token"] !== options.csrfToken) {
        sendJson(response, 403, { error: { code: "CSRF", message: "request originを確認できません。" } });
        return;
      }
      if (request.headers["content-type"]?.split(";", 1)[0] !== "application/json") {
        sendJson(response, 415, { error: { code: "CONTENT_TYPE", message: "JSONだけを受け付けます。" } });
        return;
      }
    }
    await apiRoute(method, url.pathname, request, response, options);
    return;
  }
  if (method !== "GET" && method !== "HEAD") {
    sendJson(response, 405, { error: { code: "METHOD", message: "許可されていないmethodです。" } });
    return;
  }
  serveStatic(url.pathname, response, options.staticRoot, method === "HEAD");
}

async function apiRoute(
  method: string,
  path: string,
  request: IncomingMessage,
  response: ServerResponse,
  options: RequestHandlerOptions
): Promise<void> {
  const { manager } = options;
  if (method === "GET" && path === "/api/bootstrap") return sendJson(response, 200, { csrfToken: options.csrfToken, state: manager.publicState(false), defaults: { query: "この読者が混乱しそうな箇所、感情のつながりが飛んで見える箇所、話者や目的を取り違えそうな箇所を挙げてください。" } });
  if (method === "GET" && path === "/api/state") return sendJson(response, 200, manager.publicState(false));
  if (method === "GET" && path === "/api/pair") return sendJson(response, 200, manager.maskedPair());
  if (method === "GET" && path === "/api/review") return sendJson(response, 200, manager.revealedReview());
  if (method === "GET" && path === "/api/export") return sendJson(response, 200, manager.exportPreview());
  if (method === "POST" && path === "/api/session/start") {
    const body = await readJson<{ participantId: string; useFixture: boolean }>(request);
    return sendJson(response, 200, manager.start(body.participantId, body.useFixture));
  }
  if (method === "POST" && path === "/api/import") {
    const body = await readJson<{ files: ImportFileInput[] }>(request);
    return sendJson(response, 200, manager.import(body.files));
  }
  if (method === "POST" && path === "/api/prepare") return sendJson(response, 200, manager.prepare(await readJson<PrepareInput>(request)));
  if (method === "POST" && path === "/api/consent") return sendJson(response, 200, manager.consent(await readJson<ConsentInput>(request)));
  if (method === "POST" && path === "/api/run") {
    await readJson<Record<string, never>>(request);
    return sendJson(response, 200, await manager.run());
  }
  if (method === "POST" && path === "/api/cancel") {
    await readJson<Record<string, never>>(request);
    return sendJson(response, 200, manager.cancel());
  }
  if (method === "POST" && path === "/api/rate") return sendJson(response, 200, manager.rate(await readJson<RatingInput>(request)));
  if (method === "POST" && path === "/api/finding/status") {
    const body = await readJson<{ findingId: string; authorStatus: "useful" | "rejected" | "intentional" | "unclear" | "misleading" }>(request);
    return sendJson(response, 200, manager.setFindingStatus(body.findingId, body.authorStatus));
  }
  if (method === "POST" && path === "/api/erase") {
    await readJson<Record<string, never>>(request);
    return sendJson(response, 200, manager.erase());
  }
  sendJson(response, 404, { error: { code: "NOT_FOUND", message: "APIが見つかりません。" } });
}

function serveStatic(pathname: string, response: ServerResponse, staticRoot: string, headOnly: boolean): void {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const normalized = normalize(requested).replace(/^(\.\.(\/|\\|$))+/u, "");
  let target = resolve(join(staticRoot, normalized));
  if (!target.startsWith(resolve(staticRoot)) || !existsSync(target) || !statSync(target).isFile()) target = join(staticRoot, "index.html");
  securityHeaders(response);
  response.statusCode = 200;
  response.setHeader("Content-Type", mimeTypes[extname(target)] ?? "application/octet-stream");
  if (headOnly) {
    response.end();
    return;
  }
  createReadStream(target).pipe(response);
}
