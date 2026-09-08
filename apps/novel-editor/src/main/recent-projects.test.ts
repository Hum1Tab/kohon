import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RecentProjectsStore } from "./recent-projects.js";

const directories: string[] = [];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "kohon-recent-test-"));
  directories.push(directory);
  return { directory, path: join(directory, "recent.json") };
}
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("recent projects", () => {
  it("persists, deduplicates and bounds the list without accepting arbitrary open paths", async () => {
    const { directory, path } = await fixture();
    const store = new RecentProjectsStore(path);
    await store.load();
    expect(store.list()).toEqual([]);
    await Promise.all(Array.from({ length: 8 }, (_, i) => store.remember(join(directory, String(i)), `Work ${i}`)));
    await store.remember(join(directory, "4"), "Renamed");
    const loaded = new RecentProjectsStore(path);
    await loaded.load();
    expect(loaded.list()).toHaveLength(6);
    expect(loaded.list()[0]?.title).toBe("Renamed");
    expect(loaded.list().filter((item) => item.root === join(directory, "4"))).toHaveLength(1);
    expect(loaded.has(join(directory, "unknown"))).toBe(false);
    expect(loaded.has(null)).toBe(false);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(loaded.list());
  });
  it("ignores malformed and relative entries and recovers from corrupt JSON", async () => {
    const { directory, path } = await fixture();
    await writeFile(path, JSON.stringify([null, { root: "relative", title: "Bad", lastOpenedAt: "2026-09-07" }, { root: directory, title: "Good", lastOpenedAt: "2026-09-07" }]));
    const store = new RecentProjectsStore(path);
    await store.load();
    expect(store.list().map((item) => item.title)).toEqual(["Good"]);
    await writeFile(path, "{");
    await store.load();
    expect(store.list()).toEqual([]);
  });
});
