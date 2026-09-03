import type { LensOutput } from "@kohon/contracts";
import { validateContract } from "@kohon/contracts/validator";
import type { LensProvider, ProviderCallOptions, ProviderRequest, ProviderResponse } from "@kohon/core";
import { GateAError, serializeDocumentsForProvider } from "@kohon/core";

interface OpenAIResponseBody {
  id?: unknown;
  model?: unknown;
  output_text?: unknown;
  output?: unknown;
  usage?: { input_tokens?: unknown; output_tokens?: unknown };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractOutputText(body: OpenAIResponseBody): string {
  if (typeof body.output_text === "string") return body.output_text;
  if (!Array.isArray(body.output)) throw new GateAError("OUTPUT_SCHEMA", "AI回答の本文を取得できませんでした。");
  const chunks: string[] = [];
  for (const item of body.output) {
    if (typeof item !== "object" || item === null || !("content" in item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (typeof content === "object" && content !== null && "text" in content && typeof content.text === "string") chunks.push(content.text);
    }
  }
  if (chunks.length === 0) throw new GateAError("OUTPUT_SCHEMA", "AI回答の本文を取得できませんでした。");
  return chunks.join("");
}

function safeProviderError(status: number): GateAError {
  if (status === 401 || status === 403) return new GateAError("PROVIDER_AUTH", "OpenAI APIの接続設定を確認してください。");
  if (status === 429) return new GateAError("PROVIDER_RATE_LIMIT", "OpenAI APIの利用上限に達しました。自動再試行はしていません。");
  return new GateAError("PROVIDER_ERROR", `OpenAI APIが処理を完了できませんでした（HTTP ${status}）。`);
}

export class OpenAIProvider implements LensProvider {
  readonly providerId = "openai" as const;
  readonly endpointOrigin = "https://api.openai.com";
  readonly timeoutMs: number;

  constructor(options: { timeoutMs?: number } = {}) {
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async invoke(request: ProviderRequest, options: ProviderCallOptions = {}): Promise<ProviderResponse> {
    if (request.endpoint_origin !== this.endpointOrigin) throw new GateAError("BOUNDARY_VIOLATION", "許可されていないprovider接続先です。");
    const apiKey = options.apiKey?.trim();
    if (apiKey === undefined || apiKey.length === 0) throw new GateAError("PROVIDER_AUTH", "OpenAI APIキーはこのセッションにだけ入力してください。");
    if (request.condition === "lens" && request.output_schema === undefined) {
      throw new GateAError("INVALID_REQUEST", "lens出力schemaがありません。");
    }
    const inputText = `${serializeDocumentsForProvider(request.input_documents)}\n\n<user_query>\n${request.user_query}\n</user_query>`;
    const body: Record<string, unknown> = {
      model: request.exact_model_id,
      instructions: request.instructions,
      input: [{ role: "user", content: [{ type: "input_text", text: inputText }] }],
      max_output_tokens: request.max_output_tokens,
      store: false,
      truncation: "disabled",
      tools: [],
      tool_choice: "none",
      text: request.condition === "lens"
        ? {
            format: {
              type: "json_schema",
              name: "kohon_lens_output",
              strict: true,
              schema: request.output_schema
            }
          }
        : { format: { type: "text" } }
    };
    if (request.sampling_config.temperature !== null) body["temperature"] = request.sampling_config.temperature;
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const signal = options.signal === undefined ? timeoutSignal : AbortSignal.any([options.signal, timeoutSignal]);
    const started = performance.now();
    let response: Response;
    try {
      response = await fetch(`${this.endpointOrigin}/v1/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal,
        redirect: "error"
      });
    } catch (cause) {
      if (signal.aborted) throw new GateAError(options.signal?.aborted === true ? "REQUEST_CANCELLED" : "PROVIDER_ERROR", options.signal?.aborted === true ? "処理を中止しました。" : "OpenAI APIが時間内に応答しませんでした。自動再試行はしていません。", { cause });
      throw new GateAError("PROVIDER_ERROR", "OpenAI APIへ接続できませんでした。", { cause });
    }
    if (!response.ok) throw safeProviderError(response.status);
    let parsed: OpenAIResponseBody;
    try {
      parsed = await response.json() as OpenAIResponseBody;
    } catch (cause) {
      throw new GateAError("OUTPUT_SCHEMA", "AI回答をJSONとして確認できませんでした。", { cause });
    }
    const outputText = extractOutputText(parsed);
    const common = {
      provider_request_id: stringOrNull(parsed.id),
      exact_model_id_returned: stringOrNull(parsed.model),
      status: "completed" as const,
      token_usage: {
        input_tokens: numberOrNull(parsed.usage?.input_tokens),
        output_tokens: numberOrNull(parsed.usage?.output_tokens),
        estimated_cost_minor_units: null,
        currency: null
      },
      latency_ms: Math.max(0, Math.round(performance.now() - started))
    };
    if (request.condition === "generic") return { ...common, output: { kind: "generic", markdown: outputText } };
    let unknownOutput: unknown;
    try {
      unknownOutput = JSON.parse(outputText);
    } catch (cause) {
      throw new GateAError("OUTPUT_SCHEMA", "AI回答が指定JSON Schemaに一致しませんでした。", { cause });
    }
    const validated = validateContract<LensOutput>("lens-output", unknownOutput);
    if (!validated.ok) throw new GateAError("OUTPUT_SCHEMA", "AI回答が指定JSON Schemaに一致しませんでした。");
    return { ...common, output: { kind: "lens", value: validated.value } };
  }
}
