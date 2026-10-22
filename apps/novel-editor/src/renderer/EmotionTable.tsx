import type { ReactNode } from "react";
import { emptyBeat, updateCharacterBeat, hasRecordedBeat, type CharacterBeat, type EmotionLayer, type StoryMap, type StoryOrder } from "@kohon/project-store/story-map";
import type { StoryMapController } from "./useStoryMap.js";
import { usePlanningState } from "./usePlanningState.js";
import { useLocale } from "./LocaleContext.js";
import { PlanningNavigator, SCENE_WINDOW, useSceneWindow } from "./PlanningNavigator.js";

/** One character across scenes, with every layer visible and editable together. */
export function EmotionTable({ controller: c, axis, onAxis, onScene }: { controller: StoryMapController; axis: StoryOrder; onAxis(axis: StoryOrder): void; onScene(id: string): void }): ReactNode {
  const { locale } = useLocale();
  const tr = (ja: string, en: string): string => locale === "ja" ? ja : en;
  const map = c.map;
  const [characterId, setCharacterId] = usePlanningState(c.viewState, "emotion-table:character", "");
  const [metric, setMetric] = usePlanningState<"intensity" | "valence">(c.viewState, "emotion-table:metric", "intensity");
  const character = map.characters.find(ch => ch.id === characterId) ?? map.characters[0];
  const window = useSceneWindow(map[axis], c.viewState, "emotion-table:range");
  const byId = new Map(map.scenes.map(scene => [scene.id, scene]));
  const ordered = map[axis].flatMap(id => byId.get(id) ?? []);
  const scenes = ordered.slice(window.start, window.start + SCENE_WINDOW);
  const disabled = !c.hydrated || c.status === "loading";
  const update = (sceneId: string, patch: Partial<CharacterBeat>, key: string): void => {
    if (!character) return;
    const scene = byId.get(sceneId); if (!scene) return;
    c.change({ ...map, scenes: map.scenes.map(s => s.id !== sceneId ? s : { ...s, beats: updateCharacterBeat(s.beats,character.id,patch) }) }, `${sceneId}:${character.id}:${key}`);
  };
  const textField = (sceneId: string, name: string, value: string, change: (value: string) => void, maxLength = 4000): ReactNode => <textarea rows={2} maxLength={maxLength} aria-label={`${byId.get(sceneId)?.title} · ${character?.name} · ${name}`} placeholder={tr("未記録", "Unrecorded")} value={value} disabled={disabled} onChange={e => change(e.target.value)} />;
  const emotionFields = (sceneId: string, beat: CharacterBeat, side: "surface" | "inner"): ReactNode => {
    const label = side === "surface" ? tr("表", "Surface") : tr("裏", "Inner");
    const emotion = beat[side];
    const change = (patch: Partial<EmotionLayer>, key: string): void => update(sceneId, { [side]: { ...emotion, ...patch } }, `${side}:${key}`);
    return <div className="emotion-table-value">{textField(sceneId, `${label} ${tr("感情", "emotion")}`, emotion.emotion, value => change({ emotion: value }, "emotion"), 200)}<label>{metric === "intensity" ? tr("強さ", "Intensity") : tr("快・不快", "Valence")}<input type="number" min={metric === "intensity" ? 0 : -100} max={100} step={1} value={emotion[metric] ?? ""} disabled={disabled} placeholder="—" aria-label={`${byId.get(sceneId)?.title} · ${character?.name} · ${label} ${metric === "intensity" ? tr("強さ", "intensity") : tr("快・不快", "valence")}`} onChange={e => { const n = e.target.value === "" ? null : Number(e.target.value); if (n === null || (Number.isInteger(n) && n >= (metric === "intensity" ? 0 : -100) && n <= 100)) change({ [metric]: n }, metric); }} /></label></div>;
  };
  return <div className="emotion-table-host"><div className="story-controls"><div className="story-axis"><button aria-pressed={axis === "narrativeOrder"} onClick={() => onAxis("narrativeOrder")}>{tr("読者に見せる順", "Narrative order")}</button><button aria-pressed={axis === "chronologicalOrder"} onClick={() => onAxis("chronologicalOrder")}>{tr("作中の時系列", "Story chronology")}</button></div><label>{tr("人物", "Character")}<select aria-label={tr("一覧で編集する人物", "Character to edit in table")} value={character?.id ?? ""} onChange={e => setCharacterId(e.target.value)}>{map.characters.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}</select></label><label>{tr("数値", "Score")}<select aria-label={tr("一覧の感情の数値", "Emotion score in table")} value={metric} onChange={e => setMetric(e.target.value as "intensity" | "valence")}><option value="intensity">{tr("高ぶり・強さ", "Intensity")}</option><option value="valence">{tr("快・不快", "Valence")}</option></select></label></div>
    <p className="story-help">{tr("人物の変化を場面ごとに続けて記入できます。Tabで次の欄へ。空欄は未記録、0は記録した穏やかさです。", "Follow one character across scenes. Tab moves to the next field. Blank is unrecorded; zero is a recorded calm state.")}</p>
    {!character || !scenes.length ? <p className="story-help">{tr("「物語の流れ」で場面と人物を追加してください。", "Add scenes and characters in Story flow.")}</p> : <><PlanningNavigator scenes={ordered} start={window.start} onStart={window.setStart} label={tr("感情一覧", "Emotion table")} /><div className="emotion-table-scroll" tabIndex={0} aria-label={tr("全場面の感情を編集", "Edit emotions across scenes")}><table className="emotion-table"><caption>{character.name} · {axis === "narrativeOrder" ? tr("読者順", "Narrative order") : tr("時系列", "Chronology")}</caption><thead><tr><th scope="col">{tr("場面・時刻", "Scene / time")}</th><th scope="col">{tr("表の感情", "Surface emotion")}</th><th scope="col">{tr("表での感情の動き", "Visible emotional change")}</th><th scope="col">{tr("表情・仕草", "Expression / gesture")}</th><th scope="col">{tr("裏の感情", "Inner emotion")}</th><th scope="col">{tr("隠れた心情", "Unspoken thoughts")}</th><th scope="col">{tr("求めているもの", "What they want")}</th></tr></thead><tbody>{scenes.map((scene, i) => {
      const beat = scene.beats.find(b => b.characterId === character.id) ?? emptyBeat(character.id);
      return <tr key={scene.id}><th scope="row"><button onClick={() => onScene(scene.id)}>{String(window.start + i + 1).padStart(2, "0")} · {scene.title}</button><small>{scene.time || tr("時刻未設定", "Time unset")}</small><small>{hasRecordedBeat(beat) ? tr("記録あり", "Recorded") : tr("未記録", "Unrecorded")}</small></th><td>{emotionFields(scene.id, beat, "surface")}</td><td>{textField(scene.id, tr("表での感情の動き", "Visible emotional change"), beat.surface.note, note => update(scene.id, { surface: { ...beat.surface, note } }, "surface:note"))}</td><td>{textField(scene.id, tr("表情・仕草", "Expression / gesture"), beat.expression, expression => update(scene.id, { expression }, "expression"))}</td><td>{emotionFields(scene.id, beat, "inner")}</td><td>{textField(scene.id, tr("隠れた心情", "Unspoken thoughts"), beat.inner.note, note => update(scene.id, { inner: { ...beat.inner, note } }, "inner:note"))}</td><td>{textField(scene.id, tr("求めているもの", "What they want"), beat.desire, desire => update(scene.id, { desire }, "desire"))}</td></tr>;
    })}</tbody></table></div></>}
  </div>;
}
