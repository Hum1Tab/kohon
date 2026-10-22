import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import {emptyBeat,emptyStoryMap,newStoryScene,type StoryMap} from "@kohon/project-store/story-map";
import {emptyMysteryBoard,type MysteryBoard} from "@kohon/project-store/mystery";
import {ReaderPreview} from "./ReaderPreview.js";
import {LocaleProvider} from "./LocaleContext.js";

const board:MysteryBoard={...emptyMysteryBoard(),facts:[{id:"photo",title:"写真の時刻",truth:"作者だけの真相",notes:"秘密の裏設定"}],clues:[{id:"clue",title:"時計の反射",factId:"photo",kind:"clue",plantedSceneIds:["first"],reinterpretedSceneId:"middle",payoffSceneId:"last",status:"resolved",interpretation:"初読で17時50分と思う",meaning:"伏線の本当の意味は秘密",quote:"作者用の引用",chapterId:null,checkedVersion:null}],knowledge:[{id:"belief",factId:"photo",holderId:"reader",sceneId:"first",state:"believes",belief:"読者は17時50分と信じる",source:"秘密の情報源",sourceCharacterId:null},{id:"correction",factId:"photo",holderId:"reader",sceneId:"middle",state:"knows",belief:"写真は16時50分だった",source:"写真の照合",sourceCharacterId:null}]};
const map:StoryMap={...emptyStoryMap(),scenes:[newStoryScene("first","提示の場面"),newStoryScene("middle","再解釈の場面"),newStoryScene("last","回収の場面")],narrativeOrder:["first","middle","last"],chronologicalOrder:["last","middle","first"],mystery:board};
const render=(m=map,id="first",locale:"ja"|"en"="ja")=>renderToStaticMarkup(createElement(LocaleProvider,{locale,children:createElement(ReaderPreview,{map:m,viewState:new Map([["reader:position",id]])})}));

it("shows the first impression and the recorded current belief without revealing future corrections or author-only fields",()=>{
  const html=render();
  expect(html).toContain("初読時の印象");expect(html).toContain("初読で17時50分と思う");expect(html).toContain("読者は17時50分と信じる");
  for(const secret of ["写真は16時50分だった","作者だけの真相","秘密の裏設定","伏線の本当の意味は秘密","作者用の引用","秘密の情報源","再解釈を提示済み","回収を提示済み"])expect(html).not.toContain(secret);
});
it("uses narrative order to compare initial impression with the corrected reader knowledge and visible stages",()=>{
  const before=JSON.stringify(map),html=render(map,"last");
  expect(html).toContain("初読で17時50分と思う");expect(html).toContain("写真は16時50分だった");expect(html).toContain("知っている");
  expect(html).toContain("再解釈を提示済み");expect(html).toContain("回収を提示済み");expect(html).not.toContain("読者は17時50分と信じる");
  expect(html).not.toContain("作者だけの真相");expect(html).not.toContain("伏線の本当の意味は秘密");expect(JSON.stringify(map)).toBe(before);
});
it("does not infer knowledge from a payoff and distinguishes missing records from explicitly unknown",()=>{
  const noKnowledge={...map,mystery:{...board,knowledge:[]}};
  expect(render(noKnowledge,"last")).toContain("この情報を読者がどう認識するかは、まだ記録されていません");
  const unknown={...map,mystery:{...board,knowledge:[...board.knowledge,{...board.knowledge[1]!,id:"unknown",sceneId:"last",state:"unknown" as const,belief:"知らないはずの秘密"}]}};
  const html=render(unknown,"last");expect(html).toContain("この時点では知らない、と記録されています");expect(html).not.toContain("知らないはずの秘密");expect(html).not.toContain("写真は16時50分だった");
});
it("excludes offstage knowledge and offstage reframe/payoff markers",()=>{
  const hidden={...map,scenes:map.scenes.map(s=>s.id==="first"?s:{...s,kind:"offstage" as const}),mystery:{...board,knowledge:[...board.knowledge,{...board.knowledge[1]!,id:"offstage",sceneId:"last",belief:"舞台裏の知識"}]}};
  const html=render(hidden,"last");expect(html).toContain("読者は17時50分と信じる");
  for(const text of ["舞台裏の知識","写真は16時50分だった","回収を提示済み","再解釈を提示済み"])expect(html).not.toContain(text);
});
it("recomputes visible clues after reordering and retains unlinked or missing fact references without exposing meaning",()=>{
  const reordered={...map,narrativeOrder:["last","middle","first"]};expect(render(reordered,"last")).not.toContain("時計の反射");
  for(const factId of [null,"deleted"]){const m={...map,mystery:{...board,clues:board.clues.map(c=>({...c,factId}))}};const html=render(m,"last");expect(html).toContain("関連情報が未設定、または参照先がありません");expect(html).not.toContain("伏線の本当の意味は秘密");}
});
it("supports English and keeps the last equal-scene reader update",()=>{
  const m={...map,mystery:{...board,knowledge:[...board.knowledge,{...board.knowledge[1]!,id:"later-entry",state:"suspects" as const,belief:"訂正はまだ疑っている"}]}};
  const html=render(m,"last","en");expect(html).toContain("First impression");expect(html).toContain("Current reader knowledge (related fact)");expect(html).toContain("Suspects");expect(html).toContain("訂正はまだ疑っている");expect(html).not.toContain("写真は16時50分だった");
});
it("links only the currently visible scene to its manuscript and offers its scene settings",()=>{
  const linked={...map,scenes:map.scenes.map(s=>({...s,chapterId:s.id,manuscriptAnchor:{quote:`引用-${s.id}`,prefix:"",suffix:""}}))};
  const manuscript={chapters:linked.scenes.map(s=>({id:s.id,title:`章-${s.id}`})),readChapter:undefined,onOpenChapter:()=>{}};
  const renderLink=(active=true)=>renderToStaticMarkup(createElement(LocaleProvider,{locale:"ja",children:createElement(ReaderPreview,{map:linked,viewState:new Map([["reader:position","middle"]]),manuscript,onEditScene:()=>{},active})}));
  const html=renderLink();expect(html).toContain('aria-label="本文へ: 再解釈の場面 · 章-middle"');expect(html).toContain("リンクした段落へ");expect(html).toContain("この場面の設定");
  expect(html).not.toContain('aria-label="本文へ: 提示の場面');expect(html).not.toContain('aria-label="本文へ: 回収の場面');
  expect(renderLink(false)).not.toContain("本文へ:");expect(renderLink(false)).not.toContain("この場面の設定");
});
it("does not expose an offstage manuscript or a broken chapter navigation button",()=>{
  for(const [kind,chapterId] of [["offstage","hidden"],["scene","deleted"]] as const){
    const m={...map,scenes:map.scenes.map(s=>s.id==="middle"?{...s,kind,chapterId}:s)};
    const html=renderToStaticMarkup(createElement(LocaleProvider,{locale:"ja",children:createElement(ReaderPreview,{map:m,viewState:new Map([["reader:position","middle"]]),manuscript:{chapters:[{id:"hidden",title:"公開しない章名"}],readChapter:undefined,onOpenChapter:()=>{}}})}));
    expect(html).not.toContain("公開しない章名");expect(html).not.toContain("本文へ:");
  }
});
it("counts explicitly unknown and not-yet-recorded facts separately without leaking their names or future contents",()=>{
  const m={...map,mystery:{...board,clues:[],facts:[{id:"secret",title:"秘密の犯人名",truth:"秘密の真相",notes:""},...board.facts],knowledge:[{...board.knowledge[0]!,id:"unknown-secret",factId:"secret",state:"unknown" as const,belief:"知らないのに書かれた秘密"},{...board.knowledge[1]!,sceneId:"last",belief:"未来の訂正内容"}]}};
  const before=JSON.stringify(m);
  const html=render(m);
  expect(html).toContain("「知らない」と記録：1件");expect(html).toContain("この位置まで未記録：1件");
  for(const text of ["秘密の犯人名","秘密の真相","知らないのに書かれた秘密","写真の時刻","未来の訂正内容"])expect(html).not.toContain(text);
  const later=render(m,"last");expect(later).toContain("「知らない」と記録：1件");expect(later).not.toContain("この位置まで未記録");expect(later).toContain("未来の訂正内容");
  expect(render({...m,mystery:{...m.mystery,facts:[m.mystery.facts[0]!]}})).not.toContain("この位置まで未記録");
  expect(render({...map,mystery:emptyMysteryBoard()})).toContain("読者の認識に使う情報は未登録");
  expect(JSON.stringify(m)).toBe(before);
});
it("shows authored surface valence including neutral zero, while hiding all inner values and offstage feelings",()=>{
  for(const [value,label] of [[-40,"快・不快 -40"],[0,"快・不快 0"],[30,"快・不快 +30"]] as const){
    const beat={...emptyBeat("character"),surface:{emotion:"",intensity:null,valence:value,note:""},inner:{emotion:"秘密の怒り",intensity:93,valence:-91,note:"秘密の理由"}};
    const m={...map,characters:[{id:"character",name:"人物",color:"#567890"}],scenes:map.scenes.map(s=>s.id==="first"?{...s,beats:[beat]}:s)};
    const html=render(m);expect(html).toContain(label);expect(html).not.toContain("強さ 93");expect(html).not.toContain("快・不快 -91");expect(html).not.toContain("秘密の怒り");expect(html).not.toContain("秘密の理由");
    expect(render({...m,scenes:m.scenes.map(s=>({...s,kind:"offstage" as const}))})).not.toContain(label);
  }
});
