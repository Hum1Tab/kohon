import { describe, expect, it } from "vitest";
import { findLiteralMatches, replaceAllLiteral, replaceTextMatch } from "./editor-find.js";

describe("editor find and replace", () => {
  it("finds literal text without treating punctuation as regex", () => {
    expect(findLiteralMatches("第一章…第一章 [第一章]", "第一章")).toEqual([{ start: 0, end: 3 }, { start: 4, end: 7 }, { start: 9, end: 12 }]);
    expect(findLiteralMatches("A.B a.b", "a.b")).toEqual([{ start: 0, end: 3 }, { start: 4, end: 7 }]);
    expect(findLiteralMatches("A.B a.b", "a.b", true)).toEqual([{ start: 4, end: 7 }]);
  });

  it("replaces one or all matches without interpreting replacement dollars", () => {
    expect(replaceTextMatch("前半後半", { start: 2, end: 4 }, "中央")).toEqual({ text: "前半中央", caret: 4 });
    expect(replaceAllLiteral("猫と猫", "猫", "$&犬")).toEqual({ text: "$&犬と$&犬", count: 2 });
  });
});
