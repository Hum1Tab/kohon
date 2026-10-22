import { useEffect, useState, type ReactNode } from "react";
import type { StoryScene } from "@kohon/project-store/story-map";
import { useLocale } from "./LocaleContext.js";
import "./author-workflow.css";
import { usePlanningState } from "./usePlanningState.js";

export const SCENE_WINDOW = 24;
export function useRecordWindow(count: number): { start: number; setStart: (at: number) => void } {
  const [at, setAt] = useState(0);
  const last = Math.max(0, Math.floor((count - 1) / 24) * 24);
  return { start: Math.min(at, last), setStart: n => { if (Number.isFinite(n)) setAt(Math.max(0, Math.floor(n / 24) * 24)); } };
}
export function RecordNavigator({ count, start, onStart }: { count: number; start: number; onStart(at: number): void }): ReactNode {
  const { locale } = useLocale(); const tr = (ja: string, en: string): string => locale === "ja" ? ja : en;
  if (count <= 24) return null;
  return <div className="planning-navigation"><button aria-label={tr("前の24行", "Previous 24 rows")} disabled={start === 0} onClick={() => onStart(start - 24)}>↑</button><span>{start + 1}–{Math.min(count, start + 24)} / {count} {tr("行", "rows")}</span><button aria-label={tr("次の24行", "Next 24 rows")} disabled={start + 24 >= count} onClick={() => onStart(start + 24)}>↓</button><label>{tr("行の範囲", "Row range")}<select aria-label={tr("行の範囲", "Row range")} value={start} onChange={e => onStart(Number(e.target.value))}>{Array.from({ length: Math.ceil(count / 24) }, (_, i) => <option key={i} value={i * 24}>{i * 24 + 1}–{Math.min(count, (i + 1) * 24)}</option>)}</select></label></div>;
}
export function useSceneWindow(order: readonly string[], store?: Map<string, unknown>, key = "scene-range"): { start: number; setStart: (at: number) => void; reveal: (id: string) => void } {
  const [requested, setRequested] = usePlanningState(store, key, 0);
  const last = Math.max(0, Math.floor((order.length - 1) / SCENE_WINDOW) * SCENE_WINDOW);
  const start = Math.min(last, requested);
  useEffect(() => { if (requested !== start) setRequested(start); }, [requested, start]);
  const setStart = (at: number): void => { if (Number.isFinite(at)) setRequested(Math.max(0, Math.floor(at / SCENE_WINDOW) * SCENE_WINDOW)); };
  return { start, setStart, reveal: id => { const at = order.indexOf(id); if (at >= 0) setStart(at); } };
}

export function PlanningNavigator({ scenes, start, onStart, label }: { scenes: readonly StoryScene[]; start: number; onStart(at: number): void; label: string }): ReactNode {
  const { locale } = useLocale(); const tr = (ja: string, en: string): string => locale === "ja" ? ja : en;
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase();
  const matches = scenes.map((scene, position) => ({ scene, position })).filter(({ scene }) => !search || `${scene.title} ${scene.time} ${scene.plotline}`.toLocaleLowerCase().includes(search));
  if (scenes.length <= SCENE_WINDOW) return null;
  return <div className="planning-navigation" aria-label={label}>
    <button aria-label={`${label} ${tr("前の範囲", "previous range")}`} disabled={start === 0} onClick={() => onStart(start - SCENE_WINDOW)}>←</button>
    <span>{start + 1}–{Math.min(scenes.length, start + SCENE_WINDOW)} / {scenes.length} {tr("場面", "scenes")}</span>
    <button aria-label={`${label} ${tr("次の範囲", "next range")}`} disabled={start + SCENE_WINDOW >= scenes.length} onClick={() => onStart(start + SCENE_WINDOW)}>→</button>
    <input type="search" aria-label={`${label} ${tr("移動先を探す", "find destination")}`} value={query} onChange={e => setQuery(e.target.value)} placeholder={tr("場面名・時間・筋で探す", "Find by title, time or plotline")} />
    <label>{tr("場面へ移動", "Go to scene")}<select aria-label={`${label} ${tr("場面へ移動", "go to scene")}`} value="" onChange={e => { if (e.target.value) onStart(Number(e.target.value)); }}><option value="">{search ? tr(`${matches.length}場面から選ぶ`, `Choose from ${matches.length} scenes`) : tr("全場面から選ぶ", "Choose from all scenes")}</option>{matches.map(({ scene: s, position: i }) => <option key={s.id} value={i}>{i + 1}. {s.title}</option>)}</select></label>
    {search && <><small role="status">{matches.length ? tr(`${matches.length}場面が見つかりました`, `${matches.length} scenes found`) : tr("一致する場面がありません。検索を解除できます。", "No matching scenes. Clear the search to see all.")}</small><button onClick={() => setQuery("")}>{tr("移動先の検索を解除", "Clear destination search")}</button></>}
  </div>;
}
