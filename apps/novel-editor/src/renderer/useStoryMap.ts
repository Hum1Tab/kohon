import { useEffect, useMemo, useSyncExternalStore } from "react";
import { emptyStoryMap, type StoryMap } from "@kohon/project-store/story-map";
import { StoryMapSession, type StoryMapSnapshot } from "../shared/story-map-session.js";

export interface StoryMapController extends StoryMapSnapshot {
  viewState?: Map<string, unknown>;
  change(map: StoryMap, key?: string | null): void; undo(): void; redo(): void;
  flush(): Promise<void>; reload(): Promise<void>; discardAndReload(): Promise<void>;
}
export function useStoryMap(root: string | null): StoryMapController {
  const viewState = useMemo(() => new Map<string, unknown>(), [root]);
  const session = useMemo(() => new StoryMapSession({
    read: () => root === null ? Promise.resolve(emptyStoryMap()) : window.kohon.readStoryMap(root),
    save: (map, revision) => root === null ? Promise.resolve(map) : window.kohon.saveStoryMap(root, map, revision)
  }), [root]);
  useEffect(() => { void session.load(); return () => { void session.flush().catch(() => undefined); }; }, [session]);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return { ...snapshot, viewState, change: session.change, undo: session.undo, redo: session.redo, flush: session.flush, reload: session.reload, discardAndReload: session.discardAndReload };
}
