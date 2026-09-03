import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SafeText } from "./SafeText.js";

describe("untrusted text renderer", () => {
  it("AT-017 renders scripts, HTML, images, forms and links as inert escaped text", () => {
    const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("../../../../fixtures/leakage/malicious-model-output.json", import.meta.url)), "utf8")) as { generic_markdown: string };
    const html = renderToStaticMarkup(<SafeText value={fixture.generic_markdown} />);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/<(?:script|img|form|a)\b/iu);
    expect(html).not.toContain('href="');
    expect(html).toContain("https://canary.invalid/model-output.png");
  });
});
