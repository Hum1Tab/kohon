import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import {newStoryScene,type StoryScene} from "@kohon/project-store/story-map";
import {SceneManuscriptLink} from "./SceneManuscriptLink.js";
import {LocaleProvider} from "./LocaleContext.js";
const render=(scene:StoryScene,locale:"ja"|"en"="ja")=>renderToStaticMarkup(createElement(LocaleProvider,{locale,children:createElement(SceneManuscriptLink,{scene,chapters:[{id:"chapter",title:"受け取った人"}],readChapter:undefined,onOpenChapter:()=>{}})}));
it("distinguishes opening a chapter from revealing its linked paragraph",()=>{
  const scene=newStoryScene("s","返却","chapter");
  expect(render(scene)).toContain("この章の本文を開く");
  const html=render({...scene,manuscriptAnchor:{quote:"引用",prefix:"",suffix:""}});
  expect(html).toContain("リンクした段落へ");expect(html).toContain('aria-label="本文へ: 返却 · 受け取った人"');
});
it("offers no unusable navigation button for unlinked or deleted chapters",()=>{
  const unlinked=render(newStoryScene("s","構想")),missing=render(newStoryScene("s","過去の章","deleted"));
  expect(unlinked).toContain("本文の章は未リンクです。");expect(missing).toContain("リンク先の章がありません。");
  expect(unlinked).not.toContain("<button");expect(missing).not.toContain("<button");
});
it("provides English navigation labels",()=>{
  expect(render(newStoryScene("s","返却","chapter"),"en")).toContain("Open chapter manuscript");
});
