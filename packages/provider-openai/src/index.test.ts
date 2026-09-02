import { readContractSchema } from "@kohon/contracts/validator";
import type { ProviderRequest } from "@kohon/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAIProvider } from "./index.js";

function request(condition: "generic" | "lens"): ProviderRequest {
  return {
    condition,
    provider_id: "openai",
    endpoint_origin: "https://api.openai.com",
    exact_model_id: "test-model",
    instructions: "本文だけを確認する。",
    input_documents: [{ document_id: "d-test-0", order: 0, title: "第一章", media_type: "text/plain", text: "　雨が降っていた。" }],
    user_query: "混乱する箇所は？",
    lens_id: "first-reader",
    ...(condition === "lens" ? { output_schema: readContractSchema("lens-output") } : {}),
    max_output_tokens: 500,
    sampling_config: { temperature: null, seed: null },
    store_requested: false,
    study_run_id: "run-openai-test"
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("OpenAI BYOK adapter", () => {
  it("AT-015 sends store=false, no tools, no search, and disabled truncation exactly once", async () => {
    let captured: RequestInit | undefined;
    const modelOutput = { schema_version: "0.1.0", lens_id: "first-reader", lens_version: "0.1", scope_note: "送信範囲のみ。", findings: [] };
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      captured = init;
      return new Response(JSON.stringify({ id: "resp_test", model: "test-model", output_text: JSON.stringify(modelOutput), usage: { input_tokens: 20, output_tokens: 10 } }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    await new OpenAIProvider().invoke(request("lens"), { apiKey: "sk-test-secret" });
    const body = JSON.parse(String(captured?.body)) as Record<string, unknown>;
    expect(body["store"]).toBe(false);
    expect(body["truncation"]).toBe("disabled");
    expect(body["tools"]).toEqual([]);
    expect(body["tool_choice"]).toBe("none");
    expect(JSON.stringify(body)).not.toContain("web_search");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("AT-009/010 does not retry or expose raw provider errors or the API key", async () => {
    const secret = "sk-test-NOT-A-REAL-KEY-4F91A2";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: `provider raw ${secret}` } }), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    let visible = "";
    try {
      await new OpenAIProvider().invoke(request("generic"), { apiKey: secret });
    } catch (error) {
      visible = error instanceof Error ? `${error.name}:${error.message}` : String(error);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(visible).not.toContain(secret);
    expect(visible).not.toContain("provider raw");
  });
});

