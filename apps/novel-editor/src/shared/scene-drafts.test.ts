import { describe, expect, it } from "vitest";
import { emptyStoryMap, emptyBeat, newStoryScene, validateStoryMap } from "@kohon/project-store/story-map";
import { appendSceneDrafts, findStoryScenes, sceneDrafts } from "./scene-drafts.js";

describe("author scene brainstorming", () => {
  it("keeps Japanese titles, ignores blank lines and appends to independent existing orders", () => {
    const scenes = [newStoryScene("a", "未来"), newStoryScene("b", "過去")];
    const map = { ...emptyStoryMap(), scenes, narrativeOrder: ["a", "b"], chronologicalOrder: ["b", "a"] };
    let index = 0; const next = appendSceneDrafts(map, "  約束の朝\r\n\n別れの夜\n約束の朝  ", "二人の関係", () => `s${index++}`);
    expect(next.narrativeOrder).toEqual(["a", "b", "s0", "s1", "s2"]); expect(next.chronologicalOrder).toEqual(["b", "a", "s0", "s1", "s2"]);
    expect(next.scenes.slice(2).map(s => s.title)).toEqual(["約束の朝", "別れの夜", "約束の朝"]);
    expect(next.scenes[2]?.beats).toEqual([]); expect(next.scenes[2]?.tension).toBeNull(); expect(validateStoryMap(next)).toEqual(next); expect(map.scenes).toEqual(scenes);
  });
  it("rejects an entire invalid batch, preserving the author’s input rather than truncating", () => {
    const map = emptyStoryMap();
    expect(sceneDrafts("\n ", 5000).error).toBe("empty"); expect(sceneDrafts(Array(5001).fill("場面").join("\n"), 5000).error).toBe("too-many");
    expect(sceneDrafts(Array(180).fill("場面").join("\n"), 5000).error).toBeNull();
    expect(sceneDrafts("あ".repeat(201), 5000).error).toBe("title-length"); expect(sceneDrafts("朝\n夜", 1).error).toBe("capacity");
    expect(appendSceneDrafts(map, "朝\n夜", "", () => "same")).toBe(map); expect(appendSceneDrafts(map, "あ".repeat(201), "", () => "a")).toBe(map);
  });
  it("finds scenes beyond the visible range and returns positions on the chosen axis", () => {
    const map = { ...emptyStoryMap(), scenes: Array.from({ length: 60 }, (_, i) => ({ ...newStoryScene(`s${i}`, `場面${i}`), time: i === 59 ? "Third age" : "", inner: i === 48 ? "実は兄妹" : "", beats: i === 48 ? [emptyBeat("p")] : [] })), narrativeOrder: Array.from({ length: 60 }, (_, i) => `s${i}`), chronologicalOrder: Array.from({ length: 60 }, (_, i) => `s${59 - i}`) };
    expect(findStoryScenes(map, "narrativeOrder", "兄妹", "p")).toEqual([{ id: "s48", title: "場面48", position: 48, plotline: "" }]);
    expect(findStoryScenes(map, "chronologicalOrder", "third AGE")[0]?.position).toBe(0);
    expect(findStoryScenes(map, "narrativeOrder", "兄妹", "other")).toEqual([]);
  });
});
