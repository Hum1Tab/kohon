import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { NodeProjectStore as ProjectStore } from "./node.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kohon-review-note-"));
  const store = await ProjectStore.create(root, "Test");
  const chapter = await store.createChapter("第一章", "雨は窓を叩いている。");
  const source = await store.readChapterWithVersion(chapter.id);
  const input = {
    role: "first-reader",
    provider: "mock",
    model: "offline",
    scope: "current" as const,
    sourceVersionHash: source.version,
    sourceText: source.text,
    chapterId: chapter.id,
    findingTitle: "雨",
    findingBody: "描写の重複",
    exactQuote: "雨は窓を叩いている。"
  };
  const ledger = await store.appendReviewFindings([input]);
  return { root, store, chapter, source, input, id: ledger.entries[0]!.id };
}

it("persists a decision through reopening, a status change and quote recheck", async () => {
  const { root, store, chapter, id, source } = await fixture();
  await store.setReviewAuthorNote(id, "見送り。雨の意味は前段で示している。");
  await store.setReviewFindingStatus(id, "ignored");
  const reopened = new ProjectStore(root);
  expect((await reopened.listReviewFindings())[0]).toMatchObject({
    authorNote: "見送り。雨の意味は前段で示している。",
    status: "ignored",
    anchorStatus: "attached",
    manuscriptVersionHash: source.version
  });
  expect(await reopened.readChapter(chapter.id)).toBe(source.text);
  await reopened.saveChapter(chapter.id, `静かだ。${source.text}`);
  expect((await reopened.listReviewFindings())[0]).toMatchObject({
    authorNote: "見送り。雨の意味は前段で示している。",
    anchorStatus: "stale"
  });
  expect((await reopened.recheckReviewFinding(id))[0]).toMatchObject({
    authorNote: "見送り。雨の意味は前段で示している。",
    status: "ignored",
    anchorStatus: "attached",
    anchor: { offset: 4 }
  });
});

it("preserves concurrent note, status, quote recheck and new finding writes across store instances", async () => {
  const { root, store, id, input } = await fixture();
  const second = new ProjectStore(root);
  await Promise.all([
    store.setReviewAuthorNote(id, "根拠を読み返した。"),
    second.setReviewFindingStatus(id, "ignored"),
    store.recheckReviewFinding(id),
    second.appendReviewFindings([{ ...input, findingTitle: "別の候補" }]),
    store.listReviewFindings()
  ]);
  const entries = await new ProjectStore(root).listReviewFindings();
  expect(entries).toHaveLength(2);
  expect(entries.find(entry => entry.id === id)).toMatchObject({
    authorNote: "根拠を読み返した。",
    status: "ignored",
    anchorStatus: "attached"
  });
  expect(entries.find(entry => entry.id !== id)?.finding?.title).toBe("別の候補");
});

it("rejects invalid writes without changing the ledger and allows subsequent saves", async () => {
  const { root, store, id } = await fixture();
  const path = join(root, ".novel-editor/reviews/ledger.json");
  const before = await readFile(path, "utf8");
  await expect(store.setReviewAuthorNote("missing-id", "メモ")).rejects.toThrow("not found");
  await expect(store.setReviewAuthorNote(id, "長".repeat(4001))).rejects.toThrow("authorNote");
  expect(await readFile(path, "utf8")).toBe(before);
  expect((await store.setReviewAuthorNote(id, "再保存できる。"))[0]?.authorNote).toBe("再保存できる。");
});
