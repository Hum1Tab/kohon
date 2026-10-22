import { usePlanningState } from "./usePlanningState.js";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { curveSegments, emptyBeat, updateCharacterBeat, hasRecordedBeat, moveStoryScene, newStoryScene, removeStoryScene, STORY_COLORS, type CharacterBeat, type EmotionLayer, type SceneAnchor, type StoryMap, type StoryOrder, type StoryScene } from "@kohon/project-store/story-map";
import type { Chapter } from "@kohon/project-store";
import type { StoryMapController } from "./useStoryMap.js";
import { AppIcon } from "./AppIcon.js";
import { useLocale } from "./LocaleContext.js";
import { MysteryPanel } from "./MysteryPanel.js";
import { PlanningNavigator, SCENE_WINDOW, useSceneWindow } from "./PlanningNavigator.js";
import { PlanningTitleInput } from "./PlanningTitleInput.js";
import { EmotionTable } from "./EmotionTable.js";
import {StoryAtlas} from "./StoryAtlas.js";
import {SceneManuscriptLink} from "./SceneManuscriptLink.js";
const ReaderPreview = lazy(() => import("./ReaderPreview.js").then(module => ({ default: module.ReaderPreview })));
const StoryBoard = lazy(() => import("./StoryBoard.js").then(module => ({ default: module.StoryBoard })));

const uid = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;
type Layer = "both" | "surface" | "inner";
type Metric = "intensity" | "valence";
const STEP = 184;
const HEIGHT = 108;

/** Aligned scene columns, curves and notes share one scroll area and one selection. */
export function StoryMapPanel({ controller: c, chapters, onOpenChapter, readChapter, currentManuscriptAnchor }: {
  controller: StoryMapController; chapters: Chapter[]; onOpenChapter(id: string, range?: { start: number; end: number }): void;
  readChapter?(id: string): Promise<{ text: string; version: string }>;
  currentManuscriptAnchor?(): { chapterId: string; anchor: SceneAnchor } | null;
}): ReactNode {
  const { locale } = useLocale();
  const tr = (ja: string, en: string): string => locale === "ja" ? ja : en;
  const map = c.map;
  const [axis, setAxis] = usePlanningState<StoryOrder>(c.viewState, "flow:axis", "narrativeOrder");
  const window = useSceneWindow(map[axis], c.viewState, "flow:range");
  const [visitedReader, setVisitedReader] = useState(false); const [visitedBoard, setVisitedBoard] = useState(false); const [visitedInfo, setVisitedInfo] = useState(false);
  const [mode, setMode] = usePlanningState<"atlas" | "story" | "board" | "emotions" | "mystery" | "reader">(c.viewState, "flow:mode", "atlas");
  const [layer, setLayer] = usePlanningState<Layer>(c.viewState, "flow:layer", "both");
  const [metric, setMetric] = usePlanningState<Metric>(c.viewState, "flow:metric", "intensity");
  const [overviewCharacterId, setOverviewCharacterId] = usePlanningState(c.viewState, "flow:overview", "");
  const [selectedId, setSelectedId] = usePlanningState<string | null>(c.viewState, "flow:selection", null);
  const [editingCharacterId, setEditingCharacterId] = usePlanningState(c.viewState, "flow:character", "");
  const [hiddenCharacters, setHiddenCharacters] = usePlanningState<string[]>(c.viewState, "flow:hidden", []);
  const [expanded, setExpanded] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [dropBoundary, setDropBoundary] = useState<number | null>(null);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [linkMessage, setLinkMessage] = useState("");
  const dragId = useRef<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const pendingSceneJump = useRef<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    return () => previous?.focus();
  }, [expanded]);
  useEffect(() => {
    const id = pendingSceneJump.current;
    if (mode !== "story" || id === null) return;
    pendingSceneJump.current = null;
    const index = map[axis].indexOf(id);
    if (index >= 0 && chartRef.current) chartRef.current.scrollLeft = Math.max(0, (index - window.start) * STEP - (chartRef.current.clientWidth - 136) / 2 + STEP / 2);
    titleRef.current?.focus({ preventScroll: true });
  }, [mode, axis, map, window.start]);
  const scenesById = useMemo(() => new Map(map.scenes.map(s => [s.id, s])), [map.scenes]);
  useEffect(() => { if (selectedId) window.reveal(selectedId); }, [selectedId, map[axis], axis]);
  const allScenes = map[axis].flatMap(id => scenesById.get(id) ?? []);
  const scenes = allScenes.slice(window.start, window.start + SCENE_WINDOW);
  const selected = scenesById.get(selectedId ?? "") ?? scenes[0] ?? null;
  const linkKey = selected ? JSON.stringify([selected.id, selected.chapterId, selected.manuscriptAnchor ?? null]) : "";
  useEffect(() => { setLinkMessage(""); }, [linkKey]);
  const editingCharacter = map.characters.find(ch => ch.id === editingCharacterId) ?? (editingCharacterId === "none" ? null : map.characters.find(ch => ch.id === selected?.beats[0]?.characterId) ?? map.characters[0] ?? null);
  const characters = map.characters.filter(ch => !hiddenCharacters.includes(ch.id));
  const chapterById = new Map(chapters.map(ch => [ch.id, ch]));
  const ready = c.hydrated && c.status !== "loading";
  const width = Math.max(STEP, scenes.length * STEP);
  const isSurface = layer !== "inner";
  const isInner = layer !== "surface";
  const overviewCharacter = map.characters.find(ch => ch.id === overviewCharacterId);
  const overviewStep = 1000 / Math.max(1, allScenes.length);
  const overviewValues = allScenes.map(s => overviewCharacter ? s.beats.find(b => b.characterId === overviewCharacter.id)?.surface[metric] ?? null : s.tension);
  const overviewInner = overviewCharacter ? allScenes.map(s => s.beats.find(b => b.characterId === overviewCharacter.id)?.inner[metric] ?? null) : [];
  const overviewSigned = overviewCharacter !== undefined && metric === "valence";
  const overviewColor = overviewCharacter?.color ?? "var(--nl-text)";
  const jump = (id: string, index: number): void => { setSelectedId(id); setDeleteTarget(null); window.reveal(id); pendingSceneJump.current = Math.floor(index / SCENE_WINDOW) * SCENE_WINDOW !== window.start ? id : null; if (chartRef.current) chartRef.current.scrollLeft = Math.max(0, (index - window.start) * STEP - (chartRef.current.clientWidth - 136) / 2 + STEP / 2); };
  const choose = (id: string): void => { setSelectedId(id); setDeleteTarget(null); window.reveal(id); };
  const changeScene = (patch: Partial<StoryScene>, key?: string): void => {
    if (!selected) return;
    c.change({ ...map, scenes: map.scenes.map(s => s.id === selected.id ? { ...s, ...patch } : s) }, key ? `${selected.id}:${key}` : null);
  };
  const changeBeat = (characterId: string, patch: Partial<CharacterBeat>, key?: string): void => {
    if (!selected) return;
    changeScene({ beats: updateCharacterBeat(selected.beats,characterId,patch) }, key ? `${characterId}:${key}` : undefined);
  };
  const revealManuscript = (id:string,range?:{start:number;end:number}):void => { setExpanded(false);onOpenChapter(id,range); };
  const addScene = (): void => {
    const scene = newStoryScene(uid("scene"), tr("新しい場面", "New scene"));
    const insert = (order: string[]): string[] => { const next = [...order]; const index = selected ? next.indexOf(selected.id) + 1 : next.length; next.splice(index, 0, scene.id); return next; };
    c.change({ ...map, scenes: [...map.scenes, scene], narrativeOrder: insert(map.narrativeOrder), chronologicalOrder: insert(map.chronologicalOrder) });
    choose(scene.id); requestAnimationFrame(() => { titleRef.current?.focus(); titleRef.current?.select(); });
  };
  const importChapters = (): void => {
    const linked = new Set(map.scenes.map(s => s.chapterId));
    const newCharacters = [...map.characters];
    const added = chapters.filter(ch => !linked.has(ch.id)).slice(0, Math.max(0, 5000 - map.scenes.length)).map(ch => {
      const scene = { ...newStoryScene(uid("scene"), ch.title, ch.id), surface: ch.metadata?.summary ?? "", time: ch.metadata?.timeline ?? "" };
      scene.beats = (ch.metadata?.characters ?? []).map(name => {
        let character = newCharacters.find(c => c.name === name);
        if (!character && newCharacters.length < 200) { character = { id: uid("character"), name, color: STORY_COLORS[newCharacters.length % STORY_COLORS.length]! }; newCharacters.push(character); }
        return character ? emptyBeat(character.id) : null;
      }).filter((beat): beat is CharacterBeat => beat !== null);
      return scene;
    });
    c.change({ ...map, characters: newCharacters, scenes: [...map.scenes, ...added], narrativeOrder: [...map.narrativeOrder, ...added.map(s => s.id)], chronologicalOrder: [...map.chronologicalOrder, ...added.map(s => s.id)] });
    if (added[0]) choose(added[0].id);
  };
  const addCharacter = (): void => {
    const name = newName.trim(); if (!name || map.characters.length >= 200) return;
    const ch = { id: uid("character"), name, color: STORY_COLORS[map.characters.length % STORY_COLORS.length]! };
    c.change({ ...map, characters: [...map.characters, ch], scenes: selected ? map.scenes.map(s => s.id === selected.id ? { ...s, beats: [...s.beats, emptyBeat(ch.id)] } : s) : map.scenes }); setNewName("");
  };
  const move = (id: string, boundary: number): void => { const next = moveStoryScene(map, axis, id, boundary); c.change(next); choose(id); window.setStart(next[axis].indexOf(id)); };
  const handleDragOver = (event: DragEvent, index: number): void => {
    if (!dragId.current) return;
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect(); setDropBoundary(event.clientX < rect.left + rect.width / 2 ? index : index + 1);
  };
  const renderCurve = (values: (number | null)[], color: string, dashed: boolean, signed = false): ReactNode => <>
    {curveSegments(values, STEP, HEIGHT, signed).map((points, index) => <polyline key={index} points={points} fill="none" stroke={color} strokeWidth={dashed ? 2 : 2.5} strokeDasharray={dashed ? "6 5" : undefined} />)}
    {values.map((value, index) => value === null ? null : <g key={scenes[index]!.id} role="button" tabIndex={0} aria-label={`${scenes[index]!.title}: ${dashed ? tr("裏", "Inner") : tr("表", "Surface")} ${value}`} onClick={() => choose(scenes[index]!.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(scenes[index]!.id); } }} className="story-point">
      <title>{scenes[index]!.title}: {value}</title><circle cx={index * STEP + STEP / 2} cy={12 + (1 - (signed ? (value + 100) / 200 : value / 100)) * (HEIGHT - 24)} r={dashed ? 4.5 : 4} fill={dashed ? "var(--nl-surface-raised)" : color} stroke={color} strokeWidth="2" />
    </g>)}
  </>;
  const graph = (values: (number | null)[], inner: (number | null)[] | null, color: string, signed = false): ReactNode => <svg className="story-curve" width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="group" aria-label={tr("場面ごとの起伏グラフ", "Curve across scenes")}>
    {[12, HEIGHT / 2, HEIGHT - 12].map(y => <line key={y} x1="0" x2={width} y1={y} y2={y} stroke="var(--nl-line)" strokeDasharray="2 5" />)}
    {scenes.map((s, i) => <rect key={s.id} x={i * STEP} y="0" width={STEP} height={HEIGHT} fill={selected?.id === s.id ? "var(--nl-accent-soft)" : "transparent"} opacity="0.45" />)}
    {renderCurve(values, color, false, signed)}{inner && renderCurve(inner, color, true, signed)}
  </svg>;
  const curveLabel = (title: ReactNode, description?: string, signed = false): ReactNode => <div className="story-track-label story-curve-label">
    <strong>{title}</strong>{description && <small>{description}</small>}
    <svg className="story-curve-scale" width="32" height={HEIGHT} viewBox={`0 0 32 ${HEIGHT}`} aria-label={signed ? tr("目盛り：+100、0、−100", "Scale: +100, 0, −100") : tr("目盛り：100、50、0", "Scale: 100, 50, 0")}>
      {(signed ? ["+100", "0", "−100"] : ["100", "50", "0"]).map((label, index) => <text key={label} x="32" y={[12, HEIGHT / 2, HEIGHT - 12][index]} textAnchor="end" dominantBaseline="middle">{label}</text>)}
    </svg>
  </div>;
  const statusLabel = ({ loading: tr("読み込み中…", "Loading…"), saved: tr("保存済み", "Saved"), dirty: tr("未保存", "Unsaved"), saving: tr("保存中…", "Saving…"), error: tr("保存を確認", "Check save") })[c.status];
  const exportMap = (): void => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(map, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "story-map.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const field = (label: string, value: string, update: (value: string) => void, placeholder = ""): ReactNode => <label className="story-field"><span>{label}</span><textarea aria-label={label} rows={2} maxLength={4000} value={value} placeholder={placeholder} onChange={e => update(e.target.value)} /></label>;
  const overview = <div className="story-overview"><div><strong>{tr("全体を見渡す", "Whole story")}</strong><label>{tr("曲線", "Curve")}<select value={overviewCharacter?.id ?? ""} onChange={e => setOverviewCharacterId(e.target.value)}><option value="">{tr("全体の起伏", "Story tension")}</option>{map.characters.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}</select></label><small>{tr("クリックして場面へ", "Click to jump to a scene")}</small></div><svg width="100%" height="64" viewBox="0 0 1000 64" preserveAspectRatio="none" role="group" aria-label={tr("全場面の俯瞰グラフ", "Overview of all scenes")}>
    {[12, 32, 52].map(y => <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="var(--nl-line)" strokeDasharray="3 6" />)}
    {(!overviewCharacter || isSurface) && curveSegments(overviewValues, overviewStep, 64, overviewSigned).map((points, i) => <polyline key={`surface-${i}`} points={points} fill="none" stroke={overviewColor} strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
    {isInner && curveSegments(overviewInner, overviewStep, 64, overviewSigned).map((points, i) => <polyline key={`inner-${i}`} points={points} fill="none" stroke={overviewColor} strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />)}
    {allScenes.map((s, index) => <g key={s.id} role="button" tabIndex={0} aria-label={`${tr("場面へ", "Go to")} ${s.title}`} className="story-overview-target" onClick={() => jump(s.id, index)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); jump(s.id, index); } }}><title>{index + 1}. {s.title}{s.time ? ` · ${s.time}` : ""}</title><rect x={index * overviewStep} y="0" width={overviewStep} height="64" fill={selected?.id === s.id ? "var(--nl-accent-soft)" : "transparent"} opacity="0.5" /><line x1={(index + .5) * overviewStep} x2={(index + .5) * overviewStep} y1="57" y2="63" stroke="var(--nl-muted)" /></g>)}
  </svg><div className="story-overview-endpoints"><span>01 · {allScenes[0]?.title}</span><span>{String(allScenes.length).padStart(2, "0")} · {allScenes.at(-1)?.title}</span></div></div>;
  const scoreField = (label: string, value: number | null, update: (value: number | null) => void, signed = false): ReactNode => <label className="story-score"><span>{label}</span><div><input type="range" aria-label={`${label} ${tr("調整", "adjust")}`} min={signed ? -100 : 0} max={100} step={1} value={value ?? 0} onChange={e => update(Number(e.target.value))} /><input type="number" aria-label={label} min={signed ? -100 : 0} max={100} step={1} value={value ?? ""} placeholder="—" onChange={e => { const n = e.target.value === "" ? null : Number(e.target.value); if (n === null || (Number.isInteger(n) && n >= (signed ? -100 : 0) && n <= 100)) update(n); }} /><button type="button" onClick={() => update(null)} title={tr("未設定にする", "Clear observation")} aria-label={`${label} ${tr("未設定にする", "clear")}`}>×</button></div><small>{signed ? tr("−100 不快 · 0 中立 · +100 快", "−100 unpleasant · 0 neutral · +100 pleasant") : tr("0 穏やか · 100 最大 / 空欄は未設定", "0 calm · 100 strongest / blank is unrecorded")}</small></label>;

  return <section ref={panelRef} role={expanded ? "dialog" : "region"} aria-modal={expanded || undefined} className={`story-map ${expanded ? "story-expanded" : ""}`} aria-label={tr("物語マップ", "Story Map")} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setExpanded(false); setDeleteTarget(null); }
      if (expanded && e.key === "Tab" && panelRef.current) {
        const items = [...panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')].filter(item => item.getClientRects().length > 0);
        const first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      } }}>
    <header className="story-toolbar"><div><AppIcon name="story" size={18} /><strong>{tr("物語マップ", "Story Map")}</strong><small role="status" className={c.status === "error" ? "story-error-text" : ""}>{statusLabel}</small></div><div>
      <button type="button" disabled={!c.canUndo} onClick={c.undo} title={tr("マップの変更を元に戻す", "Undo map edit")} aria-label={tr("マップの変更を元に戻す", "Undo map edit")}>↶</button><button type="button" disabled={!c.canRedo} onClick={c.redo} aria-label={tr("マップの変更をやり直す", "Redo map edit")}>↷</button>
      <button type="button" onClick={exportMap} title={tr("マップをJSONで書き出す", "Export map as JSON")} aria-label={tr("マップをJSONで書き出す", "Export map as JSON")}><AppIcon name="export" size={15} /></button>
      <button type="button" onClick={() => setExpanded(v => !v)} aria-pressed={expanded} aria-label={expanded ? tr("パネルに戻す", "Return to panel") : tr("広く表示", "Expand map")}><AppIcon name={expanded ? "close" : "focus"} size={15} /></button>
    </div></header>
    {c.error && <div className="story-save-error" role="alert"><span>{c.error}</span><button onClick={() => void (c.hydrated ? c.flush() : c.reload()).catch(() => undefined)}>{tr("保存を再試行", "Retry save")}</button><button onClick={exportMap}>{tr("変更を退避", "Export edits")}</button>{c.hydrated && <button onClick={() => setDiscardConfirm(true)}>{tr("保存先を読み直す…", "Reload saved map…")}</button>}{discardConfirm && <div role="alert"><p>{tr("未保存の変更を破棄して、保存済みのマップを開きます。必要な変更は先に退避してください。", "Discard unsaved edits and open the saved map. Export any edits you need first.")}</p><button onClick={() => { setDiscardConfirm(false); void c.discardAndReload(); }}>{tr("破棄して読み直す", "Discard and reload")}</button><button onClick={() => setDiscardConfirm(false)}>{tr("キャンセル", "Cancel")}</button></div>}</div>}
    <nav className="story-mode-tabs" aria-label={tr("設計モード", "Planning mode")}><button aria-pressed={mode === "atlas"} onClick={() => setMode("atlas")}>{tr("全体図", "Overview")}</button><button aria-pressed={mode === "story"} onClick={() => setMode("story")}>{tr("物語の流れ", "Story flow")}</button><button aria-pressed={mode === "board"} onClick={() => { setVisitedBoard(true); setMode("board"); }}>{tr("構成ボード", "Story board")}</button><button aria-pressed={mode === "emotions"} onClick={() => setMode("emotions")}>{tr("感情一覧", "Emotion table")}</button><button aria-pressed={mode === "mystery"} onClick={() => { setVisitedInfo(true); setMode("mystery"); }}>{tr("情報・伏線", "Information & clues")}</button><button aria-pressed={mode === "reader"} onClick={() => { setVisitedReader(true); setMode("reader"); }}>{tr("読者プレビュー", "Reader preview")}</button></nav>
    {mode === "atlas" && <StoryAtlas controller={c} axis={axis} onAxis={setAxis} manuscript={{chapters,readChapter,onOpenChapter:revealManuscript}} onEdit={(id, characterId) => { if(id) { pendingSceneJump.current=id; choose(id); } if(characterId) setEditingCharacterId(characterId); setMode("story"); }} />}
    {mode === "emotions" && <EmotionTable controller={c} axis={axis} onAxis={setAxis} onScene={id => { pendingSceneJump.current = id; choose(id); setMode("story"); }} />}
    <details className="planning-start-guide" hidden={mode === "atlas"}><summary>{tr("ジャンルに合わせた使い方", "Adapt the map to your genre")}</summary><p>{tr("場面名だけから始められます。時間・感情・筋・情報は必要な項目だけ記入してください。三幕構成や日付形式は強制しません。", "Start with scene titles. Add time, feelings, plotlines and information as needed. No fixed act structure or calendar is required.")}</p><ul><li>{tr("ミステリー：情報・伏線 → 配置ボードと関係図。アリバイ・物証・推理は同じ画面の詳細へ。", "Mystery: use Information & clues, placement and relationship diagrams. Alibis, evidence and deductions are available in detail views.")}</li><li>{tr("恋愛・人間ドラマ：感情の表と裏、表情、求めるものを重ね、二人の認識の違いを情報として記録。", "Romance and drama: layer visible and hidden feelings, expressions and desires; record different beliefs as information.")}</li><li>{tr("ファンタジー・SF・冒険：筋に旅や勢力を置き、世界の規則・秘密・重要な道具を情報・伏線で整理。", "Fantasy, SF and adventure: use plotlines for journeys or factions and record world rules, secrets and important objects.")}</li><li>{tr("歴史・群像・実験的な物語：自由な時間ラベルと複数の筋を使い、時系列と語る順番を独立に並べる。", "Historical, ensemble and experimental fiction: use free time labels and plotlines; arrange chronology and narration independently.")}</li></ul></details>
    {mode !== "board" && !!map.sceneDraft?.text.trim() && <button className="planning-draft-resume" onClick={() => { setVisitedBoard(true); setMode("board"); }}>{tr("入力途中の場面名を続ける", "Continue draft scene titles")}</button>}
    <div className="story-mystery-host" hidden={mode !== "board"}><Suspense fallback={<p className="story-help">{tr("構成ボードを開いています…", "Opening story board…")}</p>}>{(visitedBoard || mode === "board") && <StoryBoard controller={c} onDetails={id => { pendingSceneJump.current = id; choose(id); setMode("story"); }} />}</Suspense></div>
    <div className="story-mystery-host" hidden={mode !== "mystery"}>{(visitedInfo || mode === "mystery") && <MysteryPanel controller={c} chapters={chapters} onStory={() => { setVisitedBoard(true); setMode("board"); }} onScene={id => { if (!scenesById.has(id)) return; pendingSceneJump.current = id; choose(id); setMode("story"); }} readChapter={readChapter} />}</div>
    <div className="story-mystery-host" hidden={mode !== "reader"}><Suspense fallback={<p className="story-help">{tr("読者プレビューを開いています…", "Opening reader preview…")}</p>}>{(visitedReader || mode === "reader") && <ReaderPreview map={map} viewState={c.viewState} active={mode === "reader"} manuscript={{chapters,readChapter,onOpenChapter:revealManuscript}} onEditScene={id=>{pendingSceneJump.current=id;choose(id);setMode("story");}} />}</Suspense></div>
    {mode === "story" && <><div className="story-controls"><div className="story-axis" role="group" aria-label={tr("横軸の順番", "Scene order")}>
      <button aria-pressed={axis === "narrativeOrder"} onClick={() => setAxis("narrativeOrder")}>{tr("読者に見せる順", "Narrative order")}</button><button aria-pressed={axis === "chronologicalOrder"} onClick={() => setAxis("chronologicalOrder")}>{tr("作中の時系列", "Story chronology")}</button>
    </div><div className="story-selects"><label>{tr("表示", "Layers")}<select aria-label={tr("表示", "Layers")} value={layer} onChange={e => setLayer(e.target.value as Layer)}><option value="both">{tr("表と裏", "Surface & inner")}</option><option value="surface">{tr("表だけ", "Surface only")}</option><option value="inner">{tr("裏だけ", "Inner only")}</option></select></label><label>{tr("感情の縦軸", "Emotion axis")}<select aria-label={tr("感情の縦軸", "Emotion axis")} value={metric} onChange={e => setMetric(e.target.value as Metric)}><option value="intensity">{tr("高ぶり・強さ", "Intensity")}</option><option value="valence">{tr("快・不快", "Pleasantness")}</option></select></label></div>
      <div className="story-create"><button disabled={!ready || map.scenes.length >= 5000} onClick={addScene}>＋ {tr("場面", "Scene")}</button><button disabled={!ready || map.scenes.length >= 5000 || !chapters.some(ch => !map.scenes.some(s => s.chapterId === ch.id))} onClick={importChapters}>{tr("章から場面を作る", "Add from chapters")}</button></div>
    </div>
    <div className="story-caption"><span>{axis === "narrativeOrder" ? tr("読者がたどる順番。回想をどこで見せるかを考えます。", "The reader’s journey. Decide where to reveal a flashback.") : tr("出来事が起きる順番。同時刻には同じ時間ラベルを付けられます。", "When events happen. Use the same time label for simultaneous scenes.")}</span><span className="story-legend"><i />{tr("表", "Surface")}<i className="dashed" />{tr("裏", "Inner")}</span></div>
    <p className="story-order-hint">{tr("場面をドラッグ、または ← → で移動。変更するのは選択中の順番だけです。本文の章順は変わりません。", "Drag a scene or use ← →. Only the selected order changes; manuscript chapters keep their order.")}</p>
    <div className="story-character-filters"><span>{tr("人物", "Characters")}</span>{map.characters.map(ch => <label key={ch.id} style={{ "--story-color": ch.color } as CSSProperties}><input type="checkbox" checked={!hiddenCharacters.includes(ch.id)} onChange={e => setHiddenCharacters(old => e.target.checked ? old.filter(id => id !== ch.id) : [...old, ch.id])} /><i />{ch.name}</label>)}<form onSubmit={e => { e.preventDefault(); addCharacter(); }}><input maxLength={200} value={newName} onChange={e => setNewName(e.target.value)} aria-label={tr("追加する人物名", "New character name")} placeholder={tr("人物名", "Character name")} /><button disabled={!ready || !newName.trim() || map.characters.length >= 200} type="submit">＋</button></form></div>
    {!scenes.length ? <div className="story-empty"><AppIcon name="story" size={42} /><h2>{tr("物語の流れを、ひとつの地図に。", "See your story take shape.")}</h2><p>{tr("まず場面を置き、出来事と人物の心の動きを重ねていきます。日付も感情の数値も、決まったところからで大丈夫です。", "Start with scenes, then layer in events and character feelings. Add dates and emotion scores when you are ready.")}</p><div><button disabled={!ready} onClick={addScene}>{tr("最初の場面を作る", "Create your first scene")}</button><button disabled={!ready} onClick={() => { setVisitedBoard(true); setMode("board"); }}>{tr("場面名をまとめて置く", "Brainstorm scene titles")}</button>{chapters.length > 0 && <button disabled={!ready} onClick={importChapters}>{tr("章から場面を作る", "Add from chapters")}</button>}</div><small>{tr("記入した計画を表示します。感情はAIで自動推測しません。", "Shows your planning notes. Emotions are not automatically inferred.")}</small></div> : <>{overview}<PlanningNavigator scenes={allScenes} start={window.start} onStart={window.setStart} label={tr("感情グラフ", "Emotion graph")} /><div className="story-workspace">
      <div ref={chartRef} className="story-chart-scroll" tabIndex={0} aria-label={tr("物語のグラフと場面一覧", "Story graph and scenes")}><div className="story-tracks" style={{ width: width + 136 }}>
        <div className="story-track story-scene-header"><div className="story-track-label"><strong>{tr("場面", "Scenes")}</strong><small>{scenes.length} {tr("場面", "scenes")}</small></div><div className="story-cells">{scenes.map((scene, local) => { const i = window.start + local; return <div key={scene.id} className={`story-scene ${selected?.id === scene.id ? "selected" : ""} ${dropBoundary === i ? "drop-before" : ""} ${dropBoundary === i + 1 ? "drop-after" : ""}`} onDragOver={e => handleDragOver(e, i)} onDrop={e => { if (!dragId.current) return; e.preventDefault(); e.stopPropagation(); if (dropBoundary !== null) move(dragId.current, dropBoundary); dragId.current = null; setDropBoundary(null); }}>
          <button className="story-scene-name" draggable onDragStart={e => { dragId.current = scene.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("application/x-kohon-story-scene", scene.id); }} onDragEnd={() => { dragId.current = null; setDropBoundary(null); }} onClick={() => choose(scene.id)} onKeyDown={e => { if (!e.altKey || !e.shiftKey) return; if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); move(scene.id, i - 1); } if (e.key === "ArrowRight" && i < allScenes.length - 1) { e.preventDefault(); move(scene.id, i + 2); } }} aria-pressed={selected?.id === scene.id} title={tr("ドラッグ、または Alt+Shift+←/→ で移動", "Drag or press Alt+Shift+←/→ to move")}><small><span aria-hidden="true">⠿</span> {String(i + 1).padStart(2, "0")} · {scene.kind === "offstage" ? tr("舞台裏", "Offstage") : scene.kind === "flashback" ? tr("回想", "Flashback") : tr("場面", "Scene")}</small><strong>{scene.title}</strong><span>{scene.time || tr("時刻未設定", "Time unset")}</span><em>{tr("読者順", "Narrative")} {map.narrativeOrder.indexOf(scene.id) + 1} / {tr("時系列", "Chronology")} {map.chronologicalOrder.indexOf(scene.id) + 1}</em></button>
          <div className="story-move"><button disabled={i === 0} onClick={() => move(scene.id, i - 1)} aria-label={`${scene.title} ${tr("を前へ", "move earlier")}`}>←</button><span>{scene.plotline}</span><button disabled={i === allScenes.length - 1} onClick={() => move(scene.id, i + 2)} aria-label={`${scene.title} ${tr("を後へ", "move later")}`}>→</button></div>
        </div>; })}</div></div>
        <div className="story-track">{curveLabel(tr("全体の起伏", "Story tension"))}{graph(scenes.map(s => s.tension), null, "var(--nl-text)")}</div>
        {isSurface && <div className="story-track"><div className="story-track-label"><strong>{tr("表のストーリー", "Visible story")}</strong><small>{tr("読者に見える出来事", "Events on the page")}</small></div><div className="story-cells">{scenes.map(s => <button className={`story-note ${selected?.id === s.id ? "selected" : ""}`} key={s.id} onClick={() => choose(s.id)}><span>{s.kind === "offstage" ? tr("舞台裏の出来事", "Offstage event") : ""}</span>{s.surface || <small>{tr("出来事を記入…", "Add events…")}</small>}</button>)}</div></div>}
        {isInner && <div className="story-track"><div className="story-track-label"><strong>{tr("裏のストーリー", "Hidden story")}</strong><small>{tr("内面・伏線・秘密", "Motives & secrets")}</small></div><div className="story-cells">{scenes.map(s => <button className={`story-note story-inner-note ${selected?.id === s.id ? "selected" : ""}`} key={s.id} onClick={() => choose(s.id)}>{s.inner || <small>{tr("裏で進むことを記入…", "Add hidden events…")}</small>}</button>)}</div></div>}
        {characters.map(ch => {
          const beats = scenes.map(s => s.beats.find(b => b.characterId === ch.id));
          return <div className="story-character-track" key={ch.id} style={{ "--story-color": ch.color } as CSSProperties}><div className="story-track">{curveLabel(<><i />{ch.name}</>, metric === "intensity" ? tr("高ぶり", "Intensity") : tr("快・不快", "Valence"), metric === "valence")}{graph(beats.map(b => isSurface ? b?.surface[metric] ?? null : null), isInner ? beats.map(b => b?.inner[metric] ?? null) : null, ch.color, metric === "valence")}</div><div className="story-track"><div className="story-track-label"><small>{tr("感情と表情", "Feelings & expression")}</small></div><div className="story-cells">{scenes.map((s, i) => {
            const b = beats[i];
            return <button key={s.id} className={`story-beat-cell ${selected?.id === s.id ? "selected" : ""}`} onClick={() => choose(s.id)}>{hasRecordedBeat(b) && b ? <>{isSurface && <div><b>{tr("表", "Surface")}</b><span>{b.surface.emotion || "—"}{b.surface[metric] !== null ? ` · ${b.surface[metric]}` : ""}</span>{b.expression && <small>{b.expression}</small>}{b.surface.note && <small>{b.surface.note}</small>}</div>}{isInner && <div className="story-inner-text"><b>{tr("裏", "Inner")}</b><span>{b.inner.emotion || "—"}{b.inner[metric] !== null ? ` · ${b.inner[metric]}` : ""}</span>{b.inner.note && <small>{b.inner.note}</small>}</div>}</> : <small>{tr("未記録 · クリックで記入", "Unrecorded · click to add")}</small>}</button>;
          })}</div></div></div>;
        })}
        <p className="story-chart-footnote">{tr("横軸は場面の順番です（実時間の間隔ではありません）。点のない区間は未記録。実線は表、破線は裏の感情です。", "The x-axis is scene order, not elapsed time. Gaps are unrecorded. Solid lines show surface feelings; dashed lines show inner feelings.")}</p>
      </div></div>
      {selected && <aside className="story-inspector" aria-label={tr("選択した場面の編集", "Edit selected scene")}>
        <div className="story-inspector-heading"><strong>{tr("場面を編集", "Scene details")}</strong><span>{tr("読者順", "Narrative")} {map.narrativeOrder.indexOf(selected.id) + 1} / {tr("時系列", "Chronology")} {map.chronologicalOrder.indexOf(selected.id) + 1}</span></div>
        <label className="story-field"><span>{tr("場面名", "Scene title")}</span><PlanningTitleInput key={selected.id} inputRef={titleRef} value={selected.title} onChange={value => changeScene({ title: value }, "title")} /></label>
        <div className="story-field-pair"><label className="story-field"><span>{tr("作中の時刻・期間", "Story time / duration")}</span><input value={selected.time} maxLength={200} placeholder={tr("例：三日前 / 1日目 夜", "e.g. three days earlier")} onChange={e => changeScene({ time: e.target.value }, "time")} /></label><label className="story-field"><span>{tr("種類", "Type")}</span><select aria-label={tr("種類", "Type")} value={selected.kind} onChange={e => changeScene({ kind: e.target.value as StoryScene["kind"] })}><option value="scene">{tr("場面", "Scene")}</option><option value="flashback">{tr("回想", "Flashback")}</option><option value="offstage">{tr("舞台裏", "Offstage")}</option></select></label></div>
        <label className="story-field"><span>{tr("筋・サブプロット", "Plotline")}</span><input value={selected.plotline} maxLength={200} placeholder={tr("例：本筋 / 二人の関係", "e.g. main plot / relationship")} onChange={e => changeScene({ plotline: e.target.value }, "plotline")} /></label>
        <label className="story-field"><span>{tr("本文とのリンク", "Manuscript link")}</span><select aria-label={tr("本文とのリンク", "Manuscript link")} value={selected.chapterId ?? ""} onChange={e => changeScene({ chapterId: e.target.value || null, manuscriptAnchor: undefined })}><option value="">{tr("未リンク（構想中）", "Unlinked (planning)")}</option>{selected.chapterId && !chapterById.has(selected.chapterId) && <option value={selected.chapterId}>{tr("リンク先の章がありません", "Linked chapter is missing")}</option>}{chapters.map(ch => <option key={ch.id} value={ch.id}>{ch.title}</option>)}</select></label>
        {currentManuscriptAnchor && <button className="story-open-manuscript" disabled={!ready} onClick={() => { const current = currentManuscriptAnchor(); if (!current) { setLinkMessage(tr("本文で段落にカーソルを置くか、4,000文字以内の範囲を選んでください。", "Place the cursor in a paragraph or select up to 4,000 characters.")); return; } changeScene({ chapterId: current.chapterId, manuscriptAnchor: current.anchor }); setLinkMessage(""); }}>{tr("今の本文段落をリンク", "Link current manuscript paragraph")}</button>}
        {selected.chapterId && chapterById.has(selected.chapterId) && <>
          {field(tr("移動先の引用", "Destination quote"), selected.manuscriptAnchor?.quote ?? "", value => changeScene({ manuscriptAnchor: value.trim() ? { quote: value, prefix: "", suffix: "" } : undefined }, "anchor"), tr("本文の一文を貼り付けてもリンクできます。空欄なら章を開きます。", "Paste a sentence from the manuscript. Leave blank to open the chapter."))}
          <SceneManuscriptLink scene={selected} chapters={chapters} readChapter={readChapter} onOpenChapter={revealManuscript}/>
          {selected.manuscriptAnchor && <button onClick={() => changeScene({ manuscriptAnchor: undefined })}>{tr("段落リンクを外す", "Remove paragraph link")}</button>}
        </>}
        {linkMessage && <p className="story-help" role="status">{linkMessage}</p>}
        {field(tr("表で起きること", "Visible events"), selected.surface, value => changeScene({ surface: value }, "surface"), tr("読者が見る行動・会話・出来事", "Actions, dialogue and events on the page"))}
        {field(tr("裏で進むこと", "Hidden events"), selected.inner, value => changeScene({ inner: value }, "inner"), tr("隠れた動機・内面の変化・伏線", "Motives, inner changes and secrets"))}
        {scoreField(tr("物語全体の緊張・起伏", "Overall story tension"), selected.tension, value => changeScene({ tension: value }, "tension"))}
        <h3>{tr("人物の感情", "Character feelings")}</h3><p className="story-help">{tr("登場していなくても、裏での心情を記録できます。表情と本心は別々に書けます。", "Record an inner state even offstage. Expression and true feelings can differ.")}</p>
        {!map.characters.length && <p className="story-help">{tr("上の「人物名」から人物を追加してください。", "Add a character using the name field above.")}</p>}
        {!!map.characters.length && <label className="story-field"><span>{tr("心情を編集する人物", "Character to edit")}</span><select aria-label={tr("心情を編集する人物", "Character to edit")} value={editingCharacter?.id ?? "none"} onChange={e => setEditingCharacterId(e.target.value)}><option value="none">{tr("人物の編集を閉じる", "Close character editor")}</option>{map.characters.map(ch => <option key={ch.id} value={ch.id}>{ch.name}{hasRecordedBeat(selected.beats.find(b => b.characterId === ch.id)) ? tr(" · 記録あり", " · recorded") : tr(" · 未記録", " · unrecorded")}</option>)}</select></label>}
        {map.characters.map(ch => {
          const beat = selected.beats.find(b => b.characterId === ch.id);
          const current = beat ?? emptyBeat(ch.id);
          const emotionFields = (side: "surface" | "inner"): ReactNode => {
            const emotion = current[side];
            const update = (patch: Partial<EmotionLayer>, key: string): void => changeBeat(ch.id, { [side]: { ...emotion, ...patch } }, `${side}:${key}`);
            return <div className={`story-layer-fields ${side === "inner" ? "inner" : ""}`}>
              <h4>{side === "surface" ? tr("表 · 物語に出ている感情", "Surface · feelings shown") : tr("裏 · 隠れている本心", "Inner · hidden feelings")}</h4>
              <label className="story-field"><span>{tr("感情名（図に表示）", "Emotion name (on the chart)")}</span>
                <input aria-label={`${ch.name} · ${side === "surface" ? tr("表の感情名", "Surface emotion name") : tr("裏の感情名", "Inner emotion name")}`} maxLength={200} value={emotion.emotion} placeholder={side === "surface" ? tr("例：喜び / 装った平静", "e.g. joy / feigned composure") : tr("例：嫉妬 / 恐怖と自己嫌悪", "e.g. jealousy / fear and self-loathing")} onChange={e => update({ emotion: e.target.value }, "emotion")} />
              </label>
              <p className="story-help">{tr("図では短い感情名を使うと見比べやすくなります。理由や変化は下の心情欄へ書けます。", "Short emotion names are easier to compare on the chart. Record reasons and changes in the notes below.")}</p>
              {scoreField(tr("高ぶり・強さ", "Intensity"), emotion.intensity, value => update({ intensity: value }, "intensity"))}
              {metric === "valence" && scoreField(tr("快・不快", "Pleasantness"), emotion.valence, value => update({ valence: value }, "valence"), true)}
              {field(side === "surface" ? tr("表での感情の動き", "Visible emotional change") : tr("直接書かれていない心情", "Unspoken thoughts"), emotion.note, value => update({ note: value }, "note"))}
            </div>;
          };
          return <details className="story-character-editor" key={`${selected.id}:${ch.id}`} open={editingCharacter?.id === ch.id} onToggle={e => { if (e.currentTarget.open && editingCharacter?.id !== ch.id) setEditingCharacterId(ch.id); else if (!e.currentTarget.open && editingCharacter?.id === ch.id) setEditingCharacterId("none"); }} style={{ "--story-color": ch.color } as CSSProperties}><summary><i />{ch.name}<small>{hasRecordedBeat(beat) ? tr("記録あり", "Recorded") : tr("未記録", "Unrecorded")}</small></summary>{editingCharacter?.id === ch.id && <><label className="story-participant"><input type="checkbox" checked={beat !== undefined} onChange={e => changeScene({ beats: e.target.checked ? [...selected.beats, emptyBeat(ch.id)] : selected.beats.filter(b => b.characterId !== ch.id) })} />{tr("この場面で心情を記録する", "Track feelings in this scene")}</label>{beat && <>{emotionFields("surface")}{field(tr("物語で描かれる表情・仕草", "Expression / gesture on the page"), current.expression, value => changeBeat(ch.id, { expression: value }, "expression"), tr("例：笑っているが、目を合わせない", "e.g. smiles but avoids eye contact"))}{emotionFields("inner")}{field(tr("このとき求めているもの", "What they want now"), current.desire, value => changeBeat(ch.id, { desire: value }, "desire"))}<details className="story-character-settings"><summary>{tr("人物の名前・色を編集", "Edit character name & color")}</summary><label className="story-field"><span>{tr("人物名", "Name")}</span><input maxLength={200} value={ch.name} onChange={e => { if (e.target.value.trim()) c.change({ ...map, characters: map.characters.map(x => x.id === ch.id ? { ...x, name: e.target.value } : x) }, `name:${ch.id}`); }} /></label><label className="story-field"><span>{tr("色", "Color")}</span><input type="color" value={ch.color} onChange={e => c.change({ ...map, characters: map.characters.map(x => x.id === ch.id ? { ...x, color: e.target.value } : x) })} /></label><button className="story-danger" onClick={() => setDeleteTarget(ch.id)}>{tr("人物を削除…", "Delete character…")}</button>{deleteTarget === ch.id && <div role="alert"><p>{tr("この人物の全場面の記録を削除します。元に戻すことができます。", "Remove this character and all their observations. You can undo this.")}</p><button className="story-danger" onClick={() => { c.change({ ...map, characters: map.characters.filter(x => x.id !== ch.id), scenes: map.scenes.map(s => ({ ...s, beats: s.beats.filter(b => b.characterId !== ch.id) })) }); setDeleteTarget(null); }}>{tr("削除する", "Delete")}</button><button onClick={() => setDeleteTarget(null)}>{tr("キャンセル", "Cancel")}</button></div>}</details></>}</>}</details>;
        })}
        <div className="story-inspector-actions"><button disabled={!ready || map.scenes.length >= 5000} onClick={() => { const copy = { ...structuredClone(selected), id: uid("scene"), title: `${selected.title} ${tr("（別案）", "(alternative)")}`.slice(0, 200) }; const insert = (order: string[]): string[] => { const next = [...order]; next.splice(next.indexOf(selected.id) + 1, 0, copy.id); return next; }; c.change({ ...map, scenes: [...map.scenes, copy], narrativeOrder: insert(map.narrativeOrder), chronologicalOrder: insert(map.chronologicalOrder) }); choose(copy.id); }}>{tr("場面を複製", "Duplicate scene")}</button><button className="story-danger" onClick={() => setDeleteTarget(selected.id)}>{tr("場面を削除…", "Delete scene…")}</button></div>
        {deleteTarget === selected.id && <div className="story-delete-confirm" role="alert"><p>{tr("この場面と感情の記録を削除します。本文は残ります。", "Delete this scene and its observations. The manuscript is preserved.")}</p><button className="story-danger" onClick={() => { c.change(removeStoryScene(map, selected.id)); setSelectedId(null); setDeleteTarget(null); }}>{tr("削除する", "Delete")}</button><button onClick={() => setDeleteTarget(null)}>{tr("キャンセル", "Cancel")}</button></div>}
      </aside>}
    </div></>}</>}
  </section>;
}
