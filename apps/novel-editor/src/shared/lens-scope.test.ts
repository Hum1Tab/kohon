import { describe, expect, it } from "vitest";

import { resolveLensScope } from "./lens-scope.js";

describe("resolveLensScope", () => {
  const chapters = [{ id: "one", order: 0 }, { id: "two", order: 1 }, { id: "future", order: 2 }];

  it("enforces the author-approved reading boundary", () => {
    expect(resolveLensScope(chapters, "through-current", "two", ["one", "two"])).toEqual(chapters.slice(0, 2));
    expect(() => resolveLensScope(chapters, "through-current", "two", ["one", "two", "future"])).toThrow("送信範囲");
  });
});
