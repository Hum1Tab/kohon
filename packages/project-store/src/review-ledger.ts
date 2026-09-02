import { createHash } from "node:crypto";

/** The JSON version is deliberately small and can be migrated without touching the manuscript. */
export const REVIEW_LEDGER_SCHEMA_VERSION = 1 as const;
export const REVIEW_LEDGER_PATH = ".novel-editor/reviews/ledger.json" as const;

export type ReviewScope = "current" | "through-current" | "all";
export type ReviewStatus = "open" | "resolved" | "ignored";
export type ReviewAnchorStatus = "attached" | "stale" | "needs-recheck";
export type ReviewSeverity = string;

export interface ReviewAnchor {
  /** UTF-16 offset in the manuscript version named by manuscriptVersionHash. */
  offset: number | null;
  prefix: string;
  suffix: string;
  /** Number of non-overlapping exact-quote occurrences in that version. */
  occurrence: number;
}

export interface ReviewFindingDetails {
  title?: string;
  body?: string;
  severity?: ReviewSeverity;
}

export interface ReviewLedgerEntry {
  id: string;
  role: string;
  provider?: string;
  model?: string;
  scope: ReviewScope;
  cutoffChapter?: string;
  manuscriptVersionHash: string;
  checkpoint?: string;
  chapterId: string;
  file: string;
  /** Chapter title, kept as display metadata rather than manuscript text. */
  title: string;
  finding?: ReviewFindingDetails;
  exactQuote: string;
  anchor: ReviewAnchor;
  status: ReviewStatus;
  anchorStatus: ReviewAnchorStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewLedger {
  schemaVersion: typeof REVIEW_LEDGER_SCHEMA_VERSION;
  entries: ReviewLedgerEntry[];
}

export interface CreateReviewFindingInput {
  id?: string;
  role: string;
  provider?: string;
  model?: string;
  scope: ReviewScope;
  cutoffChapter?: string;
  manuscriptVersionHash: string;
  checkpoint?: string;
  chapterId: string;
  file: string;
  title: string;
  finding?: ReviewFindingDetails;
  /** Convenience fields for callers that receive a flat finding payload. */
  findingTitle?: string;
  findingBody?: string;
  severity?: ReviewSeverity;
  exactQuote: string;
  /** Optional local manuscript text used to calculate the initial exact anchor. */
  manuscriptText?: string;
  chapterText?: string;
  anchor?: ReviewAnchor;
  status?: ReviewStatus;
  anchorStatus?: ReviewAnchorStatus;
  createdAt?: string;
  updatedAt?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`invalid review ledger: ${key}`);
  return value;
}

function optionalString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`invalid review ledger: ${key}`);
  return value;
}

function optionalFinding(value: unknown): ReviewFindingDetails | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("invalid review ledger: finding");
  const title = optionalString(value, "title");
  const body = optionalString(value, "body");
  const severity = optionalString(value, "severity");
  if (title === undefined && body === undefined && severity === undefined) return {};
  return {
    ...(title === undefined ? {} : { title }),
    ...(body === undefined ? {} : { body }),
    ...(severity === undefined ? {} : { severity })
  };
}

function validateAnchor(value: unknown): ReviewAnchor {
  if (!isRecord(value)) throw new Error("invalid review ledger: anchor");
  const offset = value["offset"];
  if (offset !== null && (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0)) throw new Error("invalid review ledger: anchor.offset");
  const prefix = value["prefix"];
  const suffix = value["suffix"];
  const occurrence = value["occurrence"];
  if (typeof prefix !== "string" || typeof suffix !== "string" || typeof occurrence !== "number" || !Number.isInteger(occurrence) || occurrence < 0) throw new Error("invalid review ledger: anchor");
  return { offset, prefix, suffix, occurrence };
}

function validateEntry(value: unknown): ReviewLedgerEntry {
  if (!isRecord(value)) throw new Error("invalid review ledger: entry");
  const schema = value;
  const scope = schema["scope"];
  const status = schema["status"];
  const anchorStatus = schema["anchorStatus"];
  if (scope !== "current" && scope !== "through-current" && scope !== "all") throw new Error("invalid review ledger: scope");
  if (status !== "open" && status !== "resolved" && status !== "ignored") throw new Error("invalid review ledger: status");
  if (anchorStatus !== "attached" && anchorStatus !== "stale" && anchorStatus !== "needs-recheck") throw new Error("invalid review ledger: anchorStatus");
  const id = requiredString(schema, "id");
  const role = requiredString(schema, "role");
  const manuscriptVersionHash = requiredString(schema, "manuscriptVersionHash");
  const chapterId = requiredString(schema, "chapterId");
  const file = requiredString(schema, "file");
  const title = requiredString(schema, "title");
  const exactQuote = requiredString(schema, "exactQuote");
  const createdAt = requiredString(schema, "createdAt");
  const updatedAt = requiredString(schema, "updatedAt");
  const provider = optionalString(schema, "provider");
  const model = optionalString(schema, "model");
  const cutoffChapter = optionalString(schema, "cutoffChapter");
  const checkpoint = optionalString(schema, "checkpoint");
  const finding = optionalFinding(schema["finding"]);
  const anchor = validateAnchor(schema["anchor"]);
  return {
    id,
    role,
    ...(provider === undefined ? {} : { provider }),
    ...(model === undefined ? {} : { model }),
    scope,
    ...(cutoffChapter === undefined ? {} : { cutoffChapter }),
    manuscriptVersionHash,
    ...(checkpoint === undefined ? {} : { checkpoint }),
    chapterId,
    file,
    title,
    ...(finding === undefined ? {} : { finding }),
    exactQuote,
    anchor,
    status,
    anchorStatus,
    createdAt,
    updatedAt
  };
}

/** Validate and normalize an in-memory ledger without performing any I/O. */
export function validateReviewLedger(value: unknown): ReviewLedger {
  if (!isRecord(value) || value["schemaVersion"] !== REVIEW_LEDGER_SCHEMA_VERSION || !Array.isArray(value["entries"])) throw new Error("invalid review ledger");
  const entries = value["entries"].map(validateEntry);
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error("invalid review ledger: duplicate id");
    ids.add(entry.id);
  }
  return { schemaVersion: REVIEW_LEDGER_SCHEMA_VERSION, entries };
}

export function createReviewLedger(entries: readonly ReviewLedgerEntry[] = []): ReviewLedger {
  return validateReviewLedger({ schemaVersion: REVIEW_LEDGER_SCHEMA_VERSION, entries: [...entries] });
}

export function parseReviewLedger(json: string): ReviewLedger {
  try {
    return validateReviewLedger(JSON.parse(json) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("invalid review ledger JSON");
    throw error;
  }
}

export function serializeReviewLedger(ledger: ReviewLedger): string {
  return `${JSON.stringify(validateReviewLedger(ledger), null, 2)}\n`;
}

export function findReviewQuoteOccurrences(text: string, exactQuote: string): number[] {
  if (exactQuote.length === 0) return [];
  const offsets: number[] = [];
  let from = 0;
  while (from <= text.length - exactQuote.length) {
    const offset = text.indexOf(exactQuote, from);
    if (offset < 0) break;
    offsets.push(offset);
    from = offset + Math.max(1, exactQuote.length);
  }
  return offsets;
}

export interface CalculatedReviewAnchor {
  anchor: ReviewAnchor;
  anchorStatus: ReviewAnchorStatus;
}

/** Calculate an initial anchor from local manuscript text. This is never used for re-anchoring. */
export function calculateReviewAnchor(text: string, exactQuote: string): CalculatedReviewAnchor {
  const offsets = findReviewQuoteOccurrences(text, exactQuote);
  const offset = offsets.length === 1 ? offsets[0] ?? null : null;
  const end = offset === null ? null : offset + exactQuote.length;
  return {
    anchor: {
      offset,
      prefix: offset === null ? "" : text.slice(Math.max(0, offset - 32), offset),
      suffix: end === null ? "" : text.slice(end, end + 32),
      occurrence: offsets.length
    },
    anchorStatus: offsets.length === 1 ? "attached" : "needs-recheck"
  };
}

function generatedId(input: CreateReviewFindingInput, createdAt: string): string {
  const material = JSON.stringify([input.role, input.manuscriptVersionHash, input.chapterId, input.exactQuote, createdAt]);
  return `review-${createHash("sha256").update(material).digest("hex").slice(0, 24)}`;
}

function findingDetails(input: CreateReviewFindingInput): ReviewFindingDetails | undefined {
  const source = input.finding;
  const title = source?.title ?? input.findingTitle;
  const body = source?.body ?? input.findingBody;
  const severity = source?.severity ?? input.severity;
  if (title === undefined && body === undefined && severity === undefined) return undefined;
  return {
    ...(title === undefined ? {} : { title }),
    ...(body === undefined ? {} : { body }),
    ...(severity === undefined ? {} : { severity })
  };
}

export function createReviewFinding(input: CreateReviewFindingInput): ReviewLedgerEntry {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? createdAt;
  const text = input.manuscriptText ?? input.chapterText;
  const calculated = text === undefined ? null : calculateReviewAnchor(text, input.exactQuote);
  const anchor = input.anchor ?? calculated?.anchor ?? { offset: null, prefix: "", suffix: "", occurrence: 0 };
  const anchorStatus = input.anchorStatus ?? calculated?.anchorStatus ?? "needs-recheck";
  const finding = findingDetails(input);
  const entry: ReviewLedgerEntry = {
    id: input.id ?? generatedId(input, createdAt),
    role: input.role,
    ...(input.provider === undefined ? {} : { provider: input.provider }),
    ...(input.model === undefined ? {} : { model: input.model }),
    scope: input.scope,
    ...(input.cutoffChapter === undefined ? {} : { cutoffChapter: input.cutoffChapter }),
    manuscriptVersionHash: input.manuscriptVersionHash,
    ...(input.checkpoint === undefined ? {} : { checkpoint: input.checkpoint }),
    chapterId: input.chapterId,
    file: input.file,
    title: input.title,
    ...(finding === undefined ? {} : { finding }),
    exactQuote: input.exactQuote,
    anchor,
    status: input.status ?? "open",
    anchorStatus,
    createdAt,
    updatedAt
  };
  return validateEntry(entry);
}

/** Author-only lifecycle operation; it cannot alter the evidence or manuscript version. */
export function setAuthorFindingStatus(entry: ReviewLedgerEntry, status: ReviewStatus, updatedAt = new Date().toISOString()): ReviewLedgerEntry {
  if (status !== "open" && status !== "resolved" && status !== "ignored") throw new Error("invalid review ledger: status");
  if (typeof updatedAt !== "string" || updatedAt.length === 0) throw new Error("invalid review ledger: updatedAt");
  return { ...entry, status, updatedAt };
}

export function updateReviewFindingStatus(ledger: ReviewLedger, id: string, status: ReviewStatus, updatedAt = new Date().toISOString()): ReviewLedger {
  let found = false;
  const entries = ledger.entries.map((entry) => {
    if (entry.id !== id) return entry;
    found = true;
    return setAuthorFindingStatus(entry, status, updatedAt);
  });
  if (!found) throw new Error("review finding not found");
  return { schemaVersion: REVIEW_LEDGER_SCHEMA_VERSION, entries };
}

/** A hash mismatch invalidates the old location. No quote search or automatic re-attachment occurs. */
export function recheckReviewFinding(entry: ReviewLedgerEntry, manuscriptVersionHash: string, updatedAt = new Date().toISOString()): ReviewLedgerEntry {
  if (typeof manuscriptVersionHash !== "string" || manuscriptVersionHash.length === 0) throw new Error("invalid manuscript version hash");
  if (entry.manuscriptVersionHash === manuscriptVersionHash) return { ...entry };
  return { ...entry, anchorStatus: "stale", updatedAt };
}

export function markReviewLedgerStale(ledger: ReviewLedger, manuscriptVersionHash: string, updatedAt = new Date().toISOString()): ReviewLedger {
  return {
    schemaVersion: REVIEW_LEDGER_SCHEMA_VERSION,
    entries: ledger.entries.map((entry) => recheckReviewFinding(entry, manuscriptVersionHash, updatedAt))
  };
}

/** Explicitly records that an author needs to inspect an anchor; it does not move the anchor. */
export function markReviewFindingNeedsRecheck(entry: ReviewLedgerEntry, updatedAt = new Date().toISOString()): ReviewLedgerEntry {
  return { ...entry, anchorStatus: "needs-recheck", updatedAt };
}

// Short aliases keep the pure module convenient for callers while the descriptive names remain canonical.
export const validateLedger = validateReviewLedger;
export const parseLedger = parseReviewLedger;
export const serializeLedger = serializeReviewLedger;
export const createFinding = createReviewFinding;
export const setFindingStatus = setAuthorFindingStatus;
export const updateFindingStatus = updateReviewFindingStatus;
export const recheckFinding = recheckReviewFinding;
