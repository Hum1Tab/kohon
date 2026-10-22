import { emptyBeat, emptyStoryMap, newStoryScene, type StoryMap } from "../packages/project-store/src/story-map.js";
/** Fictional data for UI verification. Never inserted into an author's project automatically. */
export function storyMapDemo(): StoryMap {
  const characters = [{ id: "chinatsu", name: "千夏", color: "#467ca0" }, { id: "ren", name: "蓮", color: "#ac6b4e" }, { id: "mio", name: "澪", color: "#8471b1" }];
  const titles = ["届かなかった手紙", "駅での再会", "笑顔の約束", "雨の夜の告白", "真実を知る", "それぞれの朝"];
  const external = ["蓮は手紙を引き出しにしまう。", "千夏と蓮が三年ぶりに再会する。", "二人は笑って、また会う約束をする。", "澪が、あの夜の出来事を語る。", "千夏は手紙の本当の宛先を知る。", "千夏は自分の言葉で返事を書く。"];
  const internal = ["蓮は拒まれることを恐れている。", "千夏は蓮の沈黙を、無関心だと思っている。", "千夏は嬉しさを隠す。蓮は罪悪感を抑える。", "澪は二人を守るための嘘をやめる。", "怒りの奥に、理解したい気持ちが芽生える。", "答えを急ぐ気持ちが、待つ覚悟へ変わる。"];
  const scenes = titles.map((title, i) => {
    const scene = newStoryScene(`scene-${i + 1}`, title, `chapter-${i + 1}`);
    scene.time = i === 0 ? "三年前・冬" : `${Math.ceil(i / 2)}日目・${i % 2 ? "昼" : "夜"}`;
    scene.surface = external[i]!; scene.inner = internal[i]!; scene.tension = [20, 40, 32, 85, 96, 30][i]!;
    scene.plotline = i === 3 ? "澪の秘密" : "二人の関係"; scene.kind = i === 0 ? "flashback" : "scene";
    scene.beats = characters.flatMap((ch, ci) => {
      if (ci === 2 && i !== 3 && i !== 4) return [];
      const beat = emptyBeat(ch.id);
      beat.surface.emotion = ["平静", "驚き", "喜び", "不安", "怒り", "安堵"][i]!;
      beat.surface.intensity = (ci === 0 ? [12, 55, 30, 60, 85, 25] : ci === 1 ? [25, 35, 50, 65, 40, 20] : [null, null, null, 80, 40, null])[i]!;
      beat.inner.emotion = (ci === 0 ? ["寂しさ", "期待", "嬉しさと不安", "恐れ", "悲しみと理解", "決意"] : ["後悔", "喜び", "罪悪感", "緊張", "救われた気持ち", "希望"])[i]!;
      beat.inner.intensity = (ci === 0 ? [65, 80, 76, 90, 95, 60] : [70, 75, 85, 96, 80, 55])[i]!;
      beat.surface.valence = [-20, 20, 60, -45, -85, 70][i]!; beat.inner.valence = [-65, 55, -30, -90, -45, 85][i]!;
      beat.expression = i === 2 ? "微笑む。けれど視線は合わせない。" : i === 4 ? "唇を噛み、手紙を握りしめる。" : "";
      beat.inner.note = ci === 0 ? internal[i]! : "伝えたい言葉を、まだ選べずにいる。";
      beat.desire = i === 5 ? "自分の言葉で向き合う" : "相手の本心を知りたい";
      return [beat];
    });
    return scene;
  });
  return { ...emptyStoryMap(), characters, scenes, narrativeOrder: ["scene-2", "scene-3", "scene-1", "scene-4", "scene-5", "scene-6"], chronologicalOrder: scenes.map(s => s.id) };
}
