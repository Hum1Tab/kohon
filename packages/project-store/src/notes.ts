import { randomUUID } from "node:crypto";

export const NOTE_INDEX_SCHEMA_VERSION = 1 as const;
export const NOTE_INDEX_PATH = "notes/index.json" as const;

export type NoteKind = "character" | "place" | "world" | "plot" | "memo";

export interface NoteMeta {
  id: string;
  title: string;
  kind: NoteKind;
  file: string;
  chapterIds: string[];
  order: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteIndex {
  schemaVersion: typeof NOTE_INDEX_SCHEMA_VERSION;
  notes: NoteMeta[];
}

export interface CreateNoteMetaInput {
  title: string;
  kind: NoteKind;
  chapterIds?: readonly string[];
  order?: number;
  archived?: boolean;
  /** Optional deterministic values for tests or importers. */
  id?: string;
  now?: string;
}

export interface UpdateNoteMetaInput {
  title?: string;
  kind?: NoteKind;
  chapterIds?: readonly string[];
  order?: number;
}

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNoteKind(value: unknown): value is NoteKind {
  return value === "character" || value === "place" || value === "world" || value === "plot" || value === "memo";
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`invalid note: ${field}`);
  return value;
}

function noteId(value: unknown, field: string): string {
  const id = requiredString(value, field);
  if (!SAFE_ID.test(id)) throw new Error(`invalid note: ${field}`);
  return id;
}

function title(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid note: title");
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 200) throw new Error("invalid note: title");
  return normalized;
}

function chapterIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("invalid note: chapterIds");
  const ids = value.map((chapterId) => noteId(chapterId, "chapterIds"));
  if (new Set(ids).size !== ids.length) throw new Error("invalid note: duplicate chapterIds");
  return ids;
}

function order(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error("invalid note: order");
  return value;
}

function timestamp(value: unknown, field: string): string {
  return requiredString(value, field);
}

/** Validate and normalize one metadata record. Note bodies are deliberately not part of this model. */
export function validateNoteMeta(value: unknown): NoteMeta {
  if (!isRecord(value)) throw new Error("invalid note");
  const id = noteId(value["id"], "id");
  const file = requiredString(value["file"], "file");
  if (file !== `notes/${id}.md`) throw new Error("invalid note: file");
  const kind = value["kind"];
  if (!isNoteKind(kind)) throw new Error("invalid note: kind");
  return {
    id,
    title: title(value["title"]),
    kind,
    file,
    chapterIds: chapterIds(value["chapterIds"]),
    order: order(value["order"]),
    archived: typeof value["archived"] === "boolean" ? value["archived"] : (() => { throw new Error("invalid note: archived"); })(),
    createdAt: timestamp(value["createdAt"], "createdAt"),
    updatedAt: timestamp(value["updatedAt"], "updatedAt")
  };
}

/** Validate and normalize an in-memory note index. */
export function validateNoteIndex(value: unknown): NoteIndex {
  if (!isRecord(value) || value["schemaVersion"] !== NOTE_INDEX_SCHEMA_VERSION || !Array.isArray(value["notes"])) throw new Error("invalid note index");
  const notes = value["notes"].map(validateNoteMeta);
  const ids = new Set<string>();
  const orders = new Set<number>();
  for (const note of notes) {
    if (ids.has(note.id)) throw new Error("invalid note index: duplicate id");
    if (orders.has(note.order)) throw new Error("invalid note index: duplicate order");
    ids.add(note.id);
    orders.add(note.order);
  }
  return { schemaVersion: NOTE_INDEX_SCHEMA_VERSION, notes };
}

export function createNoteIndex(notes: readonly NoteMeta[] = []): NoteIndex {
  return validateNoteIndex({ schemaVersion: NOTE_INDEX_SCHEMA_VERSION, notes: [...notes] });
}

export function parseNoteIndex(json: string): NoteIndex {
  try {
    return validateNoteIndex(JSON.parse(json) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("invalid note index JSON");
    throw error;
  }
}

export function serializeNoteIndex(index: NoteIndex): string {
  return `${JSON.stringify(validateNoteIndex(index), null, 2)}\n`;
}

function generatedId(): string {
  return `note-${randomUUID().slice(0, 12)}`;
}

/** Create metadata only; the caller stores the body in the separate Markdown file. */
export function createNoteMeta(input: CreateNoteMetaInput, suppliedId?: string, suppliedNow?: string): NoteMeta {
  const id = noteId(suppliedId ?? input.id ?? generatedId(), "id");
  const now = timestamp(suppliedNow ?? input.now ?? new Date().toISOString(), "now");
  return validateNoteMeta({
    id,
    title: input.title,
    kind: input.kind,
    file: `notes/${id}.md`,
    chapterIds: [...(input.chapterIds ?? [])],
    order: input.order ?? 0,
    archived: input.archived ?? false,
    createdAt: now,
    updatedAt: now
  });
}

/** Update editable metadata without changing identity, file path, or creation time. */
export function updateNoteMeta(note: NoteMeta, patch: UpdateNoteMetaInput, updatedAt = new Date().toISOString()): NoteMeta {
  return validateNoteMeta({
    ...note,
    ...(patch.title === undefined ? {} : { title: patch.title }),
    ...(patch.kind === undefined ? {} : { kind: patch.kind }),
    ...(patch.chapterIds === undefined ? {} : { chapterIds: [...patch.chapterIds] }),
    ...(patch.order === undefined ? {} : { order: patch.order }),
    updatedAt
  });
}

export function archiveNote(note: NoteMeta, updatedAt = new Date().toISOString()): NoteMeta {
  return validateNoteMeta({ ...note, archived: true, updatedAt });
}

export function unarchiveNote(note: NoteMeta, updatedAt = new Date().toISOString()): NoteMeta {
  return validateNoteMeta({ ...note, archived: false, updatedAt });
}

