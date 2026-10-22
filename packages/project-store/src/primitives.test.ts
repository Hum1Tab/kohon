import { describe, expect, it } from "vitest";

import { sha256Hex } from "./hash.js";
import { basenamePath, dirnamePath, extnamePath, isAbsolutePath, isPathInside, joinPath, normalizePath, resolveManagedPath } from "./path.js";
import { randomUUID } from "./random.js";

describe("browser-safe primitives", () => {
  it("matches standard SHA-256 vectors without node:crypto", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("日本語の原稿")).toBe("bb668e5dc406a67193b2c53ab88aa6080ca7af53e7747db155ddb67f6d4c6495");
  });

  it("generates UUID-shaped ids", () => {
    expect(randomUUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  });

  it("handles Windows and POSIX managed paths", () => {
    expect(normalizePath("C:\\work\\novel\\..\\book")).toBe("C:/work/book");
    expect(joinPath("C:\\work", "manuscript/chapter.md")).toBe("C:\\work/manuscript/chapter.md");
    expect(dirnamePath("C:/work/book/manuscript/chapter.md")).toBe("C:/work/book/manuscript");
    expect(basenamePath("C:/work/book/manuscript/chapter.md")).toBe("chapter.md");
    expect(extnamePath("C:/work/book/manuscript/chapter.md")).toBe(".md");
    expect(isAbsolutePath("C:/work")).toBe(true);
    expect(isAbsolutePath("work/book")).toBe(false);
    expect(isPathInside("C:/Work/Book", "c:/work/book/manuscript/a.md")).toBe(true);
    expect(() => resolveManagedPath("C:/work/book", "../escape.md")).toThrow("boundary");
    expect(resolveManagedPath("C:/work/book", "notes/map.json")).toBe("C:/work/book/notes/map.json");
  });
});
