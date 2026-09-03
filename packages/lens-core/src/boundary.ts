import type { ProviderRequest } from "./provider.js";
import { GateAError } from "./errors.js";

export function assertProviderPayloadBoundary(request: ProviderRequest, sentDocumentIds: readonly string[]): void {
  const expected = new Set(sentDocumentIds);
  const actual = new Set(request.input_documents.map((document) => document.document_id));
  if (actual.size !== request.input_documents.length) throw new GateAError("BOUNDARY_VIOLATION", "送信文書IDが重複しています。");
  if (actual.size !== expected.size || [...actual].some((id) => !expected.has(id))) {
    throw new GateAError("BOUNDARY_VIOLATION", "provider payloadが同意済み送信範囲と一致しません。");
  }
  if (request.store_requested !== false) throw new GateAError("BOUNDARY_VIOLATION", "provider保存を有効にはできません。");
}

export function requestContainsForbiddenText(request: ProviderRequest, forbidden: readonly string[]): string[] {
  const serialized = JSON.stringify(request);
  return forbidden.filter((needle) => serialized.includes(needle));
}

