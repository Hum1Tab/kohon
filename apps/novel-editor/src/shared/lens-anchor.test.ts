import { describe, expect, it } from "vitest";
import { refreshLensAnchor } from "./lens-anchor.js";
import type { LensFinding } from "./types.js";

const finding: LensFinding = {
  id: "review", title: "確認候補", observation: "所見", readerEffect: "影響",
  quote: "父の声", chapterId: "chapter", chapterTitle: "章",
  anchorStatus: "attached", startUtf16: 0, endUtf16: 3, priority: "medium"
};

describe("review navigation after revision", () => {
  it("tracks a unique quote after edits before it, including surrogate pairs", () => {
    const current = refreshLensAnchor(finding, "😀追記。父の声だった。");
    expect(current).toMatchObject({ anchorStatus: "attached", startUtf16: 5, endUtf16: 8 });
    expect(finding.startUtf16).toBe(0);
  });
  it("refuses deleted and repeated quotes rather than retaining stale offsets", () => {
    expect(refreshLensAnchor(finding, "別の文")).toMatchObject({ anchorStatus: "missing", startUtf16: null, endUtf16: null });
    expect(refreshLensAnchor(finding, "父の声。父の声。")).toMatchObject({ anchorStatus: "ambiguous", startUtf16: null, endUtf16: null });
  });
});
