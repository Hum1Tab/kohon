export type DiffLineKind = "context" | "add" | "remove";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  leftLine: number | null;
  rightLine: number | null;
}

export interface DiffHunk {
  leftStart: number;
  rightStart: number;
  lines: DiffLine[];
}

export interface TextDiff {
  hunks: DiffHunk[];
  additions: number;
  removals: number;
  truncated: boolean;
}

interface RawLine { kind: DiffLineKind; text: string }

function rawDiff(left: readonly string[], right: readonly string[]): RawLine[] {
  const rows = left.length + 1;
  const columns = right.length + 1;
  if (left.length * right.length > 2_000_000) return [...left.map((text) => ({ kind: "remove" as const, text })), ...right.map((text) => ({ kind: "add" as const, text }))];
  const table = new Uint32Array(rows * columns);
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i * columns + j] = left[i] === right[j] ? table[(i + 1) * columns + j + 1]! + 1 : Math.max(table[(i + 1) * columns + j]!, table[i * columns + j + 1]!);
    }
  }
  const out: RawLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) { out.push({ kind: "context", text: left[i]! }); i += 1; j += 1; }
    else if (j < right.length && (i >= left.length || table[i * columns + j + 1]! > table[(i + 1) * columns + j]!)) { out.push({ kind: "add", text: right[j]! }); j += 1; }
    else { out.push({ kind: "remove", text: left[i]! }); i += 1; }
  }
  return out;
}

export function diffTextLines(leftText: string, rightText: string, contextLines = 3, maximumLines = 2_000): TextDiff {
  const left = leftText.split("\n");
  const right = rightText.split("\n");
  const raw = rawDiff(left, right);
  const numbered: DiffLine[] = [];
  let leftLine = 1;
  let rightLine = 1;
  let additions = 0;
  let removals = 0;
  for (const line of raw) {
    if (line.kind === "context") { numbered.push({ ...line, leftLine, rightLine }); leftLine += 1; rightLine += 1; }
    else if (line.kind === "remove") { numbered.push({ ...line, leftLine, rightLine: null }); leftLine += 1; removals += 1; }
    else { numbered.push({ ...line, leftLine: null, rightLine }); rightLine += 1; additions += 1; }
  }
  const changes = numbered.flatMap((line, index) => line.kind === "context" ? [] : [index]);
  if (changes.length === 0) return { hunks: [], additions: 0, removals: 0, truncated: false };
  const ranges: { start: number; end: number }[] = [];
  for (const index of changes) {
    const start = Math.max(0, index - contextLines);
    const end = Math.min(numbered.length, index + contextLines + 1);
    const previous = ranges.at(-1);
    if (previous !== undefined && start <= previous.end) previous.end = Math.max(previous.end, end);
    else ranges.push({ start, end });
  }
  let remaining = maximumLines;
  let truncated = false;
  const hunks: DiffHunk[] = [];
  for (const range of ranges) {
    if (remaining <= 0) { truncated = true; break; }
    const wanted = numbered.slice(range.start, range.end);
    const lines = wanted.slice(0, remaining);
    if (lines.length < wanted.length) truncated = true;
    remaining -= lines.length;
    const first = lines[0];
    if (first !== undefined) hunks.push({ leftStart: first.leftLine ?? Math.max(1, (first.rightLine ?? 1) - 1), rightStart: first.rightLine ?? Math.max(1, (first.leftLine ?? 1) - 1), lines });
  }
  return { hunks, additions, removals, truncated };
}
