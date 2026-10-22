import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyStoryMap, newStoryScene, type StoryMap } from "@kohon/project-store/story-map";
import { StoryMapSession } from "./story-map-session.js";
const map = (): StoryMap => ({ ...emptyStoryMap(), scenes: [newStoryScene("a", "再会")], narrativeOrder: ["a"], chronologicalOrder: ["a"] });
const changed = (title: string): StoryMap => ({ ...map(), scenes: [newStoryScene("a", title)] });
afterEach(() => { vi.useRealTimers(); });

describe("story map editing session", () => {
  it("coalesces typing, preserves structural undo and saves edits after undo and redo", async () => {
    vi.useFakeTimers(); let revision = 0;
    const save = vi.fn(async (value: StoryMap) => ({ ...value, revision: ++revision }));
    const session = new StoryMapSession({ read: async () => map(), save }); await session.load();
    session.change(changed("駅"), "a:title"); session.change(changed("駅で再会"), "a:title");
    session.undo(); expect(session.getSnapshot().map.scenes[0]!.title).toBe("再会");
    session.redo(); await session.flush();
    expect(save).toHaveBeenCalledTimes(1); expect(session.getSnapshot().status).toBe("saved");
    expect(session.getSnapshot().map.revision).toBe(1);
  });
  it("drains edits typed while a save is in flight, using the returned revision", async () => {
    vi.useFakeTimers(); let complete!: (value: StoryMap) => void;
    const save = vi.fn<(value: StoryMap, revision: number) => Promise<StoryMap>>()
      .mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }))
      .mockImplementationOnce(async value => ({ ...value, revision: 2 }));
    const session = new StoryMapSession({ read: async () => map(), save }); await session.load();
    session.change(changed("一案")); const pending = session.flush();
    session.change(changed("二案")); complete({ ...changed("一案"), revision: 1 }); await pending;
    expect(save.mock.calls[1]![1]).toBe(1); expect(save.mock.calls[1]![0].scenes[0]!.title).toBe("二案");
    expect(session.getSnapshot()).toMatchObject({ status: "saved", map: { revision: 2 } });
  });
  it("retains unsaved edits after a failure and retries without resetting the revision", async () => {
    vi.useFakeTimers(); const save = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValueOnce({ ...changed("変更"), revision: 1 });
    const session = new StoryMapSession({ read: async () => map(), save }); await session.load(); session.change(changed("変更"));
    await expect(session.flush()).rejects.toThrow("disk full");
    expect(session.getSnapshot()).toMatchObject({ status: "error", map: { scenes: [{ title: "変更" }] } });
    await session.flush(); expect(session.getSnapshot().status).toBe("saved"); expect(save.mock.calls[1]![1]).toBe(0);
  });
  it("does not accept edits before hydration or silently replace an unreadable map", async () => {
    const save = vi.fn(); const session = new StoryMapSession({ read: async () => { throw new Error("bad JSON"); }, save });
    session.change(changed("lost")); await session.load(); session.change(changed("lost")); await session.flush();
    expect(session.getSnapshot()).toMatchObject({ status: "error", hydrated: false }); expect(save).not.toHaveBeenCalled();
  });
  it("reloads restored planning and clears undo history", async () => {
    vi.useFakeTimers(); let current = map(); const session = new StoryMapSession({ read: async () => current, save: async value => value });
    await session.load(); session.change(changed("変更")); await session.flush(); current = changed("復元"); await session.reload();
    expect(session.getSnapshot()).toMatchObject({ status: "saved", canUndo: false }); expect(session.getSnapshot().map.scenes[0]!.title).toBe("復元");
  });
  it("allows explicit discard after a conflict without retrying an unsafe write", async () => {
    vi.useFakeTimers(); const save = vi.fn().mockRejectedValue(new Error("revision conflict"));
    const session = new StoryMapSession({ read: async () => map(), save }); await session.load(); session.change(changed("競合した変更"));
    await expect(session.flush()).rejects.toThrow("revision conflict");
    await session.discardAndReload();
    expect(session.getSnapshot().map.scenes[0]!.title).toBe("再会");
    expect(session.getSnapshot()).toMatchObject({ status: "saved", canUndo: false });
    await session.flush(); expect(save).toHaveBeenCalledTimes(1);
  });
});
