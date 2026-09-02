import { describe, expect, it } from "vitest";

import { annotateSelectionAsTateChuYoko, insertParagraphIndent, normalizeSelectedPunctuation, wrapSelectionWithBouten, wrapSelectionWithJapaneseQuotes, wrapSelectionWithRuby } from "./japanese-input.js";

describe("Japanese input helpers", () => {
  it("wraps the selected UTF-16 range in ruby and bouten notation", () => {
    expect(wrapSelectionWithRuby({ text: "前😀漢字後", selectionStart: 3, selectionEnd: 5 }, "かんじ")).toEqual({
      nextText: "前😀｜漢字《かんじ》後",
      nextSelectionStart: 3,
      nextSelectionEnd: 11
    });
    expect(wrapSelectionWithBouten({ text: "前本文後", selectionStart: 1, selectionEnd: 3 })).toEqual({
      nextText: "前《《本文》》後",
      nextSelectionStart: 1,
      nextSelectionEnd: 7
    });
  });

  it("normalizes ASCII ellipses and dashes only inside the selection", () => {
    expect(normalizeSelectedPunctuation({ text: "外... 中...--……――", selectionStart: 4, selectionEnd: 11 })).toEqual({
      nextText: "外... 中……――……――",
      nextSelectionStart: 4,
      nextSelectionEnd: 10
    });
  });

  it("inserts an indented paragraph and places the caret after it", () => {
    expect(insertParagraphIndent({ text: "第一文第二文", selectionStart: 3, selectionEnd: 3 })).toEqual({
      nextText: "第一文\n　第二文",
      nextSelectionStart: 5,
      nextSelectionEnd: 5
    });
  });

  it("inserts paired corner brackets without intercepting normal typing", () => {
    expect(wrapSelectionWithJapaneseQuotes({ text: "前本文後", selectionStart: 1, selectionEnd: 3 })).toEqual({ nextText: "前「本文」後", nextSelectionStart: 2, nextSelectionEnd: 4 });
    expect(wrapSelectionWithJapaneseQuotes({ text: "前後", selectionStart: 1, selectionEnd: 1 })).toEqual({ nextText: "前「」後", nextSelectionStart: 2, nextSelectionEnd: 2 });
  });

  it("adds the published Aozora tate-chu-yoko annotation only to short alphanumerics", () => {
    expect(annotateSelectionAsTateChuYoko({ text: "B29編隊", selectionStart: 1, selectionEnd: 3 })).toEqual({ nextText: "B29［＃「29」は縦中横］編隊", nextSelectionStart: 1, nextSelectionEnd: 3 });
    expect(annotateSelectionAsTateChuYoko({ text: "2026年", selectionStart: 0, selectionEnd: 4 }).nextText).toBe("2026年");
  });
});
