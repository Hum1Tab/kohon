import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { ProviderRequest } from "./provider.js";
import { validateContract } from "@kohon/contracts/validator";
import { describe, expect, it } from "vitest";

import { assertProviderPayloadBoundary, requestContainsForbiddenText } from "./boundary.js";
import { instructionsFor } from "./prompts.js";
import { selectFirstReaderContext } from "./scope.js";
import { createCorpusSnapshot, type ImportSource } from "./snapshot.js";

async function fixtureSource(relativePath: string, order: number, title = relativePath): Promise<ImportSource> {
  const path = fileURLToPath(new URL(`../../../fixtures/${relativePath}`, import.meta.url));
  return { order, title, sourceLabel: relativePath.split("/").at(-1)!, mediaType: relativePath.endsWith(".md") ? "text/markdown" : "text/plain", bytes: await readFile(path) };
}

describe("immutable corpus snapshot", () => {
  it("AT-001 preserves source and produces a schema-valid deterministic snapshot", async () => {
    const path = fileURLToPath(new URL("../../../fixtures/japanese-format/golden.md", import.meta.url));
    const before = await stat(path);
    const source = await fixtureSource("japanese-format/golden.md", 0, "日本語golden");
    const first = createCorpusSnapshot([source], new Date("2026-01-01T00:00:00.000Z")).snapshot;
    const second = createCorpusSnapshot([source], new Date("2026-08-31T00:00:00.000Z")).snapshot;
    const after = await stat(path);
    expect(first.snapshot_id).toBe(second.snapshot_id);
    expect(first.documents[0]?.source_byte_sha256).toBe("7dcad7f9958d7c9eaf2786f2fa167dd891e8048ec806439522bcf66b73150d99");
    expect(first.documents[0]?.text_sha256).toBe("7dcad7f9958d7c9eaf2786f2fa167dd891e8048ec806439522bcf66b73150d99");
    expect(first.documents[0]?.newline_style).toBe("lf");
    expect(validateContract("corpus-snapshot", first).ok).toBe(true);
    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it("AT-002 excludes future and unselected canaries from the provider payload", async () => {
    const sources = await Promise.all([
      fixtureSource("leakage/scene-01.md", 0),
      fixtureSource("leakage/scene-02.md", 1),
      fixtureSource("leakage/scene-03-future.md", 2),
      fixtureSource("leakage/scene-04-future.md", 3)
    ]);
    const snapshot = createCorpusSnapshot(sources).snapshot;
    const cutoff = snapshot.documents[1]!;
    const context = selectFirstReaderContext(snapshot, cutoff.document_id, new Date().toISOString());
    const request: ProviderRequest = {
      condition: "lens",
      provider_id: "mock",
      endpoint_origin: "urn:novel-lens:mock",
      exact_model_id: "mock-fixed-v0.1",
      instructions: instructionsFor("lens", "first-reader"),
      input_documents: context.documents.map((document) => ({ document_id: document.document_id, order: document.order, title: document.title, media_type: document.media_type, text: document.text })),
      user_query: "混乱する箇所は？",
      lens_id: "first-reader",
      output_schema: {},
      max_output_tokens: 1000,
      sampling_config: { temperature: null, seed: null },
      store_requested: false,
      study_run_id: "run-at002"
    };
    assertProviderPayloadBoundary(request, context.manifest.sent_documents.map((document) => document.document_id));
    expect(context.documents).toHaveLength(2);
    expect(context.manifest.non_eligible_documents).toHaveLength(2);
    expect(requestContainsForbiddenText(request, ["青磁梟-7Q4M-未来だけ", "未来から送った"])).toEqual([]);
    expect(JSON.stringify(request)).not.toContain(snapshot.documents[2]!.document_id);
    expect(JSON.stringify(request)).not.toContain(snapshot.documents[3]!.text_sha256);
  });

  it("AT-011 accepts one million UTF-16 characters without truncation", () => {
    const text = "あ".repeat(1_000_000);
    const started = performance.now();
    const snapshot = createCorpusSnapshot([{ order: 0, title: "長編", sourceLabel: "long.txt", mediaType: "text/plain", bytes: new TextEncoder().encode(text) }]).snapshot;
    const context = selectFirstReaderContext(snapshot, snapshot.documents[0]!.document_id, new Date().toISOString(), 1_000_000);
    expect(context.totalCharsUtf16).toBe(1_000_000);
    expect(context.manifest.coverage_percent).toBe(100);
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});

