// Creates a fresh, disposable manuscript for desktop UI checks. Never opens real projects.
import { mkdir, mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { ProjectStore } from "../apps/novel-editor/node_modules/@kohon/project-store/dist/index.js";

const cache = fileURLToPath(new URL("../.cache/", import.meta.url));
await mkdir(cache, { recursive: true });
const root = await mkdtemp(join(cache, "ux-manuscript-"));
const store = await ProjectStore.create(root, "雨のあと、言葉のつづき");
await store.createChapter("第一章　雨の匂い", "　雨がやんだのは、午後三時を少し過ぎたころだった。\n\n　窓辺に置いたノートを開く。白いページの向こうで、街の音がゆっくりと戻ってくる。傘を閉じる音、自転車のベル、遠くから聞こえる誰かの笑い声。\n\n「続きを書こう」\n\n　そう口に出してみると、昨日まで動かなかった物語が、ほんの少しだけ先へ進んだ。\n");
await store.createChapter("第二章　手紙", "　机の引き出しに、一通の手紙が残されていた。\n\n　宛名には見覚えのある筆跡で、ただ一言、『あなたへ』と書かれている。\n");
await store.createChapter("駅での再会", "　改札の向こうに、懐かしい横顔が見えた。\n", "scene");
await store.updateSettings({ writingMode: "horizontal", theme: "paper" });
await store.checkpoint("UI確認用の初期原稿");
console.log(join(root, "kohon.json"));
