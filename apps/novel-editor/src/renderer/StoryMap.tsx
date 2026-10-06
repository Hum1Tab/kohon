import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { bondsThrough, buildStoryMap, emotionSeries, sharedScenes, type StoryMapData, type StoryStrip } from "../shared/story-map.js";
import type { Chapter, ReviewLedgerEntry } from "../shared/types.js";
import { useLocale } from "./LocaleContext.js";

type Lens = "actions" | "emotion" | "time" | "place" | "relationships";
const LENSES: readonly { id: Lens; title: string }[] = [
  { id: "actions", title: "行動" }, { id: "emotion", title: "感情" }, { id: "time", title: "時間" },
  { id: "place", title: "場所" }, { id: "relationships", title: "関係" }
];
const LABEL_WIDTH = 148;
const fmt = (n: number, locale: "ja" | "en"): string => n.toLocaleString(locale === "ja" ? "ja-JP" : "en-US");
const markWidth = (width: number): number => Math.max(3, Math.min(5, width - 12));

interface Props {
  chapters: readonly Chapter[];
  lengths: Readonly<Record<string, number>>;
  reviews: readonly ReviewLedgerEntry[];
  activeChapterId: string | null;
  onChapter: (id: string) => void;
  onReorder: (ids: string[]) => void;
  disabled?: boolean;
}

function WidthGrid({ data, children, label }: { data: StoryMapData; children: (strip: StoryStrip, index: number) => ReactNode; label: string }): ReactNode {
  return <div className="story-grid-row" style={{ width: data.totalWidth + LABEL_WIDTH }}>
    <span className="story-grid-label">{label}</span>
    {data.strips.map((strip, index) => <div key={strip.id} className="story-grid-cell" style={{ width: strip.width }}>{children(strip, index)}</div>)}
  </div>;
}

export function StoryMap({ chapters, lengths, reviews, activeChapterId, onChapter, onReorder, disabled }: Props): ReactNode {
  const { t, locale } = useLocale();
  const [lens, setLens] = useState<Lens>("actions");
  const [person, setPerson] = useState<string | null>(null);
  const [relationChapter, setRelationChapter] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ chapter: string; character: string } | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const data = useMemo(() => buildStoryMap(chapters, lengths, reviews), [chapters, lengths, reviews]);
  const focusedPerson = person !== null && data.people.includes(person) ? person : null;
  const selectedRelationsAt = relationChapter !== null && data.strips.some((c) => c.id === relationChapter) ? relationChapter : activeChapterId;

  useEffect(() => {
    const container = viewport.current;
    if (!container || !activeChapterId) return;
    const chapterButton = [...container.querySelectorAll<HTMLButtonElement>("[data-story-chapter]")].find((button) => button.dataset.storyChapter === activeChapterId);
    if (!chapterButton) return;
    const left = chapterButton.offsetLeft, right = left + chapterButton.offsetWidth;
    const sticky = LABEL_WIDTH;
    if (left < container.scrollLeft + sticky) container.scrollLeft = Math.max(0, left - sticky);
    else if (right > container.scrollLeft + container.clientWidth) container.scrollLeft = right - container.clientWidth + 8;
  }, [activeChapterId, data]);

  const reorder = (sourceId: string, insertion: number): void => {
    const ids = data.strips.map((strip) => strip.id);
    const old = ids.indexOf(sourceId);
    if (old < 0) return;
    ids.splice(old, 1);
    ids.splice(Math.max(0, Math.min(ids.length, insertion > old ? insertion - 1 : insertion)), 0, sourceId);
    if (ids.some((id, i) => id !== data.strips[i]?.id)) onReorder(ids);
  };
  const onDrop = (event: DragEvent<HTMLButtonElement>, strip: StoryStrip, index: number): void => {
    event.preventDefault();
    const id = dragged;
    setDragged(null);
    if (!id) return;
    const rect = event.currentTarget.getBoundingClientRect();
    reorder(id, event.clientX < rect.left + rect.width / 2 ? index : index + 1);
  };

  const renderPresence = (): ReactNode => {
    if (!data.people.length) return <p className="story-empty">{t("登場人物は章の情報に書くと、ここに並びます。")}</p>;
    return <div className="story-presence">
      {data.people.map((name) => <WidthGrid key={name} data={data} label={name}>{(strip) => {
        const metadata = strip.chapter.metadata;
        const present = metadata?.characters?.includes(name) === true;
        const pov = metadata?.pov === name;
        const moments = (metadata?.moments ?? []).filter((m) => m.character === name);
        if (!present && !moments.length) return <span className="story-cell-none" aria-hidden="true"/>;
        const text = moments.map((m) => [m.action, m.expression, m.innerThought].filter(Boolean).join(" / ")).filter(Boolean).join(" ・ ");
        const offstage = moments.length > 0 && moments.every((m) => m.offstage === true);
        return <button type="button" disabled={disabled} className={`story-presence-mark ${pov ? "is-pov" : ""} ${offstage ? "is-offstage" : ""}`} onClick={() => { setDetail({ character: name, chapter: strip.id }); onChapter(strip.id); }} title={`${strip.title} / ${name}${text ? ": " + text : ""}${offstage ? "（場面外）" : ""}`}>
          <span className="story-presence-line" style={{ width: pov ? 4 : markWidth(strip.width) }}/>
          {text && <span className="story-presence-text">{text}</span>}
        </button>;
      }}</WidthGrid>)}
    </div>;
  };

  const renderEmotion = (): ReactNode => {
    const available = data.people.filter((name) => emotionSeries(data, name).length > 0);
    if (!available.length) return <p className="story-empty">{t("章の情報から「人物の行動・感情」を記録すると、感情曲線が表示されます。未入力を0として扱いません。")}</p>;
    const xOf = (chapterIndex: number): number => data.strips.slice(0, chapterIndex).reduce((sum, strip) => sum + strip.width, 0) + (data.strips[chapterIndex]?.width ?? 0) / 2;
    return <div className="story-emotion">
      {available.filter((name) => focusedPerson === null || name === focusedPerson).map((name) => {
        const points = emotionSeries(data, name);
        const yOf = (v: number): number => 52 - v * 7.1;
        return <div className="story-emotion-row" style={{ width: LABEL_WIDTH + data.totalWidth }} key={name}>
          <button className="story-grid-label story-person-toggle" aria-pressed={focusedPerson === name} onClick={() => setPerson(focusedPerson === name ? null : name)} title={t("選択した人物だけを見る")}>{name}</button>
          <svg role="img" aria-label={`${name}: ${t("感情の変化")}`} width={data.totalWidth} height="105" viewBox={`0 0 ${data.totalWidth} 105`}>
            <line x1="0" y1="52" x2={data.totalWidth} y2="52" className="story-midline"/>
            {data.strips.map((s,i) => <line key={s.id} x1={xOf(i)-s.width/2} x2={xOf(i)-s.width/2} y1="8" y2="97" className="story-guide"/>)}
            {points.slice(1).map((point, i) => { const previous = points[i]!; return <line key={`${previous.chapterIndex}:${point.chapterIndex}:${i}`} x1={xOf(previous.chapterIndex)} y1={yOf(previous.value)} x2={xOf(point.chapterIndex)} y2={yOf(point.value)} className={point.chapterIndex > previous.chapterIndex + 1 ? "story-emotion-gap" : "story-emotion-line"}/>; })}
            {points.map((point,i) => <circle key={i} cx={xOf(point.chapterIndex)} cy={yOf(point.value)} r="4.5" className={data.strips[point.chapterIndex]?.chapter.metadata?.pov === name ? "story-emotion-pov" : "story-emotion-point"}>
              <title>{`${data.strips[point.chapterIndex]?.title}: ${point.value > 0 ? "+" : ""}${point.value} ${point.action} ${point.expression} ${point.innerThought}`}</title>
            </circle>)}
          </svg>
        </div>;
      })}
      <p className="story-footnote">{t("高い +5 ／ 中立 0 ／ 低い -5。点のない章は未記録。破線は途中の記録がない区間。")}</p>
    </div>;
  };

  const renderCategory = (kind: "time" | "place"): ReactNode => {
    const items = kind === "time" ? data.times : data.places;
    if (!items.length) return <p className="story-empty">{kind === "time" ? t("時系列は章の情報に書くと、ここに並びます。日付の解析はしません。") : t("場所は章の情報に書くと、ここに並びます。")}</p>;
    return items.map((name) => <WidthGrid data={data} label={name} key={name}>{(strip) => {
      const exists = (kind === "time" ? strip.chapter.metadata?.timeline : strip.chapter.metadata?.location) === name;
      return exists ? <button type="button" disabled={disabled} className={`story-category-bar ${strip.id === activeChapterId ? "is-current" : ""}`} title={`${strip.title} — ${name}`} onClick={() => onChapter(strip.id)}/> : <span className="story-cell-none" aria-hidden="true"/>;
    }}</WidthGrid>);
  };

  const renderRelationships = (): ReactNode => {
    const all = data.people;
    if (!all.length) return <p className="story-empty">{t("登場人物を章の情報に登録すると、関係図に表示されます。")}</p>;
    const count = Math.min(all.length, 28), people = all.slice(0, count);
    const bonds = bondsThrough(data, selectedRelationsAt).filter((edge) => people.includes(edge.from) && people.includes(edge.to));
    const existing = new Set(bonds.map((edge) => [edge.from, edge.to].sort().join("|")));
    const coappear = sharedScenes(data, selectedRelationsAt).filter((edge) => people.includes(edge.a) && people.includes(edge.b) && !existing.has([edge.a,edge.b].sort().join("|"))).slice(0, Math.max(0, 44 - bonds.length));
    const width = Math.max(800, Math.min(1120, count * 54)), height = count > 16 ? 470 : 360;
    const cx = width / 2, cy = height / 2, rx = width / 2 - 95, ry = height / 2 - 40;
    const coords = new Map(people.map((name, i) => [name, { x: cx + rx * Math.cos((2 * Math.PI * i) / Math.max(1,count) - Math.PI / 2), y: cy + ry * Math.sin((2 * Math.PI * i) / Math.max(1,count) - Math.PI / 2) }]));
    return <div className="story-relations">
      <div className="story-relations-toolbar">
        <label>{t("この章までの関係")} <select value={selectedRelationsAt ?? ""} onChange={(e) => setRelationChapter(e.target.value || null)}>
          {data.strips.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select></label>
        <span>{t("実線：明示した関係 ／ 破線：同じ章への登場（関係を意味しません）")}</span>
      </div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("人物関係図")}>
        {coappear.map((link) => { const a = coords.get(link.a)!, b = coords.get(link.b)!; return <line key={`${link.a}/${link.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="story-relationship-context" strokeWidth={Math.min(2.5, 0.75 + link.scenes * 0.13)}><title>{`${link.a}・${link.b}：${link.scenes}${t("章で共演")}`}</title></line>; })}
        {bonds.map((link,i) => { const a = coords.get(link.from)!, b = coords.get(link.to)!; return <g key={i}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="story-relationship-authored" strokeWidth={link.strength === undefined ? 2 : Math.max(1, 1.5 + Math.abs(link.strength)*.4)}/><title>{`${link.from} → ${link.to}: ${link.label} ${link.strength === undefined ? "" : link.strength}`}</title></g>; })}
        {people.map((name) => { const point = coords.get(name)!; return <g key={name} className="story-relation-person">
          <circle cx={point.x} cy={point.y} r={name === focusedPerson ? 12 : 9} className={name === focusedPerson ? "is-selected" : ""}/>
          <text x={point.x} y={point.y + (point.y < cy ? -17 : 25)} textAnchor="middle">{name.length > 14 ? name.slice(0,13)+"…" : name}</text>
        </g>; })}
      </svg>
      <div className="story-relations-list">{bonds.length ? bonds.map((bond,i) => <button key={i} type="button" onClick={() => onChapter(bond.chapterId)}>{bond.from} ↔ {bond.to} <strong>{bond.label || t("関係を記録済み")}</strong> <small>{data.strips[bond.chapterIndex]?.title}</small></button>) : <p>{t("関係はまだ記録されていません。破線は共演のみを示します。")}</p>}</div>
      {all.length > count && <p className="story-footnote">{`${all.length-count}${t("人は省略されています。")}`}</p>}
    </div>;
  };

  const details = detail && data.strips.find((s) => s.id === detail.chapter);
  const detailMoments = details?.chapter.metadata?.moments?.filter((m) => m.character === detail?.character) ?? [];
  return <section className="story-map" aria-label={t("物語マップ")}>
    <header className="story-map-toolbar"><strong>{t("物語マップ")}</strong><span>{fmt(data.strips.length, locale)} {t("章・場面")}</span>
      <nav role="tablist" aria-label={t("表示するグラフ")}>{LENSES.map((item) => <button key={item.id} type="button" role="tab" aria-selected={lens === item.id} className={lens === item.id ? "active" : ""} onClick={() => setLens(item.id)}>{t(item.title)}</button>)}</nav>
    </header>
    <div className="story-map-scroll" ref={viewport}>
      <div className="story-map-strips" style={{ width: LABEL_WIDTH + data.totalWidth }}>
        <div className="story-grid-label story-strip-caption">{t("文字数の帯")}</div>
        {data.strips.length ? data.strips.map((strip,index) => <button type="button" key={strip.id}
          data-story-chapter={strip.id} className={`story-strip ${strip.id === activeChapterId ? "is-current" : ""} ${dragged === strip.id ? "is-dragged" : ""}`} style={{ width: strip.width }}
          disabled={disabled} draggable={!disabled} onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragged(strip.id); }} onDragEnd={() => setDragged(null)} onDragOver={(e) => { if (dragged) e.preventDefault(); }} onDrop={(e) => onDrop(e,strip,index)}
          onKeyDown={(e) => { if (!e.altKey || !e.shiftKey) return; if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); reorder(strip.id, index + (e.key === "ArrowRight" ? 2 : -1)); } }}
          onClick={() => onChapter(strip.id)} title={`${strip.title}／${fmt(strip.count, locale)}${t("文字")}（Alt+Shift+←/→ ${t("並び替え")}）`}>
          <span className="story-strip-name">{String(index+1).padStart(2,"0")} {strip.title}</span>
          {strip.hasOpenReview && <span className="story-open-dot" aria-label={t("未対応の指摘あり")}/>}
          <span className="story-strip-fill"/>
        </button>) : <div className="story-no-chapters">{t("章を追加すると帯が表示されます。")}</div>}
      </div>
      <div className="story-map-graph" style={{ minWidth: LABEL_WIDTH + data.totalWidth }}>
        {lens === "actions" && renderPresence()}
        {lens === "emotion" && renderEmotion()}
        {lens === "time" && renderCategory("time")}
        {lens === "place" && renderCategory("place")}
        {lens === "relationships" && renderRelationships()}
      </div>
    </div>
    {lens === "actions" && detail && details && <div className="story-map-detail"><strong>{detail.character} ・ {details.title}</strong>
      {detailMoments.length ? detailMoments.map((m,i) => <span key={i}>{m.offstage ? t("場面外") + "：": ""}{m.action || t("行動は未設定")}{m.expression ? ` / ${t("表情")}：${m.expression}` : ""}{m.innerThought ? ` / ${t("裏の気持ち")}：${m.innerThought}` : ""}</span>) : <span>{t("行動はまだ記録されていません。")}</span>}</div>}
    <footer className="story-map-footer">{t("クリック：章を開く ／ ドラッグ：章を移動。感情と関係は章の情報に明示された値のみ使用します。")}</footer>
  </section>;
}
