import { describe, expect, it } from "vitest";

import { createEditorHistory, recordTextEdit, redoTextEdit, undoTextEdit, type TextEdit } from "./editor-history.js";

function edit(chapterId: string, beforeText: string, afterText: string, timestamp: number, origin: TextEdit["origin"] = "typing"): TextEdit {
  return { chapterId, beforeText, afterText, selectionBefore: { start: beforeText.length, end: beforeText.length }, selectionAfter: { start: afterText.length, end: afterText.length }, origin, timestamp };
}

describe("editor history", () => {
  it("round-trips text and selection through undo and redo", () => {
    const recorded = recordTextEdit(createEditorHistory(), edit("one", "前", "前後", 1, "japanese-helper"));
    const undone = undoTextEdit(recorded, "one");
    expect(undone.edit).toMatchObject({ beforeText: "前", afterText: "前後", selectionBefore: { start: 1, end: 1 }, selectionAfter: { start: 2, end: 2 } });
    expect(redoTextEdit(undone.history, "one").edit?.afterText).toBe("前後");
  });

  it("keeps chapters independent and groups adjacent typing", () => {
    let history = createEditorHistory();
    history = recordTextEdit(history, edit("one", "", "あ", 1));
    history = recordTextEdit(history, edit("one", "あ", "あい", 200));
    history = recordTextEdit(history, edit("two", "", "別", 300));
    expect(undoTextEdit(history, "one").edit).toMatchObject({ beforeText: "", afterText: "あい" });
    expect(undoTextEdit(history, "two").edit).toMatchObject({ beforeText: "", afterText: "別" });
  });

  it("does not group IME commits or explicit commands", () => {
    let history = recordTextEdit(createEditorHistory(), edit("one", "", "日本", 1, "ime-commit"));
    history = recordTextEdit(history, edit("one", "日本", "｜日本《にほん》", 2, "japanese-helper"));
    const firstUndo = undoTextEdit(history, "one");
    expect(firstUndo.edit?.beforeText).toBe("日本");
    expect(undoTextEdit(firstUndo.history, "one").edit?.beforeText).toBe("");
  });
});
