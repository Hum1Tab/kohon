import {type ReactNode} from "react";
import {applyAtlasScores,parseAtlasScores,type AtlasMetric,type AtlasScoreFields,type AtlasScores} from "../shared/atlas-scores.js";
import type {StoryMapController} from "./useStoryMap.js";
import {useLocale} from "./LocaleContext.js";
import {usePlanningState} from "./usePlanningState.js";

interface ScoreDraft {base:AtlasScores;fields:AtlasScoreFields}
/** Keyed by scene/person/axis; drafts survive navigating away during this session. */
export function AtlasScoreEditor({controller:c,sceneId,characterId,metric}:{controller:StoryMapController;sceneId:string;characterId:string;metric:AtlasMetric}):ReactNode {
  const {locale}=useLocale();const tr=(ja:string,en:string)=>locale==="ja"?ja:en;
  const [draft,setDraft]=usePlanningState<ScoreDraft|null>(c.viewState,`atlas:scores:${JSON.stringify([sceneId,characterId,metric])}`,null);
  const scene=c.map.scenes.find(s=>s.id===sceneId),character=c.map.characters.find(ch=>ch.id===characterId);
  if(!scene||!character)return null;
  const beat=scene.beats.find(b=>b.characterId===characterId);
  const current={surface:beat?.surface[metric]??null,inner:beat?.inner[metric]??null};
  const fields=draft?.fields??{surface:String(current.surface??""),inner:String(current.inner??"")};
  const parsed=parseAtlasScores(fields,metric);
  const conflict=!!draft&&(draft.base.surface!==current.surface||draft.base.inner!==current.inner);
  const dirty=!!draft&&(!parsed||parsed.surface!==current.surface||parsed.inner!==current.inner);
  const disabled=!c.hydrated||c.status==="loading";
  const caption=metric==="intensity"?tr("図の強さを記録","Record intensity on the chart"):tr("図の快・不快を記録","Record valence on the chart");
  const change=(side:"surface"|"inner",value:string)=>setDraft(previous=>({base:previous?.base??current,fields:{...(previous?.fields??fields),[side]:value}}));
  const message=conflict?tr("記録済みの値が変わりました。入力を戻して、現在の値から記録し直してください。","Recorded scores changed. Reset your input and start from the current scores."):dirty&&!parsed?(metric==="intensity"?tr("0〜100の整数か空欄を入力してください。","Enter an integer from 0 to 100, or leave blank."):tr("−100〜100の整数か空欄を入力してください。","Enter an integer from −100 to 100, or leave blank.")):dirty?tr("入力中・図には未反映","Draft · not yet on the chart"):"";
  return <form className="atlas-score-editor" aria-label={`${scene.title} · ${character.name} · ${caption}`} onSubmit={event=>{
    event.preventDefault();if(disabled||!draft||!parsed||conflict)return;
    const result=applyAtlasScores(c.map,sceneId,characterId,metric,draft.base,parsed);
    if(result.status==="applied")c.change(result.map);
    if(result.status==="applied"||result.status==="unchanged")setDraft(null);
  }}>
    <fieldset disabled={disabled}><legend>{caption}</legend><div className="atlas-score-fields">{(["surface","inner"] as const).map(side=><label key={side}>{side==="surface"?tr("表：見せている感情","Surface: shown feelings"):tr("裏：本心","Inner: hidden feelings")}<input type="text" inputMode="numeric" value={fields[side]} placeholder={tr("未記録","Unrecorded")} aria-label={`${scene.title} · ${character.name} · ${side==="surface"?tr("表","Surface"):tr("裏","Inner")} ${metric==="intensity"?tr("強さ","intensity"):tr("快・不快","valence")}`} aria-invalid={dirty&&!parsed||conflict||undefined} maxLength={8} onChange={event=>change(side,event.target.value)}/></label>)}</div>
      <p>{metric==="intensity"?tr("0 穏やか ／ 100 強い。空欄は未記録です。","0 calm / 100 intense. Blank means unrecorded."):tr("−100 不快 ／ 0 中立 ／ +100 快。空欄は未記録です。","−100 unpleasant / 0 neutral / +100 pleasant. Blank means unrecorded.")}</p>
      {message&&<p role="status">{message}</p>}<div className="atlas-score-actions"><button type="submit" disabled={!dirty||!parsed||conflict}>{tr("図に反映","Apply to chart")}</button>{draft&&<button type="button" onClick={()=>setDraft(null)}>{tr("入力を戻す","Reset input")}</button>}</div>
    </fieldset>
  </form>;
}
