import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import {emptyBeat,newStoryScene, type StoryScene} from "@kohon/project-store/story-map";
import {StoryAtlasOverview,overviewSceneIndex} from "./StoryAtlasOverview.js";
import {LocaleProvider} from "./LocaleContext.js";

const scenes=Array.from({length:180},(_,i)=>({...newStoryScene(`s${i}`,`場面${i+1}`),tension:i===179?100:0}));
const character={id:"rio",name:"里緒",color:"#567890"};
const render=(list:readonly StoryScene[]=scenes,person:typeof character|undefined=undefined,metric:"intensity"|"valence"="intensity",locale:"ja"|"en"="ja")=>renderToStaticMarkup(createElement(LocaleProvider,{locale,children:createElement(StoryAtlasOverview,{scenes:list,start:144,character:person,metric,onReveal:()=>{}})}));

it("keeps all 180 scenes in the overview while providing bounded range controls",()=>{
  const html=render();
  expect(html).toContain("全体の緊張 · 全180場面");
  expect(html.match(/<button /gu)).toHaveLength(8);
  expect(html).toContain('aria-label="169–180場面を表示"');
  expect(html).toContain('aria-label="145–168場面を表示" aria-pressed="true"');
  const points=html.match(/points="([^"]+)"/u)![1]!.split(" ");
  expect(points).toHaveLength(180);
  expect(points[179]!.split(",")[1]).toBe("12");
});
it("breaks both character curves at missing values and preserves zero and negative valence",()=>{
  const list:StoryScene[]=scenes.slice(0,25).map(s=>({...s,tension:100,beats:[]}));
  list[0]={...list[0]!,beats:[{...emptyBeat(character.id),surface:{emotion:"平静",intensity:0,valence:0,note:""},inner:{emotion:"怒り",intensity:80,valence:-100,note:""}}]};
  list[2]={...list[2]!,beats:[{...emptyBeat(character.id),surface:{emotion:"",intensity:50,valence:50,note:""},inner:{emotion:"",intensity:null,valence:null,note:""}}]};
  const html=render(list,character,"valence");
  expect(html).toContain("里緒の表と裏 · 全25場面");
  expect(html).not.toContain("polyline");
  expect(html.match(/<circle /gu)).toHaveLength(3);
  expect(html).toContain('cx="20" cy="32"');
  expect(html).toContain('cx="20" cy="52"');
});
it("does not create a duplicate overview for a short story",()=>{
  expect(render(scenes.slice(0,24))).toBe("");
});
it("uses the supplied chronology without changing either scenes or observations",()=>{
  const reversed=scenes.toReversed(),before=JSON.stringify(reversed);
  const html=render(reversed,undefined,"intensity","en");
  expect(html).toContain("Story tension · all 180 scenes");
  expect(html).toContain('title="場面180 → 場面157"');
  expect(html.match(/points="([^"]+)"/u)![1]!.split(" ")[0]!.split(",")[1]).toBe("12");
  expect(JSON.stringify(reversed)).toBe(before);
});
it("maps chart positions to scene indexes, including the last partial range",()=>{
  expect(overviewSceneIndex(0,1000,180)).toBe(0);
  expect(overviewSceneIndex(805,1000,180)).toBe(144);
  expect(overviewSceneIndex(999,1000,180)).toBe(179);
  expect(overviewSceneIndex(1000,1000,180)).toBe(179);
  expect(overviewSceneIndex(-12,1000,180)).toBe(0);
  expect(overviewSceneIndex(1,0,180)).toBeNull();
  expect(overviewSceneIndex(NaN,1000,180)).toBeNull();
  expect(overviewSceneIndex(1,1000,0)).toBeNull();
});
