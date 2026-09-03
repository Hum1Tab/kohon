import { describe, expect, it } from "vitest";

import { isEmptyChapterMetadata, mergeChapterMetadata, validateChapterMetadata } from "./chapter-metadata.js";

describe("chapter metadata", () => {
  it("normalizes a small optional public record", () => {
    expect(validateChapterMetadata({ summary: "  港へ向かう  ", pov: " 千夏 ", characters: ["千夏", "蓮"], location: " 港 ", timeline: "一日目", status: "draft", tags: ["伏線"] })).toEqual({
      summary: "港へ向かう",
      pov: "千夏",
      characters: ["千夏", "蓮"],
      location: "港",
      timeline: "一日目",
      status: "draft",
      tags: ["伏線"]
    });
  });

  it("omits empty values and rejects duplicate list entries", () => {
    expect(validateChapterMetadata({ summary: " ", characters: [], tags: [] })).toEqual({});
    expect(isEmptyChapterMetadata({})).toBe(true);
    expect(() => validateChapterMetadata({ characters: ["千夏", "千夏"] })).toThrow("duplicate characters");
  });

  it("merges lists and summaries but refuses conflicting scalar plans", () => {
    expect(mergeChapterMetadata({ summary: "前半", characters: ["千夏"] }, { summary: "後半", characters: ["蓮"], status: "draft" })).toEqual({ summary: "前半\n\n後半", characters: ["千夏", "蓮"], status: "draft" });
    expect(() => mergeChapterMetadata({ pov: "千夏" }, { pov: "蓮" })).toThrow("conflict: pov");
  });
});
