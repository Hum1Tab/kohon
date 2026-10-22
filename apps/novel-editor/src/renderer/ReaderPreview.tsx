import { usePlanningState } from "./usePlanningState.js";
import { useMemo, type ReactNode } from "react";
import { emptyMysteryBoard } from "@kohon/project-store/mystery";
import type { StoryMap } from "@kohon/project-store/story-map";
import { indexKnowledge } from "../shared/planning-views.js";
import { useLocale } from "./LocaleContext.js";
import {SceneManuscriptLink,type SceneManuscriptLinkProps} from "./SceneManuscriptLink.js";
import "./planning-board.css";
import "./reader-preview.css";

/** An author-operated preview of recorded reveals; never a semantic reading of the manuscript. */
export function ReaderPreview({ map, viewState, manuscript, onEditScene, active = true }: { map: StoryMap; viewState?: Map<string, unknown> | undefined; manuscript?:Omit<SceneManuscriptLinkProps,"scene">; onEditScene?(id:string):void; active?:boolean }): ReactNode {
  const { locale } = useLocale(); const tr = (ja: string, en: string): string => locale === "ja" ? ja : en;
  const [id, setId] = usePlanningState(viewState, "reader:position", "");
  const byId = useMemo(() => new Map(map.scenes.map(s => [s.id, s])), [map.scenes]);
  const scenes = map.narrativeOrder.flatMap(s => byId.get(s) ?? []);
  const position = Math.max(0, scenes.findIndex(s => s.id === id)); const scene = scenes[position];
  const b = map.mystery ?? emptyMysteryBoard();
  const factsById = useMemo(() => new Map(b.facts.map(f => [f.id, f])), [b.facts]);
  const at = useMemo(() => indexKnowledge(map, b, "reader", true), [map, b]);
  const readerStates = scene ? b.facts.map(fact => ({fact, event:at(fact.id,scene.id)})) : [];
  const unknownCount = readerStates.filter(({event}) => event?.state === "unknown").length;
  const unrecordedCount = readerStates.filter(({event}) => !event).length;
  const shown = new Set(scenes.slice(0, position + 1).filter(s => s.kind !== "offstage").map(s => s.id));
  const stateName = { unknown: tr("知らない", "Unknown"), suspects: tr("疑う", "Suspects"), believes: tr("信じる", "Believes"), knows: tr("知っている", "Knows"), misunderstands: tr("誤解", "Misunderstands") };
  return <div className="reader-preview">
    <h2>{tr("読者に渡した情報を、読む順に確かめる", "Follow the information revealed to the reader")}</h2>
    <p>{tr("この画面は、記録した表の出来事・表情・読者の認識だけを表示します。本文の読み取りや、読者が本当に気づくかの判定は行いません。情報名には、読者に見せてよい呼び名を付けてください。", "This previews recorded visible events, expressions and reader knowledge. It does not infer understanding from the manuscript. Give facts reader-safe titles.")}</p>
    {!scene ? <p>{tr("場面を作ると、ここで読む順番を確認できます。", "Create scenes to preview the reader’s journey.")}</p> : <>
      <div className="planning-controls reader-position">
        <button aria-label={tr("プレビューの前の場面", "Previous preview scene")} disabled={position === 0} onClick={() => setId(scenes[position - 1]!.id)}>←</button>
        <label>{tr("読む位置", "Reading position")}<select aria-label={tr("プレビューの読む位置", "Preview reading position")} value={scene.id} onChange={e => setId(e.target.value)}>{scenes.map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {s.title}{s.kind === "offstage" ? tr("（舞台裏）", " (offstage)") : ""}</option>)}</select></label>
        <button aria-label={tr("プレビューの次の場面", "Next preview scene")} disabled={position === scenes.length - 1} onClick={() => setId(scenes[position + 1]!.id)}>→</button><span>{position + 1} / {scenes.length}</span>
      </div>
      {active && <div className="reader-manuscript-actions">
        {scene.kind !== "offstage" && manuscript && <SceneManuscriptLink scene={scene} {...manuscript}/>}
        {onEditScene && <button onClick={()=>onEditScene(scene.id)}>{tr("この場面の設定", "Edit this scene")}</button>}
      </div>}
      <div className="reader-preview-columns">
        <section><h3>{tr("この場面で見えること", "Visible in this scene")}</h3>
          {scene.kind === "offstage" ? <p>{tr("舞台裏の場面です。出来事と人物の心情は読者に表示しません。", "Offstage scene: events and character feelings are hidden.")}</p> : <>
            <p className="reader-visible-event">{scene.surface || tr("表の出来事は未記録", "Visible events unrecorded")}</p>
            {scene.beats.filter(beat => beat.surface.emotion.trim() || beat.expression.trim() || beat.surface.note.trim() || beat.surface.intensity !== null || beat.surface.valence !== null).map(beat => <article key={beat.characterId}><h4>{map.characters.find(ch => ch.id === beat.characterId)?.name}</h4><p>{beat.surface.emotion}{beat.surface.intensity !== null && ` · ${tr("強さ", "Intensity")} ${beat.surface.intensity}`}{beat.surface.valence !== null && ` · ${tr("快・不快", "Valence")} ${beat.surface.valence > 0 ? "+" : ""}${beat.surface.valence}`}</p><p>{beat.expression}</p><p>{beat.surface.note}</p></article>)}
          </>}
        </section>
        <section><h3>{tr("ここまでの読者の認識", "Reader knowledge so far")}</h3>
          {readerStates.flatMap(({fact,event}) => !event || event.state === "unknown" ? [] : <article key={fact.id}><h4>{fact.title}</h4><span>{stateName[event.state]}</span><p>{event.belief || tr("信じている内容は未記録", "Belief content unrecorded")}</p></article>)}
          {unknownCount > 0 && <p className="reader-knowledge-help">{tr(`「知らない」と記録：${unknownCount}件。情報名と内容は表示しません。`, `Recorded as unknown: ${unknownCount}. Fact names and content are hidden.`)}</p>}
          {unrecordedCount > 0 && <p className="reader-knowledge-help">{tr(`この位置まで未記録：${unrecordedCount}件。未記録を「知らない」とは扱いません。`, `Unrecorded up to this position: ${unrecordedCount}. Unrecorded does not mean unknown.`)}</p>}
          {!b.facts.length && <p>{tr("読者の認識に使う情報は未登録です。", "No facts registered for reader knowledge yet.")}</p>}
        </section>
        <section><h3>{tr("ここまでに提示した伏線", "Clues presented so far")}</h3>
          {b.clues.filter(cl => cl.plantedSceneIds.some(s => shown.has(s))).map(cl => {
            const fact = cl.factId ? factsById.get(cl.factId) : undefined;
            const knowledge = fact ? at(fact.id, scene.id) : null;
            return <article className="reader-clue" key={cl.id}><h4>{cl.title}</h4>
              <div className="reader-clue-stages" aria-label={tr("ここまでに提示した段階", "Stages presented so far")}><span>{tr("提示済み", "Presented")}</span>{cl.reinterpretedSceneId && shown.has(cl.reinterpretedSceneId) && <span>{tr("再解釈を提示済み", "Reframe presented")}</span>}{cl.payoffSceneId && shown.has(cl.payoffSceneId) && <span>{tr("回収を提示済み", "Payoff presented")}</span>}</div>
              <dl className="reader-clue-comparison"><div><dt>{tr("初読時の印象", "First impression")}</dt><dd>{cl.interpretation || tr("初読時の印象は未記録", "First impression unrecorded")}</dd></div>
                <div><dt>{tr("現在の読者の認識（関連情報）", "Current reader knowledge (related fact)")}</dt><dd>{fact && <strong>{fact.title}</strong>}{knowledge ? <><span>{stateName[knowledge.state]}</span><p>{knowledge.state === "unknown" ? tr("この時点では知らない、と記録されています。", "Recorded as unknown at this point.") : knowledge.belief || tr("信じている内容は未記録", "Belief content unrecorded")}</p></> : <p>{fact ? tr("この情報を読者がどう認識するかは、まだ記録されていません。", "No reader knowledge recorded for this fact yet.") : tr("関連情報が未設定、または参照先がありません。", "Related fact is unset or unavailable.")}</p>}</dd></div>
              </dl>
            </article>;
          })}
          {!!b.clues.length && <p className="reader-clue-help">{tr("現在の認識は「誰が・いつ・何を知るか」の読者の記録から表示します。回収の設定だけでは、真相や本当の意味を表示しません。", "Current knowledge comes from recorded reader updates. A payoff setting alone does not reveal author truth or true meaning.")}</p>}
        </section>
      </div>
    </>}
  </div>;
}
