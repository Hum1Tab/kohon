import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppIcon } from "./AppIcon.js";

describe("KOHON brand icon", () => {
  it("uses the shared SVG for both toolbar and welcome logos", () => {
    for (const tile of [false, true]) {
      const markup = renderToStaticMarkup(createElement(AppIcon, { name: "logo", tile, size: 32 }));
      expect(markup).toContain('aria-label="KOHON"');
      expect(markup).toContain('viewBox="0 0 1024 1024"');
      expect(markup).toContain('<image href=');
      expect(markup).toContain('icon.svg');
      expect(markup).not.toContain('<circle');
    }
  });

  it("keeps ordinary action icons as accessible decorative line icons", () => {
    const markup = renderToStaticMarkup(createElement(AppIcon, { name: "search" }));
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('<circle');
    expect(markup).not.toContain('<image');
  });

  it("ships the supplied three-part teal K artwork", () => {
    const svg = readFileSync(new URL("../../build/icon.svg", import.meta.url), "utf8");
    for (const id of ["upright", "rising-arm", "returning-arm"]) expect(svg).toContain(`id="${id}"`);
    for (const color of ["#17B8A6", "#087578", "#65DFBC", "#F0FFF8", "#D6EDE6"]) expect(svg).toContain(color);
  });
});
