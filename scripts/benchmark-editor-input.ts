import { performance } from "node:perf_hooks";

import { textStats } from "../packages/editor-core/src/index.js";
import { createEditorBuffers, editBuffer, loadBuffer } from "../apps/novel-editor/src/shared/editor-buffers.js";
import { createEditorHistory, recordTextEdit } from "../apps/novel-editor/src/shared/editor-history.js";

const base = "あ".repeat(100_000);
const chapter = { id: "benchmark", title: "10万字", file: "manuscript/benchmark.md", order: 0 };
let buffers = loadBuffer(createEditorBuffers(), { chapter, text: base, version: "benchmark" });
let history = createEditorHistory();
let value = base;

const editStarted = performance.now();
for (let index = 0; index < 100; index += 1) {
  const next = `${value}あ`;
  history = recordTextEdit(history, {
    chapterId: chapter.id,
    beforeText: value,
    afterText: next,
    selectionBefore: { start: value.length, end: value.length },
    selectionAfter: { start: next.length, end: next.length },
    origin: "typing",
    timestamp: index * 10
  });
  buffers = editBuffer(buffers, chapter.id, next);
  value = next;
}
const editTotalMs = performance.now() - editStarted;

const statsStarted = performance.now();
textStats(value);
const idleStatsMs = performance.now() - statsStarted;

if (buffers.buffers[chapter.id]?.text !== value) throw new Error("benchmark changed manuscript text");

console.log(JSON.stringify({
  characters: value.length,
  edits: 100,
  editTotalMs: Number(editTotalMs.toFixed(2)),
  editAverageMs: Number((editTotalMs / 100).toFixed(3)),
  idleStatsMs: Number(idleStatsMs.toFixed(2))
}, null, 2));
