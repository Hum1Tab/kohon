import { describe, expect, it } from "vitest";

import {
  applyRecoveryDraft,
  beginSave,
  createEditorBuffers,
  dismissRecoveryConflict,
  editBuffer,
  loadBuffer,
  pruneBuffers,
  saveFailed,
  saveSucceeded,
  type EditorBuffersState
} from "./editor-buffers.js";

const chapter = (id: string) => ({ id, title: id.toUpperCase(), file: `manuscript/${id}.md`, order: 0 });

function loaded(): EditorBuffersState {
  return loadBuffer(createEditorBuffers(), { chapter: chapter("one"), text: "before", version: "v1" });
}

describe("editor buffers", () => {
  it("loads, edits, and keeps the canonical text separate", () => {
    const initial = loaded();
    const edited = editBuffer(initial, "one", "after");
    expect(edited.buffers["one"]).toMatchObject({ text: "after", savedText: "before", version: "v1", saveState: "dirty" });
    expect(initial.buffers["one"]?.text).toBe("before");
  });

  it("tracks save start, success, stale completion, and failure", () => {
    const saving = beginSave(editBuffer(loaded(), "one", "new"), "one");
    expect(saving.buffers["one"]?.saveState).toBe("saving");

    const current = editBuffer(saving, "one", "newer");
    const stale = saveSucceeded(current, "one", { text: "new", version: "v2" });
    expect(stale.buffers["one"]).toMatchObject({ text: "newer", savedText: "new", version: "v2", saveState: "dirty" });
    expect(saveFailed(stale, "one").buffers["one"]?.saveState).toBe("error");

    const complete = saveSucceeded(saving, "one", { text: "new", version: "v2" });
    expect(complete.buffers["one"]).toMatchObject({ text: "new", savedText: "new", version: "v2", saveState: "saved", recoveryConflict: null });
  });

  it("prunes buffers no longer referenced by open tabs", () => {
    const two = loadBuffer(loaded(), { chapter: chapter("two"), text: "second", version: "v1" });
    const kept = pruneBuffers(two, ["one"]);
    expect(Object.keys(kept.buffers)).toEqual(["one"]);
    expect(two.buffers["two"]).toBeDefined();
    expect(pruneBuffers(kept, ["one"])).toBe(kept);
  });

  it("applies or dismisses a conflicting recovery draft explicitly", () => {
    const conflict = { draft: { schemaVersion: 1 as const, chapterId: "one", text: "recovered", baseVersion: "old", selectionStart: 0, selectionEnd: 0, scrollTop: 0, scrollLeft: 0, updatedAt: "2026-09-02T00:00:00.000Z" }, canonicalVersion: "v1", conflict: true };
    const state = loadBuffer(createEditorBuffers(), { chapter: chapter("one"), text: "canonical", version: "v1", recoveryConflict: conflict });
    expect(applyRecoveryDraft(state, "one").buffers["one"]).toMatchObject({ text: "recovered", saveState: "dirty", recoveryConflict: null });
    expect(dismissRecoveryConflict(state, "one").buffers["one"]).toMatchObject({ text: "canonical", recoveryConflict: null });
  });
});
