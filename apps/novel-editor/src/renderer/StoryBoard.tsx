import { usePlanningState } from "./usePlanningState.js";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { moveStoryScene, newStoryScene, type StoryOrder, type StoryScene } from "@kohon/project-store/story-map";
import type { StoryMapController } from "./useStoryMap.js";
import { useLocale } from "./LocaleContext.js";
import { PlanningNavigator, RecordNavigator, SCENE_WINDOW, useSceneWindow, useRecordWindow } from "./PlanningNavigator.js";
import { renamePlotline } from "../shared/planning-views.js";
import { QuickSceneComposer } from "./QuickSceneComposer.js";
import { findStoryScenes } from "../shared/scene-drafts.js";
import { PlanningTitleInput } from "./PlanningTitleInput.js";
import "./planning-board.css";

/** One scene, several views: changing a lane changes its plotline; only the chosen order moves. */
export function StoryBoard({ controller: c, onDetails }: { controller: StoryMapController; onDetails(id: string): void }): ReactNode {
  const { locale } = useLocale(); const tr = (ja: string, en: string): string => locale === "ja" ? ja : en;
  const map = c.map;
  const [axis, setAxis] = usePlanningState<StoryOrder>(c.viewState, "board:axis", "narrativeOrder");
  const [selectedId, setSelectedId] = usePlanningState(c.viewState, "board:selection", "");
  const [filter, setFilter] = usePlanningState(c.viewState, "board:filter", ""); const [character, setCharacter] = usePlanningState(c.viewState, "board:character", "");
  const [draftLane, setDraftLane] = useState("");
  const [editLane, setEditLane] = useState(""); const [laneName, setLaneName] = useState("");
  const [resultPage, setResultPage] = useState(0);
  const [compact, setCompact] = usePlanningState(c.viewState, "board:compact", false); const [drop, setDrop] = useState<string | null>(null);
  const dragged = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId) return;
    const frame = requestAnimationFrame(() => {
      const inspector = document.querySelector<HTMLElement>(".story-board .planning-inspector");
      if (inspector && inspector.parentElement!.clientWidth <= 740 && inspector.getBoundingClientRect().bottom > innerHeight) inspector.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId]);
  const byId = useMemo(() => new Map(map.scenes.map(s => [s.id, s])), [map.scenes]);
  const selected = byId.get(selectedId) ?? null;
  const order = map[axis]; const lanes = [...new Set(["", ...(map.plotlines ?? []), ...map.scenes.map(s => s.plotline)])];
  const window = useSceneWindow(order, c.viewState, "board:range"); const rowWindow = useRecordWindow(lanes.length);
  const allScenes = order.flatMap(id => byId.get(id) ?? []);
  const visibleOrder = order.slice(window.start, window.start + SCENE_WINDOW);
  const showEnd = window.start + SCENE_WINDOW >= order.length;
  useEffect(() => {
    if (!selected) return;
    window.reveal(selected.id); rowWindow.setStart(lanes.indexOf(selected.plotline));
  }, [selectedId, selected?.plotline, map[axis], axis]);
  useEffect(() => {
    if (!selected) return;
    const frame = requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>(`.story-board [data-scene-id="${CSS.escape(selected.id)}"]`);
      const scroll = card?.closest<HTMLElement>(".planning-scroll");
      if (card && scroll) {
        const label = scroll.querySelector<HTMLElement>(".planning-lane")?.clientWidth ?? 148;
        const heading = scroll.querySelector<HTMLElement>(".planning-head")?.clientHeight ?? 72;
        const cardBox = card.getBoundingClientRect(); const scrollBox = scroll.getBoundingClientRect();
        scroll.scrollLeft = Math.max(0, scroll.scrollLeft + cardBox.left - scrollBox.left - label - Math.max(0, (scroll.clientWidth - label - card.clientWidth) / 2));
        scroll.scrollTop = Math.max(0, scroll.scrollTop + cardBox.top - scrollBox.top - heading - Math.max(0, (scroll.clientHeight - heading - card.clientHeight) / 2));
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId, selected?.plotline, window.start, rowWindow.start, compact, axis]);
  const ready = c.hydrated && c.status !== "loading";
  const patch = (scene: StoryScene, changes: Partial<StoryScene>, key?: string): void => c.change({ ...map, scenes: map.scenes.map(s => s.id === scene.id ? { ...s, ...changes } : s) }, key ? `${scene.id}:${key}` : null);
  const move = (id: string, boundary: number, lane?: string): void => {
    if (!ready) return;
    const next = moveStoryScene(map, axis, id, boundary);
    c.change(lane === undefined ? next : { ...next, scenes: next.scenes.map(s => s.id === id ? { ...s, plotline: lane } : s) }); setSelectedId(id); window.setStart(next[axis].indexOf(id));
  };
  const add = (lane: string, boundary: number): void => {
    if (!ready || map.scenes.length >= 5000) return;
    const scene = { ...newStoryScene(`scene-${crypto.randomUUID()}`, tr("新しい場面", "New scene")), plotline: lane };
    const insert = (ids: string[], at: number): string[] => { const next = [...ids]; next.splice(at, 0, scene.id); return next; };
    c.change({ ...map, scenes: [...map.scenes, scene], narrativeOrder: insert(map.narrativeOrder, axis === "narrativeOrder" ? boundary : map.narrativeOrder.length), chronologicalOrder: insert(map.chronologicalOrder, axis === "chronologicalOrder" ? boundary : map.chronologicalOrder.length) }); setSelectedId(scene.id); if (boundary >= window.start + SCENE_WINDOW) window.setStart(boundary);
  };
  const results = useMemo(() => findStoryScenes(map, axis, filter, character), [map, axis, filter, character]);
  const matchIds = new Set(results.map(s => s.id)); const matches = (scene: StoryScene): boolean => matchIds.has(scene.id);
  const resultStart = Math.min(resultPage * 12, Math.max(0, Math.floor((results.length - 1) / 12) * 12));
  const field = (label: string, value: string, change: (value: string) => void, long = false): ReactNode => <label className="story-field"><span>{label}</span>{long ? <textarea aria-label={label} rows={3} maxLength={4000} value={value} onChange={e => change(e.target.value)} /> : <PlanningTitleInput key={selected?.id} label={label} value={value} onChange={change} />}</label>;
  return <div className="planning-board story-board">
    <div className="planning-board-toolbar"><div><h2>{tr("場面を並べて、構成を考える", "Arrange scenes and shape the story")}</h2><p>{tr("空きマスを押して場面を追加。カードを動かして順番と筋を変更できます。", "Click an empty cell to add a scene. Move cards to change order and plotline.")}</p></div><div className="planning-controls"><label>{tr("並び方", "Order")}<select aria-label={tr("ボードの並び方", "Board order")} value={axis} onChange={e => setAxis(e.target.value as StoryOrder)}><option value="narrativeOrder">{tr("読者に見せる順", "Narrative order")}</option><option value="chronologicalOrder">{tr("作中の時系列", "Chronology")}</option></select></label><button aria-pressed={compact} onClick={() => setCompact(v => !v)}>{tr("小さく一覧", "Compact cards")}</button></div></div>
    <div className="planning-controls planning-filters"><label>{tr("人物", "Character")}<select aria-label={tr("ボードの人物", "Board character")} value={character} onChange={e => { setCharacter(e.target.value); setResultPage(0); }}><option value="">{tr("全員", "Everyone")}</option>{map.characters.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}</select></label><input aria-label={tr("場面を検索", "Find scenes")} type="search" placeholder={tr("場面・表の出来事・裏の動きを検索", "Find scenes, visible or hidden events")} value={filter} onChange={e => { setFilter(e.target.value); setResultPage(0); }} /><form onSubmit={e => { e.preventDefault(); const name = draftLane.trim(); if (name) { if ((map.plotlines?.length ?? 0) >= 200) return; c.change({ ...map, plotlines: [...new Set([...(map.plotlines ?? []), name])] }); setDraftLane(""); } }}><input maxLength={200} aria-label={tr("新しい筋の名前", "New plotline name")} placeholder={tr("本筋・サブプロットを追加", "Add a plotline")} value={draftLane} onChange={e => setDraftLane(e.target.value)} /><button disabled={!ready || !draftLane.trim() || (map.plotlines?.length ?? 0) >= 200}>{tr("筋を追加", "Add plotline")}</button></form></div>
    <QuickSceneComposer controller={c} lanes={lanes} onAdded={(position, lane) => { setSelectedId(""); setFilter(""); setCharacter(""); window.setStart(position); rowWindow.setStart(lanes.indexOf(lane)); }} />
    {(filter.trim() || character) && <section className="planning-search-results" aria-label={tr("全場面の検索結果", "Search results across all scenes")}><div className="planning-controls"><strong role="status">{tr(`${results.length} / ${order.length}場面`, `${results.length} / ${order.length} scenes`)}</strong><button onClick={() => { setFilter(""); setCharacter(""); setResultPage(0); }}>{tr("絞り込みを解除", "Clear filters")}</button>{results.length > 12 && <><button aria-label={tr("前の検索結果", "Previous search results")} disabled={resultStart === 0} onClick={() => setResultPage(resultStart / 12 - 1)}>←</button><span>{resultStart + 1}–{Math.min(results.length, resultStart + 12)}</span><button aria-label={tr("次の検索結果", "Next search results")} disabled={resultStart + 12 >= results.length} onClick={() => setResultPage(resultStart / 12 + 1)}>→</button></>}</div><p>{tr("表示範囲の外も検索しています。結果を押すと、その場面を表示して編集できます。", "Searches beyond the current range. Select a result to reveal and edit its scene.")}</p><div className="planning-result-list">{results.slice(resultStart, resultStart + 12).map(result => <button key={result.id} aria-label={`${tr("検索結果へ", "Go to result")} ${result.title}`} aria-pressed={selectedId === result.id} onClick={() => setSelectedId(result.id)}><small>{result.position + 1} · {result.plotline || tr("筋は未設定", "No plotline")}</small><strong>{result.title}</strong></button>)}</div>{!results.length && <p>{tr("一致する場面はありません。短い言葉で探すか、人物・検索の絞り込みを解除してください。", "No matching scenes. Try a shorter phrase or clear the character and search filters.")}</p>}</section>}
    <details className="planning-instructions"><summary>{tr("操作と表示のヒント", "Tips for arranging and filtering")}</summary><p className="planning-note">{tr("選んだ順番だけ変わります。もう一方の順番と原稿の章順は保持します。人物は心情を記録した人物です（登場の有無とは別）。検索はカードを隠すだけで、場面の位置を詰めません。", "Only the selected order changes. The other order and manuscript stay intact. Characters mean tracked feelings, not confirmed appearance. Filtering hides cards without closing gaps.")}</p></details>
    <details className="planning-lane-settings"><summary>{tr("筋の名前・統合・解除", "Rename, merge or remove plotlines")}</summary><form className="planning-controls" onSubmit={e => { e.preventDefault(); c.change(renamePlotline(map, editLane, laneName.trim())); setEditLane(""); setLaneName(""); }}><select aria-label={tr("編集する筋", "Plotline to edit")} value={editLane} onChange={e => { setEditLane(e.target.value); setLaneName(e.target.value); }}><option value="">{tr("筋を選ぶ", "Choose a plotline")}</option>{lanes.filter(Boolean).map(l => <option key={l} value={l}>{l}</option>)}</select><input aria-label={tr("変更後の筋の名前", "New plotline label")} maxLength={200} value={laneName} onChange={e => setLaneName(e.target.value)} /><button disabled={!ready || !editLane || laneName === editLane}>{laneName.trim() ? tr("名前を変更・統合", "Rename or merge") : tr("全場面を未設定に戻す", "Unassign all scenes")}</button></form><p>{tr("既存の名前なら統合、空欄なら所属を解除します。場面と記録は残り、↶ で戻せます。", "An existing name merges lanes; blank unassigns scenes. Scenes and notes are kept. Undo with ↶.")}</p></details>
    <PlanningNavigator scenes={allScenes} start={window.start} onStart={window.setStart} label={tr("構成ボード", "Story board")} /><RecordNavigator count={lanes.length} start={rowWindow.start} onStart={rowWindow.setStart} />
    <div className={`planning-workspace ${selected ? "has-selection" : ""}`}><div className="planning-scroll"><div className={`planning-grid ${compact ? "compact" : ""}`} style={{ "--planning-count": Math.max(1, visibleOrder.length + (showEnd ? 1 : 0)) } as CSSProperties}>
      <div className="planning-row planning-head"><div className="planning-lane">{tr("筋 × 場面", "Plotline × scene")}</div>{visibleOrder.map((id, local) => { const i = window.start + local; const s = byId.get(id)!; return <div className="planning-heading" key={id}><b>{i + 1}</b><span>{s.title}</span><small>{tr("読者", "N")} {map.narrativeOrder.indexOf(id) + 1} · {tr("時系列", "C")} {map.chronologicalOrder.indexOf(id) + 1}</small></div>; })}{showEnd && <div className="planning-heading"><b>＋</b><span>{tr("最後に追加", "Add at end")}</span></div>}</div>
      {lanes.slice(rowWindow.start, rowWindow.start + 24).map(lane => <div className="planning-row" key={lane}><div className="planning-lane"><strong>{lane || tr("筋を未設定", "Unassigned plotline")}</strong><small>{map.scenes.filter(s => s.plotline === lane && matches(s)).length} {tr("場面", "scenes")}</small></div>{[...visibleOrder, ...(showEnd ? [""] : [])].map((id, local) => {
        const index = window.start + local; const candidate = byId.get(id); const scene = candidate?.plotline === lane ? candidate : undefined; const show = scene && matches(scene); const cell = JSON.stringify([lane, index]);
        return <div className={`planning-cell ${drop === cell ? "drop-target" : ""}`} data-lane={lane} data-column={index} key={id || "end"} onDragOver={e => { if (!dragged.current) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDrop(cell); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(null); }} onDrop={e => { if (!dragged.current) return; e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); const boundary = index + (id && e.clientX > rect.left + rect.width / 2 ? 1 : 0); move(dragged.current, boundary, lane); dragged.current = null; setDrop(null); }}>
          {show ? <article data-scene-id={scene.id} className={`planning-scene-card ${selected?.id === scene.id ? "selected" : ""}`}><button className="planning-card-face" draggable={ready} aria-label={`${tr("場面カード", "Scene card")}: ${scene.title}`} onDragStart={e => { dragged.current = scene.id; e.dataTransfer.setData("application/x-kohon-scene", scene.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { dragged.current = null; setDrop(null); }} onClick={() => setSelectedId(scene.id)} onKeyDown={e => { if (e.altKey && e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); move(scene.id, e.key === "ArrowLeft" ? Math.max(0, index - 1) : Math.min(order.length, index + 2)); } }}><span className="planning-card-kind">{scene.kind === "flashback" ? tr("回想", "Flashback") : scene.kind === "offstage" ? tr("舞台裏", "Offstage") : scene.time || tr("場面", "Scene")}</span><strong>{scene.title}</strong>{!compact && <><p>{scene.surface || tr("表の出来事を記入", "Add visible events")}</p>{scene.inner && <p className="planning-hidden">{tr("裏", "Inner")} · {scene.inner}</p>}</>}<div className="planning-character-dots">{scene.beats.map(beat => { const ch = map.characters.find(x => x.id === beat.characterId); return ch ? <span key={ch.id} style={{ "--character-color": ch.color } as CSSProperties}>{ch.name}</span> : null; })}</div>{scene.tension !== null && <span className="planning-tension"><i style={{ width: `${scene.tension}%` }} />{tr("緊張", "Tension")} {scene.tension}</span>}</button><div className="planning-card-arrows"><button aria-label={`${scene.title} ${tr("ボードで前へ", "earlier on board")}`} disabled={!ready || index === 0} onClick={() => move(scene.id, index - 1)}>←</button><button aria-label={`${scene.title} ${tr("ボードで後へ", "later on board")}`} disabled={!ready || index === order.length - 1} onClick={() => move(scene.id, index + 2)}>→</button></div></article> : scene ? <span className="planning-filtered">{tr("絞り込みで非表示", "Filtered out")}</span> : <button className="planning-empty-cell" disabled={!ready || map.scenes.length >= 5000} aria-label={`${lane || tr("未設定の筋", "Unassigned plotline")} ${index + 1} ${tr("場面を追加", "add scene")}`} onClick={() => add(lane, index)}>＋<small>{tr("ここに場面", "Add scene here")}</small></button>}
        </div>;
      })}</div>)}
    </div></div>{selected && <aside className="planning-inspector" aria-label={tr("ボードで場面を編集", "Edit scene on board")}><div className="planning-inspector-title"><strong>{tr("選んだ場面", "Selected scene")}</strong><button aria-label={tr("場面の選択を解除", "Clear scene selection")} onClick={() => setSelectedId("")}>×</button></div><label className="story-field"><span>{tr("選んだ順番の移動先", "Position in selected order")}</span><select aria-label={tr("ボードの場面の移動先", "Scene position on board")} value={order.indexOf(selected.id)} onChange={e => { const target = Number(e.target.value); const from = order.indexOf(selected.id); move(selected.id, target > from ? target + 1 : target); }}>{allScenes.map((s, i) => <option key={s.id} value={i}>{i + 1}. {s.title}</option>)}</select></label>{field(tr("ボードの場面名", "Board scene title"), selected.title, v => patch(selected, { title: v }, "title"))}<label className="story-field"><span>{tr("所属する筋", "Plotline")}</span><select aria-label={tr("所属する筋", "Plotline")} value={selected.plotline} onChange={e => patch(selected, { plotline: e.target.value })}>{lanes.map(l => <option key={l} value={l}>{l || tr("未設定", "Unassigned")}</option>)}</select></label>{field(tr("ボードの表の出来事", "Visible events on board"), selected.surface, v => patch(selected, { surface: v }, "surface"), true)}{field(tr("ボードの裏の動き", "Hidden events on board"), selected.inner, v => patch(selected, { inner: v }, "inner"), true)}<label className="story-field"><span>{tr("場面の緊張（未定は空欄）", "Scene tension (blank = unknown)")}</span><input aria-label={tr("ボードの緊張", "Board tension")} type="number" min={0} max={100} value={selected.tension ?? ""} onChange={e => { const n = e.target.value === "" ? null : Number(e.target.value); if (n === null || Number.isInteger(n) && n >= 0 && n <= 100) patch(selected, { tension: n }, "tension"); }} /></label><button className="planning-primary" onClick={() => onDetails(selected.id)}>{tr("感情・表情も詳しく編集 →", "Edit feelings and expressions →")}</button><p className="planning-note">{tr("移動も編集も、上の ↶ で元に戻せます。", "Undo moves and edits with ↶ above.")}</p></aside>}</div>
  </div>;
}
