import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NodeProjectStore as ProjectStore } from "./node.js";
import {
  createSceneAnchor,
  curveSegments,
  emptyBeat,
  emptyStoryMap,
  hasRecordedBeat,
  moveStoryScene,
  newStoryScene,
  removeStoryScene,
  resolveSceneAnchor,
  updateCharacterBeat,
  validateStoryMap
} from "./story-map.js";

const fixture = () => ({
  ...emptyStoryMap(),
  characters: [{ id: "a", name: "太郎", color: "#467ca0" }],
  scenes: ["first", "second", "third"].map((id) => ({ ...newStoryScene(id, id), beats: [emptyBeat("a")] })),
  narrativeOrder: ["third", "first", "second"],
  chronologicalOrder: ["first", "second", "third"]
});
const project = async () => ProjectStore.create(await mkdtemp(join(tmpdir(), "kohon-story-")), "物語");

describe("story map data and order", () => {
  it("retains reader-facing character order and unrelated notes when an existing feeling changes", () => {
    const first = {
      ...emptyBeat("rio"),
      expression: "手が止まる",
      inner: { emotion: "恐れ", intensity: 80, valence: null, note: "自分の責任を隠した" }
    };
    const other = emptyBeat("nao");
    const original = structuredClone([first, other]);
    const next = updateCharacterBeat([first, other], "rio", {
      surface: { emotion: "気づいた平静", intensity: 35, valence: null, note: "声を落とす" }
    });
    expect(next.map(beat => beat.characterId)).toEqual(["rio", "nao"]);
    expect(next[0]!.inner).toEqual(first.inner);
    expect(next[0]!.expression).toBe(first.expression);
    expect(next[1]).toBe(other);
    expect([first, other]).toEqual(original);
  });

  it("appends a newly recorded character without fabricating missing scores or duplicating later edits", () => {
    const next = updateCharacterBeat([emptyBeat("rio")], "nao", { expression: "袖を引く" });
    expect(next.map(beat => beat.characterId)).toEqual(["rio", "nao"]);
    expect(next[1]!.surface.intensity).toBeNull();
    const edited = updateCharacterBeat(next, "nao", { desire: "仕事を守りたい" });
    expect(edited).toHaveLength(2);
    expect(edited[1]!.expression).toBe("袖を引く");
  });

  it("follows paragraph edits before the quote, distinguishes repeated text with context, and refuses stale or ambiguous targets", () => {
    const text = "🙂朝\n同じ返事。\n同じ返事。\n夜";
    const quoteStart = text.lastIndexOf("同じ返事。");
    const anchor = createSceneAnchor(text, quoteStart, quoteStart + "同じ返事。".length)!;
    expect(anchor.quote).toBe("同じ返事。");
    expect(resolveSceneAnchor("前書き\n" + text, anchor)).toEqual({
      status: "found",
      start: "前書き\n".length + quoteStart,
      end: "前書き\n".length + quoteStart + "同じ返事。".length
    });
    expect(resolveSceneAnchor(text, { quote: "同じ返事。", prefix: "", suffix: "" })).toEqual({ status: "ambiguous" });
    expect(resolveSceneAnchor("書き直した本編", anchor)).toEqual({ status: "missing" });
    expect(createSceneAnchor("第一段落\n第二段落", 8, 8)?.quote).toBe("第二段落");
    expect(createSceneAnchor("\n\n", 1, 1)).toBeNull();
    expect(createSceneAnchor("あ".repeat(4001), 0, 4001)).toBeNull();
    expect(hasRecordedBeat(emptyBeat("a"))).toBe(false);
    expect(hasRecordedBeat({ ...emptyBeat("a"), inner: { emotion: "", note: "", valence: null, intensity: 0 } })).toBe(true);
  });

  it("preserves optional anchors in validated maps and rejects malformed or unlinked quotes", () => {
    const map = fixture();
    map.scenes[0]!.chapterId = "chapter-1";
    map.scenes[0]!.manuscriptAnchor = { quote: "対象の段落", prefix: "前", suffix: "後" };
    expect(validateStoryMap(map)).toEqual(map);
    expect(validateStoryMap(fixture()).scenes[0]).not.toHaveProperty("manuscriptAnchor");
    for (const anchor of [null, { quote: "", prefix: "", suffix: "" }, { quote: "本編", prefix: "長".repeat(65), suffix: "" }]) {
      expect(() => validateStoryMap({ ...map, scenes: [{ ...map.scenes[0], manuscriptAnchor: anchor }, ...map.scenes.slice(1)] })).toThrow();
    }
    expect(() => validateStoryMap({ ...map, scenes: [{ ...map.scenes[0], chapterId: null }, ...map.scenes.slice(1)] })).toThrow();
  });

  it("preserves unfinished brainstorming verbatim without treating it as validated scene titles", () => {
    const sceneDraft = { text: `  まだ名前を決めない\n${"あ".repeat(201)}\n`, plotline: "あとで考える" };
    expect(validateStoryMap({ ...fixture(), sceneDraft }).sceneDraft).toEqual(sceneDraft);
    expect(validateStoryMap(fixture())).not.toHaveProperty("sceneDraft");
    for (const invalid of [null, [], { text: 123, plotline: "" }, { text: "x".repeat(1005001), plotline: "" }, { text: "", plotline: "x".repeat(201) }]) {
      expect(() => validateStoryMap({ ...fixture(), sceneDraft: invalid })).toThrow();
    }
  });

  it("preserves empty plotline lanes without migrating old maps, and rejects duplicate or malformed names", () => {
    expect(validateStoryMap({ ...fixture(), plotlines: ["本編", "まだ場面のない筋"] }).plotlines).toEqual(["本編", "まだ場面のない筋"]);
    expect(validateStoryMap(fixture())).not.toHaveProperty("plotlines");
    for (const plotlines of [["同じ筋", "同じ筋"], [""], [123]]) expect(() => validateStoryMap({ ...fixture(), plotlines })).toThrow();
  });

  it("moves at both boundaries while keeping chronology and observations intact", () => {
    const map = fixture();
    const moved = moveStoryScene(map, "narrativeOrder", "third", 3);
    expect(moved.narrativeOrder).toEqual(["first", "second", "third"]);
    expect(moved.chronologicalOrder).toEqual(map.chronologicalOrder);
    expect(moved.scenes).toBe(map.scenes);
    expect(moveStoryScene(moved, "narrativeOrder", "third", 0).narrativeOrder).toEqual(map.narrativeOrder);
    expect(moveStoryScene(map, "chronologicalOrder", "first", 2).chronologicalOrder).toEqual(["second", "first", "third"]);
    expect(moveStoryScene(map, "narrativeOrder", "missing", 0)).toBe(map);
    expect(moveStoryScene(map, "narrativeOrder", "first", -1)).toBe(map);
  });

  it("removes observations and scene IDs from both axes", () => {
    const map = removeStoryScene(fixture(), "first");
    expect(map.scenes.map(scene => scene.id)).toEqual(["second", "third"]);
    expect(map.narrativeOrder).toEqual(["third", "second"]);
    expect(validateStoryMap(map)).toEqual(map);
  });

  it("breaks lines across unknown values and preserves a recorded zero", () => {
    expect(curveSegments([0, 100, null, 50], 100, 108)).toEqual(["50,96 150,12", "350,54"]);
    expect(curveSegments([null, null], 100, 108)).toEqual([]);
    expect(curveSegments([-100, 0, 100], 100, 108, true)).toEqual(["50,96 150,54 250,12"]);
  });

  it("rejects malformed values, dangling character references and duplicate or incomplete orders", () => {
    const map = fixture();
    const invalid = [
      { ...map, schemaVersion: 2 },
      { ...map, revision: -1 },
      { ...map, narrativeOrder: ["third", "first", "first"] },
      { ...map, chronologicalOrder: ["first", "second"] },
      { ...map, characters: [] },
      { ...map, scenes: [map.scenes[0], map.scenes[0]] },
      { ...map, characters: [{ id: "../outside", name: "人", color: "#467ca0" }] }
    ];
    for (const value of invalid) expect(() => validateStoryMap(value)).toThrow();
    for (const value of [-1, 101, 2.5, "100", NaN]) {
      const bad = structuredClone(map);
      bad.scenes[0]!.tension = value as number;
      expect(() => validateStoryMap(bad)).toThrow();
    }
    expect(validateStoryMap(map).scenes[0]!.beats[0]!.inner.intensity).toBeNull();
  });
});

describe("story map persistence", () => {
  it("saves paragraph anchors across reopen and restore without changing manuscript text", async () => {
    const store = await project();
    const body = "朝の段落\n夜の段落";
    const chapter = await store.createChapter("第一章", body);
    const map = fixture();
    map.scenes[0]!.chapterId = chapter.id;
    map.scenes[0]!.manuscriptAnchor = createSceneAnchor(body, 6, 6)!;
    await store.saveStoryMap(map, 0);
    const checkpoint = await store.checkpoint("段落リンクあり");
    expect((await new ProjectStore(store.root).readStoryMap()).scenes[0]!.manuscriptAnchor).toEqual(map.scenes[0]!.manuscriptAnchor);
    await store.saveStoryMap(fixture(), 1);
    await store.restore(checkpoint.commit!);
    expect((await store.readStoryMap()).scenes[0]!.manuscriptAnchor).toEqual(map.scenes[0]!.manuscriptAnchor);
    expect(await store.readChapter(chapter.id)).toBe(body);
  });

  it("saves unfinished ideas across reopen and checkpoint restore without changing the manuscript", async () => {
    const store = await project();
    const chapter = await store.createChapter("第一章", "執筆中の本編");
    const sceneDraft = { text: "  告白から始める？\n真相はまだ決めない\n", plotline: "" };
    await store.saveStoryMap({ ...fixture(), sceneDraft }, 0);
    expect((await new ProjectStore(store.root).readStoryMap()).sceneDraft).toEqual(sceneDraft);
    const checkpoint = await store.checkpoint("構想の途中");
    await store.saveStoryMap({ ...fixture(), sceneDraft: { text: "別案", plotline: "" } }, 1);
    await store.restore(checkpoint.commit!);
    expect(await store.readStoryMap()).toMatchObject({ sceneDraft, revision: 3 });
    expect(await store.readChapter(chapter.id)).toBe("執筆中の本編");
  });

  it("opens old projects without migration, saves locally and leaves chapters and metadata intact", async () => {
    const store = await project();
    const chapter = await store.createChapter("第一章", "作者の本編");
    await store.updateChapterMetadata(chapter.id, { summary: "あらすじ", characters: ["太郎"] });
    const manifest = await store.manifest();
    expect(await store.readStoryMap()).toEqual(emptyStoryMap());
    const map = { ...fixture(), plotlines: ["本編", "まだ場面のない筋"] };
    map.scenes[0]!.chapterId = chapter.id;
    const saved = await store.saveStoryMap(map, 0);
    expect(saved.revision).toBe(1);
    expect(await new ProjectStore(store.root).readStoryMap()).toEqual(saved);
    expect(await store.manifest()).toEqual(manifest);
    expect(await store.readChapter(chapter.id)).toBe("作者の本編");
    expect(JSON.parse(await readFile(join(store.root, "notes/story-map.json"), "utf8"))).toEqual(saved);
  });

  it("serializes simultaneous writes from separate instances and rejects stale revision", async () => {
    const store = await project();
    const other = new ProjectStore(store.root);
    const outcomes = await Promise.allSettled([
      store.saveStoryMap(fixture(), 0),
      other.saveStoryMap({ ...fixture(), narrativeOrder: ["first", "third", "second"] }, 0)
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((await store.readStoryMap()).revision).toBe(1);
  });

  it("never overwrites damaged JSON and validates writes before changing the saved file", async () => {
    const store = await project();
    await store.saveStoryMap(fixture(), 0);
    const path = join(store.root, "notes/story-map.json");
    const before = await readFile(path, "utf8");
    await expect(store.saveStoryMap({ ...fixture(), narrativeOrder: [] }, 1)).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe(before);
    await writeFile(path, "{");
    await expect(store.readStoryMap()).rejects.toThrow();
    await expect(store.saveStoryMap(fixture(), 1)).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe("{");
  });

  it("includes planning in checkpoints and restores it with a new revision", async () => {
    const store = await project();
    await store.saveStoryMap(fixture(), 0);
    const checkpoint = await store.checkpoint("回想を移す前");
    await store.saveStoryMap(moveStoryScene(fixture(), "narrativeOrder", "third", 3), 1);
    await store.restore(checkpoint.commit!);
    expect(await store.readStoryMap()).toMatchObject({ narrativeOrder: fixture().narrativeOrder, revision: 3 });
    expect((await store.history()).some(entry => entry.subject.startsWith("Safety checkpoint"))).toBe(true);
  });

  it("keeps planning when a linked chapter is deleted so the UI can show the missing link", async () => {
    const store = await project();
    const chapter = await store.createChapter("章", "本編");
    const map = fixture();
    map.scenes[0]!.chapterId = chapter.id;
    await store.saveStoryMap(map, 0);
    await store.deleteChapter(chapter.id);
    expect((await store.readStoryMap()).scenes[0]!.chapterId).toBe(chapter.id);
  });
});
