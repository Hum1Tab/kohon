import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NodeProjectStore as ProjectStore } from "./node.js";
import { emptyStoryMap, newStoryScene, removeStoryScene, validateStoryMap, type StoryMap } from "./story-map.js";
import {
  auditMystery,
  checkMysteryQuote,
  emptyMysteryBoard,
  knowledgeAt,
  validateMysteryBoard,
  type KnowledgeEvent,
  type MysteryClue,
  type MysteryDeduction,
  type MysteryPresence
} from "./mystery.js";

function fixture(): StoryMap {
  const map = emptyStoryMap();
  map.characters = [{ id: "a", name: "探偵", color: "#467ca0" }, { id: "b", name: "証人", color: "#886633" }];
  map.scenes = ["past", "early", "late"].map(id => newStoryScene(id, id));
  map.narrativeOrder = ["early", "late", "past"];
  map.chronologicalOrder = ["past", "early", "late"];
  map.mystery = {
    ...emptyMysteryBoard(),
    facts: [{ id: "f", title: "消えた鍵", truth: "証人が持つ", notes: "" }],
    locations: ["hall", "room", "gate"].map(id => ({ id, name: id, notes: "" }))
  };
  return map;
}
const event = (id: string, holderId: string, sceneId: string, state: KnowledgeEvent["state"] = "knows"): KnowledgeEvent => ({ id, factId: "f", holderId, sceneId, state, belief: "", source: "", sourceCharacterId: null });
const clue = (patch: Partial<MysteryClue> = {}): MysteryClue => ({ id: "cl", title: "傷のある鍵", factId: "f", kind: "clue", plantedSceneIds: ["early"], reinterpretedSceneId: null, payoffSceneId: "late", status: "planned", interpretation: "", meaning: "", quote: "", chapterId: null, checkedVersion: null, ...patch });
const presence = (id: string, locationId: string, start: number | null, end: number | null, patch: Partial<MysteryPresence> = {}): MysteryPresence => ({ id, characterId: "a", sceneId: "early", locationId, clock: "共通", start, end, certainty: "confirmed", notes: "", ...patch });
const deduction = (id: string, patch: Partial<MysteryDeduction> = {}): MysteryDeduction => ({ id, title: id, sceneId: "early", holderId: "a", factIds: [], clueIds: [], custodyIds: [], testimonyIds: [], dependsOnIds: [], conclusionFactId: "f", notes: "", alternatives: "", ...patch });
const codes = (map: StoryMap) => auditMystery(map).map(issue => issue.code);

describe("mystery data compatibility and persistence", () => {
  it("leaves old story maps unchanged and round-trips complete mystery records", () => {
    const old = emptyStoryMap();
    expect(validateStoryMap(old)).toEqual(old);
    expect(validateStoryMap(old)).not.toHaveProperty("mystery");
    const map = fixture();
    map.mystery!.knowledge.push(event("e", "reader", "past"));
    map.mystery!.clues.push(clue());
    expect(validateStoryMap(JSON.parse(JSON.stringify(map)))).toEqual(map);
  });

  it("rejects unsafe IDs, bad enums, times, duplicate references and unsupported versions", () => {
    const b = fixture().mystery!;
    const invalid = [
      { ...b, schemaVersion: 2 },
      { ...b, facts: [{ ...b.facts[0], id: "../outside" }] },
      { ...b, facts: [b.facts[0], b.facts[0]] },
      { ...b, knowledge: [{ ...event("e", "a", "past"), state: "maybe" }] },
      { ...b, presences: [presence("p", "hall", 1.5, 8)] },
      { ...b, routes: [{ id: "r", fromId: "hall", toId: "room", minutes: -1, bidirectional: true }] },
      { ...b, clues: [clue({ plantedSceneIds: ["early", "early"] })] }
    ];
    for (const value of invalid) expect(() => validateMysteryBoard(value)).toThrow();
  });

  it("keeps dangling references after deletion and reports them without discarding notes", () => {
    const map = fixture();
    map.mystery!.knowledge.push(event("e", "a", "past"));
    const removed = removeStoryScene(map, "past");
    expect(validateStoryMap(removed).mystery?.knowledge).toEqual(map.mystery!.knowledge);
    expect(codes(removed)).toContain("missing-reference");
  });

  it("saves and restores all mystery records with the map checkpoint", async () => {
    const store = await ProjectStore.create(await mkdtemp(join(tmpdir(), "kohon-mystery-")), "ミステリー");
    const chapter = await store.createChapter("章", "鍵を見た。");
    const map = fixture();
    map.mystery!.clues.push(clue({ chapterId: chapter.id, quote: "鍵を見た。" }));
    const saved = await store.saveStoryMap(map, 0);
    const snapshot = await store.checkpoint("伏線の設置");
    await store.saveStoryMap({ ...saved, mystery: emptyMysteryBoard() }, saved.revision);
    await store.restore(snapshot.commit!);
    expect((await store.readStoryMap()).mystery).toEqual(map.mystery);
    await store.deleteChapter(chapter.id);
    expect((await store.readStoryMap()).mystery?.clues[0]?.chapterId).toBe(chapter.id);
  });
});

describe("character chronology and reader information", () => {
  it("moving a flashback changes reader knowledge but leaves character knowledge alone", () => {
    const m = fixture();
    m.mystery!.knowledge = [event("r", "reader", "past"), event("a", "a", "past")];
    expect(knowledgeAt(m, m.mystery!, "reader", "f", "early")).toBeNull();
    expect(knowledgeAt(m, m.mystery!, "a", "f", "early")?.state).toBe("knows");
    const moved = { ...m, narrativeOrder: ["past", "early", "late"] };
    expect(knowledgeAt(moved, m.mystery!, "reader", "f", "early")?.state).toBe("knows");
    expect(knowledgeAt(moved, m.mystery!, "a", "f", "early")).toEqual(knowledgeAt(m, m.mystery!, "a", "f", "early"));
  });

  it("distinguishes unrecorded, explicitly unknown, mistaken and same-scene updates", () => {
    const m = fixture();
    m.mystery!.knowledge = [event("u", "a", "past", "unknown"), event("x", "a", "early", "misunderstands"), event("y", "a", "early", "believes")];
    expect(knowledgeAt(m, m.mystery!, "b", "f", "past")).toBeNull();
    expect(knowledgeAt(m, m.mystery!, "a", "f", "past")?.state).toBe("unknown");
    expect(knowledgeAt(m, m.mystery!, "a", "f", "early")?.state).toBe("believes");
    expect(knowledgeAt(m, m.mystery!, "a", "f", "missing")).toBeNull();
  });

  it("checks uses and explicit source transfers without assuming every belief is true", () => {
    const m = fixture();
    m.mystery!.knowledge = [event("a", "a", "past", "misunderstands"), { ...event("b", "b", "early"), sourceCharacterId: "a" }];
    m.mystery!.uses = [{ id: "use", factId: "f", holderId: "a", sceneId: "early", purpose: "", requiresTruth: false }];
    expect(codes(m)).not.toContain("knowledge-use");
    expect(codes(m)).not.toContain("source-knowledge");
    m.mystery!.uses[0]!.requiresTruth = true;
    expect(codes(m)).toContain("knowledge-use");
    m.mystery!.knowledge[0]!.sceneId = "late";
    expect(codes(m)).toContain("source-knowledge");
  });

  it("warns when a reader reveal exists only offstage", () => {
    const m = fixture();
    m.scenes[0]!.kind = "offstage";
    m.mystery!.knowledge = [event("r", "reader", "past")];
    expect(codes(m)).toContain("offstage-reveal");
  });
});

describe("clue placement and quote attachment", () => {
  it("rechecks planting after reordering, and intentional-open remains an explicit author choice", () => {
    const m = fixture();
    m.mystery!.clues = [clue()];
    expect(codes(m)).toEqual([]);
    m.narrativeOrder = ["late", "early", "past"];
    expect(codes(m)).toContain("clue-before-plant");
    m.mystery!.clues[0]!.status = "intentional-open";
    expect(codes(m)).toEqual([]);
  });

  it("does not treat offstage notes as planting and distinguishes unset payoff from late reinterpretation", () => {
    const m = fixture();
    m.scenes.find(scene => scene.id === "early")!.kind = "offstage";
    m.mystery!.clues = [clue({ reinterpretedSceneId: "past" })];
    expect(codes(m)).toContain("clue-before-plant");
    expect(codes(m)).toContain("reinterpret-after-payoff");
    m.mystery!.clues = [clue({ payoffSceneId: null, status: "resolved" })];
    expect(codes(m)).toContain("clue-unresolved");
    m.mystery!.clues[0]!.status = "planned";
    expect(codes(m)).toContain("clue-open");
  });

  it("invalidates intentional acknowledgements when the reported condition changes", () => {
    const m = fixture();
    m.mystery!.clues = [clue({ plantedSceneIds: ["past"] })];
    const issue = auditMystery(m)[0]!;
    m.mystery!.acknowledgements = [{ issueId: issue.id, fingerprint: issue.fingerprint, reason: "後から見せる" }];
    m.narrativeOrder = ["late", "early", "past"];
    const changed = auditMystery(m).find(candidate => candidate.id === issue.id)!;
    expect(changed.fingerprint).not.toBe(issue.fingerprint);
    m.mystery!.deductions = [deduction("d", { factIds: ["f"], holderId: "a" })];
    const first = auditMystery(m).find(candidate => candidate.code === "deduction-knowledge")!;
    m.mystery!.deductions[0]!.holderId = "b";
    expect(auditMystery(m).find(candidate => candidate.id === first.id)?.fingerprint).not.toBe(first.fingerprint);
  });

  it("requires one exact quote match, preserving ambiguity and absence", () => {
    expect(checkMysteryQuote("", "鍵")).toBe("empty");
    expect(checkMysteryQuote("鍵", "鍵は机にある")).toBe("attached");
    expect(checkMysteryQuote("鍵", "鍵と鍵")).toBe("ambiguous");
    expect(checkMysteryQuote("鍵", "手帳")).toBe("missing");
    expect(checkMysteryQuote("aa", "aaa")).toBe("ambiguous");
  });
});

describe("alibi and travel checks", () => {
  it("flags overlap while allowing adjacent intervals, claims and separate clocks", () => {
    const m = fixture();
    m.mystery!.presences = [presence("one", "hall", 60, 90), presence("two", "room", 80, 100)];
    expect(codes(m)).toContain("presence-overlap");
    m.mystery!.presences[1]!.start = 90;
    expect(codes(m)).not.toContain("presence-overlap");
    m.mystery!.presences[1]!.start = 80;
    m.mystery!.presences[1]!.certainty = "claimed";
    expect(codes(m)).not.toContain("presence-overlap");
    m.mystery!.presences[1]!.certainty = "confirmed";
    m.mystery!.presences[1]!.clock = "別の時計";
    expect(codes(m)).not.toContain("presence-overlap");
  });

  it("handles instantaneous sightings, midnight and incomplete records without guesses", () => {
    const m = fixture();
    m.mystery!.presences = [presence("one", "hall", 1440, 1440), presence("two", "room", 1440, 1470)];
    expect(codes(m)).toContain("presence-overlap");
    m.mystery!.presences[1]!.end = 1440;
    expect(codes(m)).toContain("presence-overlap");
    m.mystery!.presences[1]!.start = null;
    expect(codes(m)).not.toContain("presence-overlap");
    m.mystery!.presences[1]!.start = 1500;
    expect(codes(m)).toContain("negative-duration");
  });

  it("uses the shortest known directed path and does not invent missing routes", () => {
    const m = fixture();
    m.mystery!.presences = [presence("one", "hall", 0, 10), presence("two", "gate", 35, 40)];
    expect(codes(m)).not.toContain("travel-time");
    m.mystery!.routes = [
      { id: "r1", fromId: "hall", toId: "room", minutes: 10, bidirectional: false },
      { id: "r2", fromId: "room", toId: "gate", minutes: 20, bidirectional: false },
      { id: "r3", fromId: "hall", toId: "gate", minutes: 50, bidirectional: false }
    ];
    expect(auditMystery(m).find(issue => issue.code === "travel-time")?.ja).toContain("30 分");
    m.mystery!.presences[1]!.start = 40;
    expect(codes(m)).not.toContain("travel-time");
    m.mystery!.presences = [presence("one", "gate", 0, 10), presence("two", "hall", 20, 25)];
    expect(codes(m)).not.toContain("travel-time");
  });
});

describe("evidence and deduction dependencies", () => {
  it("upgrades legacy deductions with empty source links and validates explicit links strictly", () => {
    const b = fixture().mystery!;
    const { custodyIds: _custody, testimonyIds: _testimony, ...legacy } = deduction("d");
    const upgraded = validateMysteryBoard({ ...b, deductions: [legacy] });
    expect(upgraded.deductions[0]).toEqual(deduction("d"));
    for (const links of [{ custodyIds: null }, { testimonyIds: ["../outside"] }, { custodyIds: ["record", "record"] }]) {
      expect(() => validateMysteryBoard({ ...b, deductions: [{ ...legacy, ...links }] })).toThrow();
    }
  });

  it("round-trips evidence and false statement links and preserves deleted-source references for review", async () => {
    const m = fixture();
    m.mystery!.items = [{ id: "receipt", name: "鍵の控え", notes: "原本と区別" }];
    m.mystery!.custody = [{ id: "copy", itemId: "receipt", sceneId: "late", characterId: "b", locationId: null, state: "held", notes: "受領済み" }];
    m.mystery!.testimonies = [{ id: "claim", factId: "f", characterId: "b", sceneId: "early", statement: "紛失した", belief: "返却を知る", intent: "lie", notes: "責任回避" }];
    m.mystery!.deductions = [deduction("d", { sceneId: "late", holderId: "reader", custodyIds: ["copy"], testimonyIds: ["claim"], notes: "発言を要約" })];
    const root = await mkdtemp(join(tmpdir(), "kohon-deduction-sources-"));
    const store = await ProjectStore.create(root, "推理の根拠");
    const saved = await store.saveStoryMap(m, 0);
    const snapshot = await store.checkpoint("物証と証言を参照");
    await store.saveStoryMap({ ...saved, mystery: emptyMysteryBoard() }, saved.revision);
    await store.restore(snapshot.commit!);
    expect((await store.readStoryMap()).mystery?.deductions).toEqual(m.mystery!.deductions);
    expect(saved.mystery?.deductions).toEqual(m.mystery!.deductions);
    expect(saved.mystery?.testimonies[0]?.intent).toBe("lie");
    m.mystery!.custody = [];
    m.mystery!.testimonies = [];
    const retained = validateStoryMap(m);
    expect(retained.mystery?.deductions[0]?.custodyIds).toEqual(["copy"]);
    expect(retained.mystery?.deductions[0]?.testimonyIds).toEqual(["claim"]);
    const issues = auditMystery(retained).filter(issue => issue.code === "missing-reference");
    expect(issues).toHaveLength(2);
  });

  it("checks reader source order without treating a reference as proof of character knowledge", () => {
    const m = fixture();
    m.mystery!.items = [{ id: "receipt", name: "控え", notes: "" }];
    m.mystery!.custody = [{ id: "copy", itemId: "receipt", sceneId: "late", characterId: "b", locationId: null, state: "missing", notes: "" }];
    m.mystery!.testimonies = [{ id: "claim", factId: "f", characterId: "b", sceneId: "past", statement: "", belief: "", intent: "uncertain", notes: "" }];
    m.mystery!.deductions = [deduction("d", { holderId: "reader", custodyIds: ["copy"], testimonyIds: ["claim"] })];
    expect(auditMystery(m).filter(issue => issue.code === "deduction-source-order")).toHaveLength(2);
    m.mystery!.deductions[0]!.sceneId = "past";
    expect(codes(m)).not.toContain("deduction-source-order");
    m.scenes.find(scene => scene.id === "late")!.kind = "offstage";
    expect(codes(m)).toContain("deduction-source-order");
    m.mystery!.deductions[0]!.holderId = "a";
    expect(codes(m)).not.toContain("deduction-source-order");
    expect(m.mystery!.knowledge).toEqual([]);
    expect(m.mystery!.custody[0]!.state).toBe("missing");
  });

  it("checks destroyed objects in chronology regardless of presentation order", () => {
    const m = fixture();
    m.mystery!.items = [{ id: "key", name: "鍵", notes: "" }];
    m.mystery!.custody = [
      { id: "destroy", itemId: "key", sceneId: "past", characterId: null, locationId: "hall", state: "destroyed", notes: "" },
      { id: "carry", itemId: "key", sceneId: "early", characterId: "a", locationId: null, state: "held", notes: "" }
    ];
    expect(codes(m)).toContain("destroyed-item");
    m.mystery!.custody[1]!.sceneId = "past";
    expect(codes(m)).not.toContain("destroyed-item");
  });

  it("checks premise awareness and reader planting, respecting each reasoner's axis", () => {
    const m = fixture();
    m.mystery!.clues = [clue({ plantedSceneIds: ["past"] })];
    m.mystery!.deductions = [
      deduction("d", { holderId: "reader", factIds: ["f"], clueIds: ["cl"], dependsOnIds: ["earlier"] }),
      deduction("earlier", { sceneId: "past" })
    ];
    expect(codes(m)).toContain("deduction-knowledge");
    expect(codes(m)).toContain("deduction-clue");
    expect(codes(m)).toContain("deduction-order");
    m.mystery!.knowledge = [event("a", "a", "past")];
    m.mystery!.deductions[0]!.holderId = "a";
    expect(codes(m)).not.toContain("deduction-knowledge");
    expect(codes(m)).not.toContain("deduction-order");
  });

  it("finds cycles and missing dependencies without recursively traversing long chains", () => {
    const m = fixture();
    m.mystery!.deductions = [deduction("d1", { dependsOnIds: ["d2"] }), deduction("d2", { dependsOnIds: ["d1", "missing"] })];
    expect(codes(m)).toContain("deduction-cycle");
    expect(codes(m)).toContain("missing-reference");
    m.mystery!.deductions = Array.from({ length: 2500 }, (_, index) => deduction(`d${index}`, { dependsOnIds: index === 2499 ? [] : [`d${index + 1}`] }));
    expect(codes(m)).toEqual([]);
  });

  it("keeps acknowledgements saveable for long cycles and does not duplicate broken references", () => {
    const m = fixture();
    m.mystery!.deductions = Array.from({ length: 100 }, (_, index) => deduction(`long-deduction-${index}`, {
      dependsOnIds: [`long-deduction-${(index + 1) % 100}`],
      factIds: ["missing"],
      conclusionFactId: "missing"
    }));
    const issues = auditMystery(m);
    expect(new Set(issues.map(issue => issue.id)).size).toBe(issues.length);
    const cycle = issues.find(issue => issue.code === "deduction-cycle")!;
    expect(cycle.id.length).toBeLessThan(250);
    m.mystery!.acknowledgements = [{ issueId: cycle.id, fingerprint: cycle.fingerprint, reason: "循環を示すため" }];
    expect(validateStoryMap(m)).toEqual(m);
  });
});
