import { describe, expect, it } from "vitest";
import { ROLE_REGISTRY, searchProjects, textStats, validateFinding } from "./index.js";
describe("editor core", () => {
  it("registers five roles", () => expect(Object.keys(ROLE_REGISTRY)).toHaveLength(5));
  it("searches projects and validates quotes", () => { expect(searchProjects([{ projectId: "p", documentId: "d", title: "x", text: "abc abc" }], "abc")).toHaveLength(2); expect(validateFinding("猫と犬", "猫").status).toBe("attached"); expect(validateFinding("猫 猫", "猫").status).toBe("ambiguous"); });
  it("returns UTF-16 stats", () => expect(textStats("😀 あ").characters).toBe(4));
});
