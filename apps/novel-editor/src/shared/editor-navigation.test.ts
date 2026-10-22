import { expect, it } from "vitest";
import { editOriginForInput, revealOffset } from "./editor-navigation.js";

it("reveals distant paragraphs from either end and clamps document boundaries", () => {
  expect(revealOffset(2200, 36, 600, 0, 0, 4000)).toBe(1918);
  expect(revealOffset(40, 36, 600, 3800, 0, 4000)).toBe(0);
  expect(revealOffset(4600, 36, 600, 0, 0, 4000)).toBe(4000);
});
it("preserves a readable target and supports negative vertical-rl scroll offsets", () => {
  expect(revealOffset(1120, 36, 600, 1000, 0, 4000)).toBe(1000);
  expect(revealOffset(-1800, 36, 600, 0, -4000, 0)).toBe(-2082);
  expect(revealOffset(-60, 36, 600, -3800, -4000, 0)).toBe(-342);
});
it("does not crash or invent typing metadata for Japanese beforeinput events", () => {
  expect(editOriginForInput(undefined)).toBe("input");
  expect(editOriginForInput(null)).toBe("input");
  expect(editOriginForInput("insertCompositionText")).toBe("input");
  expect(editOriginForInput("insertText")).toBe("typing");
  expect(editOriginForInput("deleteContentBackward")).toBe("typing");
});
