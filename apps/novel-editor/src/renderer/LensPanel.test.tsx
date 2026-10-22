import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { LocaleProvider } from "./LocaleContext.js";
import { LensPanel, type LensPanelProps } from "./Panels.js";

const noop = () => {};
const base: LensPanelProps = {
  role: "first-reader", setRole: noop, provider: "codex", codexConnected: true,
  openAIConnected: false, onOpenSettings: noop, query: "読みやすさを教えて", setQuery: noop,
  scopeTitles: ["第一章", "第二章"], thread: [], result: null, running: false,
  onRun: noop, onClear: noop, onFinding: noop, reviews: [], onReview: noop,
  onReviewStatus: noop, onReviewRecheck: noop,
  reviewNoteDrafts: {}, onReviewNoteDraft: noop, onReviewNoteSave: async () => {}
};
const render = (patch: Partial<LensPanelProps> = {}) => renderToStaticMarkup(createElement(LocaleProvider, { locale: "ja", children: createElement(LensPanel, { ...base, ...patch }) }));

it("replaces the redundant checkbox with an explicit destination-and-scope action", () => {
  const html = render();
  expect(html).not.toContain('type="checkbox"');
  expect(html).toContain("2章をChatGPTに送って聞く");
  expect(html).toContain("第一章");
  expect(html).toContain("第二章");
  expect(html).not.toContain('class="lens-help"');
  expect(html).not.toContain("この読み手について");
  expect(html).not.toContain('class="primary full" disabled');
  expect(html).not.toContain('class="review-ledger"');
  expect(html).not.toContain('class="lens-result-count"');
});
it.each([{ scopeTitles: [] }, { query: " " }, { running: true }, { codexConnected: false }])("blocks invalid or unavailable requests: %j", (patch) => {
  expect(render(patch)).toContain('class="primary full" disabled');
});
it("distinguishes offline execution and the OpenAI destination", () => {
  expect(render({ provider: "mock" })).toContain("オフラインで試す");
  expect(render({ provider: "openai", openAIConnected: true })).toContain("2章をOpenAIに送って聞く");
});

const result: NonNullable<LensPanelProps["result"]> = {
  role: "first-reader", provider: "codex", modelId: "test-model", ledgerStored: true,
  summary: "読み直しました", coverage: { chapterCount: 2, characterCount: 40, chapterTitles: ["第一章", "第二章"] },
  findings: [{ id: "live-1", title: "時間の区別", observation: "時刻が曖昧です", readerEffect: "前後を確認します",
    quote: "引用文", chapterId: "chapter-1", chapterTitle: "第一章", anchorStatus: "attached", startUtf16: 0, endUtf16: 3, priority: "medium" }]
};
const review: LensPanelProps["reviews"][number] = {
  id: "review-1", role: "first-reader", provider: "codex", model: "test-model", scope: "through-current",
  manuscriptVersionHash: "source-version", chapterId: "chapter-1", file: "manuscript/chapter-1.md", title: "第一章",
  finding: { title: "時間の区別", body: "時刻が曖昧です\n\n読者への影響: 前後を確認します", severity: "medium" },
  exactQuote: "引用文", anchor: { offset: 0, prefix: "", suffix: "", occurrence: 1 },
  status: "open", anchorStatus: "attached", createdAt: "2026-10-06T00:00:00Z", updatedAt: "2026-10-06T00:00:00Z"
};
const titleCount = (html: string) => html.split("<h3>時間の区別</h3>").length - 1;

it("shows a saved finding once with its ledger actions and review-time coverage", () => {
  const html = render({ result, reviews: [review] });
  expect(titleCount(html)).toBe(1);
  expect(html).toContain("解決");
  expect(html).toContain("見送る");
  expect(html).toContain("回答時の本文: 2章・40字を確認");
  expect(html).toContain("この回答の指摘: 1件");
  expect(html).not.toContain('class="finding priority-medium"');
});

it.each([false, undefined])("keeps the preview if storage is not confirmed: %s", ledgerStored => {
  const pending = { ...result };
  if (ledgerStored === undefined) delete pending.ledgerStored;
  else pending.ledgerStored = ledgerStored;
  expect(titleCount(render({ result: pending, reviews: [review] }))).toBe(2);
});

it.each([
  { model: "other-model" }, { provider: "openai" }, { role: "line-editor" },
  { chapterId: "chapter-2" }, { exactQuote: "別の引用" },
  { finding: { title: "時間の区別", body: "違う指摘" } }
])("keeps a distinct finding even when some identifying text matches: %j", patch => {
  expect(render({ result, reviews: [{ ...review, ...patch }] })).toContain('class="finding priority-medium"');
});

it("keeps unanchored and overflow findings that are not visible in the ledger", () => {
  const unmatched = { ...result, findings: [{ ...result.findings[0]!, chapterId: null, anchorStatus: "missing" as const }] };
  expect(render({ result: unmatched, reviews: [review] })).toContain('class="finding priority-medium"');
  const preceding = Array.from({ length: 200 }, (_, i) => ({ ...review, id: `other-${i}`, exactQuote: `別の引用${i}` }));
  expect(render({ result, reviews: [...preceding, review] })).toContain('class="finding priority-medium"');
});

it("uses the ledger's author status and manuscript-change state after revision", () => {
  const html = render({ result, reviews: [{ ...review, status: "resolved", anchorStatus: "stale" }] });
  expect(titleCount(html)).toBe(1);
  expect(html).toContain("本文変更あり");
  expect(html).toContain("現在の本文で再確認");
  expect(html).toContain("未対応へ戻す");
});

it("distinguishes a zero-finding response from unresolved historical findings", () => {
  const html = render({ result: { ...result, findings: [] }, reviews: [review] });
  expect(html).toContain("この回答の指摘: 0件");
  expect(html).toContain("時間の区別");
  expect(html).toContain("未対応");
  expect(html).toContain("解決");
  expect(html).toContain("回答時の本文: 2章・40字を確認");
});

const responseText = [result.summary, ...result.findings.map(finding => `・${finding.title}: ${finding.observation}`)].join("\n");
const responseMessage: LensPanelProps["thread"][number] = { sender: "lens", text: responseText, createdAt: "2026-10-06T00:00:00Z" };

it("avoids repeating current finding details in the conversation without changing its transcript", () => {
  const thread = [{ sender: "author" as const, text: "質問", createdAt: "2026-10-06T00:00:00Z" }, responseMessage];
  const html = render({ result, reviews: [review], thread });
  expect(html).toContain("読み直しました");
  expect(html).not.toContain("・時間の区別:");
  expect(html).toContain("時刻が曖昧です");
  expect(thread[1]?.text).toBe(responseText);
});

it("retains older finding details and mismatched role or message transcripts", () => {
  const older = { ...responseMessage, createdAt: "2026-10-05T00:00:00Z" };
  const html = render({ result, reviews: [review], thread: [older, responseMessage] });
  expect(html.split("・時間の区別:").length - 1).toBe(1);
  expect(render({ result: { ...result, role: "editor" }, thread: [responseMessage] })).toContain("・時間の区別:");
  expect(render({ result, thread: [{ ...responseMessage, text: responseText + "別の回答" }] })).toContain("・時間の区別:");
});

it("retains unsaved or unmatched current findings in their cards beside the response summary", () => {
  const html = render({ result: { ...result, ledgerStored: false }, thread: [responseMessage] });
  expect(html).not.toContain("・時間の区別:");
  expect(html).toContain('class="finding priority-medium"');
  expect(html).toContain("時刻が曖昧です");
  expect(html).toContain("引用文");
});
