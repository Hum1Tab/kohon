import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import {emptyStoryMap,newStoryScene,type StoryMap} from "@kohon/project-store/story-map";
import {LocaleProvider} from "./LocaleContext.js";
import {StoryTimeBraid} from "./StoryTimeBraid.js";

const map:StoryMap={...emptyStoryMap(),scenes:[newStoryScene("a","現在"),{...newStoryScene("b","過去"),kind:"flashback"},{...newStoryScene("c","隠れた事件"),kind:"offstage"}],narrativeOrder:["a","b","c"],chronologicalOrder:["b","c","a"]};
const render=(m=map,selectedId:string|undefined="a",locale:"ja"|"en"="ja")=>renderToStaticMarkup(createElement(LocaleProvider,{locale,children:createElement(StoryTimeBraid,{map:m,selectedId,onReveal:()=>{}})}));

it("connects each scene's independent narrative and chronology ranks without editing the story",()=>{
  const before=JSON.stringify(map),html=render();
  expect(html).toContain("読者順 1 → 時系列 3 · 現在");
  expect(html).toContain("読者順 2 → 時系列 1 · 過去");
  expect(html).toContain('d="M 166.66666666666666 0 C 166.66666666666666 26 833.3333333333334 26 833.3333333333334 52"');
  expect(html.match(/class="is-highlighted"/gu)).toHaveLength(1);
  expect(html.match(/aria-pressed="true" tabindex="0"/gu)).toHaveLength(2);
  expect(JSON.stringify(map)).toBe(before);
});
it("marks offstage scenes while drawing every scene and explaining rank instead of elapsed time",()=>{
  const html=render(map,"c");
  expect(html.match(/<path /gu)).toHaveLength(3);
  expect(html).toContain('stroke-dasharray="4 3"');
  expect(html).toContain("選択中は舞台裏の場面（破線）");
  expect(html).toContain("時間の長さは表しません");
});
it("keeps all 180 scenes with a scene selector and only one keyboard tab stop per rail",()=>{
  const scenes=Array.from({length:180},(_,i)=>newStoryScene(`s${i}`,`場面${i+1}`));
  const m={...emptyStoryMap(),scenes,narrativeOrder:scenes.map(s=>s.id),chronologicalOrder:scenes.toReversed().map(s=>s.id)};
  const html=render(m,"s179");
  expect(html.match(/<path /gu)).toHaveLength(180);
  expect(html.match(/<option /gu)).toHaveLength(180);
  expect(html.match(/tabindex="0"/gu)).toHaveLength(2);
  expect(html).toContain("場面180 · 読者順 180 → 時系列 1");
  expect(html).toContain("is-dense");
});
it("handles an empty story and a deleted selection and supports English",()=>{
  expect(render(emptyStoryMap())).toBe("");
  const html=render(map,"deleted","en");
  expect(html).toContain("Narrative 1 → Chronology 3");
  expect(html).toContain("Ranks show order, not elapsed time");
  expect(html).not.toContain("deleted");
});
