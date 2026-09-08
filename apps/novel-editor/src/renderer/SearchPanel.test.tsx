import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { LocaleProvider } from "./LocaleContext.js";
import { SearchPanel } from "./Panels.js";

it("keeps replacement behind a closed disclosure without removing its safeguards", () => {
  const noop = () => {};
  const markup = renderToStaticMarkup(createElement(LocaleProvider, { locale: "ja", children: createElement(SearchPanel, {
    query: "", setQuery: noop, replacement: "", setReplacement: noop,
    caseSensitive: false, setCaseSensitive: noop, hits: [], previewReady: false,
    onSearch: noop, onReplace: noop, onHit: noop
  }) }));
  expect(markup).toContain('<details class="replace-disclosure"><summary>おきかえる</summary>');
  expect(markup).toContain('disabled=""');
  expect(markup).toContain("実行前に保存点を作ります");
});
