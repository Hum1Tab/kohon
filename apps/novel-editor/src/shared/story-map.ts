import type { Chapter, ReviewLedgerEntry } from "./types.js";

export interface StoryStrip { id: string; title: string; order: number; width: number; count: number; hasOpenReview: boolean; chapter: Chapter; }
export interface StoryMapData {
  strips: StoryStrip[];
  people: string[];
  places: string[];
  times: string[];
  totalWidth: number;
}

export function buildStoryMap(chapters: readonly Chapter[], lengths: Readonly<Record<string, number>>, reviews: readonly ReviewLedgerEntry[]): StoryMapData {
  const ordered = [...chapters].sort((a, b) => a.order - b.order);
  const total = ordered.reduce((sum, c) => sum + Math.max(0, lengths[c.id] ?? 0), 0);
  const viewport = Math.max(720, ordered.length * 105);
  const open = new Set(reviews.filter((r) => r.status === "open").map((r) => r.chapterId));
  const strips = ordered.map((chapter) => {
    const count = Math.max(0, lengths[chapter.id] ?? 0);
    // All non-empty widths share the same linear scale; blank chapters stay usable.
    return { id: chapter.id, title: chapter.title, order: chapter.order, count, chapter,
      width: count === 0 ? 58 : Math.max(58, Math.round(viewport * count / Math.max(1, total))),
      hasOpenReview: open.has(chapter.id) };
  });
  const unique = (values: Array<string | undefined>): string[] => [...new Set(values.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()))];
  return {
    strips, totalWidth: strips.reduce((sum, c) => sum + c.width, 0),
    people: unique(ordered.flatMap((c) => c.metadata?.characters ?? [])),
    places: unique(ordered.map((c) => c.metadata?.location)),
    times: unique(ordered.map((c) => c.metadata?.timeline))
  };
}

export interface StoryBond { from: string; to: string; label: string; strength: number | undefined; chapterId: string; chapterIndex: number; }

/** A bond persists until the author explicitly changes it in a later chapter. */
export function bondsThrough(data: StoryMapData, chapterId: string | null): StoryBond[] {
  const end = chapterId === null ? data.strips.length - 1 : data.strips.findIndex((c) => c.id === chapterId);
  const latest = new Map<string, StoryBond>();
  for (let i = 0; i <= end; i += 1) {
    const strip = data.strips[i];
    if (!strip) continue;
    for (const item of strip.chapter.metadata?.relationships ?? []) {
      if (!data.people.includes(item.from) || !data.people.includes(item.to)) continue;
      const key = [item.from, item.to].sort().join("\u0000");
      latest.set(key, { from: item.from, to: item.to, label: item.label ?? "", strength: item.strength, chapterId: strip.id, chapterIndex: i });
    }
  }
  return [...latest.values()];
}

export function sharedScenes(data: StoryMapData, throughChapterId: string | null): Array<{ a: string; b: string; scenes: number }> {
  const end = throughChapterId === null ? data.strips.length - 1 : data.strips.findIndex((c) => c.id === throughChapterId);
  const counts = new Map<string, number>();
  for (let i = 0; i <= end; i += 1) {
    const set = new Set(data.strips[i]?.chapter.metadata?.characters ?? []);
    const members = data.people.filter((person) => set.has(person));
    for (let a = 0; a < members.length; a += 1) for (let b = a + 1; b < members.length; b += 1) {
      const key = [members[a], members[b]].sort().join("\u0000");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts].map(([key, scenes]) => { const [a, b] = key.split("\u0000"); return { a: a!, b: b!, scenes }; }).sort((x, y) => y.scenes - x.scenes || x.a.localeCompare(y.a));
}

export interface EmotionPoint { chapterId: string; chapterIndex: number; value: number; action: string; expression: string; innerThought: string; offstage: boolean; }
/** Unknown emotion is never treated as neutral (0). */
export function emotionSeries(data: StoryMapData, person: string): EmotionPoint[] {
  return data.strips.flatMap((strip, chapterIndex) =>
    (strip.chapter.metadata?.moments ?? []).filter((moment) => moment.character === person && moment.emotion !== undefined).map((moment) => ({
      chapterId: strip.id, chapterIndex, value: moment.emotion!,
      action: moment.action ?? "", expression: moment.expression ?? "", innerThought: moment.innerThought ?? "", offstage: moment.offstage === true
    })));
}
