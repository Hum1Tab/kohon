import {expect,it} from "vitest";
import {emptyBeat,emptyStoryMap,newStoryScene} from "@kohon/project-store/story-map";
import {applyAtlasScores,parseAtlasScores} from "./atlas-scores.js";
import {StoryMapSession} from "./story-map-session.js";

const beat={...emptyBeat("rio"),surface:{emotion:"平静",intensity:20,valence:0,note:"表の説明"},inner:{emotion:"怒り",intensity:85,valence:-70,note:"裏の説明"},expression:"袖口を引く",desire:"帰りたい"};
const map={...emptyStoryMap(),revision:3,characters:[{id:"rio",name:"里緒",color:"#123456"},{id:"nao",name:"奈緒",color:"#654321"}],scenes:[{...newStoryScene("first","発見"),beats:[beat,emptyBeat("nao")]},newStoryScene("last","返却")],narrativeOrder:["first","last"],chronologicalOrder:["last","first"]};

it("distinguishes blank, zero, signed scores, and invalid/partial numeric input",()=>{
  expect(parseAtlasScores({surface:"",inner:"0"},"intensity")).toEqual({surface:null,inner:0});
  expect(parseAtlasScores({surface:" -100 ",inner:"+100"},"valence")).toEqual({surface:-100,inner:100});
  for(const value of ["-1","101","1.5","1e2","+","NaN","Infinity","0x10"])
    expect(parseAtlasScores({surface:value,inner:""},"intensity")).toBeNull();
  expect(parseAtlasScores({surface:"-101",inner:""},"valence")).toBeNull();
});
it("edits only the selected metric in place, preserving other people, fields and both orders",()=>{
  const before=structuredClone(map);
  const result=applyAtlasScores(map,"first","rio","intensity",{surface:20,inner:85},{surface:0,inner:50});
  expect(result.status).toBe("applied");expect(map).toEqual(before);
  const expected=structuredClone(map);expected.scenes[0]!.beats[0]!.surface.intensity=0;expected.scenes[0]!.beats[0]!.inner.intensity=50;
  expect(result.map).toEqual(expected);expect(result.map.scenes[1]).toBe(map.scenes[1]);
});
it("keeps newer changes to notes and the other metric but rejects changed scores",()=>{
  const newer=structuredClone(map);newer.scenes[0]!.beats[0]!.inner.note="新しい説明";newer.scenes[0]!.beats[0]!.inner.valence=-30;
  const result=applyAtlasScores(newer,"first","rio","intensity",{surface:20,inner:85},{surface:null,inner:50});
  expect(result.status).toBe("applied");expect(result.map.scenes[0]!.beats[0]!.inner.note).toBe("新しい説明");expect(result.map.scenes[0]!.beats[0]!.inner.valence).toBe(-30);
  newer.scenes[0]!.beats[0]!.inner.intensity=60;
  expect(applyAtlasScores(newer,"first","rio","intensity",{surface:20,inner:85},{surface:30,inner:50})).toEqual({status:"conflict",map:newer});
});
it("does not create an empty observation or resurrect removed scenes and characters",()=>{
  expect(applyAtlasScores(map,"last","rio","intensity",{surface:null,inner:null},{surface:null,inner:null})).toEqual({status:"unchanged",map});
  for(const [scene,character] of [["removed","rio"],["last","removed"]])expect(applyAtlasScores(map,scene!,character!,"intensity",{surface:null,inner:null},{surface:10,inner:50})).toEqual({status:"missing",map});
  expect(applyAtlasScores(map,"last","rio","intensity",{surface:null,inner:null},{surface:-1,inner:50})).toEqual({status:"invalid",map});
});
it("adds an observation only when scores are recorded; clearing a score retains its prose",()=>{
  const added=applyAtlasScores(map,"last","rio","valence",{surface:null,inner:null},{surface:0,inner:-50});
  expect(added.map.scenes[1]!.beats).toEqual([{...emptyBeat("rio"),surface:{...emptyBeat("rio").surface,valence:0},inner:{...emptyBeat("rio").inner,valence:-50}}]);
  const cleared=applyAtlasScores(map,"first","rio","intensity",{surface:20,inner:85},{surface:null,inner:null});
  expect(cleared.map.scenes[0]!.beats[0]!.inner.emotion).toBe("怒り");expect(cleared.map.scenes[0]!.beats[0]!.inner.note).toBe("裏の説明");
});
it("records both values as one undo step and persists undo/redo through the real session",async()=>{
  let saved=map;const session=new StoryMapSession({read:async()=>saved,save:async(next,revision)=>(saved={...next,revision:revision+1})});await session.load();
  const updated=applyAtlasScores(session.getSnapshot().map,"first","rio","intensity",{surface:20,inner:85},{surface:30,inner:70});
  session.change(updated.map);await session.flush();expect(saved.scenes[0]!.beats[0]!.inner.intensity).toBe(70);
  session.undo();await session.flush();expect(saved.scenes).toEqual(map.scenes);expect(session.getSnapshot().canUndo).toBe(false);
  session.redo();await session.flush();expect(saved.scenes).toEqual(updated.map.scenes);
});
