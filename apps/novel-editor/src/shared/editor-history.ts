export type EditOrigin = "typing" | "input" | "ime-commit" | "find-replace" | "japanese-helper";

export interface TextSelection {
  start: number;
  end: number;
}

export interface TextEdit {
  chapterId: string;
  beforeText: string;
  afterText: string;
  selectionBefore: TextSelection;
  selectionAfter: TextSelection;
  origin: EditOrigin;
  timestamp: number;
}

interface ChapterHistory {
  past: readonly TextEdit[];
  future: readonly TextEdit[];
}

export interface EditorHistoryState {
  readonly chapters: Readonly<Record<string, ChapterHistory>>;
}

export interface HistoryStepResult {
  history: EditorHistoryState;
  edit: TextEdit | null;
}

const MAX_CHAPTER_EDITS = 100;
const MAX_CHAPTER_TEXT_UNITS = 4_000_000;
const TYPING_GROUP_MS = 1_000;

export function createEditorHistory(): EditorHistoryState {
  return { chapters: {} };
}

function sameSelection(left: TextSelection, right: TextSelection): boolean {
  return left.start === right.start && left.end === right.end;
}

function canGroupTyping(previous: TextEdit | undefined, next: TextEdit): boolean {
  return previous !== undefined
    && previous.origin === "typing"
    && next.origin === "typing"
    && previous.chapterId === next.chapterId
    && previous.afterText === next.beforeText
    && sameSelection(previous.selectionAfter, next.selectionBefore)
    && next.timestamp >= previous.timestamp
    && next.timestamp - previous.timestamp <= TYPING_GROUP_MS;
}

function trimPast(past: readonly TextEdit[]): readonly TextEdit[] {
  const kept: TextEdit[] = [];
  let textUnits = 0;
  for (let index = past.length - 1; index >= 0 && kept.length < MAX_CHAPTER_EDITS; index -= 1) {
    const edit = past[index]!;
    const size = edit.beforeText.length + edit.afterText.length;
    if (kept.length > 0 && textUnits + size > MAX_CHAPTER_TEXT_UNITS) break;
    kept.push(edit);
    textUnits += size;
  }
  return kept.reverse();
}

export function recordTextEdit(history: EditorHistoryState, edit: TextEdit): EditorHistoryState {
  if (edit.beforeText === edit.afterText) return history;
  const current = history.chapters[edit.chapterId] ?? { past: [], future: [] };
  const previous = current.past.at(-1);
  const past = canGroupTyping(previous, edit)
    ? [...current.past.slice(0, -1), { ...edit, beforeText: previous!.beforeText, selectionBefore: previous!.selectionBefore }]
    : [...current.past, edit];
  return { chapters: { ...history.chapters, [edit.chapterId]: { past: trimPast(past), future: [] } } };
}

export function undoTextEdit(history: EditorHistoryState, chapterId: string): HistoryStepResult {
  const current = history.chapters[chapterId];
  const edit = current?.past.at(-1);
  if (current === undefined || edit === undefined) return { history, edit: null };
  return {
    history: {
      chapters: {
        ...history.chapters,
        [chapterId]: { past: current.past.slice(0, -1), future: [...current.future, edit] }
      }
    },
    edit
  };
}

export function redoTextEdit(history: EditorHistoryState, chapterId: string): HistoryStepResult {
  const current = history.chapters[chapterId];
  const edit = current?.future.at(-1);
  if (current === undefined || edit === undefined) return { history, edit: null };
  return {
    history: {
      chapters: {
        ...history.chapters,
        [chapterId]: { past: [...current.past, edit], future: current.future.slice(0, -1) }
      }
    },
    edit
  };
}

export function clearTextHistory(history: EditorHistoryState, chapterId?: string): EditorHistoryState {
  if (chapterId === undefined) return createEditorHistory();
  if (history.chapters[chapterId] === undefined) return history;
  const chapters = { ...history.chapters };
  delete chapters[chapterId];
  return { chapters };
}
