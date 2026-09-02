import { describe, expect, it, vi } from "vitest";

import { GateAError } from "@kohon/core";

import { SessionManager, type RatingValues } from "./session.js";

const ratings = (): RatingValues => ({ usefulness: 2, specificity: 2, evidence_trust: 2, novel_insight: 2, misleading_risk: 2, voice_pressure: 2, decision_confidence: 2 });

function startPrepared(manager: SessionManager, providerId: "mock" | "openai" = "mock"): void {
  const state = manager.start("P-AUTO01", true) as { snapshot: { documents: Array<{ document_id: string }> } };
  manager.prepare({
    cutoffDocumentId: state.snapshot.documents[1]!.document_id,
    query: "読者が混乱しそうな箇所は？",
    providerId,
    modelId: providerId === "mock" ? "mock-fixed-v0.1" : "test-model",
    maxOutputTokens: 1400
  });
}

async function complete(manager: SessionManager): Promise<void> {
  manager.consent({ sendApproved: true, rawResponseNotSaved: true, metricsExportApproved: true });
  await manager.run();
  manager.rate({ ratings: { A: ratings(), B: ratings() }, preference: "tie", reasonCodes: [], conditionGuess: "cannot-tell", guessConfidence: 0 });
}

describe("Gate A acceptance flow", () => {
  it("AT-003 invalidates consent after scope/query changes", async () => {
    const manager = new SessionManager();
    startPrepared(manager);
    manager.consent({ sendApproved: true, rawResponseNotSaved: true, metricsExportApproved: true });
    const state = manager.publicState(false) as { snapshot: { documents: Array<{ document_id: string }> } };
    manager.prepare({ cutoffDocumentId: state.snapshot.documents[0]!.document_id, query: "別の読者質問は？", providerId: "mock", modelId: "mock-fixed-v0.1", maxOutputTokens: 1400 });
    await expect(manager.run()).rejects.toMatchObject({ code: "CONSENT_STALE" });
  });

  it("AT-004 keeps A/B model, output limit, sampling and snapshot equal", async () => {
    const manager = new SessionManager();
    startPrepared(manager);
    await complete(manager);
    const exported = manager.exportPreview() as { snapshot: { snapshot_id: string }; runs: Array<{ provider: { requested_model_id: string; max_output_tokens: number; sampling: unknown } }> };
    expect(exported.runs).toHaveLength(2);
    expect(exported.runs[0]!.provider.requested_model_id).toBe(exported.runs[1]!.provider.requested_model_id);
    expect(exported.runs[0]!.provider.max_output_tokens).toBe(exported.runs[1]!.provider.max_output_tokens);
    expect(exported.runs[0]!.provider.sampling).toEqual(exported.runs[1]!.provider.sampling);
    expect(exported.snapshot.snapshot_id).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("AT-007 never includes condition labels or mapping before rating", async () => {
    const manager = new SessionManager();
    startPrepared(manager);
    manager.consent({ sendApproved: true, rawResponseNotSaved: true, metricsExportApproved: true });
    const masked = await manager.run();
    const serialized = JSON.stringify(masked);
    expect(serialized).not.toContain("generic");
    expect(serialized).not.toContain("lens");
    expect(serialized).not.toContain("sealed");
    expect(masked).toMatchObject({ mappingRevealed: false });
  });

  it("AT-008 erases all declared in-memory classes", async () => {
    const manager = new SessionManager();
    startPrepared(manager);
    await complete(manager);
    const receipt = manager.erase();
    expect(receipt.deletedClasses).toEqual(expect.arrayContaining(["manuscript-text", "provider-request-response", "api-key", "ratings", "server-session"]));
    expect(manager.publicState(false)).toEqual({ stage: "empty" });
  });

  it("AT-012/013 completes S1-S8 with Mock and makes no fetch request", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("Mock must not use network"); });
    vi.stubGlobal("fetch", fetchMock);
    const manager = new SessionManager();
    startPrepared(manager);
    await complete(manager);
    const review = manager.revealedReview() as { findings: unknown[] };
    const exported = manager.exportPreview();
    expect(review.findings.length).toBeGreaterThan(0);
    expect(exported).toMatchObject({ content_included: false, operator_variable_cost_policy: "user-owned-services-only" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(manager.erase().deletedClasses).toHaveLength(5);
    vi.unstubAllGlobals();
  });

  it("AT-014 refuses a run before consent without invoking a provider", async () => {
    const manager = new SessionManager();
    startPrepared(manager);
    await expect(manager.run()).rejects.toEqual(expect.objectContaining<Partial<GateAError>>({ code: "CONSENT_STALE" }));
  });

  it("AT-009 cannot rate a partial pair after the second cloud call fails", async () => {
    const manager = new SessionManager();
    startPrepared(manager, "openai");
    manager.consent({ sendApproved: true, rawResponseNotSaved: true, metricsExportApproved: true, apiKey: "sk-test-secret" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "one", model: "test-model", output_text: "generic answer", usage: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response("provider raw", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(manager.run()).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    expect(() => manager.maskedPair()).toThrow();
    expect(() => manager.rate({ ratings: { A: ratings(), B: ratings() }, preference: "tie", reasonCodes: [], conditionGuess: "cannot-tell", guessConfidence: 0 })).toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("AT-016 exports metrics and hashes without manuscript, quote, raw output, filename or path", async () => {
    const manager = new SessionManager();
    startPrepared(manager);
    await complete(manager);
    const serialized = JSON.stringify(manager.exportPreview());
    for (const forbidden of ["雨は九時", "scene-01.md", "この箇所は、読者が", "# 第一場", "D:\\\\", "/Users/"]) expect(serialized).not.toContain(forbidden);
    expect(serialized).toContain("operator_variable_cost_policy");
  });

  it("applies a lower fail-closed input ceiling to user-paid OpenAI runs", () => {
    const manager = new SessionManager();
    manager.start("P-COST01", false);
    const imported = manager.import([{ name: "large.txt", title: "大きい原稿", mediaType: "text/plain", base64: Buffer.from("あ".repeat(250_001)).toString("base64") }]) as {
      snapshot: { documents: Array<{ document_id: string }> };
    };
    const cutoffDocumentId = imported.snapshot.documents[0]!.document_id;

    expect(() => manager.prepare({
      cutoffDocumentId,
      query: "読者が混乱しそうな箇所は？",
      providerId: "openai",
      modelId: "test-model",
      maxOutputTokens: 1400
    })).toThrow(expect.objectContaining<Partial<GateAError>>({ code: "CONTEXT_TOO_LARGE" }));

    expect(() => manager.prepare({
      cutoffDocumentId,
      query: "読者が混乱しそうな箇所は？",
      providerId: "mock",
      modelId: "mock-fixed-v0.1",
      maxOutputTokens: 1400
    })).not.toThrow();
  });
});
