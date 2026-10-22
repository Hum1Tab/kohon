import { usePlanningState } from "./usePlanningState.js";
import { useId, type ReactNode } from "react";
import type { MysteryBoard } from "@kohon/project-store/mystery";
import type { StoryMap } from "@kohon/project-store/story-map";
import { useLocale } from "./LocaleContext.js";
import "./planning-board.css";

type Kind = "facts" | "clues" | "knowledge" | "testimony" | "deductions" | "custody";
interface Link { kind: Kind; id: string; title: string; relation: string; sceneIds: string[] }

/** Focused relationship diagram. Links come only from the author's explicit references. */
export function InformationGraph({ map, board: b, onEdit, onScene, viewState }: { map: StoryMap; board: MysteryBoard; viewState?: Map<string, unknown> | undefined; onEdit(kind: Kind, id: string): void; onScene(id: string): void }): ReactNode {
  const { locale } = useLocale(); const tr = (ja: string, en: string): string => locale === "ja" ? ja : en;
  const marker = useId().replace(/:/g, "");
  const [factId, setFactId] = usePlanningState(viewState, "graph:center", ""); const [query, setQuery] = usePlanningState(viewState, "graph:query", ""); const [page, setPage] = usePlanningState(viewState, "graph:page", 0);
  const facts = b.facts.filter(f => !query.trim() || `${f.title} ${f.truth} ${f.notes}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const fact = facts.find(f => f.id === factId) ?? facts[0];
  const kindName = { facts: tr("情報", "Fact"), clues: tr("伏線", "Clue"), knowledge: tr("認識", "Knowledge"), testimony: tr("証言・発言", "Statement"), deductions: tr("推理", "Deduction"), custody: tr("物証の記録", "Evidence record") };
  const knowledgeName = { unknown: tr("知らない", "Unknown"), suspects: tr("疑う", "Suspects"), believes: tr("信じる", "Believes"), knows: tr("真相を知る", "Knows truth"), misunderstands: tr("誤解", "Misunderstands") };
  const intentName = { truthful: tr("真実を話す", "Truthful"), lie: tr("嘘", "Lie"), mistaken: tr("勘違い", "Mistaken"), uncertain: tr("未確定", "Uncertain") };
  const sceneName = (id: string): string => map.scenes.find(s => s.id === id)?.title ?? tr("参照先なし", "Missing reference");
  const factClues = new Set(b.clues.filter(cl => cl.factId === fact?.id).map(cl => cl.id));
  const factDeductions = b.deductions.filter(d => d.factIds.includes(fact?.id ?? "") || d.conclusionFactId === fact?.id || d.clueIds.some(id => factClues.has(id)));
  const referencedCustody = new Set(factDeductions.flatMap(d => d.custodyIds));
  const referencedTestimonies = new Set(factDeductions.flatMap(d => d.testimonyIds));
  const sourceRelation = (field: "custodyIds" | "testimonyIds", id: string): string => `${tr("推理が参照", "Referenced by deduction")}: ${factDeductions.filter(d => d[field].includes(id)).map(d => d.title).join(" / ")}`;
  const links: Link[] = !fact ? [] : [
    ...b.clues.filter(cl => cl.factId === fact.id).map(cl => ({ kind: "clues" as const, id: cl.id, title: cl.title, relation: tr("この情報を示す伏線", "Clue for this fact"), sceneIds: [...new Set([...cl.plantedSceneIds, ...[cl.reinterpretedSceneId, cl.payoffSceneId].filter((s): s is string => !!s)])] })),
    ...b.knowledge.filter(e => e.factId === fact.id).map(e => ({ kind: "knowledge" as const, id: e.id, title: `${e.holderId === "reader" ? tr("読者", "Reader") : map.characters.find(ch => ch.id === e.holderId)?.name ?? tr("参照先なし", "Missing reference")} · ${knowledgeName[e.state]}${e.belief ? `：${e.belief}` : ""}`, relation: tr("この情報への認識", "Knowledge of this fact"), sceneIds: [e.sceneId] })),
    ...b.testimonies.filter(t => t.factId === fact.id || referencedTestimonies.has(t.id)).map(t => ({ kind: "testimony" as const, id: t.id, title: `${map.characters.find(ch => ch.id === t.characterId)?.name ?? tr("参照先なし", "Missing reference")} · ${intentName[t.intent]}：${t.statement}`, relation: referencedTestimonies.has(t.id) ? sourceRelation("testimonyIds", t.id) : tr("この情報についての発言", "Statement about this fact"), sceneIds: [t.sceneId] })),
    ...factDeductions.map(d => ({ kind: "deductions" as const, id: d.id, title: d.title, relation: d.conclusionFactId === fact.id ? tr("この情報を結論にする", "Concludes this fact") : tr("この情報・伏線を根拠にする", "Uses this fact or clue as a premise"), sceneIds: d.sceneId ? [d.sceneId] : [] })),
    ...b.custody.filter(e => referencedCustody.has(e.id)).map(e => ({ kind: "custody" as const, id: e.id, title: `${b.items.find(i => i.id === e.itemId)?.name || tr("参照先なし", "Missing reference")} · ${sceneName(e.sceneId)}${e.notes ? `：${e.notes}` : ""}`, relation: sourceRelation("custodyIds", e.id), sceneIds: [e.sceneId] })),
  ];
  const start = Math.min(Math.floor(Math.max(0, links.length - 1) / 12), page) * 12;
  const visible = links.slice(start, start + 12); const height = Math.max(170, visible.length * 100 + 24);
  const rootY = Math.min(height / 2, 250);
  return <section className="information-graph">
    <h2>{tr("一つの情報を、誰がどう受け取り、何につながるか", "Trace who receives a fact and what it supports")}</h2>
    <p>{tr("作者が登録した情報・伏線・認識・発言・推理の参照を結びます。恋愛の誤解、魔法の条件、歴史上の密約にも使えます。意味や因果関係は自動推測しません。", "Connects your recorded facts, clues, knowledge, statements and deductions. Useful for romantic misunderstandings, magic rules or secret treaties. Connections are not inferred.")}</p>
    <div className="planning-controls"><input aria-label={tr("関係図の情報を検索", "Find graph facts")} type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder={tr("情報名・内容で探す", "Find by title or content")} /><label>{tr("中心にする情報", "Central fact")}<select aria-label={tr("関係図の中心", "Graph central fact")} value={fact?.id ?? ""} onChange={e => { setFactId(e.target.value); setPage(0); }}>{!facts.length && <option value="">{tr("該当する情報なし", "No matching facts")}</option>}{facts.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}</select></label></div>
    {!fact ? <p>{tr("「情報・知識」で情報を登録し、伏線や発言の「関連する情報」を指定すると、ここでつながりが見えます。", "Create facts in Information & knowledge, then link clues or statements to them to see connections here.")}</p> : <>
      <div className="information-graph-summary"><strong>{fact.title}</strong><p>{fact.truth || tr("確定した内容は未記録", "Established content unrecorded")}</p><button onClick={() => onEdit("facts", fact.id)}>{tr("中心の情報を編集", "Edit central fact")}</button></div>
      <div className="planning-controls"><span>{links.length} {tr("件のつながり", "connections")}</span>{links.length > 12 && <><button disabled={start === 0} onClick={() => setPage(start / 12 - 1)}>←</button><span>{start + 1}–{Math.min(start + 12, links.length)}</span><button disabled={start + 12 >= links.length} onClick={() => setPage(start / 12 + 1)}>→</button></>}</div>
      <div className="information-graph-scroll"><div className="information-graph-canvas" style={{ height }}>
        <svg viewBox={`0 0 760 ${height}`} aria-hidden="true"><defs><marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8Z" fill="currentColor" /></marker></defs>{visible.map((link, i) => <path key={`${link.kind}:${link.id}`} d={link.kind === "deductions" && b.deductions.find(d => d.id === link.id)?.conclusionFactId === fact.id ? `M 390 ${i * 100 + 58} C 315 ${i * 100 + 58}, 315 ${rootY}, 242 ${rootY}` : `M 242 ${rootY} C 315 ${rootY}, 315 ${i * 100 + 58}, 390 ${i * 100 + 58}`} fill="none" stroke="currentColor" strokeWidth="1.5" markerEnd={`url(#${marker})`} />)}</svg>
        <button className="information-root" style={{ top: rootY - 42 }} onClick={() => onEdit("facts", fact.id)}><small>{kindName.facts}</small><strong>{fact.title}</strong></button>
        {visible.map((link, i) => <div className={`information-node ${link.kind}`} style={{ top: i * 100 + 14 }} key={`${link.kind}:${link.id}`}><button onClick={() => onEdit(link.kind, link.id)} title={link.title}><small>{kindName[link.kind]} · {link.relation}</small><strong>{link.title}</strong></button><div>{link.sceneIds.slice(0, 2).map(id => <button key={id} onClick={() => onScene(id)} title={sceneName(id)}>{sceneName(id)}</button>)}{link.sceneIds.length > 2 && <span>＋{link.sceneIds.length - 2}</span>}</div></div>)}
      </div></div>
      {!links.length && <p>{tr("まだ関連付けがありません。各記録の詳細で、この情報を指定できます。", "No connections yet. Choose this fact in the details of related records.")}</p>}
      <p>{tr("矢印の意味は各カードの文にも表示します。中心を変えて、複雑な仕掛けを一つずつ確認できます。", "Each card labels the relationship. Change the central fact to inspect a complex plot one connection at a time.")}</p>
    </>}
  </section>;
}
