import { describe, expect, it } from "vitest";
import { emptyStoryMap, newStoryScene } from "@kohon/project-store/story-map";
import { emptyMysteryBoard, knowledgeAt } from "@kohon/project-store/mystery";
import { indexKnowledge, renamePlotline } from "./planning-views.js";
import { genrePlanningDemo, longPlanningDemo } from "../../../../fixtures/planning-genres.js";
import { validateStoryMap } from "@kohon/project-store/story-map";

describe("planning perspectives", () => {
  it("persists genre-neutral examples and long ensembles without a required genre schema", () => {
    for (const genre of ["romance", "fantasy", "history", "mystery"] as const) expect(validateStoryMap(genrePlanningDemo(genre))).toEqual(genrePlanningDemo(genre));
    expect(validateStoryMap(longPlanningDemo()).scenes).toHaveLength(180);
  });
  it("matches knowledge semantics in both axes, including duplicate updates and missing references", () => {
    const map = { ...emptyStoryMap(), scenes: Array.from({ length: 180 }, (_, i) => newStoryScene(`s${i}`, `Scene ${i}`)), narrativeOrder: Array.from({ length: 180 }, (_, i) => `s${179 - i}`), chronologicalOrder: Array.from({ length: 180 }, (_, i) => `s${i}`) };
    const b = emptyMysteryBoard();
    b.knowledge = Array.from({ length: 500 }, (_, i) => ({ id: `k${i}`, factId: `f${i % 7}`, holderId: i % 3 ? "reader" : "a", sceneId: `s${i % 181}`, state: i % 2 ? "knows" : "unknown", belief: `${i}`, source: "", sourceCharacterId: null }));
    for (const holder of ["reader", "a", "missing"]) {
      const at = indexKnowledge(map, b, holder);
      for (const scene of [...map.narrativeOrder, "missing"]) for (let f = 0; f < 7; f++) expect(at(`f${f}`, scene)).toEqual(knowledgeAt(map, b, holder, `f${f}`, scene));
    }
  });
  it("reader preview cannot acquire author-only offstage updates", () => {
    const map = { ...emptyStoryMap(), scenes: [{ ...newStoryScene("s", "Secret"), kind: "offstage" as const }], narrativeOrder: ["s"], chronologicalOrder: ["s"] };
    const b = emptyMysteryBoard(); b.knowledge.push({ id: "k", factId: "f", holderId: "reader", sceneId: "s", state: "knows", belief: "hidden", source: "", sourceCharacterId: null });
    expect(indexKnowledge(map, b, "reader")("f", "s")?.belief).toBe("hidden");
    expect(indexKnowledge(map, b, "reader", true)("f", "s")).toBeNull();
  });
  it("merges or removes plotlines without changing scene identity, either order or hidden data", () => {
    const scene = { ...newStoryScene("s", "History"), plotline: "外交", inner: "内密の取引" };
    const map = { ...emptyStoryMap(), scenes: [scene], plotlines: ["外交", "戦場", "未配置"], narrativeOrder: ["s"], chronologicalOrder: ["s"] };
    const merged = renamePlotline(map, "外交", "戦場"); expect(merged.plotlines).toEqual(["戦場", "未配置"]); expect(merged.scenes[0]).toEqual({ ...scene, plotline: "戦場" });
    expect(renamePlotline(merged, "戦場", "").scenes[0]?.plotline).toBe("");
    expect(merged.narrativeOrder).toBe(map.narrativeOrder); expect(merged.chronologicalOrder).toBe(map.chronologicalOrder);
    expect(renamePlotline(map, "", "x")).toBe(map);
  });
  it("does not exceed saved-lane capacity while renaming a scene-only lane", () => {
    const map = { ...emptyStoryMap(), plotlines: Array.from({ length: 200 }, (_, i) => `Lane ${i}`), scenes: [{ ...newStoryScene("s", "Scene"), plotline: "自由な筋" }], narrativeOrder: ["s"], chronologicalOrder: ["s"] };
    const renamed = renamePlotline(map, "自由な筋", "別の自由な筋");
    expect(renamed.plotlines).toHaveLength(200); expect(renamed.scenes[0]?.plotline).toBe("別の自由な筋"); expect(validateStoryMap(renamed)).toEqual(renamed);
  });
});
