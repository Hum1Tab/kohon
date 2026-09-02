/** The text and UTF-16 selection offsets of a native textarea. */
export interface TextareaSelection {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/** The result of an explicit, user-invoked text-area edit. */
export interface JapaneseInputResult {
  nextText: string;
  nextSelectionStart: number;
  nextSelectionEnd: number;
}

interface SelectionRange {
  start: number;
  end: number;
}

function offset(value: number, textLength: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(textLength, Math.trunc(value))) : 0;
}

function selectionOf(input: TextareaSelection): SelectionRange {
  const start = offset(input.selectionStart, input.text.length);
  const end = offset(input.selectionEnd, input.text.length);
  return start <= end ? { start, end } : { start: end, end: start };
}

function replaceSelection(input: TextareaSelection, replacement: string, selectReplacement: boolean): JapaneseInputResult {
  const selection = selectionOf(input);
  const nextText = input.text.slice(0, selection.start) + replacement + input.text.slice(selection.end);
  const caret = selection.start + replacement.length;
  return {
    nextText,
    nextSelectionStart: selectReplacement ? selection.start : caret,
    nextSelectionEnd: caret
  };
}

/**
 * Wraps a non-empty selection in KOHON's Markdown-compatible ruby notation.
 * The reading is supplied by the UI; this helper does not infer or rewrite it.
 */
export function wrapSelectionWithRuby(input: TextareaSelection, reading: string): JapaneseInputResult {
  const selection = selectionOf(input);
  if (selection.start === selection.end) {
    return { nextText: input.text, nextSelectionStart: selection.start, nextSelectionEnd: selection.end };
  }
  return replaceSelection(input, `｜${input.text.slice(selection.start, selection.end)}《${reading}》`, true);
}

/** Wraps a non-empty selection in KOHON's emphasis (傍点) notation. */
export function wrapSelectionWithBouten(input: TextareaSelection): JapaneseInputResult {
  const selection = selectionOf(input);
  if (selection.start === selection.end) {
    return { nextText: input.text, nextSelectionStart: selection.start, nextSelectionEnd: selection.end };
  }
  return replaceSelection(input, `《《${input.text.slice(selection.start, selection.end)}》》`, true);
}

/** Converts only ASCII punctuation contained wholly within the current selection. */
export function normalizeSelectedPunctuation(input: TextareaSelection): JapaneseInputResult {
  const selection = selectionOf(input);
  if (selection.start === selection.end) {
    return { nextText: input.text, nextSelectionStart: selection.start, nextSelectionEnd: selection.end };
  }
  const selected = input.text.slice(selection.start, selection.end);
  const normalized = selected.replace(/\.\.\./gu, "……").replace(/--/gu, "――");
  return replaceSelection(input, normalized, true);
}

/** Inserts one explicitly requested paragraph break and a full-width indent. */
export function insertParagraphIndent(input: TextareaSelection): JapaneseInputResult {
  return replaceSelection(input, "\n　", false);
}

/** Inserts Japanese corner brackets explicitly; no automatic IME interception is used. */
export function wrapSelectionWithJapaneseQuotes(input: TextareaSelection): JapaneseInputResult {
  const selection = selectionOf(input);
  const selected = input.text.slice(selection.start, selection.end);
  const replacement = `「${selected}」`;
  const nextText = input.text.slice(0, selection.start) + replacement + input.text.slice(selection.end);
  return {
    nextText,
    nextSelectionStart: selection.start + 1,
    nextSelectionEnd: selection.start + 1 + selected.length
  };
}

/** JLReq's common short alphanumeric case; longer spans should remain ordinary text. */
export function isTateChuYokoCandidate(value: string): boolean {
  return /^[A-Za-z0-9]{2,3}$/u.test(value);
}

/** Uses the published Aozora Bunko annotation instead of inventing an opaque syntax. */
export function annotateSelectionAsTateChuYoko(input: TextareaSelection): JapaneseInputResult {
  const selection = selectionOf(input);
  const selected = input.text.slice(selection.start, selection.end);
  if (!isTateChuYokoCandidate(selected)) return { nextText: input.text, nextSelectionStart: selection.start, nextSelectionEnd: selection.end };
  const annotation = `［＃「${selected}」は縦中横］`;
  const nextText = input.text.slice(0, selection.end) + annotation + input.text.slice(selection.end);
  return { nextText, nextSelectionStart: selection.start, nextSelectionEnd: selection.end };
}
