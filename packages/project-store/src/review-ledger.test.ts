import { describe, expect, it } from "vitest";
import {
  createReviewFinding,
  parseReviewLedger,
  recheckReviewFinding,
  serializeReviewLedger,
  setAuthorFindingStatus,
  type ReviewLedger
} from "./review-ledger.js";

const input = {
  role: "editor",
  provider: "mock",
  model: "offline",
  scope: "current" as const,
  manuscriptVersionHash: "sha-old",
  chapterId: "chapter-1",
  file: "manuscript/chapter-1.md",
  title: "第一章",
  finding: { title: "視点", body: "焦点が揺れる候補です。", severity: "medium" },
  exactQuote: "雨は窓を叩いた。",
  manuscriptText: "静かな夜だった。雨は窓を叩いた。\n",
  createdAt: "2026-09-02T00:00:00.000Z"
};

describe("review ledger", () => {
  it("creates an exact anchor and round-trips JSON", () => {
    const entry = createReviewFinding(input);
    const ledger: ReviewLedger = { schemaVersion: 1, entries: [entry] };
    expect(entry).toMatchObject({ status: "open", anchorStatus: "attached", anchor: { occurrence: 1 } });
    expect(parseReviewLedger(serializeReviewLedger(ledger))).toEqual(ledger);
  });

  it("changes lifecycle status through the author operation only", () => {
    const entry = createReviewFinding(input);
    const resolved = setAuthorFindingStatus(entry, "resolved", "2026-09-02T01:00:00.000Z");
    expect(resolved).toMatchObject({ status: "resolved", updatedAt: "2026-09-02T01:00:00.000Z", anchorStatus: "attached" });
    expect(entry.status).toBe("open");
  });

  it("marks an old manuscript anchor stale when its hash changes", () => {
    const entry = createReviewFinding(input);
    const stale = recheckReviewFinding(entry, "sha-new", "2026-09-02T02:00:00.000Z");
    expect(stale).toMatchObject({ anchorStatus: "stale", manuscriptVersionHash: "sha-old" });
    expect(stale.anchor).toEqual(entry.anchor);
  });
});
