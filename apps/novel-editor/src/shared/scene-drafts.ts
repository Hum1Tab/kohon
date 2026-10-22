import { newStoryScene, type StoryMap, type StoryOrder } from "@kohon/project-store/story-map";

export type SceneDraftError = "empty" | "too-many" | "title-length" | "capacity";
export function sceneDrafts(text: string, remaining: number): { titles: string[]; error: SceneDraftError | null } {
  const titles = text.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  const error = !titles.length ? "empty" : titles.length > 5000 ? "too-many" : titles.some(title => title.length > 200) ? "title-length" : titles.length > remaining ? "capacity" : null;
  return { titles, error };
}

/** Title-only brainstorming is one undoable edit; neither existing order changes. */
export function appendSceneDrafts(map: StoryMap, text: string, lane: string, nextId: () => string): StoryMap {
  const draft = sceneDrafts(text, 5000 - map.scenes.length);
  if (draft.error || lane.length > 200) return map;
  const scenes = draft.titles.map(title => ({ ...newStoryScene(nextId(), title), plotline: lane }));
  const ids = scenes.map(s => s.id);
  if (new Set(ids).size !== ids.length || ids.some(id => map.scenes.some(s => s.id === id))) return map;
  return { ...map, sceneDraft: { text: "", plotline: lane }, scenes: [...map.scenes, ...scenes], narrativeOrder: [...map.narrativeOrder, ...ids], chronologicalOrder: [...map.chronologicalOrder, ...ids] };
}

export function findStoryScenes(map: StoryMap, axis: StoryOrder, query: string, character = ""): { id: string; title: string; position: number; plotline: string }[] {
  const search = query.trim().toLocaleLowerCase(); const byId = new Map(map.scenes.map(s => [s.id, s]));
  return map[axis].flatMap((id, position) => {
    const scene = byId.get(id);
    return !scene || character && !scene.beats.some(b => b.characterId === character) || search && ![scene.title, scene.surface, scene.inner, scene.plotline, scene.time].join(" ").toLocaleLowerCase().includes(search) ? [] : [{ id, title: scene.title, position, plotline: scene.plotline }];
  });
}
