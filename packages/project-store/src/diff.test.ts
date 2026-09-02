import { describe, expect, it } from "vitest";
import { diffTextLines } from "./diff.js";

describe("line diff", () => {
  it("reports additions and removals with line numbers and context", () => {
    const result = diffTextLines("一\n二\n三", "一\n第二\n三\n四", 1);
    expect(result).toMatchObject({ additions: 2, removals: 1, truncated: false });
    expect(result.hunks[0]?.lines.map((line) => [line.kind, line.text])).toEqual([["context", "一"], ["remove", "二"], ["add", "第二"], ["context", "三"], ["add", "四"]]);
  });

  it("returns no hunks for identical text and caps rendered lines", () => {
    expect(diffTextLines("同じ", "同じ").hunks).toEqual([]);
    expect(diffTextLines("a\nb\nc", "x\ny\nz", 0, 2).truncated).toBe(true);
  });
});
