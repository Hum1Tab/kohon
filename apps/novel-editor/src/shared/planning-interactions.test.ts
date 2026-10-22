import { describe, expect, it } from "vitest";
import { emptyStoryMap, newStoryScene } from "@kohon/project-store/story-map";
import { emptyMysteryBoard } from "@kohon/project-store/mystery";
import { moveMysteryPlacement, recordKnowledge } from "./planning-interactions.js";

const map = () => ({ ...emptyStoryMap(), scenes: ["a", "b", "c"].map(id => newStoryScene(id, id)), narrativeOrder: ["c", "a", "b"], chronologicalOrder: ["a", "b", "c"], characters: [{ id: "person", name: "探偵", color: "#467ca0" }] });
const board = () => ({ ...emptyMysteryBoard(), facts: [{ id: "fact", title: "鍵", truth: "", notes: "" }], clues: [{ id: "clue", title: "濡れた鍵", factId: "fact", kind: "clue" as const, plantedSceneIds: ["a", "c"], reinterpretedSceneId: "b", payoffSceneId: "c", status: "planned" as const, interpretation: "誤誘導", meaning: "本当の意味", quote: "原稿の引用", chapterId: "chapter", checkedVersion: "version" }] });
describe("direct manipulation of mystery placements", () => {
  it("moves one planting while retaining other appearances, quote checks and both scene orders", () => {
    const m = map(), b = board(); const moved = moveMysteryPlacement(m, b, { kind: "plant", rowId: "clue", sceneId: "a" }, "b");
    expect(moved.clues[0]).toEqual({ ...b.clues[0], plantedSceneIds: ["b", "c"] }); expect(b.clues[0]!.plantedSceneIds).toEqual(["a", "c"]);
    expect(m.narrativeOrder).toEqual(["c", "a", "b"]); expect(m.chronologicalOrder).toEqual(["a", "b", "c"]);
    expect(moveMysteryPlacement(m, b, { kind: "plant", rowId: "clue", sceneId: "a" }, "c").clues[0]?.plantedSceneIds).toEqual(["c"]);
  });
  it("moves reinterpretation or payoff independently and rejects stale drag references", () => {
    const m = map(), b = board(); const moved = moveMysteryPlacement(m, b, { kind: "payoff", rowId: "clue", sceneId: "c" }, "a");
    expect(moved.clues[0]!.payoffSceneId).toBe("a"); expect(moved.clues[0]!.reinterpretedSceneId).toBe("b");
    expect(moveMysteryPlacement(m, b, { kind: "reframe", rowId: "clue", sceneId: "b" }, "a").clues[0]?.reinterpretedSceneId).toBe("a");
    expect(moveMysteryPlacement(m, b, { kind: "payoff", rowId: "clue", sceneId: "a" }, "b")).toBe(b);
    expect(moveMysteryPlacement(m, b, { kind: "plant", rowId: "deleted", sceneId: "a" }, "b")).toBe(b);
    expect(moveMysteryPlacement(m, b, { kind: "plant", rowId: "clue", sceneId: "a" }, "missing")).toBe(b);
  });
  it("relocates acquisition records without changing sources or silently overwriting another update", () => {
    const m = map(); const initial = recordKnowledge(m, board(), "fact", "reader", "a", "suspects", "event");
    initial.knowledge[0]!.belief = "蓮を疑う"; initial.knowledge[0]!.source = "目撃";
    const withLater = recordKnowledge(m, initial, "fact", "reader", "b", "knows", "later");
    const moved = moveMysteryPlacement(m, withLater, { kind: "knowledge", rowId: "event", sceneId: "a" }, "b");
    expect(moved.knowledge).toHaveLength(2); expect(moved.knowledge[0]).toEqual({ ...initial.knowledge[0], sceneId: "b" });
    expect(moved.knowledge[1]?.id).toBe("later");
  });
  it("updates the last same-scene recognition without replacing authored beliefs, and records explicit ignorance", () => {
    const m = map(); const b = recordKnowledge(m, board(), "fact", "person", "a", "misunderstands", "first"); b.knowledge[0]!.belief = "鍵を持っていたのは探偵";
    const changed = recordKnowledge(m, b, "fact", "person", "a", "unknown", "unused");
    expect(changed.knowledge).toHaveLength(1); expect(changed.knowledge[0]).toMatchObject({ id: "first", belief: "鍵を持っていたのは探偵", state: "unknown" });
    expect(recordKnowledge(m, b, "missing", "person", "a", "knows", "x")).toBe(b); expect(recordKnowledge(m, b, "fact", "missing", "a", "knows", "x")).toBe(b);
  });
  it("moves custody and deduction records independently of chronology and retains their details", () => {
    const m = map(); const b = { ...board(), custody: [{ id: "custody", itemId: "key", sceneId: "a", characterId: "person", locationId: "hall", state: "held" as const, notes: "右のポケット" }], deductions: [{ id: "d", title: "推理", sceneId: "b", holderId: "reader", factIds: ["fact"], clueIds: ["clue"], custodyIds: [], testimonyIds: [], dependsOnIds: ["prior"], conclusionFactId: "fact", notes: "根拠", alternatives: "別の鍵" }] };
    expect(moveMysteryPlacement(m, b, { kind: "custody", rowId: "custody", sceneId: "a" }, "c").custody[0]).toEqual({ ...b.custody[0], sceneId: "c" });
    expect(moveMysteryPlacement(m, b, { kind: "deduction", rowId: "d", sceneId: "b" }, "a").deductions[0]).toEqual({ ...b.deductions[0], sceneId: "a" });
  });
  it("permits updating a full knowledge ledger but cannot append beyond its storage limit", () => {
    const m = map(); const b = board();
    b.knowledge = Array.from({ length: 5000 }, (_, i) => ({ id: `k${i}`, factId: "fact", holderId: "reader", sceneId: "a", state: "suspects", belief: "記録を保持", source: "会話", sourceCharacterId: null }));
    expect(recordKnowledge(m, b, "fact", "reader", "b", "knows", "overflow")).toBe(b);
    const updated = recordKnowledge(m, b, "fact", "reader", "a", "knows", "unused");
    expect(updated.knowledge).toHaveLength(5000); expect(updated.knowledge[4999]).toMatchObject({ state: "knows", belief: "記録を保持" });
  });
});
