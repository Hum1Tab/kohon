import {expect,it,vi} from "vitest";
import {newStoryScene} from "@kohon/project-store/story-map";
import {sceneManuscriptDestination} from "./scene-manuscript.js";
const scene={...newStoryScene("scene","貸主への返却","chapter"),manuscriptAnchor:{quote:"五時十分、真木さんは奥の応接室にいた。",prefix:"",suffix:""}};
it("follows a quoted paragraph after prose was inserted before it without mutating the scene",async()=>{
  const before=structuredClone(scene),intro="新しい冒頭。\n🌿",text=intro+scene.manuscriptAnchor.quote+"続き。";
  const read=vi.fn(async()=>({text,version:"revised"}));
  expect(await sceneManuscriptDestination(scene,["chapter"],read)).toEqual({status:"found",chapterId:"chapter",range:{start:intro.length,end:intro.length+scene.manuscriptAnchor.quote.length}});
  expect(read).toHaveBeenCalledWith("chapter");expect(scene).toEqual(before);
});
it("opens the linked chapter when the author has not chosen a paragraph",async()=>{
  const read=vi.fn();expect(await sceneManuscriptDestination(newStoryScene("s","章全体","chapter"),["chapter"],read)).toEqual({status:"found",chapterId:"chapter"});expect(read).not.toHaveBeenCalled();
});
it("does not silently open the chapter when a revision removed its quoted paragraph",async()=>{
  expect(await sceneManuscriptDestination(scene,["chapter"],async()=>({text:"別の段落。",version:"new"}))).toEqual({status:"missing"});
});
it("refuses an ambiguous repeated quote and respects distinguishing context",async()=>{
  const text="前A\n引用\n後A\n前B\n引用\n後B",s={...scene,manuscriptAnchor:{quote:"引用",prefix:"",suffix:""}};
  const read=async()=>({text,version:"current"});
  expect(await sceneManuscriptDestination(s,["chapter"],read)).toEqual({status:"ambiguous"});
  const chosen={...s,manuscriptAnchor:{quote:"引用",prefix:"前B\n",suffix:"\n後B"}};
  expect(await sceneManuscriptDestination(chosen,["chapter"],read)).toEqual({status:"found",chapterId:"chapter",range:{start:text.lastIndexOf("引用"),end:text.lastIndexOf("引用")+2}});
});
it("does not read deleted or unlinked chapters",async()=>{
  const read=vi.fn();expect(await sceneManuscriptDestination(scene,[],read)).toEqual({status:"chapter-missing"});
  expect(await sceneManuscriptDestination(newStoryScene("s","構想"),["chapter"],read)).toEqual({status:"unlinked"});expect(read).not.toHaveBeenCalled();
});
it("preserves read errors and distinguishes an unavailable reader",async()=>{
  expect(await sceneManuscriptDestination(scene,["chapter"],undefined)).toEqual({status:"unavailable"});
  await expect(sceneManuscriptDestination(scene,["chapter"],async()=>{throw new Error("保存失敗");})).rejects.toThrow("保存失敗");
});
