import { describe, expect, it } from "vitest";
import { bondsThrough, buildStoryMap, emotionSeries, sharedScenes } from "./story-map.js";
import type { Chapter, ReviewLedgerEntry } from "./types.js";

const make = (id: string, order: number, metadata: Chapter["metadata"] = {}, title = id): Chapter =>
  ({ id, order, title, file: `manuscript/${id}.md`, kind: "chapter", metadata });
const review = (chapterId: string, status: ReviewLedgerEntry["status"]): ReviewLedgerEntry =>
  ({ chapterId, status } as ReviewLedgerEntry);

describe("story-map data", () => {
  const chapters = [
    make("b", 1, { characters: ["葵", "蓮"], location: "図書館", timeline: "初日", pov: "葵",
      moments: [{ character: "葵", emotion: -4, action: "探す", innerThought: "焦り" }],
      relationships: [{ from: "葵", to: "蓮", label: "友達", strength: 2 }] }),
    make("a", 0, { characters: ["葵"], location: "港", timeline: "初日",
      moments: [{ character: "葵", emotion: 4, expression: "笑顔" }] }, "とても長い章題".repeat(15)),
    make("c", 2, { characters: [], location: "港", timeline: "前日",
      moments: [{ character: "蓮", emotion: 0, offstage: true }],
      relationships: [{ from: "蓮", to: "葵", label: "対立", strength: -2 }] }),
    make("d", 3, { characters: ["葵"], timeline: "初日",
      moments: [{ character: "葵", action: "出発する" }] }),
    make("e", 4, {})
  ];
  const ledger = [
    review("a", "open"), review("a", "open"), review("b", "resolved"), review("c", "ignored")
  ];
  const lengths = { a: 1200, b: 2400, c: 0, d: 80, e: 0 };
  const data = buildStoryMap(chapters, lengths, ledger);

  it("preserves author narrative order, scales length, but makes zero-length chapters clickable", () => {
    expect(data.strips.map((strip) => strip.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(data.strips[1]!.width).toBeGreaterThan(data.strips[0]!.width);
    expect(data.strips[2]!.width).toBe(58);
    expect(data.strips[4]!.width).toBe(58);
    expect(data.strips[0]!.width).toBeGreaterThan(58);
    expect(data.totalWidth).toBe(data.strips.reduce((sum, strip) => sum + strip.width, 0));
  });

  it("shows one marker only for open reviews, never resolved or ignored", () => {
    expect(data.strips.map((strip) => strip.hasOpenReview)).toEqual([true, false, false, false, false]);
  });

  it("uses explicitly named people and exact time labels", () => {
    expect(data.people).toEqual(["葵", "蓮"]);
    expect(data.places).toEqual(["港", "図書館"]);
    expect(data.times).toEqual(["初日", "前日"]);
    expect(data.people).not.toContain("第三者");
  });

  it("never interprets unknown emotion as neutral, and keeps private thought and offstage distinct", () => {
    const points = emotionSeries(data, "葵");
    expect(points.map((item) => item.value)).toEqual([4, -4]);
    expect(points[1]?.innerThought).toBe("焦り");
    expect(emotionSeries(data, "蓮")[0]).toMatchObject({ chapterId: "c", value: 0, offstage: true });
    expect(emotionSeries(data, "第三者")).toEqual([]);
  });

  it("distinguishes explicit authored relationship changes from shared scenes", () => {
    expect(bondsThrough(data, "a")).toEqual([]);
    expect(bondsThrough(data, "b")).toEqual([
      expect.objectContaining({ from: "葵", to: "蓮", label: "友達", strength: 2, chapterId: "b" })
    ]);
    expect(bondsThrough(data, "c")).toEqual([
      expect.objectContaining({ from: "蓮", to: "葵", label: "対立", strength: -2, chapterId: "c" })
    ]);
    expect(sharedScenes(data, "b")).toEqual([{ a: "葵", b: "蓮", scenes: 1 }]);
    expect(sharedScenes(data, "a")).toEqual([]);
  });

  it("renders a manuscript containing no text or metadata without fabricating values", () => {
    const blank = buildStoryMap([make("x", 0, {}, "空白")], {}, []);
    expect(blank.strips[0]!.width).toBe(58);
    expect(blank.people).toEqual([]);
    expect(blank.places).toEqual([]);
    expect(blank.times).toEqual([]);
    expect(bondsThrough(blank, null)).toEqual([]);
  });
});
