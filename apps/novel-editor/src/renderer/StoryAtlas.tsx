import {useEffect, useRef, type CSSProperties, type ReactNode} from "react";
import {curveSegments, hasRecordedBeat, moveStoryScene, type CharacterBeat, type StoryOrder} from "@kohon/project-store/story-map";
import type {StoryMapController} from "./useStoryMap.js";
import {usePlanningState} from "./usePlanningState.js";
import {PlanningNavigator, SCENE_WINDOW, useSceneWindow} from "./PlanningNavigator.js";
import {useLocale} from "./LocaleContext.js";
import {StoryAtlasOverview} from "./StoryAtlasOverview.js";
import {SceneManuscriptLink,type SceneManuscriptLinkProps} from "./SceneManuscriptLink.js";
import {AtlasScoreEditor} from "./AtlasScoreEditor.js";
import {StoryTimeBraid} from "./StoryTimeBraid.js";
import "./story-atlas.css";

const STEP=100, HEIGHT=88;
const y=(value:number,signed:boolean)=>12+(1-(signed?(value+100)/200:value/100))*64;

/** Overview first; prose is revealed only for the selected scene and person. */
export function StoryAtlas({controller:c,axis,onAxis,onEdit,manuscript}:{controller:StoryMapController;axis:StoryOrder;onAxis(axis:StoryOrder):void;onEdit(sceneId:string,characterId?:string):void;manuscript?:Omit<SceneManuscriptLinkProps,"scene">}):ReactNode {
  const {locale}=useLocale();const tr=(ja:string,en:string)=>locale==="ja"?ja:en;
  const [metric,setMetric]=usePlanningState<"intensity"|"valence">(c.viewState,"atlas:metric","intensity");
  const [characterFilter,setCharacterFilter]=usePlanningState(c.viewState,"atlas:character","");
  const [selection,setSelection]=usePlanningState<{sceneId:string;characterId?:string}|null>(c.viewState,"atlas:selection",null);
  const [showBraid,setShowBraid]=usePlanningState(c.viewState,"atlas:braid",false);
  const [fullEmotionNames,setFullEmotionNames]=usePlanningState(c.viewState,"atlas:fullEmotionNames",false);
  const plotHeight=fullEmotionNames?64:44;
  const dragId=useRef<string|null>(null);
  const chartRef=useRef<HTMLDivElement>(null),cornerRef=useRef<HTMLDivElement>(null),selectedHeadRef=useRef<HTMLButtonElement>(null);
  const range=useSceneWindow(c.map[axis],c.viewState,"atlas:range");
  const byId=new Map(c.map.scenes.map(s=>[s.id,s]));
  const ordered=c.map[axis].flatMap(id=>byId.get(id)??[]);
  const scenes=ordered.slice(range.start,range.start+SCENE_WINDOW);
  const characters=characterFilter?c.map.characters.filter(ch=>ch.id===characterFilter):c.map.characters;
  useEffect(()=>{
    const chart=chartRef.current,head=selectedHeadRef.current;
    if(!chart||!head)return;
    const reveal=()=>{
      const frame=chart.getBoundingClientRect(),target=head.getBoundingClientRect();
      const left=frame.left+(cornerRef.current?.getBoundingClientRect().width??0),right=frame.left+chart.clientWidth;
      if(target.left<left)chart.scrollLeft+=target.left-left;
      else if(target.right>right)chart.scrollLeft+=target.right-right;
    };
    reveal();const observer=new ResizeObserver(reveal);observer.observe(chart);
    return()=>observer.disconnect();
  },[selection?.sceneId,range.start,characters.length]);
  const selected=selection?byId.get(selection.sceneId):undefined;
  const changeAxis=(next:StoryOrder)=>{
    onAxis(next);
    if(selected)range.setStart(c.map[next].indexOf(selected.id));
  };
  const selectedCharacter=c.map.characters.find(ch=>ch.id===selection?.characterId);
  const selectedBeat=selected?.beats.find(b=>b.characterId===selectedCharacter?.id);
  const selectedSurface=selectedCharacter?tr("この人物の感情は未記録","This character's feelings are unrecorded"):selected?.surface||"—";
  const selectedInner=selectedCharacter?tr("この人物の心情は未記録","This character's inner state is unrecorded"):selected?.inner||"—";
  const signed=metric==="valence",width=Math.max(STEP,scenes.length*STEP);
  const layerLabel=(inner:boolean)=>inner?tr("裏","Inner"):tr("表","Surface");
  const score=(n:number|null|undefined)=>n==null?tr("未記録","Unrecorded"):String(n);
  const missingScores=(surface:number|null|undefined,inner:number|null|undefined)=>`${signed?tr("快・不快未記録","Valence unrecorded"):tr("強さ未記録","Intensity unrecorded")}：${surface==null?layerLabel(false):""}${surface==null&&inner==null?"・":""}${inner==null?layerLabel(true):""}`;
  const select=(sceneId:string,characterId?:string)=>setSelection({sceneId,...(characterId===undefined?{}:{characterId})});
  const move=(id:string,boundary:number)=>{
    if(!c.hydrated||c.status==="loading")return;
    const next=moveStoryScene(c.map,axis,id,boundary);c.change(next);select(id);range.setStart(next[axis].indexOf(id));
  };
  const lines=(values:(number|null)[],inner:boolean,color:string):ReactNode=>curveSegments(values,STEP,HEIGHT,signed).map((points,i)=><polyline key={i} points={points} fill="none" stroke={color} strokeWidth={inner?2:2.5} strokeDasharray={inner?"5 4":undefined} vectorEffect="non-scaling-stroke"/>);
  const label=(beat:CharacterBeat|undefined,inner:boolean)=>{
    const layer=inner?beat?.inner:beat?.surface;
    return `${layerLabel(inner)} ${layer?.emotion||tr("感情未記録","Emotion unrecorded")} · ${metric==="intensity"?tr("強さ","Intensity"):tr("快・不快","Valence")} ${score(layer?.[metric])}`;
  };
  return <section className={`story-atlas${fullEmotionNames?"":" is-compact"}`} aria-label={tr("物語全体図","Story overview")}>
    <div className="atlas-controls"><div className="story-axis"><button aria-pressed={axis==="narrativeOrder"} onClick={()=>changeAxis("narrativeOrder")}>{tr("読者に見せる順","Narrative order")}</button><button aria-pressed={axis==="chronologicalOrder"} onClick={()=>changeAxis("chronologicalOrder")}>{tr("作中の時系列","Story chronology")}</button></div>
      <label>{tr("人物","Character")}<select aria-label={tr("全体図の人物","Overview character")} value={characterFilter} onChange={e=>setCharacterFilter(e.target.value)}><option value="">{tr("全員","Everyone")}</option>{c.map.characters.map(ch=><option key={ch.id} value={ch.id}>{ch.name}</option>)}</select></label>
      <label>{tr("縦軸","Vertical axis")}<select aria-label={tr("全体図の感情の軸","Overview emotion axis")} value={metric} onChange={e=>setMetric(e.target.value as typeof metric)}><option value="intensity">{tr("高ぶり・強さ","Intensity")}</option><option value="valence">{tr("快・不快","Valence")}</option></select></label>
      {!!scenes.length&&<button aria-expanded={showBraid} onClick={()=>setShowBraid(!showBraid)}>{tr("時間の編み図","Time braid")}</button>}
      {!!scenes.length&&<button aria-pressed={fullEmotionNames} onClick={()=>setFullEmotionNames(!fullEmotionNames)}>{tr("感情名を詳しく表示","Expand emotion labels")}</button>}
    </div>
    <div className="atlas-legend"><span><i className="atlas-solid"/>{tr("表：見せている感情","Surface: shown feelings")}</span><span><i className="atlas-dashed"/>{tr("裏：本心","Inner: hidden feelings")}</span><span><i className="atlas-band"/>{tr("帯：数値の隔たり","Band: gap between scores")}</span><small>{signed?tr("−100 不快 / 0 中立 / +100 快","−100 unpleasant / 0 neutral / +100 pleasant"):tr("0 穏やか / 100 強い","0 calm / 100 intense")}</small></div>
    {!scenes.length?<div className="atlas-empty"><h3>{tr("場面から、物語の輪郭が現れます。","Your story takes shape scene by scene.")}</h3><button onClick={()=>onEdit("")}>{tr("場面を作る","Create scenes")}</button></div>:<>
      {showBraid&&<StoryTimeBraid map={c.map} selectedId={selected?.id} onReveal={id=>{range.reveal(id);select(id,selectedCharacter?.id??(characterFilter||undefined));}}/>}
      <StoryAtlasOverview scenes={ordered} start={range.start} character={characterFilter?characters[0]:undefined} metric={metric} onReveal={id=>{range.reveal(id);select(id,characterFilter||undefined);}}/>
      <PlanningNavigator scenes={ordered} start={range.start} onStart={range.setStart} label={tr("全体図","Overview")}/>
      <div className={`atlas-workspace${selected?" has-detail":""}`}><div className="atlas-chart">
      <div className="atlas-scroll" ref={chartRef}><div className="atlas-grid" style={{"--atlas-scene-count":scenes.length} as CSSProperties}>
        <div className="atlas-corner" ref={cornerRef}>{tr("場面 →","Scenes →")}<small>{axis==="narrativeOrder"?tr("読者順","Narrative"):tr("時系列","Chronology")}</small></div>
        <div className="atlas-heads">{scenes.map((scene,i)=><button key={scene.id} ref={selected?.id===scene.id?selectedHeadRef:undefined} className={selected?.id===scene.id?"selected":""} aria-label={`${tr("場面を選ぶ","Select scene")}: ${scene.title}`} onClick={()=>select(scene.id)} draggable={c.hydrated && c.status !== "loading"} onDragStart={e=>{dragId.current=scene.id;e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("application/x-kohon-story-scene",scene.id);}} onDragEnd={()=>{dragId.current=null;}} onDragOver={e=>{if(dragId.current){e.preventDefault();e.dataTransfer.dropEffect="move";}}} onDrop={e=>{if(!dragId.current)return;e.preventDefault();const id=dragId.current;dragId.current=null;const rect=e.currentTarget.getBoundingClientRect();move(id,range.start+i+(e.clientX>=rect.left+rect.width/2?1:0));}} onKeyDown={e=>{if(!e.altKey||!e.shiftKey)return;const index=c.map[axis].indexOf(scene.id);if(e.key==="ArrowLeft"&&index>0){e.preventDefault();move(scene.id,index-1);}if(e.key==="ArrowRight"&&index<ordered.length-1){e.preventDefault();move(scene.id,index+2);}}} title={`${scene.title}\n${scene.time}\n${scene.surface}`}><small>{String(range.start+i+1).padStart(2,"0")}{scene.kind==="flashback"?tr(" 回想"," Flashback"):scene.kind==="offstage"?tr(" 舞台裏"," Offstage"):""}</small><strong>{scene.title}</strong><em>{scene.time||tr("時刻未設定","Time unset")}</em></button>)}</div>
        <div className="atlas-row-label"><strong>{tr("全体の緊張","Story tension")}</strong><small>100 / 50 / 0</small></div>
        <svg className="atlas-tension" width="100%" height="58" viewBox={`0 0 ${width} 88`} preserveAspectRatio="none" role="group" aria-label={tr("全体の緊張の曲線","Story tension curve")}>
          {curveSegments(scenes.map(s=>s.tension),STEP,HEIGHT).map((points,i)=><polyline key={i} points={points} fill="none" stroke="var(--nl-text)" strokeWidth="2" vectorEffect="non-scaling-stroke"/>)}
          {scenes.map((s,i)=>s.tension===null?null:<circle key={s.id} cx={i*STEP+50} cy={y(s.tension,false)} r="3" fill="var(--nl-text)"><title>{`${s.title}: ${s.tension}`}</title></circle>)}
        </svg>
        {characters.map(ch=>{
          const beats=scenes.map(s=>s.beats.find(b=>b.characterId===ch.id));
          const surface=beats.map(b=>b?.surface[metric]??null),inner=beats.map(b=>b?.inner[metric]??null);
          return <div className="atlas-person-row" key={ch.id} style={{"--atlas-person":ch.color} as CSSProperties}>
            <div className="atlas-row-label"><strong><i/>{ch.name}</strong><small>{signed?"+100 / 0 / −100":"100 / 50 / 0"}</small></div>
            <div className="atlas-person-plot">
              <svg width="100%" height={plotHeight} viewBox={`0 0 ${width} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
                {[12,44,76].map(at=><line key={at} x1="0" x2={width} y1={at} y2={at} stroke="var(--nl-line)" strokeDasharray="2 5"/>)}
                {scenes.map((s,i)=>{const a=surface[i],b=inner[i];return a==null||b==null?null:<rect key={s.id} x={i*STEP+44} width="12" y={Math.min(y(a,signed),y(b,signed))} height={Math.max(1,Math.abs(y(a,signed)-y(b,signed)))} fill={ch.color} opacity="0.22"/>;})}
                {lines(surface,false,ch.color)}{lines(inner,true,ch.color)}
                {scenes.flatMap((s,i)=>[false,true].map(isInner=>{const n=(isInner?inner:surface)[i];return n==null?null:<circle key={`${s.id}:${isInner}`} cx={i*STEP+50} cy={y(n,signed)} r={isInner?4:3.5} fill={isInner?"var(--nl-surface)":ch.color} stroke={ch.color} strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>;}))}
              </svg>
              <div className="atlas-cell-actions">{scenes.map((scene,i)=><button key={scene.id} aria-label={`${scene.title} · ${ch.name} · ${label(beats[i],false)} · ${label(beats[i],true)}`} aria-pressed={selected?.id===scene.id&&selectedCharacter?.id===ch.id} onClick={()=>select(scene.id,ch.id)} title={`${scene.title} · ${ch.name}\n${label(beats[i],false)}\n${label(beats[i],true)}`}>{[false,true].map(isInner=>{const value=(isInner?inner:surface)[i];return value==null?null:<span key={String(isInner)} className={isInner?"atlas-score atlas-score-inner":"atlas-score atlas-score-surface"} style={{top:y(value,signed)*plotHeight/HEIGHT}} aria-hidden="true">{signed&&value>0?"+":""}{value}</span>;})}<span className="atlas-emotion-name">{hasRecordedBeat(beats[i]) ? `${tr("表", "Surface")} ${beats[i]?.surface.emotion || "—"}` : tr("未記録", "Unrecorded")}</span>{hasRecordedBeat(beats[i]) && <span className="atlas-emotion-name atlas-inner-name">{tr("裏", "Inner")} {beats[i]?.inner.emotion || "—"}</span>}{(surface[i]===null||inner[i]===null)&&hasRecordedBeat(beats[i])&&<small>{missingScores(surface[i],inner[i])}</small>}</button>)}</div>
            </div>
          </div>;
        })}
      </div></div>
      <p className="atlas-footnote">{tr("横軸は場面の順番。空白は未記録で、線はつなぎません。場面名をドラッグ、または Alt+Shift+←/→ でこの順序だけ移動。本文の章順は変わりません。","The x-axis is scene order. Missing scores leave gaps. Drag scene headings or press Alt+Shift+←/→ to reorder this axis. Manuscript chapter order stays unchanged.")}</p>
      </div>
      {selected&&<aside className="atlas-detail" aria-label={tr("選んだ場面の内容","Selected scene details")}><header><div><small>{selected.time}</small><h3>{selected.title}{selectedCharacter?` · ${selectedCharacter.name}`:""}</h3></div><div className="atlas-detail-actions"><button onClick={()=>onEdit(selected.id,selectedCharacter?.id)}>{tr("詳しく編集","Edit details")} →</button><button aria-label={tr("場面の詳細を閉じる","Close scene details")} onClick={()=>setSelection(null)}>×</button></div></header>
        {manuscript&&<SceneManuscriptLink scene={selected} {...manuscript}/>}
        {selectedCharacter&&<AtlasScoreEditor key={JSON.stringify([selected.id,selectedCharacter.id,metric])} controller={c} sceneId={selected.id} characterId={selectedCharacter.id} metric={metric}/>}
        <div className="atlas-detail-columns"><div><b>{tr("表に見えていること","On the surface")}</b><p>{selectedBeat?selectedBeat.surface.emotion||tr("感情未記録","Emotion unrecorded"):selectedSurface}</p>{selectedBeat&&<><small>{label(selectedBeat,false)}</small><p>{selectedBeat.expression||tr("表情・仕草は未記録","Gesture unrecorded")}</p>{selectedBeat.surface.note&&<p>{selectedBeat.surface.note}</p>}</>}</div>
          <div><b>{tr("裏で動いていること","Under the surface")}</b><p>{selectedBeat?selectedBeat.inner.emotion||tr("感情未記録","Emotion unrecorded"):selectedInner}</p>{selectedBeat&&<><small>{label(selectedBeat,true)}</small>{selectedBeat.inner.note&&<p>{selectedBeat.inner.note}</p>}{selectedBeat.desire&&<p>{tr("求めるもの：","Wants: ")}{selectedBeat.desire}</p>}</>}</div></div>
      </aside>}
      </div>
    </>}
  </section>;
}
