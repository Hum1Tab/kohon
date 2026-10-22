import { validateMysteryBoard, type MysteryBoard } from "./mystery.js";
/** Author-owned planning data; never inferred from, or written into, the manuscript. */
export interface StoryCharacter { id: string; name: string; color: string }
export interface EmotionLayer { emotion: string; intensity: number | null; valence: number | null; note: string }
export interface CharacterBeat { characterId: string; surface: EmotionLayer; inner: EmotionLayer; expression: string; desire: string }
export interface SceneAnchor { quote: string; prefix: string; suffix: string }
export interface StoryScene {
  id: string; title: string; chapterId: string | null; time: string; plotline: string;
  kind: "scene" | "flashback" | "offstage";
  surface: string; inner: string; tension: number | null; beats: CharacterBeat[];
  manuscriptAnchor?: SceneAnchor | undefined;
}
export interface StoryMap {
  schemaVersion: 1; revision: number; characters: StoryCharacter[]; scenes: StoryScene[];
  narrativeOrder: string[]; chronologicalOrder: string[];
  mystery?: MysteryBoard;
  plotlines?: string[];
  sceneDraft?: { text: string; plotline: string };
}
export type StoryOrder = "narrativeOrder" | "chronologicalOrder";
export const STORY_COLORS = ["#467ca0", "#ac6b4e", "#8471b1", "#53856f", "#aa6788", "#9a843f"] as const;
export function emptyStoryMap(): StoryMap { return { schemaVersion: 1, revision: 0, characters: [], scenes: [], narrativeOrder: [], chronologicalOrder: [] }; }
export function emptyEmotion(): EmotionLayer { return { emotion: "", intensity: null, valence: null, note: "" }; }
export function emptyBeat(characterId: string): CharacterBeat { return { characterId, surface: emptyEmotion(), inner: emptyEmotion(), expression: "", desire: "" }; }
/** Editing an existing observation must not move it in reader-facing lists. */
export function updateCharacterBeat(beats: readonly CharacterBeat[], characterId: string, patch: Partial<Omit<CharacterBeat,"characterId">>): CharacterBeat[] {
  const index=beats.findIndex(beat=>beat.characterId===characterId);
  const next={...(index<0?emptyBeat(characterId):beats[index]!),...patch,characterId};
  return index<0?[...beats,next]:beats.map((beat,i)=>i===index?next:beat);
}
export function hasRecordedBeat(beat: CharacterBeat | undefined): boolean {
  return !!beat && !!(beat.expression || beat.desire || [beat.surface, beat.inner].some(e => e.emotion || e.note || e.intensity !== null || e.valence !== null));
}
/** Quotes follow edits before a scene; repeated text requires uniquely matching context. */
export function resolveSceneAnchor(text: string, anchor: SceneAnchor): { status: "found"; start: number; end: number } | { status: "missing" | "ambiguous" } {
  if (!anchor.quote) return { status: "missing" };
  const offsets: number[] = [];
  for (let from = 0; from <= text.length - anchor.quote.length;) {
    const start = text.indexOf(anchor.quote, from);
    if (start < 0) break;
    offsets.push(start); from = start + 1;
  }
  const contextual = offsets.filter(start => text.slice(Math.max(0, start - anchor.prefix.length), start) === anchor.prefix && text.slice(start + anchor.quote.length, start + anchor.quote.length + anchor.suffix.length) === anchor.suffix);
  const matches = offsets.length === 1 ? offsets : contextual;
  if (matches.length !== 1) return { status: offsets.length ? "ambiguous" : "missing" };
  return { status: "found", start: matches[0]!, end: matches[0]! + anchor.quote.length };
}
export function createSceneAnchor(text: string, start: number, end: number): SceneAnchor | null {
  start = Math.max(0, Math.min(text.length, start)); end = Math.max(start, Math.min(text.length, end));
  if (start === end) { start = text.lastIndexOf("\n", start - 1) + 1; const next = text.indexOf("\n", end); end = next < 0 ? text.length : next; }
  const quote = text.slice(start, end);
  if (!quote.trim() || quote.length > 4000) return null;
  return { quote, prefix: text.slice(Math.max(0, start - 64), start), suffix: text.slice(end, end + 64) };
}
export function newStoryScene(id: string, title: string, chapterId: string | null = null): StoryScene {
  return { id, title, chapterId, time: "", plotline: "", kind: "scene", surface: "", inner: "", tension: null, beats: [] };
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid story map object");
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 4000): string {
  if (typeof value !== "string" || value.length > max) throw new Error("invalid story map text");
  return value;
}
function id(value: unknown): string {
  const result = text(value, 81);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(result)) throw new Error("invalid story map id");
  return result;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("invalid story map list");
  return value;
}
function score(value: unknown, min = 0): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > 100) throw new Error("invalid story map score");
  return value;
}
function layer(value: unknown): EmotionLayer {
  const v = record(value);
  return { emotion: text(v["emotion"], 200), intensity: score(v["intensity"]), valence: score(v["valence"], -100), note: text(v["note"]) };
}
function unique(ids: string[]): void { if (new Set(ids).size !== ids.length) throw new Error("duplicate story map id"); }
/** Reject damaged data rather than silently replacing the author's planning. */
export function validateStoryMap(value: unknown): StoryMap {
  const v = record(value);
  if (v["schemaVersion"] !== 1 || !Number.isSafeInteger(v["revision"]) || (v["revision"] as number) < 0) throw new Error("unsupported story map version");
  const characters = list(v["characters"], 200).map((item): StoryCharacter => {
    const c = record(item); const name = text(c["name"], 200); const color = text(c["color"], 7);
    if (!name.trim() || !/^#[0-9a-f]{6}$/iu.test(color)) throw new Error("invalid story map character");
    return { id: id(c["id"]), name, color };
  });
  unique(characters.map(c => c.id));
  const characterIds = new Set(characters.map(c => c.id));
  const scenes = list(v["scenes"], 5000).map((item): StoryScene => {
    const s = record(item); const kind = s["kind"];
    if (kind !== "scene" && kind !== "flashback" && kind !== "offstage") throw new Error("invalid story scene kind");
    const beats = list(s["beats"], 200).map((item): CharacterBeat => {
      const b = record(item); const characterId = id(b["characterId"]);
      if (!characterIds.has(characterId)) throw new Error("unknown story character");
      return { characterId, surface: layer(b["surface"]), inner: layer(b["inner"]), expression: text(b["expression"]), desire: text(b["desire"]) };
    });
    unique(beats.map(b => b.characterId));
    const title = text(s["title"], 200); if (!title.trim()) throw new Error("empty story scene title");
    const rawAnchor = s["manuscriptAnchor"] === undefined ? undefined : record(s["manuscriptAnchor"]);
    const manuscriptAnchor = rawAnchor === undefined ? undefined : { quote: text(rawAnchor["quote"]), prefix: text(rawAnchor["prefix"], 64), suffix: text(rawAnchor["suffix"], 64) };
    if (manuscriptAnchor && (!manuscriptAnchor.quote.trim() || s["chapterId"] === null)) throw new Error("invalid scene manuscript anchor");
    return { id: id(s["id"]), title, chapterId: s["chapterId"] === null ? null : id(s["chapterId"]), time: text(s["time"], 200), plotline: text(s["plotline"], 200), kind, surface: text(s["surface"]), inner: text(s["inner"]), tension: score(s["tension"]), beats, ...(manuscriptAnchor === undefined ? {} : { manuscriptAnchor }) };
  });
  const ids = scenes.map(s => s.id); unique(ids); const sceneIds = new Set(ids);
  const order = (raw: unknown): string[] => {
    const result = list(raw, 5000).map(id); unique(result);
    if (result.length !== scenes.length || result.some(x => !sceneIds.has(x))) throw new Error("invalid story scene order");
    return result;
  };
  const plotlines = v["plotlines"] === undefined ? undefined : list(v["plotlines"], 200).map(item => { const name = text(item, 200); if (!name.trim()) throw new Error("empty story plotline"); return name; });
  if (plotlines) unique(plotlines);
  const draft = v["sceneDraft"] === undefined ? undefined : record(v["sceneDraft"]);
  const sceneDraft = draft === undefined ? undefined : { text: text(draft["text"], 1005000), plotline: text(draft["plotline"], 200) };
  return { schemaVersion: 1, revision: v["revision"] as number, characters, scenes, narrativeOrder: order(v["narrativeOrder"]), chronologicalOrder: order(v["chronologicalOrder"]), ...(plotlines === undefined ? {} : { plotlines }), ...(sceneDraft === undefined ? {} : { sceneDraft }), ...(v["mystery"] === undefined ? {} : { mystery: validateMysteryBoard(v["mystery"]) }) };
}
/** Move to an insertion boundary. Both directions and the last boundary are supported. */
export function moveStoryScene(map: StoryMap, axis: StoryOrder, sceneId: string, boundary: number): StoryMap {
  const order = map[axis]; const from = order.indexOf(sceneId);
  if (from < 0 || !Number.isInteger(boundary) || boundary < 0 || boundary > order.length) return map;
  const next = order.filter(x => x !== sceneId); next.splice(boundary > from ? boundary - 1 : boundary, 0, sceneId);
  return { ...map, [axis]: next };
}
export function removeStoryScene(map: StoryMap, sceneId: string): StoryMap {
  return { ...map, scenes: map.scenes.filter(s => s.id !== sceneId), narrativeOrder: map.narrativeOrder.filter(x => x !== sceneId), chronologicalOrder: map.chronologicalOrder.filter(x => x !== sceneId) };
}
/** Missing observations break the curve. A calm zero is still a measured point. */
export function curveSegments(values: readonly (number | null)[], step: number, height: number, signed = false): string[] {
  const segments: string[] = []; let points: string[] = [];
  for (const [index, value] of values.entries()) {
    if (value === null) { if (points.length) segments.push(points.join(" ")); points = []; continue; }
    const fraction = signed ? (value + 100) / 200 : value / 100;
    points.push(`${index * step + step / 2},${12 + (1 - fraction) * (height - 24)}`);
  }
  if (points.length) segments.push(points.join(" "));
  return segments;
}
