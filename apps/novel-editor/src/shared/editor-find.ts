export interface TextMatch {
  start: number;
  end: number;
}

function patternFor(query: string, caseSensitive: boolean): RegExp | null {
  if (query.length === 0) return null;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(escaped, caseSensitive ? "gu" : "giu");
}

export function findLiteralMatches(text: string, query: string, caseSensitive = false): TextMatch[] {
  const pattern = patternFor(query, caseSensitive);
  if (pattern === null) return [];
  return [...text.matchAll(pattern)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
}

export function replaceTextMatch(text: string, match: TextMatch, replacement: string): { text: string; caret: number } {
  const start = Math.max(0, Math.min(text.length, Math.trunc(match.start)));
  const end = Math.max(start, Math.min(text.length, Math.trunc(match.end)));
  return { text: text.slice(0, start) + replacement + text.slice(end), caret: start + replacement.length };
}

export function replaceAllLiteral(text: string, query: string, replacement: string, caseSensitive = false): { text: string; count: number } {
  const matches = findLiteralMatches(text, query, caseSensitive);
  if (matches.length === 0) return { text, count: 0 };
  let cursor = 0;
  const parts: string[] = [];
  for (const match of matches) {
    parts.push(text.slice(cursor, match.start), replacement);
    cursor = match.end;
  }
  parts.push(text.slice(cursor));
  return { text: parts.join(""), count: matches.length };
}
