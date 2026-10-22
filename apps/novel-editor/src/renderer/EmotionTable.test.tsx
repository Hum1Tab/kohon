import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { emptyBeat, emptyStoryMap, newStoryScene } from "@kohon/project-store/story-map";
import { LocaleProvider } from "./LocaleContext.js";
import { EmotionTable } from "./EmotionTable.js";
import type { StoryMapController } from "./useStoryMap.js";

const noop = () => {};
const map = { ...emptyStoryMap(), characters: [{ id: "a", name: "澄", color: "#467ca0" }], scenes: Array.from({ length: 50 }, (_, i) => ({ ...newStoryScene(`s-${i}`, `場面${i}`), beats: i === 0 ? [{ ...emptyBeat("a"), inner: { emotion: "恐怖", note: "笑顔に隠す", intensity: 0, valence: null } }] : [] })), narrativeOrder: Array.from({ length: 50 }, (_, i) => `s-${i}`), chronologicalOrder: Array.from({ length: 50 }, (_, i) => `s-${49 - i}`) };
const controller: StoryMapController = { map, hydrated: true, status: "saved", error: null, canUndo: false, canRedo: false, change: noop, undo: noop, redo: noop, flush: async () => {}, reload: async () => {}, discardAndReload: async () => {} };
const render = (axis: "narrativeOrder" | "chronologicalOrder") => renderToStaticMarkup(createElement(LocaleProvider, { locale: "ja", children: createElement(EmotionTable, { controller, axis, onAxis: noop, onScene: noop }) }));
it("shows every emotional layer together, distinguishes calm zero from missing scores, and names fields by scene and character", () => {
  const html = render("narrativeOrder");
  expect(html).toContain('aria-label="場面0 · 澄 · 表 強さ" value=""');
  expect(html).toContain('aria-label="場面0 · 澄 · 裏 強さ" value="0"');
  for (const label of ["表の感情", "表での感情の動き", "表情・仕草", "裏の感情", "隠れた心情", "求めているもの", "笑顔に隠す"]) expect(html).toContain(label);
});
it("uses the chosen chronology and limits editable rows while retaining navigation to all scenes", () => {
  const html = render("chronologicalOrder");
  expect((html.match(/scope="row"/gu) ?? []).length).toBe(24);
  expect(html).toContain('aria-label="場面49 · 澄 · 裏 強さ"');
  expect(html).not.toContain('aria-label="場面0 · 澄 · 裏 強さ"');
  expect(html).toContain("1–24 / 50");
});
