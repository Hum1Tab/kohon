export type RoleId = "first-reader" | "editor" | "critic" | "consistency" | "setting";

export interface RoleDefinition { id: RoleId; label: string; description: string; systemInstruction: string; }

export const ROLE_REGISTRY: Readonly<Record<RoleId, RoleDefinition>> = {
  "first-reader": { id: "first-reader", label: "初見読者", description: "初めて読む人の理解と感情の流れを確認します。", systemInstruction: "初見読者として、本文にない推測を事実扱いせず、読者が理解できること・迷うことを引用付きで示してください。作者の代わりに書き換えないでください。" },
  editor: { id: "editor", label: "編集者", description: "構成、表現、読みやすさの改善候補を整理します。", systemInstruction: "編集者として、改善候補を優先度と理由つきで示してください。本文を書き換えず、判断材料と根拠を提示してください。" },
  critic: { id: "critic", label: "批評家", description: "作品の効果、主題、語りの選択を批評します。", systemInstruction: "批評家として、解釈と観察を区別し、断定できないことを明示してください。引用を根拠に、敬意を保って批評してください。" },
  consistency: { id: "consistency", label: "整合性確認", description: "人物、時系列、設定の矛盾候補を探します。", systemInstruction: "整合性確認役として、矛盾を断定せず候補として示してください。該当箇所を引用し、未検査範囲と推測を明示してください。" },
  setting: { id: "setting", label: "設定確認", description: "世界観・用語・設定の提示と一貫性を確認します。", systemInstruction: "設定確認役として、本文から確認できる設定を整理し、未提示の設定を創作しないでください。用語や描写の根拠を引用してください。" }
};

export function getRole(id: RoleId): RoleDefinition { return ROLE_REGISTRY[id]; }

export interface SearchDocument { projectId: string; documentId: string; title: string; text: string; }
export interface SearchMatch extends SearchDocument { index: number; end: number; snippet: string; }
export function searchProjects(documents: readonly SearchDocument[], query: string): SearchMatch[] {
  const q = query.trim().toLocaleLowerCase(); if (!q) return [];
  return documents.flatMap(d => { const source = d.text.toLocaleLowerCase(); const out: SearchMatch[] = []; let from = 0; let i; while ((i = source.indexOf(q, from)) >= 0) { const start = Math.max(0, i - 60), end = Math.min(d.text.length, i + query.trim().length + 60); out.push({ ...d, index: i, end: i + query.trim().length, snippet: d.text.slice(start, end) }); from = i + Math.max(1, q.length); } return out; });
}

export type FindingStatus = "attached" | "ambiguous" | "missing";
export interface FindingValidation { status: FindingStatus; quote: string; startUtf16?: number; endUtf16?: number; occurrences: number[]; }
export function validateFinding(text: string, quote: string): FindingValidation {
  const occurrences: number[] = []; if (!quote) return { status: "missing", quote, occurrences };
  let from = 0, i; while ((i = text.indexOf(quote, from)) >= 0) { occurrences.push(i); from = i + Math.max(1, quote.length); }
  const status: FindingStatus = occurrences.length === 1 ? "attached" : occurrences.length ? "ambiguous" : "missing";
  const first = occurrences[0];
  return { status, quote, occurrences, ...(status === "attached" && first !== undefined ? { startUtf16: first, endUtf16: first + quote.length } : {}) };
}

export interface TextStats { characters: number; charactersNoWhitespace: number; words: number; lines: number; }
export function textStats(text: string): TextStats {
  const characters = text.length, charactersNoWhitespace = [...text].filter(c => !/\s/u.test(c)).length, lines = text ? text.split(/\r\n|\r|\n/u).length : 0;
  let words = 0; const Segmenter = (Intl as typeof Intl & { Segmenter?: new (locales?: string | string[], options?: { granularity?: string }) => { segment(s: string): Iterable<{ isWordLike?: boolean }> } }).Segmenter;
  if (Segmenter) { for (const part of new Segmenter("ja", { granularity: "word" }).segment(text)) if (part.isWordLike) words++; }
  else words = text.trim() ? text.trim().split(/\s+/u).length : 0;
  return { characters, charactersNoWhitespace, words, lines };
}
