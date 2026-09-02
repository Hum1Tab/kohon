import { describe, expect, it } from "vitest";

import { activateEditorTab, closeEditorGroup, closeEditorTab, defaultEditorSession, openEditorTab, sanitizeEditorSession, splitEditor, updateEditorTabView } from "./editor-session.js";

describe("editor session", () => {
  it("opens, activates, closes, and splits tabs without losing view state", () => {
    let session = openEditorTab(defaultEditorSession("a"), "b");
    session = updateEditorTabView(session, "group-1", "b", { selectionStart: 12, selectionEnd: 15, scrollTop: 80 });
    session = activateEditorTab(session, "group-1", "a");
    session = splitEditor(session, "right", "b");
    expect(session.groups[1]).toMatchObject({ activeChapterId: "b" });
    expect(session.groups[0]!.tabs[1]).toMatchObject({ chapterId: "b", selectionStart: 12, selectionEnd: 15, scrollTop: 80 });
    session = closeEditorTab(session, "group-2", "b");
    expect(session.groups[1]!.activeChapterId).toBeNull();
    expect(closeEditorGroup(session, "group-2")).toMatchObject({ split: "none", activeGroupId: "group-1" });
  });

  it("drops missing chapters and malformed persisted values", () => {
    const restored = sanitizeEditorSession({ split: "down", activeGroupId: "group-2", groups: [{ tabs: [{ chapterId: "gone" }, { chapterId: "a", selectionStart: -2, selectionEnd: 4 }] }, { tabs: [{ chapterId: "b" }], activeChapterId: "b" }] }, ["a", "b"]);
    expect(restored).toMatchObject({ split: "down", activeGroupId: "group-2" });
    expect(restored.groups[0]!.tabs).toEqual([{ chapterId: "a", selectionStart: 0, selectionEnd: 4, scrollTop: 0, scrollLeft: 0 }]);
  });
});
