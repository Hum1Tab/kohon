import { describe, expect, it } from "vitest";

import { defaultChapterTitle, defaultSceneTitle } from "./chapter-title.js";

describe("defaultChapterTitle", () => {
  it("uses conventional Japanese numerals consistently", () => {
    expect([1, 2, 10, 11, 20, 101].map((value) => defaultChapterTitle(value))).toEqual([
      "第一章", "第二章", "第十章", "第十一章", "第二十章", "第百一章"
    ]);
  });
  it("numbers scenes with the same numeral system", () => expect([1, 2, 10].map((value) => defaultSceneTitle(value))).toEqual(["場面一", "場面二", "場面十"]));

  it("uses straightforward English titles when the app is in English", () => {
    expect(defaultChapterTitle(12, "en")).toBe("Chapter 12");
    expect(defaultSceneTitle(3, "en")).toBe("Scene 3");
  });
});
