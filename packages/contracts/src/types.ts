export const SCHEMA_VERSION = "0.1.0" as const;

export type Sha256 = string;
export type MediaType = "text/plain" | "text/markdown";
export type NewlineStyle = "none" | "lf" | "crlf" | "cr" | "mixed";
export type UnicodeNormalization = "nfc" | "nfd" | "nfkc" | "nfkd" | "mixed-or-unknown";

export interface CorpusDocument {
  document_id: string;
  order: number;
  title: string;
  source_label: string;
  media_type: MediaType;
  source_byte_sha256: Sha256;
  text_sha256: Sha256;
  source_byte_count: number;
  char_count_utf16: number;
  newline_style: NewlineStyle;
  unicode_normalization: UnicodeNormalization;
  bom: boolean;
  empty: boolean;
  text: string;
}

export interface CorpusSnapshot {
  schema_version: typeof SCHEMA_VERSION;
  snapshot_id: Sha256;
  hash_policy: "ordered-document-content-v1";
  created_at: string;
  documents: CorpusDocument[];
}

export interface ReaderCutoff {
  document_id: string;
  order: number;
  inclusive: true;
  label: string;
}

export interface SentDocument {
  document_id: string;
  order: number;
  text_sha256: Sha256;
  char_count_utf16: number;
}

export interface OmittedDocument {
  document_id: string;
  reason: "context-limit" | "provider-limit" | "user-excluded" | "decode-failure" | "other";
}

export interface NonEligibleDocument {
  document_id: string;
  reason: "after-cutoff" | "not-selected" | "empty-document";
}

export interface ContextManifest {
  eligible_document_ids: string[];
  sent_documents: SentDocument[];
  omitted_documents: OmittedDocument[];
  non_eligible_documents: NonEligibleDocument[];
  coverage_percent: number;
  tools_enabled: false;
  external_search_enabled: false;
  user_consented_at: string;
}

export type LensId = "first-reader" | "consistency-candidate";
export type FindingCategory =
  | "reader-confusion"
  | "speaker-ambiguity"
  | "emotional-jump"
  | "motivation-gap"
  | "timeline-candidate"
  | "location-candidate"
  | "knowledge-candidate"
  | "continuity-candidate"
  | "intentional-ambiguity-candidate"
  | "other";
export type Ordinal = "low" | "medium" | "high";

export interface ModelEvidence {
  document_id: string;
  exact_text: string;
}

export interface ModelFinding {
  category: FindingCategory;
  claim: string;
  reader_effect: string;
  salience: Ordinal;
  model_confidence: Ordinal;
  alternative_interpretations: string[];
  evidence: ModelEvidence[];
}

export interface LensOutput {
  schema_version: typeof SCHEMA_VERSION;
  lens_id: LensId;
  lens_version: "0.1";
  scope_note: string;
  findings: ModelFinding[];
}

export type AnchorStatus = "attached" | "missing" | "ambiguous" | "source-version-mismatch";

export interface ValidatedEvidence {
  document_id: string;
  document_text_sha256: Sha256;
  exact_text: string;
  start_utf16: number | null;
  end_utf16: number | null;
  prefix: string;
  suffix: string;
  occurrence_count: number;
  anchor_status: AnchorStatus;
}

export interface LensFinding extends Omit<ModelFinding, "evidence"> {
  schema_version: typeof SCHEMA_VERSION;
  finding_id: string;
  snapshot_id: Sha256;
  lens_id: LensId;
  lens_version: "0.1";
  evidence: ValidatedEvidence[];
  validation_status: "valid" | "invalid" | "stale" | "ambiguous";
  duplicate_of: string | null;
  author_status: "unreviewed" | "useful" | "rejected" | "intentional" | "unclear" | "misleading" | "resolved";
}

export interface ProviderMetadata {
  provider_id: "mock" | "openai";
  endpoint_origin: string;
  requested_model_id: string;
  returned_model_id: string | null;
  max_output_tokens: number;
  sampling: { temperature: number | null; seed: number | null };
  store_requested: false;
  truncation_policy: "disabled";
  request_id: string | null;
  latency_ms: number | null;
}

export interface TokenUsage {
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_minor_units: number | null;
  currency: string | null;
}

export type RunStatus =
  | "pending"
  | "completed"
  | "cancelled"
  | "coverage-failed"
  | "provider-error"
  | "invalid-model-output"
  | "protocol-failure";

export type RunOutput =
  | { kind: "generic-markdown"; markdown: string }
  | { kind: "validated-findings"; lens_id: LensId; lens_version: "0.1"; findings: LensFinding[]; invalid_finding_count: number }
  | { kind: "none"; error_code: string | null };

export interface LensRun {
  schema_version: typeof SCHEMA_VERSION;
  run_id: string;
  study_id: string;
  study_version: string;
  condition: "generic" | "lens";
  snapshot_id: Sha256;
  query_id: string;
  query_text: string;
  cutoff: ReaderCutoff;
  context_manifest: ContextManifest;
  provider: ProviderMetadata;
  prompt_hash: Sha256;
  output_schema_hash: Sha256 | null;
  renderer_version: string;
  requested_at: string;
  completed_at: string | null;
  status: RunStatus;
  output: RunOutput;
  usage: TokenUsage;
}

export type ContractName =
  | "corpus-snapshot"
  | "lens-output"
  | "lens-finding"
  | "lens-run"
  | "blind-study-result"
  | "evidence-review";
