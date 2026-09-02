import type { CorpusDocument, ModelEvidence, ValidatedEvidence } from "@kohon/contracts";

export interface CrossVersionAnchorResult {
  status: "attached" | "reattachment-candidate" | "ambiguous" | "missing";
  occurrenceCount: number;
  startUtf16: number | null;
  endUtf16: number | null;
}

export function findOccurrences(text: string, exactText: string): number[] {
  if (exactText.length === 0) return [];
  const offsets: number[] = [];
  let from = 0;
  while (from <= text.length - exactText.length) {
    const offset = text.indexOf(exactText, from);
    if (offset < 0) break;
    offsets.push(offset);
    from = offset + Math.max(1, exactText.length);
  }
  return offsets;
}

export function validateEvidence(document: CorpusDocument, evidence: ModelEvidence): ValidatedEvidence {
  const offsets = findOccurrences(document.text, evidence.exact_text);
  const uniqueOffset = offsets.length === 1 ? offsets[0] ?? null : null;
  const start = uniqueOffset;
  const end = start === null ? null : start + evidence.exact_text.length;
  return {
    document_id: document.document_id,
    document_text_sha256: document.text_sha256,
    exact_text: evidence.exact_text,
    start_utf16: start,
    end_utf16: end,
    prefix: start === null ? "" : document.text.slice(Math.max(0, start - 32), start),
    suffix: end === null ? "" : document.text.slice(end, end + 32),
    occurrence_count: offsets.length,
    anchor_status: offsets.length === 0 ? "missing" : offsets.length === 1 ? "attached" : "ambiguous"
  };
}

export function resolveCrossVersionAnchor(
  sourceTextSha256: string,
  exactText: string,
  target: CorpusDocument
): CrossVersionAnchorResult {
  const offsets = findOccurrences(target.text, exactText);
  const uniqueOffset = offsets.length === 1 ? offsets[0] ?? null : null;
  const status = offsets.length === 0
    ? "missing"
    : offsets.length > 1
      ? "ambiguous"
      : target.text_sha256 === sourceTextSha256
        ? "attached"
        : "reattachment-candidate";
  return {
    status,
    occurrenceCount: offsets.length,
    startUtf16: uniqueOffset,
    endUtf16: uniqueOffset === null ? null : uniqueOffset + exactText.length
  };
}

