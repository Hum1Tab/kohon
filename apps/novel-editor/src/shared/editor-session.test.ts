import { describe, expect, it } from "vitest";

import { activateEditorTab, closeEditorGroup, closeEditorTab, defaultEditorSession, moveEditorTab, openEditorTab, sanitizeEditorSession, splitEditor, updateEditorTabView } from "./editor-session.js";

describe("editor session", () => {
  it("opens, activates, closes, and splits tabs without losing view state", () => {
    let session = openEditorTab(defaultEditorSession("a"), "b");
    session = updateEditorTabView(session, "group-1", "b", { selectionStart: 12, selectionEnd: 15, scrollTop: 80 });
    session = activateEditorTab(session, "group-1", "a");
    session = splitEditor(session, "right", "b");
    expect(session.groups[1]).toMatchObject({ activeChapterId: "b", tabs: [{ chapterId: "b", selectionStart: 12, scrollTop: 80 }] });
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

  it("reorders a tab within its group and keeps it active", () => {
    let session = openEditorTab(openEditorTab(defaultEditorSession("a"), "b"), "c");
    session = updateEditorTabView(session, "group-1", "b", { selectionStart: 4, scrollTop: 24 });
    const moved = moveEditorTab(session, "group-1", "b", "group-1", 0);
    expect(moved.activeGroupId).toBe("group-1");
    expect(moved.groups[0]!.tabs.map((item) => item.chapterId)).toEqual(["b", "a", "c"]);
    expect(moved.groups[0]!.activeChapterId).toBe("b");
    expect(moved.groups[0]!.tabs[0]).toMatchObject({ chapterId: "b", selectionStart: 4, scrollTop: 24 });
  });

  it("moves across groups, selects the source neighbor, and does not duplicate an existing target tab", () => {
    const session = {
      ...defaultEditorSession("a"),
      activeGroupId: "group-1" as const,
      split: "right" as const,
      groups: [
        { id: "group-1" as const, tabs: [
          { chapterId: "a", selectionStart: 2, selectionEnd: 3, scrollTop: 10, scrollLeft: 1 },
          { chapterId: "b", selectionStart: 4, selectionEnd: 5, scrollTop: 20, scrollLeft: 2 }
        ], activeChapterId: "a" },
        { id: "group-2" as const, tabs: [
          { chapterId: "c", selectionStart: 6, selectionEnd: 7, scrollTop: 30, scrollLeft: 3 },
          { chapterId: "a", selectionStart: 8, selectionEnd: 9, scrollTop: 40, scrollLeft: 4 }
        ], activeChapterId: "c" }
      ]
    };
    const moved = moveEditorTab(session, "group-1", "a", "group-2", 0);
    expect(moved.activeGroupId).toBe("group-2");
    expect(moved.groups[0]).toMatchObject({ activeChapterId: "b", tabs: [{ chapterId: "b" }] });
    expect(moved.groups[1]!.tabs.map((item) => item.chapterId)).toEqual(["c", "a"]);
    expect(moved.groups[1]!.activeChapterId).toBe("a");
    expect(moved.groups[1]!.tabs[1]).toMatchObject({ chapterId: "a", selectionStart: 8, scrollTop: 40 });
  });
});
