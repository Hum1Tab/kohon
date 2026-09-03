import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { SCHEMA_VERSION, type LensOutput } from "@kohon/contracts";
import { describe, expect, it } from "vitest";

import { resolveCrossVersionAnchor, validateEvidence } from "./anchor.js";
import { validateLensOutput } from "./findings.js";
import { createCorpusSnapshot } from "./snapshot.js";

async function documentFrom(relativePath: string) {
  const bytes = await readFile(fileURLToPath(new URL(`../../../fixtures/anchor/${relativePath}`, import.meta.url)));
  return createCorpusSnapshot([{ order: 0, title: "anchor", sourceLabel: relativePath, mediaType: "text/markdown", bytes }]).snapshot.documents[0]!;
}

describe("strict exact anchors", () => {
  it("AT-005 rejects a fabricated quote instead of creating a finding card", async () => {
    const document = await documentFrom("v1.md");
    const snapshot = createCorpusSnapshot([{ order: 0, title: document.title, sourceLabel: document.source_label, mediaType: document.media_type, bytes: new TextEncoder().encode(document.text) }]).snapshot;
    const output: LensOutput = {
      schema_version: SCHEMA_VERSION,
      lens_id: "first-reader",
      lens_version: "0.1",
      scope_note: "送信範囲だけを確認しました。",
      findings: [{ category: "reader-confusion", claim: "捏造引用です。", reader_effect: "誤解します。", salience: "high", model_confidence: "high", alternative_interpretations: [], evidence: [{ document_id: snapshot.documents[0]!.document_id, exact_text: "本文に存在しない引用" }] }]
    };
    const result = validateLensOutput(output, snapshot, [snapshot.documents[0]!.document_id]);
    expect(result.findings).toHaveLength(0);
    expect(result.invalidFindingCount).toBe(1);
  });

  it("AT-006 never jumps when an exact quote is duplicated", async () => {
    const duplicate = await documentFrom("v4-duplicate.md");
    const evidence = validateEvidence(duplicate, { document_id: duplicate.document_id, exact_text: "時計台の針は、午前零時で止まっていた。" });
    expect(evidence.anchor_status).toBe("ambiguous");
    expect(evidence.occurrence_count).toBe(2);
    expect(evidence.start_utf16).toBeNull();
  });

  it("marks cross-version unique exact matches as candidates, never silent attachments", async () => {
    const original = await documentFrom("v1.md");
    const moved = await documentFrom("v3-moved.md");
    const paraphrased = await documentFrom("v5-paraphrased.md");
    expect(resolveCrossVersionAnchor(original.text_sha256, "時計台の針は、午前零時で止まっていた。", moved).status).toBe("reattachment-candidate");
    expect(resolveCrossVersionAnchor(original.text_sha256, "時計台の針は、午前零時で止まっていた。", paraphrased).status).toBe("missing");
  });
});

