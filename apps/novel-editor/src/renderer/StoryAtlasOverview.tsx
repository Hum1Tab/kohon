import type {ReactNode} from "react";
import {curveSegments, type StoryCharacter, type StoryScene} from "@kohon/project-store/story-map";
import {SCENE_WINDOW} from "./PlanningNavigator.js";
import {useLocale} from "./LocaleContext.js";

/** The overview uses the same scene order as the detailed chart, never elapsed time. */
export function overviewSceneIndex(offset:number,width:number,count:number):number|null {
  if(!Number.isFinite(offset)||!Number.isFinite(width)||width<=0||!Number.isInteger(count)||count<=0)return null;
  return Math.max(0,Math.min(count-1,Math.floor(offset/width*count)));
}

export function StoryAtlasOverview({scenes,start,character,metric,onReveal}:{
  scenes:readonly StoryScene[];start:number;character:StoryCharacter|undefined;metric:"intensity"|"valence";onReveal(id:string):void;
}):ReactNode {
  const {locale}=useLocale();const tr=(ja:string,en:string)=>locale==="ja"?ja:en;
  if(scenes.length<=SCENE_WINDOW)return null;
  const width=1000,height=64,step=width/scenes.length;
  const layers=character?[false,true].map(inner=>({inner,color:character.color,signed:metric==="valence",values:scenes.map(s=>s.beats.find(b=>b.characterId===character.id)?.[inner?"inner":"surface"][metric]??null)})):
    [{inner:false,color:"var(--nl-text)",signed:false,values:scenes.map(s=>s.tension)}];
  const title=character?tr(`${character.name}の表と裏 · 全${scenes.length}場面`,`${character.name}, surface and inner · all ${scenes.length} scenes`):tr(`全体の緊張 · 全${scenes.length}場面`,`Story tension · all ${scenes.length} scenes`);
  return <section className="atlas-overview" aria-label={tr("全場面の俯瞰図","Whole-story overview")}>
    <header><strong>{title}</strong><small>{tr("図を押して、その場面へ","Click the chart to reveal a scene")}</small></header>
    <svg className="atlas-overview-plot" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={title} onClick={e=>{
      const rect=e.currentTarget.getBoundingClientRect(),index=overviewSceneIndex(e.clientX-rect.left,rect.width,scenes.length);
      if(index!==null)onReveal(scenes[index]!.id);
    }}>
      <rect className="atlas-overview-range" x={start*step} y="0" width={Math.min(SCENE_WINDOW,scenes.length-start)*step} height={height}/>
      <line x1="0" x2={width} y1={height/2} y2={height/2} stroke="var(--nl-line)" strokeDasharray="3 5"/>
      {layers.flatMap(layer=>curveSegments(layer.values,step,height,layer.signed).map((points,i)=>points.includes(" ")?
        <polyline key={`${layer.inner}:${i}`} points={points} fill="none" stroke={layer.color} strokeWidth="2" strokeDasharray={layer.inner?"5 4":undefined} vectorEffect="non-scaling-stroke"/>:
        <circle key={`${layer.inner}:${i}`} cx={points.split(",")[0]} cy={points.split(",")[1]} r="2" fill={layer.inner?"var(--nl-surface)":layer.color} stroke={layer.color}/>))}
    </svg>
    <nav className="atlas-overview-ranges" aria-label={tr("俯瞰図から範囲へ移動","Reveal a range from the overview")}>
      {Array.from({length:Math.ceil(scenes.length/SCENE_WINDOW)},(_,i)=>{
        const at=i*SCENE_WINDOW,end=Math.min(scenes.length,at+SCENE_WINDOW),label=`${at+1}–${end}`;
        return <button key={at} aria-label={tr(`${label}場面を表示`, `Show scenes ${label}`)} aria-pressed={start===at} title={`${scenes[at]!.title} → ${scenes[end-1]!.title}`} onClick={()=>onReveal(scenes[at]!.id)}>{label}</button>;
      })}
    </nav>
  </section>;
}
