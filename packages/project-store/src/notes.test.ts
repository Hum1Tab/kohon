import { describe, expect, it } from "vitest";

import { archiveNote, createNoteIndex, createNoteMeta, parseNoteIndex, serializeNoteIndex, unarchiveNote, updateNoteMeta } from "./notes.js";

describe("note metadata", () => {
  it("round-trips metadata without putting a body in the index", () => {
    const note = createNoteMeta({ id: "note-1", title: "  主人公  ", kind: "character", chapterIds: ["chapter-1"], order: 0 }, undefined, "2026-09-02T00:00:00.000Z");
    const index = createNoteIndex([note]);
    const json = serializeNoteIndex(index);
    expect(json).not.toContain("body");
    expect(parseNoteIndex(json)).toEqual(index);
  });

  it("creates and updates editable metadata while keeping its file and identity", () => {
    const note = createNoteMeta({ title: "場所", kind: "place" }, "note-place", "2026-09-02T00:00:00.000Z");
    const updated = updateNoteMeta(note, { title: "港町", chapterIds: ["chapter-2"], order: 1 }, "2026-09-02T01:00:00.000Z");
    expect(updated).toMatchObject({ id: "note-place", file: "notes/note-place.md", title: "港町", chapterIds: ["chapter-2"], order: 1, createdAt: "2026-09-02T00:00:00.000Z", updatedAt: "2026-09-02T01:00:00.000Z" });
    expect(note).toMatchObject({ title: "場所", chapterIds: [], order: 0 });
  });

  it("archives and restores metadata without mutating the original", () => {
    const note = createNoteMeta({ id: "note-plot", title: "筋書き", kind: "plot" }, undefined, "2026-09-02T00:00:00.000Z");
    const archived = archiveNote(note, "2026-09-02T02:00:00.000Z");
    const restored = unarchiveNote(archived, "2026-09-02T03:00:00.000Z");
    expect(note.archived).toBe(false);
    expect(archived).toMatchObject({ archived: true, updatedAt: "2026-09-02T02:00:00.000Z" });
    expect(restored).toMatchObject({ archived: false, updatedAt: "2026-09-02T03:00:00.000Z", file: "notes/note-plot.md" });
  });
});
