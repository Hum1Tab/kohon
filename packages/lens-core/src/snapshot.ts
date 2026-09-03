import type {
  CorpusDocument,
  CorpusSnapshot,
  MediaType,
  NewlineStyle,
  UnicodeNormalization
} from "@kohon/contracts";
import { SCHEMA_VERSION } from "@kohon/contracts";

import { GateAError } from "./errors.js";
import { sha256Bytes, sha256Canonical, sha256Text } from "./hash.js";

export interface ImportSource {
  order: number;
  title: string;
  sourceLabel: string;
  mediaType: MediaType;
  bytes: Uint8Array;
}

export interface SnapshotBuildResult {
  snapshot: CorpusSnapshot;
  duplicateDocumentIds: string[];
}

const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);

function startsWithBytes(value: Uint8Array, prefix: Uint8Array): boolean {
  return prefix.every((byte, index) => value[index] === byte);
}

export function detectNewlineStyle(text: string): NewlineStyle {
  const withoutCrLf = text.replaceAll("\r\n", "");
  const hasCrLf = text.includes("\r\n");
  const hasLf = withoutCrLf.includes("\n");
  const hasCr = withoutCrLf.includes("\r");
  const count = Number(hasCrLf) + Number(hasLf) + Number(hasCr);
  if (count === 0) return "none";
  if (count > 1) return "mixed";
  if (hasCrLf) return "crlf";
  return hasLf ? "lf" : "cr";
}

export function detectUnicodeNormalization(text: string): UnicodeNormalization {
  const candidates: Array<[UnicodeNormalization, "NFC" | "NFD" | "NFKC" | "NFKD"]> = [
    ["nfc", "NFC"],
    ["nfd", "NFD"],
    ["nfkc", "NFKC"],
    ["nfkd", "NFKD"]
  ];
  for (const [label, form] of candidates) {
    if (text.normalize(form) === text) return label;
  }
  return "mixed-or-unknown";
}

export function decodeUtf8(bytes: Uint8Array): { text: string; bom: boolean } {
  const bom = startsWithBytes(bytes, UTF8_BOM);
  const content = bom ? bytes.subarray(UTF8_BOM.length) : bytes;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content);
  } catch (cause) {
    throw new GateAError("IMPORT_ENCODING", "UTF-8として読めません。UTF-8のTXT/Markdownコピーを選んでください。", { cause });
  }
  if (text.includes("\u0000")) {
    throw new GateAError("IMPORT_BINARY", "バイナリデータを含むため原稿として読み込めません。");
  }
  return { text, bom };
}

function documentBaseHash(sourceByteHash: string, title: string): string {
  const prefix = new TextEncoder().encode("gate-a-document-id-v1");
  const source = new TextEncoder().encode(sourceByteHash);
  const encodedTitle = new TextEncoder().encode(title);
  const material = new Uint8Array(prefix.length + source.length + encodedTitle.length + 2);
  let offset = 0;
  material.set(prefix, offset);
  offset += prefix.length + 1;
  material.set(source, offset);
  offset += source.length + 1;
  material.set(encodedTitle, offset);
  return sha256Bytes(material);
}

function normalizeSource(source: ImportSource, duplicateCounts: Map<string, number>): CorpusDocument {
  if (!Number.isSafeInteger(source.order) || source.order < 0) {
    throw new GateAError("INVALID_REQUEST", "文書順は0以上の整数で指定してください。");
  }
  const title = source.title.trim();
  if (title.length === 0 || title.length > 256) {
    throw new GateAError("INVALID_REQUEST", "文書タイトルは1〜256文字で指定してください。");
  }
  if (source.sourceLabel.length === 0 || source.sourceLabel.length > 256 || /[\\/]/u.test(source.sourceLabel)) {
    throw new GateAError("INVALID_REQUEST", "表示名にはファイル名だけを使用してください。");
  }
  const sourceByteHash = sha256Bytes(source.bytes);
  const { text, bom } = decodeUtf8(source.bytes);
  const base = documentBaseHash(sourceByteHash, title);
  const duplicateIndex = duplicateCounts.get(base) ?? 0;
  duplicateCounts.set(base, duplicateIndex + 1);
  return {
    document_id: `d-${base.slice(0, 24)}-${duplicateIndex}`,
    order: source.order,
    title,
    source_label: source.sourceLabel,
    media_type: source.mediaType,
    source_byte_sha256: sourceByteHash,
    text_sha256: sha256Text(text),
    source_byte_count: source.bytes.byteLength,
    char_count_utf16: text.length,
    newline_style: detectNewlineStyle(text),
    unicode_normalization: detectUnicodeNormalization(text),
    bom,
    empty: text.length === 0,
    text
  };
}

export function createCorpusSnapshot(sources: readonly ImportSource[], createdAt = new Date()): SnapshotBuildResult {
  if (sources.length === 0) throw new GateAError("INVALID_REQUEST", "少なくとも1つの原稿を選んでください。");
  const ordered = [...sources].sort((a, b) => a.order - b.order);
  const orders = new Set<number>();
  for (const source of ordered) {
    if (orders.has(source.order)) throw new GateAError("INVALID_REQUEST", "文書順が重複しています。");
    orders.add(source.order);
  }
  const duplicateCounts = new Map<string, number>();
  const documents = ordered.map((source) => normalizeSource(source, duplicateCounts));
  const hashMaterial = {
    schema_version: SCHEMA_VERSION,
    hash_policy: "ordered-document-content-v1",
    documents: documents.map((document) => ({
      document_id: document.document_id,
      order: document.order,
      title: document.title,
      media_type: document.media_type,
      source_byte_sha256: document.source_byte_sha256,
      text_sha256: document.text_sha256
    }))
  };
  const duplicateDocumentIds = documents
    .filter((document) => document.document_id.endsWith("-1") || !document.document_id.endsWith("-0"))
    .map((document) => document.document_id);
  return {
    snapshot: {
      schema_version: SCHEMA_VERSION,
      snapshot_id: sha256Canonical(hashMaterial),
      hash_policy: "ordered-document-content-v1",
      created_at: createdAt.toISOString(),
      documents
    },
    duplicateDocumentIds
  };
}

