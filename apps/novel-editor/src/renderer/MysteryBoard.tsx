import { usePlanningState } from "./usePlanningState.js";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { emptyMysteryBoard, type KnowledgeState, type MysteryBoard as BoardData, type MysteryClue } from "@kohon/project-store/mystery";
import type { StoryMapController } from "./useStoryMap.js";
import { moveMysteryPlacement, recordKnowledge, type Placement, type PlacementKind } from "../shared/planning-interactions.js";
import { useLocale } from "./LocaleContext.js";
import { PlanningNavigator, RecordNavigator, SCENE_WINDOW, useSceneWindow, useRecordWindow } from "./PlanningNavigator.js";
import { indexKnowledge } from "../shared/planning-views.js";
import "./planning-board.css";

type View = "clues" | "knowledge" | "items" | "deductions";
type EditKind = "clues" | "knowledge" | "facts" | "custody" | "deductions" | "items";
interface Selection { rowId: string; sceneId: string; placement: Placement | null }
const uid = (): string => `m-${crypto.randomUUID()}`;

/** Place first, inspect second. Board cells are buttons as well as drop targets. */
export function MysteryBoard({ controller: c, onEdit, onStory, onScene }: {
  controller: StoryMapController; onEdit(kind: EditKind, id: string): void; onStory(): void; onScene(id: string): void;
}): ReactNode {
  const { locale } = useLocale(); const tr = (ja: string, en: string): string => locale === "ja" ? ja : en;
  const b = c.map.mystery ?? emptyMysteryBoard(); const map = c.map;
  const [view, setView] = usePlanningState<View>(c.viewState, "placement:view", "clues"); const [holder, setHolder] = usePlanningState(c.viewState, "placement:holder", "reader");
  const [selection, setSelection] = usePlanningState<Selection | null>(c.viewState, "placement:selection", null); const [name, setName] = usePlanningState(c.viewState, "placement:draftName", "");
  const [initialScene, setInitialScene] = usePlanningState(c.viewState, "placement:initial", ""); const nameInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = usePlanningState(c.viewState, "placement:query", ""); const [drop, setDrop] = useState<string | null>(null);
  const [dependency, setDependency] = useState(""); const [message, setMessage] = useState("");
  const dragged = useRef<Placement | null>(null);
  useEffect(() => {
    if (!selection) return;
    const frame = requestAnimationFrame(() => {
      const inspector = document.querySelector<HTMLElement>(".mystery-placement-board .planning-inspector");
      if (inspector && inspector.parentElement!.clientWidth <= 740 && inspector.getBoundingClientRect().bottom > innerHeight) inspector.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selection]);
  const effectiveHolder = holder === "reader" || map.characters.some(ch => ch.id === holder) ? holder : "reader";
  const axis = view === "items" || view === "knowledge" && effectiveHolder !== "reader" ? "chronologicalOrder" : "narrativeOrder";
  const order = map[axis]; const byId = useMemo(() => new Map(map.scenes.map(s => [s.id, s])), [map.scenes]);
  const scenes = order.flatMap(id => byId.get(id) ?? []); const window = useSceneWindow(order, c.viewState, "placement:range");
  const visibleScenes = scenes.slice(window.start, window.start + SCENE_WINDOW);
  const knowledge = useMemo(() => indexKnowledge(map, b, effectiveHolder), [map, b, effectiveHolder]);
  const clueById = useMemo(() => new Map(b.clues.map(cl => [cl.id, cl])), [b.clues]);
  const deductionById = useMemo(() => new Map(b.deductions.map(d => [d.id, d])), [b.deductions]);
  const eventsByCell = useMemo(() => { const cells = new Map<string, typeof b.knowledge>(); for (const e of b.knowledge) if (e.holderId === effectiveHolder) { const key = `${e.factId}:${e.sceneId}`; const list = cells.get(key) ?? []; list.push(e); cells.set(key, list); } return cells; }, [b.knowledge, effectiveHolder]);
  const custodyByCell = useMemo(() => { const cells = new Map<string, typeof b.custody>(); for (const e of b.custody) { const key = `${e.itemId}:${e.sceneId}`; const list = cells.get(key) ?? []; list.push(e); cells.set(key, list); } return cells; }, [b.custody]);
  const ready = c.hydrated && c.status !== "loading";
  const write = (board: BoardData, key?: string): void => { if (ready) c.change({ ...map, mystery: board }, key ?? null); };
  const label = (kind: PlacementKind): string => ({ plant: tr("提示", "Plant"), reframe: tr("再解釈", "Reframe"), payoff: tr("回収", "Payoff"), knowledge: tr("認識の更新", "Knowledge update"), custody: tr("物証の変化", "Item change"), deduction: tr("推理する", "Deduce") })[kind];
  const states: { id: KnowledgeState; label: string }[] = [{ id: "unknown", label: tr("知らない", "Unknown") }, { id: "suspects", label: tr("疑う", "Suspects") }, { id: "believes", label: tr("信じる", "Believes") }, { id: "knows", label: tr("真相を知る", "Knows truth") }, { id: "misunderstands", label: tr("誤解", "Misunderstands") }];
  const custodyStates = [{ id: "held", label: tr("所持", "Held") }, { id: "stored", label: tr("保管", "Stored") }, { id: "destroyed", label: tr("破壊", "Destroyed") }, { id: "missing", label: tr("所在不明", "Missing") }, { id: "locked", label: tr("施錠", "Locked") }, { id: "unlocked", label: tr("解錠", "Unlocked") }];
  const rows = (view === "clues" ? b.clues.map(x => ({ id: x.id, title: x.title })) : view === "knowledge" ? b.facts.map(x => ({ id: x.id, title: x.title })) : view === "items" ? b.items.map(x => ({ id: x.id, title: x.name })) : b.deductions.map(x => ({ id: x.id, title: x.title }))).filter(row => !query.trim() || row.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const rowWindow = useRecordWindow(rows.length);
  const chosenRow = selection ? rows.find(row => row.id === selection.rowId) : null;
  let selected = chosenRow && selection && scenes.some(s => s.id === selection.sceneId) ? selection : null;
  // Undo or edits in another view can relocate/remove the selected occurrence. Follow its
  // current location when identifiable; never show stale controls for a removed planting.
  if (selected?.placement) {
    const p = selected.placement; let current: string | null = null;
    if (p.kind === "plant") current = b.clues.find(cl => cl.id === p.rowId)?.plantedSceneIds.includes(p.sceneId) ? p.sceneId : null;
    else if (p.kind === "reframe") current = b.clues.find(cl => cl.id === p.rowId)?.reinterpretedSceneId ?? null;
    else if (p.kind === "payoff") current = b.clues.find(cl => cl.id === p.rowId)?.payoffSceneId ?? null;
    else if (p.kind === "knowledge") current = b.knowledge.find(e => e.id === p.rowId && e.factId === selected!.rowId && e.holderId === effectiveHolder)?.sceneId ?? null;
    else if (p.kind === "custody") current = b.custody.find(e => e.id === p.rowId && e.itemId === selected!.rowId)?.sceneId ?? null;
    else current = b.deductions.find(d => d.id === p.rowId)?.sceneId ?? null;
    selected = current && scenes.some(s => s.id === current) ? { ...selected, sceneId: current, placement: { ...p, sceneId: current } } : { ...selected, placement: null };
  }
  const chosenClue = b.clues.find(cl => cl.id === selected?.rowId);
  const chosenFact = b.facts.find(f => f.id === selected?.rowId);
  const selectedEvent = selected?.placement?.kind === "knowledge" ? b.knowledge.find(e => e.id === selected.placement!.rowId) : b.knowledge.findLast(e => e.factId === selected?.rowId && e.holderId === effectiveHolder && e.sceneId === selected?.sceneId);
  const selectedCustody = b.custody.find(e => e.id === selected?.placement?.rowId);
  const selectedDeduction = b.deductions.find(d => d.id === selected?.rowId);
  useEffect(() => {
    if (!selected) return;
    window.reveal(selected.sceneId); rowWindow.setStart(rows.findIndex(row => row.id === selected.rowId));
  }, [selected?.sceneId, selected?.rowId, axis]);
  const patchClue = (changes: Partial<MysteryClue>, key?: string): void => { if (chosenClue) write({ ...b, clues: b.clues.map(cl => cl.id === chosenClue.id ? { ...cl, ...changes } : cl) }, key ? `mystery:${chosenClue.id}:${key}` : undefined); };
  const choose = (rowId: string, sceneId: string, placement: Placement | null = null): void => { setSelection({ rowId, sceneId, placement }); setDependency(""); setMessage(""); window.reveal(sceneId); };
  const move = (placement: Placement, to: string, rowId: string): void => {
    const next = moveMysteryPlacement(map, b, placement, to); if (next === b) return;
    write(next); choose(rowId, to, { ...placement, sceneId: to }); setMessage(tr("配置を変更しました。↶ で元に戻せます。", "Placement changed. Undo with ↶."));
  };
  const placeClue = (kind: "plant" | "reframe" | "payoff"): void => {
    if (!selected || !chosenClue) return;
    patchClue(kind === "plant" ? { plantedSceneIds: [...new Set([...chosenClue.plantedSceneIds, selected.sceneId])] } : kind === "reframe" ? { reinterpretedSceneId: selected.sceneId } : { payoffSceneId: selected.sceneId });
    choose(chosenClue.id, selected.sceneId, { kind, rowId: chosenClue.id, sceneId: selected.sceneId });
  };
  const remove = (): void => {
    const p = selected?.placement; if (!p) return;
    if (p.kind === "plant") patchClue({ plantedSceneIds: chosenClue!.plantedSceneIds.filter(id => id !== p.sceneId) });
    else if (p.kind === "reframe") patchClue({ reinterpretedSceneId: null });
    else if (p.kind === "payoff") patchClue({ payoffSceneId: null });
    else if (p.kind === "knowledge") write({ ...b, knowledge: b.knowledge.filter(e => e.id !== p.rowId) });
    else if (p.kind === "custody") write({ ...b, custody: b.custody.filter(e => e.id !== p.rowId) });
    else write({ ...b, deductions: b.deductions.map(d => d.id === p.rowId ? { ...d, sceneId: null } : d) });
    if (selected) choose(selected.rowId, selected.sceneId);
  };
  const create = (): void => {
    if (!name.trim() || !ready || (view === "clues" ? b.clues : view === "knowledge" ? b.facts : view === "items" ? b.items : b.deductions).length >= 5000) return; const id = uid(); const sceneId = scenes.some(scene => scene.id === initialScene) ? initialScene : ""; const title = name.trim();
    if (view === "clues") write({ ...b, clues: [...b.clues, { id, title, factId: null, kind: "clue", plantedSceneIds: sceneId ? [sceneId] : [], reinterpretedSceneId: null, payoffSceneId: null, status: "planned", interpretation: "", meaning: "", quote: "", chapterId: null, checkedVersion: null }] });
    if (view === "knowledge") write({ ...b, facts: [...b.facts, { id, title, truth: "", notes: "" }] });
    if (view === "items") write({ ...b, items: [...b.items, { id, name: title, notes: "" }] });
    if (view === "deductions") write({ ...b, deductions: [...b.deductions, { id, title, sceneId: sceneId || null, holderId: "reader", factIds: [], clueIds: [], custodyIds: [], testimonyIds: [], dependsOnIds: [], conclusionFactId: null, notes: "", alternatives: "" }] });
    setName(""); setQuery(""); rowWindow.setStart(rows.length);
    if (sceneId && (view === "clues" || view === "deductions")) choose(id, sceneId, view === "clues" ? { kind: "plant", rowId: id, sceneId } : { kind: "deduction", rowId: id, sceneId });
    else setSelection(null);
    nameInput.current?.focus({ preventScroll: true });
  };
  const field = (title: string, value: string, change: (v: string) => void, long = false): ReactNode => <label className="story-field"><span>{title}</span>{long ? <textarea aria-label={title} value={value} rows={3} maxLength={4000} onChange={e => change(e.target.value)} /> : <input aria-label={title} maxLength={200} value={value} onChange={e => change(e.target.value)} />}</label>;
  const token = (rowId: string, p: Placement, text: string, note: string, color: string): ReactNode => <button key={`${p.kind}:${p.rowId}`} className={`planning-token ${color} ${selected?.placement?.kind === p.kind && selected.placement.rowId === p.rowId && selected.sceneId === p.sceneId ? "selected" : ""}`} aria-label={`${rows.find(r => r.id === rowId)?.title ?? ""} · ${text} · ${scenes.find(s => s.id === p.sceneId)?.title ?? ""}`} draggable={ready} onDragStart={e => { dragged.current = p; e.dataTransfer.setData("application/x-kohon-placement", JSON.stringify(p)); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { dragged.current = null; setDrop(null); }} onClick={() => choose(rowId, p.sceneId, p)} onKeyDown={e => { if (e.altKey && e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); const index = order.indexOf(p.sceneId) + (e.key === "ArrowLeft" ? -1 : 1); if (order[index]) move(p, order[index]!, rowId); } }}><span>{text}</span>{note && <small>{note}</small>}</button>;
  const viewNames = { clues: tr("伏線を配置", "Place clues"), knowledge: tr("知識を配置", "Place knowledge"), items: tr("物証を配置", "Place evidence"), deductions: tr("推理を配置", "Place deductions") };
  return <div className="planning-board mystery-placement-board"><div className="planning-board-toolbar"><div><h2>{tr("場面に置いて、情報の渡し方を考える", "Plan how information reaches the reader")}</h2><p>{tr("マスを押して記録。配置をドラッグして、どこで知らせるかを変えられます。", "Click a cell to record. Drag a placement to change when it appears.")}</p></div><div className="planning-controls"><label>{tr("配置するもの", "What to place")}<select aria-label={tr("配置ボードの種類", "Placement board type")} value={view} onChange={e => { setView(e.target.value as View); setSelection(null); setQuery(""); setName(""); }}>{Object.entries(viewNames).map(([id, text]) => <option value={id} key={id}>{text}</option>)}</select></label>{view === "knowledge" && <label>{tr("視点", "Perspective")}<select aria-label={tr("知識ボードの視点", "Knowledge board perspective")} value={effectiveHolder} onChange={e => { setHolder(e.target.value); setSelection(null); }}><option value="reader">{tr("読者", "Reader")}</option>{map.characters.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}</select></label>}</div></div>
    <form className="planning-inline-add" onSubmit={e => { e.preventDefault(); create(); }}><input ref={nameInput} aria-label={tr("ボードに追加する名前", "Name to add on board")} maxLength={200} value={name} onChange={e => setName(e.target.value)} placeholder={view === "clues" ? tr("例：濡れていない傘", "e.g. the dry umbrella") : view === "knowledge" ? tr("例：鍵の持ち主", "e.g. who holds the key") : view === "items" ? tr("例：合鍵", "e.g. duplicate key") : tr("例：出来事の理由を考える", "e.g. explain what happened")} />{(view === "clues" || view === "deductions") && <label className="planning-create-position">{tr("追加時の配置", "Place on creation")}<select aria-label={tr("名前を追加するときの場面", "Scene for new record")} value={scenes.some(scene => scene.id === initialScene) ? initialScene : ""} onChange={e => setInitialScene(e.target.value)}><option value="">{tr("名前だけ登録（配置はあとで）", "Name only — place later")}</option>{scenes.map((scene, i) => <option key={scene.id} value={scene.id}>{i + 1}. {scene.title}</option>)}</select></label>}<button disabled={!ready || !name.trim() || (view === "clues" ? b.clues : view === "knowledge" ? b.facts : view === "items" ? b.items : b.deductions).length >= 5000}>{tr("ボードに追加", "Add to board")}</button><input aria-label={tr("配置の名前を検索", "Find placement names")} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={tr("名前で絞り込み", "Filter names")} /></form>
    <div className="planning-axis-caption">{axis === "narrativeOrder" ? tr("読者に見せる順に配置", "Place in narrative order") : tr("作中の時系列に配置", "Place in chronological order")}</div>
    <details className="planning-instructions"><summary>{tr("操作と表示のヒント", "Tips for arranging and filtering")}</summary><p className="planning-note">{axis === "narrativeOrder" ? tr("横軸：読者に見せる順。動かしても場面そのものの順番は変わりません。", "Narrative order. Moving placements does not reorder scenes.") : tr("横軸：作中の時系列。人物の知識と物証は、実際に起きた順で確認します。", "Chronology. Character knowledge and evidence follow actual events.")} {tr("ドラッグ以外に、選択後の場面指定や Alt+Shift+← → でも移動できます。", "Move by drag, scene selector or Alt+Shift+← →.")}</p>
    <p className="planning-note">{view === "clues" ? tr("提示 → 再解釈 → 回収。色と文字で区別します。", "Plant → reframe → payoff, labeled in words and colors.") : view === "knowledge" ? tr("認識の更新はカード、引き継いだ認識は ↳。未記録は「知らない」と区別します。", "Cards update knowledge; ↳ carries it forward. Unrecorded differs from unknown.") : view === "items" ? tr("所持・保管・破壊などの変化を文字で確認します。", "Item changes are labeled held, stored, destroyed and more.") : tr("推理の場面と結論を表示します。前提の接続は選んだ推理の編集欄へ。", "Shows deduction scenes and conclusions. Select a deduction to connect premises.")}</p>
    </details>
    <PlanningNavigator scenes={scenes} start={window.start} onStart={window.setStart} label={tr("配置ボード", "Placement board")} /><RecordNavigator count={rows.length} start={rowWindow.start} onStart={rowWindow.setStart} />
    {!scenes.length ? <div className="planning-empty-guide"><strong>{tr("まず、物語の場面を置きましょう。", "Start with scenes where events happen.")}</strong><p>{tr("場面名だけで構いません。構成ボードに場面を置いたら、ここで手掛かりや知識を重ねていけます。", "Scene titles are enough. Once scenes exist, layer clues and knowledge here.")}</p><button onClick={onStory}>{tr("構成ボードで場面を作る →", "Create scenes on the story board →")}</button></div> : <div className={`planning-workspace ${selected ? "has-selection" : ""}`}><div className="planning-scroll">{!rows.length && <div className="planning-empty-guide"><strong>{tr("記録がありません。名前を追加するか、検索を解除してください。", "No matching records. Add a name or clear the search.")}</strong><p>{view === "clues" ? tr("提示・再解釈・回収を同じ行で比較できます。回収を先に決めてから、手掛かりを逆算して置くこともできます。", "Compare planting, reinterpretation and payoff in one row. Start with the payoff and work backward to the clues.") : tr("追加した記録と場面が交わるマスを押すと、その場面での状態を記録できます。", "Click where a record meets a scene to record its state there.")}</p></div>}<div className="planning-grid" style={{ "--planning-count": visibleScenes.length } as CSSProperties}><div className="planning-row planning-head"><div className="planning-lane">{viewNames[view]}</div>{visibleScenes.map((s, local) => <div className="planning-heading" key={s.id}><b>{window.start + local + 1}</b><button onClick={() => onScene(s.id)}>{s.title}</button><small>{s.time || (s.kind === "offstage" ? tr("舞台裏", "Offstage") : "")}</small></div>)}</div>{rows.slice(rowWindow.start, rowWindow.start + 24).map(row => <div className="planning-row" key={row.id}><div className="planning-lane"><strong>{row.title}</strong><button onClick={() => onEdit(view === "knowledge" ? "facts" : view === "items" ? "items" : view, row.id)}>{tr("詳細", "Details")}</button>{view === "clues" && !clueById.get(row.id)?.plantedSceneIds.length && !clueById.get(row.id)?.payoffSceneId && !clueById.get(row.id)?.reinterpretedSceneId && <small>{tr("まだ場面に未配置", "Not placed yet")}</small>}{view === "deductions" && !b.deductions.find(d => d.id === row.id)?.sceneId && <small>{tr("まだ場面に未配置", "Not placed yet")}</small>}</div>{visibleScenes.map(s => {
      const cellId = `${row.id}:${s.id}`; const clue = view === "clues" ? clueById.get(row.id) : null;
      const events = view === "knowledge" ? (eventsByCell.get(cellId) ?? []) : [];
      const known = view === "knowledge" ? knowledge(row.id, s.id) : null;
      const custody = view === "items" ? (custodyByCell.get(cellId) ?? []) : [];
      const d = view === "deductions" ? (deductionById.get(row.id)?.sceneId === s.id ? deductionById.get(row.id) : null) : null;
      const placements: ReactNode[] = [];
      if (clue?.plantedSceneIds.includes(s.id)) placements.push(token(row.id, { kind: "plant", rowId: row.id, sceneId: s.id }, label("plant"), clue.interpretation, "plant"));
      if (clue?.reinterpretedSceneId === s.id) placements.push(token(row.id, { kind: "reframe", rowId: row.id, sceneId: s.id }, label("reframe"), clue.meaning, "reframe"));
      if (clue?.payoffSceneId === s.id) placements.push(token(row.id, { kind: "payoff", rowId: row.id, sceneId: s.id }, label("payoff"), clue.meaning, "payoff"));
      for (const e of events) placements.push(token(row.id, { kind: "knowledge", rowId: e.id, sceneId: s.id }, states.find(x => x.id === e.state)!.label, e.belief, e.state === "knows" ? "payoff" : e.state === "misunderstands" ? "reframe" : "plant"));
      for (const e of custody) {
        const holder = map.characters.find(ch => ch.id === e.characterId)?.name;
        const location = b.locations.find(l => l.id === e.locationId)?.name;
        placements.push(token(row.id, { kind: "custody", rowId: e.id, sceneId: s.id }, custodyStates.find(x => x.id === e.state)!.label, [holder, location, e.notes].filter(Boolean).join(" · "), "plant"));
      }
      if (d) placements.push(token(row.id, { kind: "deduction", rowId: d.id, sceneId: s.id }, label("deduction"), b.facts.find(f => f.id === d.conclusionFactId)?.title ?? d.notes, "payoff"));
      return <div className={`planning-cell ${drop === cellId ? "drop-target" : ""}`} data-record-row={row.id} data-scene={s.id} key={s.id} onDragOver={e => { const p = dragged.current; if (!p) return; const ownRow = p.kind === "knowledge" ? b.knowledge.find(x => x.id === p.rowId)?.factId : p.kind === "custody" ? b.custody.find(x => x.id === p.rowId)?.itemId : p.rowId; if (ownRow !== row.id) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDrop(cellId); }} onDrop={e => { const p = dragged.current; if (!p || drop !== cellId) return; e.preventDefault(); move(p, s.id, row.id); dragged.current = null; setDrop(null); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(null); }}>
        {placements}{view === "knowledge" && !known && <small className="planning-carried">{tr("未記録", "Unrecorded")}</small>}{known && !events.length && <div className="planning-carried">↳ {states.find(x => x.id === known.state)!.label}<small>{known.belief}</small></div>}<button className="planning-cell-edit" disabled={!ready} aria-label={`${row.title} · ${s.title} · ${tr("配置を編集", "edit placement")}`} onClick={() => choose(row.id, s.id)}>＋ {tr("記録", "Record")}</button>
      </div>;
    })}</div>)}</div></div>{selected && <aside className="planning-inspector" aria-label={tr("配置を編集する", "Edit placement")}><div className="planning-inspector-title"><strong>{chosenRow!.title}</strong><button aria-label={tr("配置の選択を解除", "Clear placement selection")} onClick={() => setSelection(null)}>×</button></div><p className="planning-related">{scenes.find(s => s.id === selected.sceneId)?.title}</p>
      {selected.placement && <label className="story-field"><span>{tr("この記録を移す場面", "Move this record to a scene")}</span><select aria-label={tr("記録の移動先", "Placement destination")} value={selected.sceneId} onChange={e => move(selected.placement!, e.target.value, selected.rowId)}>{scenes.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>}
      {view === "clues" && chosenClue && <><div className="planning-empty-actions"><button onClick={() => placeClue("plant")}>{tr("ここに提示する", "Plant here")}</button><button onClick={() => placeClue("reframe")}>{tr("ここで再解釈する", "Reinterpret here")}</button><button onClick={() => placeClue("payoff")}>{tr("ここで回収する", "Pay off here")}</button></div>{field(tr("ボードの初読での印象", "First impression on board"), chosenClue.interpretation, v => patchClue({ interpretation: v }, "interpretation"), true)}{field(tr("ボードの本当の意味", "Real meaning on board"), chosenClue.meaning, v => patchClue({ meaning: v }, "meaning"), true)}<button onClick={() => onEdit("clues", chosenClue.id)}>{tr("引用・回収状態も編集 →", "Edit quotes and status →")}</button></>}
      {view === "knowledge" && chosenFact && <><p className="planning-related">{effectiveHolder === "reader" ? tr("読者", "Reader") : map.characters.find(ch => ch.id === effectiveHolder)?.name}</p><div className="planning-quick-states">{states.map(state => <button key={state.id} disabled={!ready || !selectedEvent && b.knowledge.length >= 5000} aria-pressed={selectedEvent?.state === state.id} onClick={() => { const next = recordKnowledge(map, b, chosenFact.id, effectiveHolder, selected.sceneId, state.id, uid()); write(next); const updated = next.knowledge.findLast(e => e.factId === chosenFact.id && e.holderId === effectiveHolder && e.sceneId === selected.sceneId); setSelection({ ...selected, placement: updated ? { kind: "knowledge", rowId: updated.id, sceneId: selected.sceneId } : null }); }}>{state.label}</button>)}</div>{selectedEvent && field(tr("ボードで信じている内容", "Belief on board"), selectedEvent.belief, v => write({ ...b, knowledge: b.knowledge.map(e => e.id === selectedEvent.id ? { ...e, belief: v } : e) }, `mystery:${selectedEvent.id}:belief`), true)}<small>{tr("前の認識は引き継がれます。更新を消すと、それ以前の記録に戻ります。", "Knowledge carries forward. Removing an update restores the earlier recorded state.")}</small><button onClick={() => onEdit(selectedEvent ? "knowledge" : "facts", selectedEvent?.id ?? chosenFact.id)}>{tr("真相・情報源も編集 →", "Edit truth and sources →")}</button></>}
      {view === "items" && <>{selectedCustody ? <>
        <label className="story-field"><span>{tr("ボードの物証の状態", "Item state on board")}</span><select aria-label={tr("ボードの物証の状態", "Item state on board")} value={selectedCustody.state} onChange={e => write({ ...b, custody: b.custody.map(x => x.id === selectedCustody.id ? { ...x, state: e.target.value as typeof x.state } : x) })}>{custodyStates.map(s => <option value={s.id} key={s.id}>{s.label}</option>)}</select></label>
        <label className="story-field"><span>{tr("ボードの所持者", "Item holder on board")}</span><select aria-label={tr("ボードの所持者", "Item holder on board")} value={selectedCustody.characterId ?? ""} onChange={e => write({ ...b, custody: b.custody.map(x => x.id === selectedCustody.id ? { ...x, characterId: e.target.value || null } : x) })}><option value="">{tr("未設定", "Unset")}</option>{selectedCustody.characterId && !map.characters.some(ch => ch.id === selectedCustody.characterId) && <option value={selectedCustody.characterId}>{tr("参照先なし", "Missing reference")}</option>}{map.characters.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}</select></label>
        {field(tr("受け渡し・操作メモ", "Transfer and operation notes"), selectedCustody.notes, v => write({ ...b, custody: b.custody.map(x => x.id === selectedCustody.id ? { ...x, notes: v } : x) }, `mystery:${selectedCustody.id}:notes`), true)}
        <button onClick={() => onEdit("custody", selectedCustody.id)}>{tr("保管場所を編集 →", "Edit storage location →")}</button>
      </> : <button disabled={!ready || b.custody.length >= 5000} onClick={() => { const id = uid(); write({ ...b, custody: [...b.custody, { id, itemId: selected.rowId, sceneId: selected.sceneId, characterId: null, locationId: null, state: "stored", notes: "" }] }); choose(selected.rowId, selected.sceneId, { kind: "custody", rowId: id, sceneId: selected.sceneId }); }}>{tr("ここで物証の変化を記録", "Record item change here")}</button>}</>}
      {view === "deductions" && selectedDeduction && <><button onClick={() => { write({ ...b, deductions: b.deductions.map(d => d.id === selectedDeduction.id ? { ...d, sceneId: selected.sceneId } : d) }); choose(selected.rowId, selected.sceneId, { kind: "deduction", rowId: selected.rowId, sceneId: selected.sceneId }); }}>{tr("この場面で推理する", "Deduce in this scene")}</button><div className="planning-connection"><label className="story-field"><span>{tr("前提となる別の推理", "A prior deduction")}</span><select aria-label={tr("ボードで推理を接続", "Connect deductions on board")} value={dependency} onChange={e => setDependency(e.target.value)}><option value="">{tr("選択してください", "Choose one")}</option>{b.deductions.filter(d => d.id !== selectedDeduction.id && !selectedDeduction.dependsOnIds.includes(d.id)).map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label><button disabled={!dependency} onClick={() => { write({ ...b, deductions: b.deductions.map(d => d.id === selectedDeduction.id ? { ...d, dependsOnIds: [...new Set([...d.dependsOnIds, dependency])] } : d) }); setDependency(""); }}>{tr("根拠としてつなぐ", "Connect as a premise")}</button>{selectedDeduction.dependsOnIds.map(id => <div className="planning-row-actions" key={id}><span className="planning-related">{b.deductions.find(d => d.id === id)?.title ?? tr("参照先なし", "Missing reference")} →</span><button aria-label={`${tr("推理の接続を外す", "Disconnect deduction")}: ${b.deductions.find(d => d.id === id)?.title ?? tr("参照先なし", "Missing reference")}`} onClick={() => write({ ...b, deductions: b.deductions.map(d => d.id === selectedDeduction.id ? { ...d, dependsOnIds: d.dependsOnIds.filter(x => x !== id) } : d) })}>×</button></div>)}</div><button onClick={() => onEdit("deductions", selectedDeduction.id)}>{tr("結論・代替説も編集 →", "Edit conclusion and alternatives →")}</button></>}
      {selected.placement && <button className="story-danger" onClick={remove}>{tr("この配置を外す（元に戻せます）", "Remove this placement (undoable)")}</button>}<p className="planning-note" role="status">{message || tr("選択した記録だけ編集します。↶ で操作を戻せます。", "Only this record changes. Undo with ↶.")}</p>
    </aside>}</div>}
  </div>;
}
