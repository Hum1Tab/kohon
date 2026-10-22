import type { StoryMap } from "@kohon/project-store/story-map";
import type { KnowledgeEvent, MysteryBoard } from "@kohon/project-store/mystery";

/** Build once per perspective, then binary-search; equal-scene updates keep entry order. */
export function indexKnowledge(map: StoryMap, board: MysteryBoard, holder: string, visibleOnly = false): (fact: string, scene: string) => KnowledgeEvent | null {
  const position = new Map((holder === "reader" ? map.narrativeOrder : map.chronologicalOrder).map((id, i) => [id, i]));
  const offstage = new Set(visibleOnly ? map.scenes.filter(s => s.kind === "offstage").map(s => s.id) : []);
  const groups = new Map<string, { at: number; entry: number; event: KnowledgeEvent }[]>();
  board.knowledge.forEach((event, entry) => {
    const at = position.get(event.sceneId);
    if (event.holderId !== holder || at === undefined || offstage.has(event.sceneId)) return;
    const list = groups.get(event.factId) ?? []; list.push({ at, entry, event }); groups.set(event.factId, list);
  });
  for (const list of groups.values()) list.sort((a, b) => a.at - b.at || a.entry - b.entry);
  return (fact, scene) => {
    const at = position.get(scene); const list = groups.get(fact);
    if (at === undefined || !list) return null;
    let lo = 0, hi = list.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (list[mid]!.at <= at) lo = mid + 1; else hi = mid; }
    return list[lo - 1]?.event ?? null;
  };
}

/** Renaming/merging/removing a lane changes all its scenes in one undoable edit. */
export function renamePlotline(map: StoryMap, from: string, to: string): StoryMap {
  if (!from || to.length > 200 || (to && !to.trim())) return map;
  const names = [...new Set((map.plotlines ?? []).map(name => name === from ? to : name).filter(Boolean))];
  // Scene-only plotlines can exceed the optional saved-lane limit. Renaming one
  // must not expand all of them into an invalid saved-lane list.
  if (to && names.length < 200 && !names.includes(to)) names.push(to);
  return { ...map, plotlines: names, scenes: map.scenes.map(s => s.plotline === from ? { ...s, plotline: to } : s) };
}
