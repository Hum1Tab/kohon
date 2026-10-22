import {useLayoutEffect,useRef,useState,type ReactNode} from "react";
import type {StoryScene} from "@kohon/project-store/story-map";
import {sceneManuscriptDestination,type ReadSceneChapter} from "../shared/scene-manuscript.js";
import {useLocale} from "./LocaleContext.js";
import {AppIcon} from "./AppIcon.js";

export interface SceneManuscriptLinkProps {
  scene:StoryScene;chapters:readonly {id:string;title:string}[];
  readChapter:ReadSceneChapter|undefined;
  onOpenChapter(id:string,range?:{start:number;end:number}):void;
}

/** Shared by the overview and scene editor; selection changes cancel late reads. */
export function SceneManuscriptLink({scene,chapters,readChapter,onOpenChapter}:SceneManuscriptLinkProps):ReactNode {
  const {locale}=useLocale();const tr=(ja:string,en:string)=>locale==="ja"?ja:en;
  const [opening,setOpening]=useState(false),[message,setMessage]=useState("");
  const request=useRef(0);
  const chapter=chapters.find(ch=>ch.id===scene.chapterId);
  const linkKey=JSON.stringify([scene.id,scene.chapterId,scene.manuscriptAnchor??null,chapter?.id??null]);
  useLayoutEffect(()=>{request.current++;setOpening(false);setMessage("");return()=>{request.current++;};},[linkKey]);
  const open=async()=>{
    const token=++request.current;setOpening(true);setMessage("");
    try {
      const destination=await sceneManuscriptDestination(scene,chapters.map(ch=>ch.id),readChapter);
      if(token!==request.current)return;
      if(destination.status==="found"){onOpenChapter(destination.chapterId,destination.range);return;}
      const messages={
        unlinked:tr("本文の章は未リンクです。「詳しく編集」で章を選べます。","No chapter is linked. Choose a chapter in Edit details."),
        "chapter-missing":tr("リンク先の章がありません。本文とのリンクを選び直してください。","The linked chapter is missing. Choose the manuscript link again."),
        missing:tr("引用が本文に見つかりません。推敲後の段落をリンクし直してください。","Quote no longer exists. Link the revised paragraph again."),
        ambiguous:tr("同じ引用が複数あります。本文で対象の段落を選び、リンクし直してください。","Multiple matches. Select the intended paragraph and link again."),
        unavailable:tr("本文を読み込めません。","Cannot read the manuscript.")
      };
      setMessage(messages[destination.status]);
    }catch(error){if(token===request.current)setMessage(error instanceof Error?error.message:String(error));}
    finally{if(token===request.current)setOpening(false);}
  };
  if(!chapter)return <p className="scene-manuscript-unlinked">{scene.chapterId?tr("リンク先の章がありません。","The linked chapter is missing."):tr("本文の章は未リンクです。","No manuscript chapter is linked.")}</p>;
  return <div className="scene-manuscript-link">
    <button className="story-open-manuscript" disabled={opening} onClick={()=>void open()} title={chapter.title} aria-label={`${tr("本文へ", "Go to manuscript")}: ${scene.title} · ${chapter.title}`}><AppIcon name="files" size={14}/>{opening?tr("本文を確認中…","Checking manuscript…"):scene.manuscriptAnchor?tr("リンクした段落へ","Go to linked paragraph"):tr("この章の本文を開く","Open chapter manuscript")}</button>
    {message&&<p className="story-help" role="status">{message}</p>}
  </div>;
}
