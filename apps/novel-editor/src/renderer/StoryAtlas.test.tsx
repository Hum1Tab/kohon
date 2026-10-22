import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import {emptyStoryMap,emptyBeat,newStoryScene} from "@kohon/project-store/story-map";
import {StoryAtlas} from "./StoryAtlas.js";
import {LocaleProvider} from "./LocaleContext.js";
import type {StoryMapController} from "./useStoryMap.js";
const noop=()=>{};
const beat={...emptyBeat("rio"),surface:{emotion:"笑顔",intensity:20,valence:0,note:""},inner:{emotion:"怒り",intensity:85,valence:-70,note:"秘密の長いメモ"},expression:"袖口を引く"};
const scenes=[{...newStoryScene("first","発見"),time:"18:12",tension:75,beats:[beat]},{...newStoryScene("gap","未設定場面"),beats:[]},{...newStoryScene("last","返却"),beats:[{...beat,inner:{...beat.inner,intensity:0,valence:30}}]}];
const map={...emptyStoryMap(),characters:[{id:"rio",name:"里緒",color:"#567890"}],scenes,narrativeOrder:["first","gap","last"],chronologicalOrder:["last","first","gap"]};
const render=(state:Map<string,unknown>=new Map(),axis:"narrativeOrder"|"chronologicalOrder"="narrativeOrder",locale:"ja"|"en"="ja")=>{
  const c:StoryMapController={map,hydrated:true,status:"saved",error:null,canUndo:false,canRedo:false,change:noop,undo:noop,redo:noop,flush:async()=>{},reload:async()=>{},discardAndReload:async()=>{},viewState:state};
  return renderToStaticMarkup(createElement(LocaleProvider,{locale,children:createElement(StoryAtlas,{controller:c,axis,onAxis:noop,onEdit:noop})}));
};
it("provides a compact scene and character diagram, gaps, and score differences without expanding prose",()=>{
  const html=render();
  expect(html).toContain("発見 · 里緒 · 表 笑顔 · 強さ 20 · 裏 怒り · 強さ 85");
  expect(html).toContain("返却 · 里緒 · 表 笑顔 · 強さ 20 · 裏 怒り · 強さ 0");
  expect(html).toContain("未設定場面 · 里緒 · 表 感情未記録 · 強さ 未記録");
  expect(html).not.toContain("秘密の長いメモ");
  for(const match of html.matchAll(/points="([^"]+)"/gu)) expect(match[1]!.trim().split(/\s+/u)).toHaveLength(1);
  expect(html).toContain('opacity="0.22"');expect(html).toContain("帯：数値の隔たり");
  expect(html).not.toContain("図の強さを記録");
});
it("uses chronology without editing the map or its independent narrative order",()=>{
  const html=render(new Map(),"chronologicalOrder");
  expect(html.indexOf('Select scene')).toBe(-1);
  expect(html.indexOf('場面を選ぶ: 返却')).toBeLessThan(html.indexOf('場面を選ぶ: 発見'));
  expect(map.narrativeOrder).toEqual(["first","gap","last"]);
});
it("shows negative valence and neutral zero, and reveals only the selected person's detail",()=>{
  const state=new Map<string,unknown>([["atlas:metric","valence"],["atlas:selection",{sceneId:"first",characterId:"rio"}]]);
  const html=render(state);
  expect(html).toContain("快・不快 0");expect(html).toContain("快・不快 -70");
  expect(html).toContain("0 中立");expect(html).toContain("秘密の長いメモ");expect(html).toContain("袖口を引く");
  expect(html).toContain("詳しく編集");
  expect(html).toContain("図の快・不快を記録");expect(html).toContain('value="-70"');expect(html).toContain('value="0"');
});
it("supports English labels",()=>{
  expect(render(new Map(),"narrativeOrder","en")).toContain("Surface: shown feelings");
});
it("opens the time braid with both scene orders while retaining the selected person's score editor",()=>{
  const state=new Map<string,unknown>([["atlas:braid",true],["atlas:selection",{sceneId:"first",characterId:"rio"}]]);
  const html=render(state);
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain("語る順 × 起きた順");
  expect(html).toContain("読者順 1 → 時系列 2 · 発見");
  expect(html).toContain("図の強さを記録");
  expect(render()).not.toContain("語る順 × 起きた順");
});
it("does not attribute a scene's events to an unrecorded character",()=>{
  const html=render(new Map([["atlas:selection",{sceneId:"gap",characterId:"rio"}]]));
  expect(html).toContain("この人物の感情は未記録");
  expect(html).toContain("この人物の心情は未記録");
  expect(html).toContain("図の強さを記録");expect(html).toContain('placeholder="未記録"');
});
it("retains score drafts per scene and person and reports stale values without changing the map",()=>{
  const state=new Map<string,unknown>([["atlas:selection",{sceneId:"first",characterId:"rio"}],[`atlas:scores:${JSON.stringify(["first","rio","intensity"])}`,{base:{surface:20,inner:80},fields:{surface:"30",inner:"70"}}]]);
  const html=render(state);expect(html).toContain('value="30"');expect(html).toContain("記録済みの値が変わりました");expect(html).toContain("入力を戻す");
  expect(map.scenes[0]!.beats[0]!.surface.intensity).toBe(20);
});
it("reveals manuscript navigation only for the selected scene in the overview",()=>{
  const selectedMap={...map,scenes:map.scenes.map(s=>({...s,chapterId:"chapter",manuscriptAnchor:{quote:"原稿の引用",prefix:"",suffix:""}}))};
  const state=new Map<string,unknown>([["atlas:selection",{sceneId:"first",characterId:"rio"}]]);
  const c:StoryMapController={map:selectedMap,hydrated:true,status:"saved",error:null,canUndo:false,canRedo:false,change:noop,undo:noop,redo:noop,flush:async()=>{},reload:async()=>{},discardAndReload:async()=>{},viewState:state};
  const html=renderToStaticMarkup(createElement(LocaleProvider,{locale:"ja",children:createElement(StoryAtlas,{controller:c,axis:"narrativeOrder",onAxis:noop,onEdit:noop,manuscript:{chapters:[{id:"chapter",title:"原稿の章"}],readChapter:undefined,onOpenChapter:noop}})}));
  expect(html).toContain('aria-label="本文へ: 発見 · 原稿の章"');
  expect(html).toContain("リンクした段落へ");expect(html).not.toContain('aria-label="本文へ: 返却');
});
