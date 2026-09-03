export interface PublicDocument {
  document_id: string;
  order: number;
  title: string;
  source_label: string;
  source_byte_sha256: string;
  text_sha256: string;
  source_byte_count: number;
  char_count_utf16: number;
  newline_style: string;
  unicode_normalization: string;
  bom: boolean;
  empty: boolean;
  text?: string;
}

export interface PublicState {
  stage: string;
  participantId?: string;
  snapshot?: { snapshot_id: string; created_at: string; documents: PublicDocument[] } | null;
  prepared?: {
    cutoff: { document_id: string; order: number; label: string };
    query: string;
    providerId: "mock" | "openai";
    modelId: string;
    maxOutputTokens: number;
    configHash: string;
    manifest: {
      eligible_document_ids: string[];
      sent_documents: Array<{ document_id: string; char_count_utf16: number; text_sha256: string }>;
      non_eligible_documents: Array<{ document_id: string; reason: string }>;
      coverage_percent: number;
    };
    totalCharsUtf16: number;
    estimatedTokens: number;
    sentDocumentTitles: string[];
  } | null;
  consented?: boolean;
}

export interface MaskedPanel {
  id: "A" | "B";
  blocks: Array<{ title: string; body: string; quotes: string[] }>;
  warningCount: number;
}

export interface MaskedPair {
  pairId: string;
  displayOrder: Array<"A" | "B">;
  panels: MaskedPanel[];
  mappingRevealed: false;
}

export interface Evidence {
  document_id: string;
  document_text_sha256: string;
  exact_text: string;
  start_utf16: number | null;
  end_utf16: number | null;
  prefix: string;
  suffix: string;
  occurrence_count: number;
  anchor_status: "attached" | "missing" | "ambiguous" | "source-version-mismatch";
}

export interface Finding {
  finding_id: string;
  category: string;
  claim: string;
  reader_effect: string;
  salience: "low" | "medium" | "high";
  model_confidence: "low" | "medium" | "high";
  alternative_interpretations: string[];
  evidence: Evidence[];
  validation_status: string;
  author_status: string;
}

export interface RevealedReview {
  mapping: { A: "generic" | "lens"; B: "generic" | "lens" };
  findings: Finding[];
  documents: PublicDocument[];
  coverage: number;
}

