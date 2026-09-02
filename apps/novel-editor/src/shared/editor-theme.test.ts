import { describe, expect, it } from "vitest";

import { automaticTextColor, contrastRatio, resolveManuscriptPalette } from "./editor-theme.js";

describe("manuscript palettes", () => {
  it("pairs every preset with readable text and auto-contrasts custom backgrounds", () => {
    for (const theme of ["paper", "sepia", "gray", "dark"] as const) {
      const palette = resolveManuscriptPalette(theme, "#ffffff", null);
      expect(contrastRatio(palette.background, palette.text)).toBeGreaterThanOrEqual(4.5);
    }
    expect(automaticTextColor("#111111")).toBe("#f2f2f2");
    expect(automaticTextColor("#f7f7f7")).toBe("#202124");
    expect(resolveManuscriptPalette("custom", "#203040", null).text).toBe("#f2f2f2");
  });
});
