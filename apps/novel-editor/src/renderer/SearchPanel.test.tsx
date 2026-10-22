import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { LocaleProvider } from "./LocaleContext.js";
import { SearchPanel } from "./Panels.js";
import type { SearchHit } from "../shared/types.js";

const noop = () => {};
const hit = (chapterId: string, title: string, start: number): SearchHit => ({ chapterId, title, start, end: start + 1, excerpt: `雨の場面 ${start}` });
const renderResults = (hits: SearchHit[], locale: "ja" | "en" = "ja") => renderToStaticMarkup(createElement(LocaleProvider, { locale, children: createElement(SearchPanel, {
  query: "雨", setQuery: noop, replacement: "", setReplacement: noop,
  caseSensitive: false, setCaseSensitive: noop, hits, previewReady: true,
  onSearch: noop, onReplace: noop, onHit: noop
}) }));

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

it("groups repeated chapter hits without dropping matches or the replacement count", () => {
  const markup = renderResults([hit("first", "第一章", 0), hit("first", "第一章", 10), hit("second", "第二章", 20)]);
  expect(markup.match(/class="search-result-group"/gu)).toHaveLength(2);
  expect(markup.match(/<h3/gu)).toHaveLength(2);
  expect(markup).toContain("雨の場面 0");
  expect(markup).toContain("雨の場面 10");
  expect(markup).toContain("雨の場面 20");
  expect(markup).toContain("3件を置換…");
  expect(markup).toContain("3件 · 2章");
});

it("announces no results and gives the search field an accessible name in English", () => {
  const markup = renderResults([], "en");
  expect(markup).toContain('aria-label="Search the project"');
  expect(markup).toContain('role="status">No matches found.');
  expect(markup).not.toContain('class="search-result-group"');
});
