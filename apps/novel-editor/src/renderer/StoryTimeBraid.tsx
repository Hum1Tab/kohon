import {useState,type CSSProperties,type KeyboardEvent,type ReactNode} from "react";
import type {StoryMap,StoryOrder} from "@kohon/project-store/story-map";
import {useLocale} from "./LocaleContext.js";

/** Both rails use scene ranks, never elapsed time or manuscript chapter order. */
export function StoryTimeBraid({map,selectedId,onReveal}:{map:StoryMap;selectedId:string|undefined;onReveal(id:string):void}):ReactNode {
  const {locale}=useLocale();const tr=(ja:string,en:string)=>locale==="ja"?ja:en;
  const [hovered,setHovered]=useState<string|null>(null);
  const byId=new Map(map.scenes.map(scene=>[scene.id,scene]));
  const narrative=map.narrativeOrder.filter(id=>byId.has(id));
  const chronological=map.chronologicalOrder.filter(id=>byId.has(id));
  const ranks=new Map(chronological.map((id,i)=>[id,i]));
  const narrativeRanks=new Map(narrative.map((id,i)=>[id,i]));
  const chosen=narrative.includes(selectedId??"")?selectedId!:narrative[0];
  const highlighted=hovered&&narrativeRanks.has(hovered)?hovered:chosen;
  const scene=chosen?byId.get(chosen):undefined;
  if(!narrative.length||!chronological.length)return null;
  const x=(i:number,count:number)=>(i+.5)*1000/count;
  const position=(id:string)=>`${tr("読者順","Narrative")} ${(narrativeRanks.get(id)??-1)+1} → ${tr("時系列","Chronology")} ${(ranks.get(id)??-1)+1}`;
  const keyMove=(e:KeyboardEvent<HTMLButtonElement>,ids:string[],index:number)=>{
    if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
    const next=e.key==="ArrowLeft"?Math.max(0,index-1):e.key==="ArrowRight"?Math.min(ids.length-1,index+1):e.key==="Home"?0:e.key==="End"?ids.length-1:null;
    if(next===null)return;e.preventDefault();setHovered(null);onReveal(ids[next]!);
    (e.currentTarget.parentElement?.children[next] as HTMLButtonElement|undefined)?.focus();
  };
  const rail=(order:StoryOrder,ids:string[])=> <div className={`atlas-braid-rail${ids.length>24?" is-dense":""}`} style={{"--braid-count":ids.length} as CSSProperties} role="group" aria-label={order==="narrativeOrder"?tr("読者に語る順","Order told to readers"):tr("作中で起きた順","Order of events")}>
    {ids.map((id,i)=>{const s=byId.get(id)!;return <button key={id} aria-label={`${position(id)} · ${s.title}${s.kind==="offstage"?tr(" · 舞台裏"," · Offstage"):""}`} aria-pressed={chosen===id} tabIndex={chosen===id?0:-1} title={`${s.title}\n${position(id)}\n${s.time}`} onClick={()=>onReveal(id)} onKeyDown={e=>keyMove(e,ids,i)} onMouseEnter={()=>setHovered(id)} onMouseLeave={()=>setHovered(null)}><span>{i+1}</span><strong>{s.title}</strong></button>;})}
  </div>;
  return <section className="atlas-braid" aria-label={tr("時間の編み図","Time braid")}>
    <header><strong>{tr("語る順 × 起きた順","Telling order × event order")}</strong><label>{tr("場面","Scene")}<select aria-label={tr("編み図の場面","Time braid scene")} value={chosen} onChange={e=>onReveal(e.target.value)}>{narrative.map(id=><option key={id} value={id}>{byId.get(id)!.title} · {position(id)}</option>)}</select></label></header>
    <small>{tr("上：読者に語る順","Top: order told to readers")}</small>
    {rail("narrativeOrder",narrative)}
    <svg className="atlas-braid-lines" style={{"--braid-opacity":Math.min(.3,4/narrative.length)} as CSSProperties} viewBox="0 0 1000 52" preserveAspectRatio="none" aria-hidden="true">
      {narrative.filter(id=>id!==highlighted).concat(highlighted&&narrative.includes(highlighted)?[highlighted]:[]).map(id=>{
        const a=narrativeRanks.get(id)!,b=ranks.get(id);if(b===undefined)return null;
        const from=x(a,narrative.length),to=x(b,chronological.length);
        return <path key={id} className={id===highlighted?"is-highlighted":""} d={`M ${from} 0 C ${from} 26 ${to} 26 ${to} 52`} fill="none" vectorEffect="non-scaling-stroke" strokeDasharray={byId.get(id)!.kind==="offstage"?"4 3":undefined}/>;
      })}
    </svg>
    {rail("chronologicalOrder",chronological)}
    <small>{tr("下：作中で起きた順","Bottom: order of events")}{scene?.kind==="offstage"?tr(" · 選択中は舞台裏の場面（破線）"," · Selected offstage scene (dashed)"):""}</small>
    <p>{scene?.title} · {chosen?position(chosen):""}<span>{tr("同じ場面を線で結んでいます。並びの比較で、時間の長さは表しません。","Lines connect the same scene. Ranks show order, not elapsed time.")}</span></p>
  </section>;
}
