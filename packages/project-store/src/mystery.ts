import type { StoryMap } from "./story-map.js";

export type KnowledgeState = "unknown" | "suspects" | "believes" | "knows" | "misunderstands";
export type KnowledgeHolder = string; // character ID or the reserved "reader"
export interface MysteryFact { id: string; title: string; truth: string; notes: string }
export interface KnowledgeEvent { id: string; factId: string; holderId: KnowledgeHolder; sceneId: string; state: KnowledgeState; belief: string; source: string; sourceCharacterId: string | null }
export interface KnowledgeUse { id: string; factId: string; holderId: KnowledgeHolder; sceneId: string; purpose: string; requiresTruth: boolean }
export interface MysteryClue { id: string; title: string; factId: string | null; kind: "clue" | "red-herring"; plantedSceneIds: string[]; reinterpretedSceneId: string | null; payoffSceneId: string | null; status: "planned" | "resolved" | "intentional-open"; interpretation: string; meaning: string; quote: string; chapterId: string | null; checkedVersion: string | null }
export interface MysteryTestimony { id: string; factId: string; characterId: string; sceneId: string; statement: string; belief: string; intent: "truthful" | "lie" | "mistaken" | "uncertain"; notes: string }
export interface MysteryLocation { id: string; name: string; notes: string }
export interface MysteryPresence { id: string; characterId: string; sceneId: string; locationId: string; clock: string; start: number | null; end: number | null; certainty: "confirmed" | "claimed" | "unknown"; notes: string }
export interface MysteryRoute { id: string; fromId: string; toId: string; minutes: number | null; bidirectional: boolean }
export interface MysteryItem { id: string; name: string; notes: string }
export interface MysteryCustody { id: string; itemId: string; sceneId: string; characterId: string | null; locationId: string | null; state: "held" | "stored" | "destroyed" | "missing" | "locked" | "unlocked"; notes: string }
export interface MysteryDeduction { id: string; title: string; sceneId: string | null; holderId: KnowledgeHolder | null; factIds: string[]; clueIds: string[]; custodyIds: string[]; testimonyIds: string[]; dependsOnIds: string[]; conclusionFactId: string | null; notes: string; alternatives: string }
export interface MysteryAcknowledgement { issueId: string; fingerprint: string; reason: string }
export interface MysteryBoard {
  schemaVersion: 1; facts: MysteryFact[]; knowledge: KnowledgeEvent[]; uses: KnowledgeUse[];
  clues: MysteryClue[]; testimonies: MysteryTestimony[]; locations: MysteryLocation[];
  presences: MysteryPresence[]; routes: MysteryRoute[]; items: MysteryItem[];
  custody: MysteryCustody[]; deductions: MysteryDeduction[]; acknowledgements: MysteryAcknowledgement[];
}
export function emptyMysteryBoard(): MysteryBoard { return { schemaVersion: 1, facts: [], knowledge: [], uses: [], clues: [], testimonies: [], locations: [], presences: [], routes: [], items: [], custody: [], deductions: [], acknowledgements: [] }; }
const obj = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("invalid mystery object"); return v as Record<string, unknown>; };
const txt = (v: unknown, max = 4000): string => { if (typeof v !== "string" || v.length > max) throw new Error("invalid mystery text"); return v; };
const ident = (v: unknown): string => { const s = txt(v, 81); if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(s)) throw new Error("invalid mystery id"); return s; };
const nullableId = (v: unknown): string | null => v === null ? null : ident(v);
const bool = (v: unknown): boolean => { if (typeof v !== "boolean") throw new Error("invalid mystery flag"); return v; };
const number = (v: unknown, min = -10_000_000): number | null => { if (v === null) return null; if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > 10_000_000) throw new Error("invalid mystery time"); return v; };
function choice<T extends string>(v: unknown, values: readonly T[]): T { if (!values.includes(v as T)) throw new Error("invalid mystery choice"); return v as T; }
function rows<T>(v: unknown, parse: (r: Record<string, unknown>) => T, max = 5000): T[] {
  if (!Array.isArray(v) || v.length > max) throw new Error("invalid mystery list");
  const result = v.map(item => parse(obj(item))); const ids = result.map(item => (item as { id?: string; issueId?: string }).id ?? (item as { issueId: string }).issueId);
  if (new Set(ids).size !== ids.length) throw new Error("duplicate mystery id"); return result;
}
const ids = (v: unknown): string[] => { if (!Array.isArray(v) || v.length > 5000) throw new Error("invalid mystery references"); const result = v.map(ident); if (new Set(result).size !== result.length) throw new Error("duplicate mystery reference"); return result; };
/** Broken links are retained for the author and reported by audit, rather than deleting planning. */
export function validateMysteryBoard(value: unknown): MysteryBoard {
  const v = obj(value); if (v["schemaVersion"] !== 1) throw new Error("unsupported mystery version");
  return {
    schemaVersion: 1,
    facts: rows(v["facts"], r => ({ id: ident(r["id"]), title: txt(r["title"], 200), truth: txt(r["truth"]), notes: txt(r["notes"]) })),
    knowledge: rows(v["knowledge"], r => ({ id: ident(r["id"]), factId: ident(r["factId"]), holderId: ident(r["holderId"]), sceneId: ident(r["sceneId"]), state: choice(r["state"], ["unknown", "suspects", "believes", "knows", "misunderstands"] as const), belief: txt(r["belief"]), source: txt(r["source"]), sourceCharacterId: nullableId(r["sourceCharacterId"]) })),
    uses: rows(v["uses"], r => ({ id: ident(r["id"]), factId: ident(r["factId"]), holderId: ident(r["holderId"]), sceneId: ident(r["sceneId"]), purpose: txt(r["purpose"]), requiresTruth: bool(r["requiresTruth"]) })),
    clues: rows(v["clues"], r => ({ id: ident(r["id"]), title: txt(r["title"], 200), factId: nullableId(r["factId"]), kind: choice(r["kind"], ["clue", "red-herring"] as const), plantedSceneIds: ids(r["plantedSceneIds"]), reinterpretedSceneId: nullableId(r["reinterpretedSceneId"]), payoffSceneId: nullableId(r["payoffSceneId"]), status: choice(r["status"], ["planned", "resolved", "intentional-open"] as const), interpretation: txt(r["interpretation"]), meaning: txt(r["meaning"]), quote: txt(r["quote"]), chapterId: nullableId(r["chapterId"]), checkedVersion: r["checkedVersion"] === null ? null : txt(r["checkedVersion"], 200) })),
    testimonies: rows(v["testimonies"], r => ({ id: ident(r["id"]), factId: ident(r["factId"]), characterId: ident(r["characterId"]), sceneId: ident(r["sceneId"]), statement: txt(r["statement"]), belief: txt(r["belief"]), intent: choice(r["intent"], ["truthful", "lie", "mistaken", "uncertain"] as const), notes: txt(r["notes"]) })),
    locations: rows(v["locations"], r => ({ id: ident(r["id"]), name: txt(r["name"], 200), notes: txt(r["notes"]) })),
    presences: rows(v["presences"], r => ({ id: ident(r["id"]), characterId: ident(r["characterId"]), sceneId: ident(r["sceneId"]), locationId: ident(r["locationId"]), clock: txt(r["clock"], 200), start: number(r["start"]), end: number(r["end"]), certainty: choice(r["certainty"], ["confirmed", "claimed", "unknown"] as const), notes: txt(r["notes"]) })),
    routes: rows(v["routes"], r => ({ id: ident(r["id"]), fromId: ident(r["fromId"]), toId: ident(r["toId"]), minutes: number(r["minutes"], 0), bidirectional: bool(r["bidirectional"]) })),
    items: rows(v["items"], r => ({ id: ident(r["id"]), name: txt(r["name"], 200), notes: txt(r["notes"]) })),
    custody: rows(v["custody"], r => ({ id: ident(r["id"]), itemId: ident(r["itemId"]), sceneId: ident(r["sceneId"]), characterId: nullableId(r["characterId"]), locationId: nullableId(r["locationId"]), state: choice(r["state"], ["held", "stored", "destroyed", "missing", "locked", "unlocked"] as const), notes: txt(r["notes"]) })),
    deductions: rows(v["deductions"], r => ({ id: ident(r["id"]), title: txt(r["title"], 200), sceneId: nullableId(r["sceneId"]), holderId: nullableId(r["holderId"]), factIds: ids(r["factIds"]), clueIds: ids(r["clueIds"]), custodyIds: r["custodyIds"] === undefined ? [] : ids(r["custodyIds"]), testimonyIds: r["testimonyIds"] === undefined ? [] : ids(r["testimonyIds"]), dependsOnIds: ids(r["dependsOnIds"]), conclusionFactId: nullableId(r["conclusionFactId"]), notes: txt(r["notes"]), alternatives: txt(r["alternatives"]) })),
    acknowledgements: rows(v["acknowledgements"], r => ({ issueId: txt(r["issueId"], 250), fingerprint: txt(r["fingerprint"], 4000), reason: txt(r["reason"]) }))
  };
}
/** Characters follow actual chronology; the reader follows presentation. Equal-scene events use entry order. */
export function knowledgeAt(map: StoryMap, board: MysteryBoard, holderId: string, factId: string, sceneId: string): KnowledgeEvent | null {
  const order = holderId === "reader" ? map.narrativeOrder : map.chronologicalOrder;
  const cutoff = order.indexOf(sceneId); if (cutoff < 0) return null;
  const position = new Map(order.map((id, i) => [id, i])); let found: KnowledgeEvent | null = null; let last = -1;
  for (const event of board.knowledge) {
    const at = position.get(event.sceneId);
    if (event.holderId === holderId && event.factId === factId && at !== undefined && at <= cutoff && at >= last) { found = event; last = at; }
  }
  return found;
}
export function checkMysteryQuote(quote: string, text: string): "empty" | "missing" | "ambiguous" | "attached" {
  if (!quote.trim()) return "empty"; const first = text.indexOf(quote);
  if (first < 0) return "missing"; return text.indexOf(quote, first + 1) < 0 ? "attached" : "ambiguous";
}
export interface MysteryIssue { id: string; code: string; ja: string; en: string; sceneIds: string[]; fingerprint: string }
// Compact stable fingerprints include the full condition, including long dependency chains.
function digest(text: string): string {
  let first = 2166136261; let second = 2246822507;
  for (let i = 0; i < text.length; i++) { first = Math.imul(first ^ text.charCodeAt(i), 16777619); second = Math.imul(second ^ text.charCodeAt(i), 3266489909); }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}
export function auditMystery(map: StoryMap): MysteryIssue[] {
  const b = map.mystery ?? emptyMysteryBoard(); const result: MysteryIssue[] = [];
  const sceneNames = new Map(map.scenes.map(s => [s.id, s.title])); const charNames = new Map(map.characters.map(c => [c.id, c.name]));
  const facts = new Map(b.facts.map(f => [f.id, f])); const sceneIds = new Set(sceneNames.keys()); const characters = new Set(charNames.keys());
  const readerOrder = new Map(map.narrativeOrder.map((s, i) => [s, i])); const actualOrder = new Map(map.chronologicalOrder.map((s, i) => [s, i]));
  const issueIds = new Set<string>();
  const add = (code: string, key: string, ja: string, en: string, scenes: (string | null)[], context: unknown): void => {
    const id = `${code}:${key.length > 200 ? digest(key) : key}`;
    if (issueIds.has(id)) return; issueIds.add(id);
    result.push({ id, code, ja, en, sceneIds: [...new Set(scenes.filter((id): id is string => id !== null && sceneIds.has(id)))], fingerprint: digest(JSON.stringify([code, context])) });
  };
  const references = (kind: string, rowId: string, refs: (string | null)[], known: Set<string>): void => {
    for (const reference of refs) if (reference !== null && !known.has(reference)) add("missing-reference", `${rowId}:${kind}:${reference}`, `参照先がありません：${kind} / ${reference}。記録は保持されています。`, `Missing ${kind}: ${reference}. The planning record is preserved.`, [], [rowId, kind, reference]);
  };
  const factIds = new Set(facts.keys()); const locationIds = new Set(b.locations.map(l => l.id)); const itemIds = new Set(b.items.map(i => i.id)); const clueIds = new Set(b.clues.map(c => c.id)); const deductionIds = new Set(b.deductions.map(d => d.id));
  const holders = new Set([...characters, "reader"]);
  for (const e of [...b.knowledge, ...b.uses]) { references("scene", e.id, [e.sceneId], sceneIds); references("fact", e.id, [e.factId], factIds); references("holder", e.id, [e.holderId], holders); }
  for (const e of b.knowledge) {
    references("source character", e.id, [e.sourceCharacterId], characters);
    if (e.holderId === "reader" && map.scenes.find(s => s.id === e.sceneId)?.kind === "offstage") add("offstage-reveal", e.id, "読者への情報提示が舞台裏の場面に置かれています。読者が知る場面を確認してください。", "A reader reveal is linked to an offstage scene. Check where the reader actually learns it.", [e.sceneId], [e.id, e.sceneId]);
    if (e.sourceCharacterId && e.state !== "unknown") {
      const source = knowledgeAt(map, b, e.sourceCharacterId, e.factId, e.sceneId);
      if (!source || source.state === "unknown") add("source-knowledge", e.id, `情報源の「${charNames.get(e.sourceCharacterId) ?? e.sourceCharacterId}」が、その時点で「${facts.get(e.factId)?.title ?? e.factId}」を知る記録がありません。`, "The source character has no awareness recorded at the acquisition time.", [e.sceneId], [e, source?.id, source?.state]);
    }
  }
  for (const use of b.uses) {
    if (!sceneIds.has(use.sceneId) || !factIds.has(use.factId)) continue;
    const event = knowledgeAt(map, b, use.holderId, use.factId, use.sceneId);
    if (!event || event.state === "unknown" || (use.requiresTruth && event.state !== "knows")) add("knowledge-use", use.id, `「${use.holderId === "reader" ? "読者" : charNames.get(use.holderId) ?? use.holderId}」が「${facts.get(use.factId)!.title}」を使う場面に、必要な知識の記録がありません。`, "A use of this fact precedes the required recorded knowledge.", [use.sceneId, event?.sceneId ?? null], [use, event?.id, event?.state]);
  }
  for (const clue of b.clues) {
    references("scene", clue.id, [...clue.plantedSceneIds, clue.reinterpretedSceneId, clue.payoffSceneId], sceneIds); references("fact", clue.id, [clue.factId], factIds);
    if (clue.status === "intentional-open") continue;
    const payoff = clue.payoffSceneId === null ? undefined : readerOrder.get(clue.payoffSceneId);
    const plants = clue.plantedSceneIds.filter(id => map.scenes.find(s => s.id === id)?.kind !== "offstage").flatMap(id => readerOrder.has(id) ? [readerOrder.get(id)!] : []);
    if (payoff !== undefined && !plants.some(i => i <= payoff)) add("clue-before-plant", clue.id, `「${clue.title}」の回収より前に、読者への提示が記録されていません。`, `“${clue.title}” pays off before any recorded on-page planting.`, [clue.payoffSceneId], [clue.id, clue.payoffSceneId, clue.plantedSceneIds, payoff, plants]);
    if (clue.status === "resolved" && payoff === undefined) add("clue-unresolved", clue.id, `「${clue.title}」は回収済みですが、回収場面が未設定です。`, `“${clue.title}” is marked resolved without a payoff scene.`, [], [clue.id, clue.status, clue.payoffSceneId]);
    if (clue.status === "planned" && clue.payoffSceneId === null) add("clue-open", clue.id, `「${clue.title}」の回収場面がまだ決まっていません。`, `“${clue.title}” has no planned payoff yet.`, clue.plantedSceneIds, [clue.id, clue.status]);
    if (clue.reinterpretedSceneId && payoff !== undefined && (readerOrder.get(clue.reinterpretedSceneId) ?? -1) > payoff) add("reinterpret-after-payoff", clue.id, `「${clue.title}」の再解釈が回収より後です。意図した構成か確認してください。`, `“${clue.title}” is reinterpreted after its payoff. Check the intended structure.`, [clue.reinterpretedSceneId, clue.payoffSceneId], [clue.id, readerOrder.get(clue.reinterpretedSceneId), payoff]);
  }
  for (const t of b.testimonies) { references("scene", t.id, [t.sceneId], sceneIds); references("fact", t.id, [t.factId], factIds); references("character", t.id, [t.characterId], characters); }
  for (const p of b.presences) { references("scene", p.id, [p.sceneId], sceneIds); references("character", p.id, [p.characterId], characters); references("location", p.id, [p.locationId], locationIds); if (p.start !== null && p.end !== null && p.end < p.start) add("negative-duration", p.id, "滞在の終了時刻が開始時刻より前です。", "A presence ends before it starts.", [p.sceneId], [p.id, p.start, p.end]); }
  for (const route of b.routes) references("location", route.id, [route.fromId, route.toId], locationIds);
  const adjacency = new Map<string, { to: string; minutes: number }[]>();
  const routeEdge = (from: string, to: string, minutes: number): void => { const edges = adjacency.get(from) ?? []; edges.push({ to, minutes }); adjacency.set(from, edges); };
  for (const route of b.routes) if (route.minutes !== null && locationIds.has(route.fromId) && locationIds.has(route.toId)) { routeEdge(route.fromId, route.toId, route.minutes); if (route.bidirectional) routeEdge(route.toId, route.fromId, route.minutes); }
  const travelCache = new Map<string, number | null>();
  const travel = (from: string, to: string): number | null => {
    const key = JSON.stringify([from, to]); if (travelCache.has(key)) return travelCache.get(key)!;
    const distances = new Map([[from, 0]]); const pending = new Set([from]);
    while (pending.size) { const current = [...pending].reduce((a, x) => distances.get(a)! <= distances.get(x)! ? a : x); pending.delete(current); if (current === to) { const minutes = distances.get(current)!; travelCache.set(key, minutes); return minutes; }
      for (const edge of adjacency.get(current) ?? []) { const distance = distances.get(current)! + edge.minutes; if (distance < (distances.get(edge.to) ?? Infinity)) { distances.set(edge.to, distance); pending.add(edge.to); } }
    } travelCache.set(key, null); return null;
  };
  const groups = new Map<string, MysteryPresence[]>();
  for (const p of b.presences) if (p.certainty === "confirmed" && p.start !== null && p.end !== null && p.start <= p.end && locationIds.has(p.locationId)) { const key = JSON.stringify([p.characterId, p.clock]); const group = groups.get(key) ?? []; group.push(p); groups.set(key, group); }
  for (const group of groups.values()) {
    group.sort((a, c) => a.start! - c.start!);
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const a = group[i]!, z = group[j]!; if (a.locationId === z.locationId) continue;
      const overlap = Math.max(a.start!, z.start!) < Math.min(a.end!, z.end!) || (a.start === a.end && a.start! >= z.start! && a.start! < z.end!) || (z.start === z.end && z.start! >= a.start! && z.start! < a.end!) || (a.start === a.end && z.start === z.end && a.start === z.start);
      if (overlap) add("presence-overlap", `${a.id}:${z.id}`, `「${charNames.get(a.characterId) ?? a.characterId}」の確定した居場所が重なっています。`, "Confirmed presences overlap at different locations.", [a.sceneId, z.sceneId], [a.id, z.id, a.start, a.end, z.start, z.end, a.locationId, z.locationId, a.clock]);
      else { const minutes = travel(a.locationId, z.locationId); const gap = z.start! - a.end!; if (minutes !== null && gap < minutes) add("travel-time", `${a.id}:${z.id}`, `移動に最低 ${minutes} 分必要ですが、空き時間は ${gap} 分です。`, `Travel needs at least ${minutes} minutes, but only ${gap} minutes are available.`, [a.sceneId, z.sceneId], [a.id, z.id, a.end, z.start, minutes, a.clock]); }
    }
  }
  for (const event of b.custody) { references("item", event.id, [event.itemId], itemIds); references("scene", event.id, [event.sceneId], sceneIds); references("character", event.id, [event.characterId], characters); references("location", event.id, [event.locationId], locationIds); }
  for (const item of b.items) {
    const events = b.custody.filter(e => e.itemId === item.id && actualOrder.has(e.sceneId)).sort((a, z) => actualOrder.get(a.sceneId)! - actualOrder.get(z.sceneId)!);
    let destroyed: MysteryCustody | null = null;
    for (const event of events) { if (destroyed && actualOrder.get(event.sceneId)! > actualOrder.get(destroyed.sceneId)! && event.state !== "destroyed" && event.state !== "missing") add("destroyed-item", event.id, `「${item.name}」が破壊された後に再登場しています。別個体・修復・誤認の設定を確認してください。`, `“${item.name}” reappears after destruction. Check duplicates, repairs or mistaken identity.`, [destroyed.sceneId, event.sceneId], [destroyed.id, event.id, event.state]); if (event.state === "destroyed") destroyed = event; }
  }
  const deductions = new Map(b.deductions.map(d => [d.id, d]));
  const custodyIds = new Set(b.custody.map(e => e.id));
  const testimonyIds = new Set(b.testimonies.map(t => t.id));
  for (const d of b.deductions) {
    references("scene", d.id, [d.sceneId], sceneIds); references("holder", d.id, [d.holderId], holders); references("fact", d.id, [...d.factIds, d.conclusionFactId], factIds); references("clue", d.id, d.clueIds, clueIds); references("deduction", d.id, d.dependsOnIds, deductionIds);
    references("custody", d.id, d.custodyIds, custodyIds); references("testimony", d.id, d.testimonyIds, testimonyIds);
    // A link records the author's reference, not proof of truth or a character's awareness.
    // Reader-facing references can nevertheless reveal a misplaced future/offstage source.
    if (d.sceneId && d.holderId === "reader") {
      const at = readerOrder.get(d.sceneId);
      for (const [kind, source] of [
        ...d.custodyIds.flatMap(id => { const e = b.custody.find(e => e.id === id); return e ? [["custody", e] as const] : []; }),
        ...d.testimonyIds.flatMap(id => { const t = b.testimonies.find(t => t.id === id); return t ? [["testimony", t] as const] : []; })
      ]) {
        const sourceAt = readerOrder.get(source.sceneId);
        if (at !== undefined && sourceAt !== undefined && (sourceAt > at || map.scenes.find(s => s.id === source.sceneId)?.kind === "offstage")) {
          add("deduction-source-order", `${d.id}:${kind}:${source.id}`, `読者の推理「${d.title}」が、後の場面または舞台裏の${kind === "custody" ? "物証の記録" : "証言"}を参照しています。読者への提示場面を確認してください。`, `The reader's deduction “${d.title}” references a later or offstage ${kind === "custody" ? "evidence record" : "statement"}. Check its on-page reveal.`, [d.sceneId, source.sceneId], [d.id, kind, source.id, d.sceneId, source.sceneId, at, sourceAt, map.scenes.find(s => s.id === source.sceneId)?.kind]);
        }
      }
    }
    if (d.sceneId && d.holderId && sceneIds.has(d.sceneId)) for (const factId of d.factIds) {
      const known = knowledgeAt(map, b, d.holderId, factId, d.sceneId);
      if (!known || known.state === "unknown") add("deduction-knowledge", `${d.id}:${factId}`, `推理「${d.title}」の前提「${facts.get(factId)?.title ?? factId}」を、推理する人物が知る記録がありません。`, `A premise of “${d.title}” is not recorded as known to its reasoner.`, [d.sceneId], [d.id, d.holderId, factId, d.sceneId, known?.id, known?.state]);
    }
    if (d.sceneId && d.holderId) for (const parentId of d.dependsOnIds) {
      const parent = deductions.get(parentId); const order = d.holderId === "reader" ? readerOrder : actualOrder;
      if (parent?.sceneId && order.has(d.sceneId) && order.has(parent.sceneId) && order.get(parent.sceneId)! > order.get(d.sceneId)!) add("deduction-order", `${d.id}:${parentId}`, `推理「${d.title}」が、後の場面の推理を前提にしています。`, `“${d.title}” depends on a deduction made later.`, [d.sceneId, parent.sceneId], [d.id, d.holderId, d.sceneId, parentId, parent.sceneId, order.get(d.sceneId), order.get(parent.sceneId)]);
    }
    if (d.sceneId && d.holderId === "reader") for (const clueId of d.clueIds) {
      const clue = b.clues.find(c => c.id === clueId); const at = readerOrder.get(d.sceneId);
      if (clue && at !== undefined && !clue.plantedSceneIds.some(id => (readerOrder.get(id) ?? Infinity) <= at && map.scenes.find(s => s.id === id)?.kind !== "offstage")) add("deduction-clue", `${d.id}:${clueId}`, `読者の推理「${d.title}」より前に「${clue.title}」が提示されていません。`, `“${clue.title}” is not planted before the reader’s deduction “${d.title}”.`, [d.sceneId], [d.id, clueId, at, clue.plantedSceneIds.map(id => readerOrder.get(id))]);
    }
  }
  // Iterative traversal handles long deduction chains without overflowing the call stack.
  const done = new Set<string>();
  for (const start of b.deductions) {
    if (done.has(start.id)) continue;
    const path: string[] = []; const active = new Set<string>(); const stack = [{ id: start.id, next: 0 }];
    while (stack.length) { const frame = stack.at(-1)!; const node = deductions.get(frame.id);
      if (!active.has(frame.id)) { active.add(frame.id); path.push(frame.id); }
      const next = node?.dependsOnIds[frame.next++];
      if (next === undefined) { done.add(frame.id); active.delete(frame.id); path.pop(); stack.pop(); }
      else if (active.has(next)) { const cycle = path.slice(path.indexOf(next)); const key = [...cycle].sort().join("+"); add("deduction-cycle", key, "推理の根拠が循環しています。結論を自分自身の根拠にしていないか確認してください。", "Deduction dependencies contain a cycle. Check whether a conclusion relies on itself.", cycle.map(id => deductions.get(id)?.sceneId ?? null), cycle); }
      else if (deductions.has(next) && !done.has(next)) stack.push({ id: next, next: 0 });
    }
  }
  return result;
}
