import type { Chapter } from "@kohon/project-store";
import type { RecoveryDraftResult } from "./types.js";

/** The state of the canonical manuscript save for one open chapter. */
export type BufferSaveState = "saved" | "dirty" | "saving" | "error";

export interface EditorBuffer {
  readonly chapter: Chapter;
  readonly text: string;
  readonly savedText: string;
  /** The version of savedText in the canonical manuscript. */
  readonly version: string;
  readonly saveState: BufferSaveState;
  readonly recoveryConflict: RecoveryDraftResult | null;
}

export interface EditorBuffersState {
  readonly buffers: Readonly<Record<string, EditorBuffer>>;
}

export interface LoadBufferInput {
  readonly chapter: Chapter;
  readonly text: string;
  readonly version: string;
  readonly savedText?: string;
  readonly saveState?: BufferSaveState;
  readonly recoveryConflict?: RecoveryDraftResult | null;
}

export interface SaveSuccessInput {
  /** The text included in the completed save request. */
  readonly text?: string;
  /** The canonical version returned by the store for text. */
  readonly version: string;
}

function copyBuffers(state: EditorBuffersState, chapterId: string, buffer: EditorBuffer): EditorBuffersState {
  return { buffers: { ...state.buffers, [chapterId]: buffer } };
}

function bufferFrom(input: LoadBufferInput): EditorBuffer {
  const savedText = input.savedText ?? input.text;
  return {
    chapter: input.chapter,
    text: input.text,
    savedText,
    version: input.version,
    saveState: input.saveState ?? (input.text === savedText ? "saved" : "dirty"),
    recoveryConflict: input.recoveryConflict ?? null
  };
}

/** Create an empty immutable buffer collection. */
export function createEditorBuffers(): EditorBuffersState {
  return { buffers: {} };
}

/** Load a chapter from canonical storage, replacing any existing buffer. */
export function loadBuffer(state: EditorBuffersState, input: LoadBufferInput): EditorBuffersState {
  return copyBuffers(state, input.chapter.id, bufferFrom(input));
}

/** Alias used by callers that receive chapter data incrementally. */
export const upsertBuffer = loadBuffer;

/** Apply an edit without performing I/O or making any IME assumptions. */
export function editBuffer(state: EditorBuffersState, chapterId: string, text: string): EditorBuffersState {
  const current = state.buffers[chapterId];
  if (current === undefined || current.text === text) return state;
  return copyBuffers(state, chapterId, {
    ...current,
    text,
    saveState: text === current.savedText ? "saved" : "dirty"
  });
}

/** Short reducer-style name for editBuffer. */
export const edit = editBuffer;

/** Mark a dirty buffer as being persisted. Clean buffers are left unchanged. */
export function beginSave(state: EditorBuffersState, chapterId: string): EditorBuffersState {
  const current = state.buffers[chapterId];
  if (current === undefined || current.text === current.savedText || current.saveState === "saving") return state;
  return copyBuffers(state, chapterId, { ...current, saveState: "saving" });
}

/** Record a successful save, retaining newer in-memory edits if they exist. */
export function saveSucceeded(state: EditorBuffersState, chapterId: string, result: SaveSuccessInput): EditorBuffersState {
  const current = state.buffers[chapterId];
  if (current === undefined) return state;
  const savedText = result.text ?? current.text;
  return copyBuffers(state, chapterId, {
    ...current,
    savedText,
    version: result.version,
    saveState: current.text === savedText ? "saved" : "dirty",
    recoveryConflict: current.text === savedText ? null : current.recoveryConflict
  });
}

/** Mark a save as failed while retaining the unsaved text for retry. */
export function saveFailed(state: EditorBuffersState, chapterId: string): EditorBuffersState {
  const current = state.buffers[chapterId];
  if (current === undefined) return state;
  return copyBuffers(state, chapterId, { ...current, saveState: "error" });
}

export function applyRecoveryDraft(state: EditorBuffersState, chapterId: string): EditorBuffersState {
  const current = state.buffers[chapterId];
  if (current === undefined || current.recoveryConflict === null) return state;
  return copyBuffers(state, chapterId, { ...current, text: current.recoveryConflict.draft.text, saveState: "dirty", recoveryConflict: null });
}

export function dismissRecoveryConflict(state: EditorBuffersState, chapterId: string): EditorBuffersState {
  const current = state.buffers[chapterId];
  if (current === undefined || current.recoveryConflict === null) return state;
  return copyBuffers(state, chapterId, { ...current, recoveryConflict: null });
}

/** Remove buffers no longer referenced by any editor group/tab. */
export function pruneBuffers(state: EditorBuffersState, referencedChapterIds: Iterable<string>): EditorBuffersState {
  const referenced = new Set(referencedChapterIds);
  let changed = false;
  const buffers: Record<string, EditorBuffer> = {};
  for (const [chapterId, buffer] of Object.entries(state.buffers)) {
    if (referenced.has(chapterId)) buffers[chapterId] = buffer;
    else changed = true;
  }
  return changed ? { buffers } : state;
}

/** More explicit alias for callers handling a tab close event. */
export const removeUnreferencedBuffers = pruneBuffers;
