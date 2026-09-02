import type { LensId, LensOutput, MediaType, TokenUsage } from "@kohon/contracts";

export interface ProviderInputDocument {
  document_id: string;
  order: number;
  title: string;
  media_type: MediaType;
  text: string;
}

export interface ProviderRequest {
  condition: "generic" | "lens";
  provider_id: "mock" | "openai";
  endpoint_origin: string;
  exact_model_id: string;
  instructions: string;
  input_documents: ProviderInputDocument[];
  user_query: string;
  lens_id: LensId;
  output_schema?: Record<string, unknown>;
  max_output_tokens: number;
  sampling_config: { temperature: number | null; seed: number | null };
  store_requested: false;
  study_run_id: string;
}

export interface ProviderResponse {
  provider_request_id: string | null;
  exact_model_id_returned: string | null;
  status: "completed";
  output: { kind: "generic"; markdown: string } | { kind: "lens"; value: LensOutput };
  token_usage: TokenUsage;
  latency_ms: number;
}

export interface ProviderCallOptions {
  signal?: AbortSignal;
  apiKey?: string;
}

export interface LensProvider {
  readonly providerId: "mock" | "openai";
  invoke(request: ProviderRequest, options?: ProviderCallOptions): Promise<ProviderResponse>;
}

