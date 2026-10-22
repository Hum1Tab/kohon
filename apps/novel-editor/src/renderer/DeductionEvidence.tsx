import { useState, type ReactNode } from "react";
import type { MysteryBoard, MysteryDeduction } from "@kohon/project-store/mystery";
import type { StoryMap } from "@kohon/project-store/story-map";

export type DeductionSourceKind = "custody" | "testimony";

/** Explicit references keep contradictory statements and uncertain evidence visible. */
export function DeductionEvidence({ map, board, deduction, tr, onChange, onOpen }: {
  map: StoryMap; board: MysteryBoard; deduction: MysteryDeduction;
  tr(ja: string, en: string): string;
  onChange(field: "custodyIds" | "testimonyIds", ids: string[]): void;
  onOpen(kind: DeductionSourceKind, id: string): void;
}): ReactNode {
  const [query, setQuery] = useState("");
  const [choosing, setChoosing] = useState(() => !deduction.custodyIds.length && !deduction.testimonyIds.length);
  const sceneName = (id: string): string => map.scenes.find(s => s.id === id)?.title || tr("参照先なし", "Missing reference");
  const custodyState = { held: tr("所持", "Held"), stored: tr("保管", "Stored"), destroyed: tr("破棄", "Destroyed"), missing: tr("所在不明", "Missing"), locked: tr("施錠", "Locked"), unlocked: tr("解錠", "Unlocked") };
  const intent = { truthful: tr("真実を話す", "Truthful"), lie: tr("意図した嘘", "Deliberate lie"), mistaken: tr("本人も誤認", "Mistaken belief"), uncertain: tr("未確定・曖昧", "Uncertain") };
  const records = {
    custodyIds: board.custody.map(e => ({ id: e.id, title: `${board.items.find(i => i.id === e.itemId)?.name || tr("参照先なし", "Missing reference")} · ${sceneName(e.sceneId)} · ${custodyState[e.state]}`, summary: e.notes })),
    testimonyIds: board.testimonies.map(t => ({ id: t.id, title: `${map.characters.find(c => c.id === t.characterId)?.name || tr("参照先なし", "Missing reference")} · ${sceneName(t.sceneId)} · ${intent[t.intent]}`, summary: t.statement }))
  };
  const groups = [
    { field: "custodyIds" as const, kind: "custody" as const, label: tr("参照する物証の記録", "Referenced evidence records") },
    { field: "testimonyIds" as const, kind: "testimony" as const, label: tr("参照する証言・発言", "Referenced statements") }
  ];
  const needle = query.trim().toLocaleLowerCase();
  const selectedCount = deduction.custodyIds.length + deduction.testimonyIds.length;
  return <section className="deduction-evidence">
    <div className="deduction-selected-heading">{tr("参照中の物証・証言", "Referenced evidence and statements")} · {selectedCount}{tr("件", " records")}</div>
    {selectedCount > 0 && <ul className="deduction-selected">
      {groups.flatMap(({ field, kind }) => deduction[field].map(id => {
        const record = records[field].find(r => r.id === id);
        return <li key={`${kind}:${id}`}>
          <small>{kind === "custody" ? tr("物証", "Evidence") : tr("証言", "Statement")}</small>
          {record ? <button type="button" title={record.summary} aria-label={`${tr("参照記録を開く", "Open referenced record")}: ${record.title}`} onClick={() => onOpen(kind, id)}>{record.title}<span aria-hidden="true"> →</span></button> : <span className="deduction-missing" role="status">{tr("参照先なし", "Missing reference")}: {id}</span>}
        </li>;
      }))}
    </ul>}
    {!selectedCount && <p className="story-help">{tr("まだ物証・証言を参照していません。", "No evidence or statements referenced yet.")}</p>}
    <details className="deduction-picker" open={choosing} onToggle={e => setChoosing(e.currentTarget.open)}>
    <summary>{tr("根拠を選ぶ・変更する", "Choose or change references")}</summary>
    <div className="deduction-picker-body">
    <p className="story-help">{tr("物証の変化や発言を、賛成・反証・未確定の検討材料として結びます。参照だけで真実や人物の知識を確定しません。", "Link evidence changes and statements to support, challenge or explore a conclusion. References do not establish truth or character awareness.")}</p>
    <label className="story-field"><span>{tr("物証・証言を探す", "Find evidence or statements")}</span><input type="search" aria-label={tr("物証・証言を探す", "Find evidence or statements")} value={query} onChange={e => setQuery(e.target.value)} placeholder={tr("品名・人物・場面・内容", "Item, character, scene or content")} /></label>
    {groups.map(({ field, kind, label }) => {
      const selected = deduction[field];
      const source = records[field];
      const broken = selected.filter(id => !source.some(r => r.id === id));
      const visible = source.filter(r => selected.includes(r.id) || !needle || `${r.title} ${r.summary}`.toLocaleLowerCase().includes(needle));
      return <fieldset className="mystery-multi deduction-source-list" key={field}>
        <legend>{label}</legend>
        {visible.map(r => <div className="deduction-source" key={r.id}>
          <label><input type="checkbox" checked={selected.includes(r.id)} onChange={e => onChange(field, e.target.checked ? [...selected, r.id] : selected.filter(id => id !== r.id))} />{r.title}</label>
          {r.summary && <p title={r.summary}>{r.summary}</p>}
          <button type="button" aria-label={`${tr("参照記録を開く", "Open referenced record")}: ${r.title}`} onClick={() => onOpen(kind, r.id)}>{tr("記録を開く →", "Open record →")}</button>
        </div>)}
        {broken.map(id => <label key={id}><input type="checkbox" checked onChange={() => onChange(field, selected.filter(value => value !== id))} />{tr("参照先なし", "Missing reference")}: {id}</label>)}
        {!source.length && !broken.length && <small>{tr("先に「物証・場所」や「真相・証言」で記録を追加してください。", "Add records in Evidence or Testimony first.")}</small>}
        {!!source.length && !visible.length && !broken.length && <small>{tr("該当する記録がありません。", "No matching records.")}</small>}
      </fieldset>;
    })}
    </div>
    </details>
  </section>;
}
