import { emptyBeat, emptyStoryMap, newStoryScene, STORY_COLORS, type StoryMap } from "../packages/project-store/src/story-map.js";
import { emptyMysteryBoard } from "../packages/project-store/src/mystery.js";

export function genrePlanningDemo(genre: "romance" | "fantasy" | "history" | "mystery"): StoryMap {
  const names = { romance: ["すれ違い", "告白", "届かなかった約束"], fantasy: ["旅の始まり", "魔法の代償", "王家の秘密"], history: ["密約", "過去の戦場", "使者の決断"], mystery: ["証言", "事件の前夜", "犯人の行動"] }[genre];
  const map = emptyStoryMap(); map.characters = [{ id: "p", name: "主人公", color: STORY_COLORS[0] }]; map.plotlines = [names[0]!];
  map.scenes = names.map((name, i) => ({ ...newStoryScene(`g${i}`, name), time: genre === "fantasy" ? `第三紀 ${i + 1}の月` : `${i + 1}日目`, plotline: names[0]!, kind: i === 2 ? "offstage" : i === 1 ? "flashback" : "scene", surface: `VISIBLE-${genre}-${i}`, inner: `SECRET-${genre}-${i}`, beats: [{ ...emptyBeat("p"), surface: { emotion: "期待", intensity: 40, valence: null, note: "表に見える心情" }, inner: { emotion: "不安", intensity: 80, valence: null, note: `SECRET-EMOTION-${genre}` }, expression: "微笑み", desire: `SECRET-DESIRE-${genre}` }] }));
  map.narrativeOrder = ["g0", "g1", "g2"]; map.chronologicalOrder = ["g1", "g0", "g2"];
  const b = emptyMysteryBoard(); map.mystery = b;
  b.facts = [{ id: "f", title: "約束の意味", truth: `SECRET-TRUTH-${genre}`, notes: `SECRET-NOTES-${genre}` }];
  b.knowledge = [
    { id: "k0", factId: "f", holderId: "p", sceneId: "g0", state: "knows", belief: `SECRET-CHARACTER-${genre}`, source: "", sourceCharacterId: null },
    { id: "k1", factId: "f", holderId: "reader", sceneId: "g1", state: "misunderstands", belief: `BELIEF-${genre}`, source: "会話", sourceCharacterId: null },
    { id: "k2", factId: "f", holderId: "reader", sceneId: "g2", state: "knows", belief: `SECRET-OFFSTAGE-${genre}`, source: "", sourceCharacterId: null },
  ];
  b.clues = [{ id: "cl", title: "約束の品", factId: "f", kind: "clue", plantedSceneIds: ["g0"], reinterpretedSceneId: "g1", payoffSceneId: "g2", status: "planned", interpretation: "大切な贈り物", meaning: `SECRET-MEANING-${genre}`, quote: "", chapterId: null, checkedVersion: null }];
  b.testimonies = [{ id: "t", factId: "f", characterId: "p", sceneId: "g0", statement: "約束を守る", belief: "約束は続いている", intent: "truthful", notes: "" }];
  b.deductions = [{ id: "d", title: "約束についての結論", sceneId: "g1", holderId: "reader", factIds: [], clueIds: ["cl"], custodyIds: [], testimonyIds: [], dependsOnIds: [], conclusionFactId: "f", notes: "", alternatives: "" }];
  return map;
}

export function longPlanningDemo(): StoryMap {
  const map = emptyStoryMap();
  map.characters = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `人物${i + 1}`, color: STORY_COLORS[i % STORY_COLORS.length]! }));
  map.plotlines = Array.from({ length: 30 }, (_, i) => `筋${i + 1}`);
  map.scenes = Array.from({ length: 180 }, (_, i) => ({ ...newStoryScene(`l${i}`, `長編の場面${i + 1}`), plotline: map.plotlines![i % 30]!, surface: `出来事${i + 1}`, beats: map.characters.map(ch => emptyBeat(ch.id)) }));
  map.narrativeOrder = map.scenes.map(s => s.id); map.chronologicalOrder = [...map.narrativeOrder].reverse();
  const b = emptyMysteryBoard(); map.mystery = b;
  b.facts = Array.from({ length: 120 }, (_, i) => ({ id: `f${i}`, title: `情報${i + 1}`, truth: "裏設定", notes: "" }));
  b.knowledge = b.facts.map((f, i) => ({ id: `k${i}`, factId: f.id, holderId: "reader", sceneId: "l0", state: "believes", belief: `最初の認識${i + 1}`, source: "", sourceCharacterId: null }));
  b.clues = b.facts.map((f, i) => ({ id: `cl${i}`, title: `伏線${i + 1}`, factId: f.id, kind: "clue", plantedSceneIds: ["l0"], reinterpretedSceneId: null, payoffSceneId: "l179", status: "planned", interpretation: "初読の印象", meaning: "意味", quote: "", chapterId: null, checkedVersion: null }));
  return map;
}
