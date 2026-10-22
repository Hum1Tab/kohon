import {resolveSceneAnchor, type StoryScene} from "@kohon/project-store/story-map";

export type SceneManuscriptDestination =
  | {status:"found";chapterId:string;range?:{start:number;end:number}}
  | {status:"unlinked"|"chapter-missing"|"missing"|"ambiguous"|"unavailable"};
export type ReadSceneChapter = (id:string)=>Promise<{text:string;version:string}>;

/** Resolve against current saved/buffered text, never an old character offset. */
export async function sceneManuscriptDestination(scene:StoryScene,chapterIds:readonly string[],readChapter:ReadSceneChapter|undefined):Promise<SceneManuscriptDestination> {
  if(!scene.chapterId)return {status:"unlinked"};
  if(!chapterIds.includes(scene.chapterId))return {status:"chapter-missing"};
  if(!scene.manuscriptAnchor)return {status:"found",chapterId:scene.chapterId};
  if(!readChapter)return {status:"unavailable"};
  const {text}=await readChapter(scene.chapterId);
  const result=resolveSceneAnchor(text,scene.manuscriptAnchor);
  return result.status==="found"?{status:"found",chapterId:scene.chapterId,range:{start:result.start,end:result.end}}:result;
}
