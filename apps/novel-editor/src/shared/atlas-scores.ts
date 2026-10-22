import {emptyBeat,updateCharacterBeat,type StoryMap} from "@kohon/project-store/story-map";

export type AtlasMetric="intensity"|"valence";
export interface AtlasScores {surface:number|null;inner:number|null}
export interface AtlasScoreFields {surface:string;inner:string}
const valid=(value:number|null,metric:AtlasMetric)=>value===null||Number.isInteger(value)&&value>=(metric==="intensity"?0:-100)&&value<=100;

/** Blank means unrecorded; reject partial numbers instead of clamping or guessing. */
export function parseAtlasScores(fields:AtlasScoreFields,metric:AtlasMetric):AtlasScores|null {
  const parse=(field:string):number|null|undefined=>{
    const text=field.trim();if(!text)return null;
    if(!/^[+-]?\d+$/u.test(text))return undefined;
    const value=Number(text);return valid(value,metric)?value:undefined;
  };
  const surface=parse(fields.surface),inner=parse(fields.inner);
  return surface===undefined||inner===undefined?null:{surface,inner};
}

/** Update only these two scores against the latest map. Other edits remain intact. */
export function applyAtlasScores(map:StoryMap,sceneId:string,characterId:string,metric:AtlasMetric,expected:AtlasScores,values:AtlasScores):{status:"applied"|"unchanged"|"missing"|"conflict"|"invalid";map:StoryMap} {
  if(!valid(values.surface,metric)||!valid(values.inner,metric))return {status:"invalid",map};
  const scene=map.scenes.find(s=>s.id===sceneId);
  if(!scene||!map.characters.some(ch=>ch.id===characterId))return {status:"missing",map};
  const beat=scene.beats.find(b=>b.characterId===characterId)??emptyBeat(characterId);
  if(beat.surface[metric]!==expected.surface||beat.inner[metric]!==expected.inner)return {status:"conflict",map};
  if(beat.surface[metric]===values.surface&&beat.inner[metric]===values.inner)return {status:"unchanged",map};
  const beats=updateCharacterBeat(scene.beats,characterId,{surface:{...beat.surface,[metric]:values.surface},inner:{...beat.inner,[metric]:values.inner}});
  return {status:"applied",map:{...map,scenes:map.scenes.map(s=>s.id===sceneId?{...s,beats}:s)}};
}
