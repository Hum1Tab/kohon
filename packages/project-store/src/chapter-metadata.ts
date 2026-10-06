export type ChapterStatus = "idea" | "draft" | "revising" | "done";

export interface CharacterMoment {
  character: string;
  action?: string;
  emotion?: number; // author-entered -5..5, undefined means unknown
  expression?: string;
  innerThought?: string; // may be off-page/private
  offstage?: boolean;
}
export interface RelationshipMoment {
  from: string;
  to: string;
  label?: string;
  strength?: number; // author-entered -5..5
}

/** Optional planning data. The manuscript body remains in its Markdown file. */
export interface ChapterMetadata {
  summary?: string;
  pov?: string;
  characters?: string[];
  location?: string;
  timeline?: string;
  status?: ChapterStatus;
  tags?: string[];
  moments?: CharacterMoment[];
  relationships?: RelationshipMoment[];
}

const MAX_SUMMARY_LENGTH = 2_000;
const MAX_LABEL_LENGTH = 200;
const MAX_LIST_ITEMS = 50;
const MAX_LIST_ITEM_LENGTH = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`invalid chapter metadata: ${field}`);
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  if (normalized.length > maxLength) throw new Error(`invalid chapter metadata: ${field}`);
  return normalized;
}

function optionalList(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) throw new Error(`invalid chapter metadata: ${field}`);
  const normalized = value.map((item) => {
    if (typeof item !== "string") throw new Error(`invalid chapter metadata: ${field}`);
    const text = item.trim();
    if (text.length === 0 || text.length > MAX_LIST_ITEM_LENGTH) throw new Error(`invalid chapter metadata: ${field}`);
    return text;
  });
  if (new Set(normalized).size !== normalized.length) throw new Error(`invalid chapter metadata: duplicate ${field}`);
  return normalized.length === 0 ? undefined : normalized;
}

function optionalStatus(value: unknown): ChapterStatus | undefined {
  if (value === undefined) return undefined;
  if (value !== "idea" && value !== "draft" && value !== "revising" && value !== "done") throw new Error("invalid chapter metadata: status");
  return value;
}

/** Bound untrusted optional story data without inferring anything from manuscript text. */
function optionalMoments(value: unknown): CharacterMoment[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 100) throw new Error("invalid chapter metadata: moments");
  const result: CharacterMoment[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) throw new Error("invalid chapter metadata: moments");
    const character = optionalText(entry["character"], "character", MAX_LIST_ITEM_LENGTH);
    if (character === undefined) throw new Error("invalid chapter metadata: character");
    const action = optionalText(entry["action"], "action", 500);
    const expression = optionalText(entry["expression"], "expression", MAX_LABEL_LENGTH);
    const innerThought = optionalText(entry["innerThought"], "innerThought", 500);
    const emotion = entry["emotion"];
    if (emotion !== undefined && (!Number.isInteger(emotion) || (emotion as number) < -5 || (emotion as number) > 5)) throw new Error("invalid chapter metadata: emotion");
    const offstage = entry["offstage"];
    if (offstage !== undefined && typeof offstage !== "boolean") throw new Error("invalid chapter metadata: offstage");
    result.push({ character, ...(action ? { action } : {}), ...(emotion === undefined ? {} : { emotion: emotion as number }), ...(expression ? { expression } : {}), ...(innerThought ? { innerThought } : {}), ...(offstage === true ? { offstage: true } : {}) });
  }
  return result.length ? result : undefined;
}
function optionalRelationships(value: unknown): RelationshipMoment[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 100) throw new Error("invalid chapter metadata: relationships");
  const result: RelationshipMoment[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) throw new Error("invalid chapter metadata: relationships");
    const from = optionalText(entry["from"], "from", MAX_LIST_ITEM_LENGTH);
    const to = optionalText(entry["to"], "to", MAX_LIST_ITEM_LENGTH);
    if (!from || !to || from === to) throw new Error("invalid chapter metadata: relationship people");
    const label = optionalText(entry["label"], "label", MAX_LABEL_LENGTH);
    const strength = entry["strength"];
    if (strength !== undefined && (!Number.isInteger(strength) || (strength as number) < -5 || (strength as number) > 5)) throw new Error("invalid chapter metadata: relationship strength");
    result.push({ from, to, ...(label ? { label } : {}), ...(strength === undefined ? {} : { strength: strength as number }) });
  }
  return result.length ? result : undefined;
}

/** Validate unknown JSON input and omit empty optional values. */
export function validateChapterMetadata(value: unknown): ChapterMetadata {
  if (!isRecord(value)) throw new Error("invalid chapter metadata");
  const summary = optionalText(value["summary"], "summary", MAX_SUMMARY_LENGTH);
  const pov = optionalText(value["pov"], "pov", MAX_LABEL_LENGTH);
  const characters = optionalList(value["characters"], "characters");
  const location = optionalText(value["location"], "location", MAX_LABEL_LENGTH);
  const timeline = optionalText(value["timeline"], "timeline", MAX_LABEL_LENGTH);
  const status = optionalStatus(value["status"]);
  const tags = optionalList(value["tags"], "tags");
  const moments = optionalMoments(value["moments"]);
  const relationships = optionalRelationships(value["relationships"]);
  return {
    ...(summary === undefined ? {} : { summary }),
    ...(pov === undefined ? {} : { pov }),
    ...(characters === undefined ? {} : { characters }),
    ...(location === undefined ? {} : { location }),
    ...(timeline === undefined ? {} : { timeline }),
    ...(status === undefined ? {} : { status }),
    ...(tags === undefined ? {} : { tags }),
    ...(moments === undefined ? {} : { moments }),
    ...(relationships === undefined ? {} : { relationships })
  };
}

export function isEmptyChapterMetadata(metadata: ChapterMetadata | undefined): boolean {
  return metadata === undefined || Object.keys(validateChapterMetadata(metadata)).length === 0;
}

function mergeScalar<T extends string>(field: "pov" | "location" | "timeline" | "status", left: T | undefined, right: T | undefined): T | undefined {
  if (left !== undefined && right !== undefined && left !== right) throw new Error(`chapter metadata conflict: ${field}`);
  return left ?? right;
}

/** Combine metadata without silently discarding conflicting planning information. */
export function mergeChapterMetadata(target: ChapterMetadata | undefined, source: ChapterMetadata | undefined): ChapterMetadata | undefined {
  const left = validateChapterMetadata(target ?? {});
  const right = validateChapterMetadata(source ?? {});
  const summary = left.summary === undefined ? right.summary : right.summary === undefined || left.summary === right.summary ? left.summary : `${left.summary}\n\n${right.summary}`;
  const merged = validateChapterMetadata({
    summary,
    pov: mergeScalar("pov", left.pov, right.pov),
    characters: [...new Set([...(left.characters ?? []), ...(right.characters ?? [])])],
    location: mergeScalar("location", left.location, right.location),
    timeline: mergeScalar("timeline", left.timeline, right.timeline),
    status: mergeScalar("status", left.status, right.status),
    tags: [...new Set([...(left.tags ?? []), ...(right.tags ?? [])])],
    moments: [...(left.moments ?? []), ...(right.moments ?? [])],
    relationships: [...(left.relationships ?? []), ...(right.relationships ?? [])]
  });
  return isEmptyChapterMetadata(merged) ? undefined : merged;
}
