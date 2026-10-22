import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface AppPaths {
  dataDir: string;
  documentsDir: string;
  cacheDir: string;
  tempDir: string;
  homeDir: string;
  platform: string;
  version: string;
  appName: string;
}

export interface HttpResponse {
  status: number;
  body: string;
}

export interface CodexProcessInfo {
  installed: boolean;
  running: boolean;
  path: string | null;
  generation: number;
}

export interface GitHubStatusPayload {
  cliInstalled: boolean;
  connected: boolean;
  state: "unavailable" | "disconnected" | "connected" | "error";
  message: string;
}

export interface FileText {
  path: string;
  name: string;
  text: string;
}

export function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(name, args);
}

export function listenEvent<T>(name: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  return listen<T>(name, (event) => handler(event.payload));
}

export function appPaths(): Promise<AppPaths> {
  return command<AppPaths>("app_paths");
}

export function openExternalUrl(url: string): Promise<void> {
  return command<void>("open_external", { url });
}

export function httpRequest(input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}): Promise<HttpResponse> {
  return command<HttpResponse>("http_request", {
    method: input.method,
    url: input.url,
    headers: input.headers,
    body: input.body,
    timeoutMs: input.timeoutMs
  });
}
