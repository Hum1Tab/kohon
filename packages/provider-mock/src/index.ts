import type { LensOutput, ModelFinding } from "@kohon/contracts";
import { SCHEMA_VERSION } from "@kohon/contracts";
import type { LensProvider, ProviderCallOptions, ProviderRequest, ProviderResponse } from "@kohon/core";
import { GateAError } from "@kohon/core";

function firstUsableQuote(text: string): string {
  const paragraph = text
    .split(/\r\n|\n|\r/u)
    .map((line) => line.trim())
    .find((line) => line.length >= 4 && !line.startsWith("#"));
  if (paragraph === undefined) return text.slice(0, 80);
  return paragraph.slice(0, 120);
}

function mockFinding(request: ProviderRequest): ModelFinding[] {
  const source = request.input_documents.find((document) => document.text.trim().length > 0);
  if (source === undefined) return [];
  const quote = firstUsableQuote(source.text);
  if (quote.length === 0) return [];
  return [{
    category: "reader-confusion",
    claim: "この箇所は、読者が状況をまだ一意に決められない可能性があります。",
    reader_effect: "誰の認識なのか、次の文脈を確認しながら読むことになりそうです。",
    salience: "medium",
    model_confidence: "low",
    alternative_interpretations: ["意図的に情報を遅らせている可能性もあります。"],
    evidence: [{ document_id: source.document_id, exact_text: quote }]
  }];
}

export class MockProvider implements LensProvider {
  readonly providerId = "mock" as const;

  async invoke(request: ProviderRequest, options: ProviderCallOptions = {}): Promise<ProviderResponse> {
    if (options.signal?.aborted === true) throw new GateAError("REQUEST_CANCELLED", "処理を中止しました。");
    const started = performance.now();
    await Promise.resolve();
    if (request.condition === "generic") {
      const source = request.input_documents[0];
      const quote = source === undefined ? "" : firstUsableQuote(source.text);
      return {
        provider_request_id: null,
        exact_model_id_returned: "mock-fixed-v0.1",
        status: "completed",
        output: {
          kind: "generic",
          markdown: quote.length === 0
            ? "確認できる本文がありません。"
            : `読者として気になった箇所: 「${quote}」\n\nここでは状況の受け取り方が複数あり得ます。直後の文脈で意図が明確になるか確認するとよさそうです。`
        },
        token_usage: { input_tokens: null, output_tokens: null, estimated_cost_minor_units: 0, currency: "JPY" },
        latency_ms: Math.max(0, Math.round(performance.now() - started))
      };
    }
    const output: LensOutput = {
      schema_version: SCHEMA_VERSION,
      lens_id: request.lens_id,
      lens_version: "0.1",
      scope_note: `送信された${request.input_documents.length}文書だけを確認しました。`,
      findings: mockFinding(request)
    };
    return {
      provider_request_id: null,
      exact_model_id_returned: "mock-fixed-v0.1",
      status: "completed",
      output: { kind: "lens", value: output },
      token_usage: { input_tokens: null, output_tokens: null, estimated_cost_minor_units: 0, currency: "JPY" },
      latency_ms: Math.max(0, Math.round(performance.now() - started))
    };
  }
}
