import { useEffect, useRef, useState, type ReactNode } from "react";
import type { StoryMapController } from "./useStoryMap.js";
import { appendSceneDrafts, sceneDrafts } from "../shared/scene-drafts.js";
import { useLocale } from "./LocaleContext.js";

export function QuickSceneComposer({ controller: c, lanes, onAdded }: { controller: StoryMapController; lanes: string[]; onAdded(position: number, lane: string): void }): ReactNode {
  const { locale } = useLocale(); const tr = (ja: string, en: string): string => locale === "ja" ? ja : en;
  const [open, setOpen] = useState(false); const [message, setMessage] = useState("");
  const text = c.map.sceneDraft?.text ?? ""; const lane = c.map.sceneDraft?.plotline ?? "";
  const initialized = useRef(false); const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (c.hydrated && !initialized.current) { initialized.current = true; setOpen(c.map.scenes.length === 0 || !!text); } }, [c.hydrated, c.map.scenes.length, text]);
  const draft = sceneDrafts(text, 5000 - c.map.scenes.length); const ready = c.hydrated && c.status !== "loading";
  const effectiveLane = lanes.includes(lane) ? lane : "";
  const errors = { empty: "", "too-many": tr("一つの作品に保存できるのは5000場面までです。入力はそのまま残っています。", "A project supports up to 5,000 scenes. Your draft is preserved."), "title-length": tr("200文字を超える場面名があります。短くしてから追加してください。", "A title exceeds 200 characters. Shorten it before adding."), capacity: tr("保存できる場面数を超えます。入力はそのまま残っています。", "This would exceed scene capacity. Your draft is preserved.") };
  const add = (): void => {
    if (!ready || draft.error) return;
    const position = c.map.scenes.length; const next = appendSceneDrafts(c.map, text, effectiveLane, () => `scene-${crypto.randomUUID()}`);
    if (next === c.map) return;
    c.change(next); setMessage(tr(`${draft.titles.length}場面を追加しました。上の ↶ でまとめて戻せます。`, `Added ${draft.titles.length} scenes. Undo the batch with ↶ above.`)); onAdded(position, effectiveLane); input.current?.focus({ preventScroll: true });
  };
  return <details className="quick-scene-composer" open={open} onToggle={e => setOpen(e.currentTarget.open)}><summary>{tr("場面名だけで、構想をまとめて置く", "Brainstorm scenes with titles only")}</summary>
    <p>{tr("1行に1場面。入力途中も自動保存します。「追加」でカードになり、細部はあとから足せます。", "One scene per line. Drafts autosave too. Add them as cards, then fill in details later.")}</p>
    <form onSubmit={e => { e.preventDefault(); add(); }} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); e.stopPropagation(); add(); } }}>
      <textarea ref={input} rows={3} maxLength={1005000} disabled={!ready} aria-label={tr("まとめて追加する場面名", "Scene titles to add together")} placeholder={tr("届かなかった手紙\n駅での再会\n告白の夜", "The missing letter\nReunion at the station\nA night of confessions")} value={text} onChange={e => { c.change({ ...c.map, sceneDraft: { text: e.target.value, plotline: effectiveLane } }, "scene-draft"); setMessage(""); }} />
      <div className="planning-controls"><label>{tr("所属する筋", "Plotline")}<select disabled={!ready} aria-label={tr("まとめて追加する筋", "Plotline for new scenes")} value={effectiveLane} onChange={e => c.change({ ...c.map, sceneDraft: { text, plotline: e.target.value } }, "scene-draft")} >{lanes.map(l => <option key={l} value={l}>{l || tr("あとで決める", "Decide later")}</option>)}</select></label><button disabled={!ready || draft.error !== null}>{tr(`${draft.titles.length || ""}場面を追加`, `Add ${draft.titles.length || ""} scenes`)}</button><small>Ctrl / ⌘ + Enter</small></div>
      <p className="planning-draft-message" role="status">{draft.error ? errors[draft.error] : message}</p>
    </form>
  </details>;
}
