import type { ContextManifest, CorpusDocument, CorpusSnapshot, ReaderCutoff } from "@kohon/contracts";

import { GateAError } from "./errors.js";

export interface ScopedContext {
  manifest: ContextManifest;
  documents: CorpusDocument[];
  totalCharsUtf16: number;
  estimatedTokens: number;
}

export function selectFirstReaderContext(
  snapshot: CorpusSnapshot,
  cutoffDocumentId: string,
  userConsentedAt: string,
  maxInputChars = 1_000_000
): ScopedContext {
  const cutoffDocument = snapshot.documents.find((document) => document.document_id === cutoffDocumentId);
  if (cutoffDocument === undefined) throw new GateAError("INVALID_REQUEST", "指定した読了位置が見つかりません。");
  const documents: CorpusDocument[] = [];
  const nonEligible: ContextManifest["non_eligible_documents"] = [];
  for (const document of snapshot.documents) {
    if (document.empty) {
      nonEligible.push({ document_id: document.document_id, reason: "empty-document" });
    } else if (document.order > cutoffDocument.order) {
      nonEligible.push({ document_id: document.document_id, reason: "after-cutoff" });
    } else {
      documents.push(document);
    }
  }
  if (documents.length === 0) throw new GateAError("SCOPE_EMPTY", "読む範囲がありません。");
  const totalCharsUtf16 = documents.reduce((sum, document) => sum + document.char_count_utf16, 0);
  if (totalCharsUtf16 > maxInputChars) {
    throw new GateAError("CONTEXT_TOO_LARGE", "全文を省略せず送れません。読了位置かモデルを選び直してください。");
  }
  const manifest: ContextManifest = {
    eligible_document_ids: documents.map((document) => document.document_id),
    sent_documents: documents.map((document) => ({
      document_id: document.document_id,
      order: document.order,
      text_sha256: document.text_sha256,
      char_count_utf16: document.char_count_utf16
    })),
    omitted_documents: [],
    non_eligible_documents: nonEligible,
    coverage_percent: 100,
    tools_enabled: false,
    external_search_enabled: false,
    user_consented_at: userConsentedAt
  };
  assertManifestInvariant(snapshot, manifest);
  return { manifest, documents, totalCharsUtf16, estimatedTokens: Math.ceil(totalCharsUtf16 / 2.5) };
}

export function cutoffFromDocument(document: CorpusDocument): ReaderCutoff {
  return { document_id: document.document_id, order: document.order, inclusive: true, label: document.title };
}

export function assertManifestInvariant(snapshot: CorpusSnapshot, manifest: ContextManifest): void {
  const eligible = new Set(manifest.eligible_document_ids);
  const sent = new Set(manifest.sent_documents.map((document) => document.document_id));
  const omitted = new Set(manifest.omitted_documents.map((document) => document.document_id));
  const nonEligible = new Set(manifest.non_eligible_documents.map((document) => document.document_id));
  if (eligible.size !== manifest.eligible_document_ids.length || sent.size !== manifest.sent_documents.length || omitted.size !== manifest.omitted_documents.length) {
    throw new GateAError("BOUNDARY_VIOLATION", "送信範囲に重複があります。");
  }
  for (const id of eligible) {
    if (sent.has(id) === omitted.has(id)) throw new GateAError("BOUNDARY_VIOLATION", "eligible文書の送信状態が一意ではありません。");
    if (nonEligible.has(id)) throw new GateAError("BOUNDARY_VIOLATION", "文書が送信対象と対象外の両方に含まれています。");
  }
  for (const document of snapshot.documents) {
    if (eligible.has(document.document_id) === nonEligible.has(document.document_id)) {
      throw new GateAError("BOUNDARY_VIOLATION", "snapshot文書の範囲分類が一意ではありません。");
    }
  }
  const expectedCoverage = eligible.size === 0 ? 0 : (sent.size / eligible.size) * 100;
  if (Math.abs(expectedCoverage - manifest.coverage_percent) > Number.EPSILON) {
    throw new GateAError("BOUNDARY_VIOLATION", "coverage値が送信範囲と一致しません。");
  }
}

