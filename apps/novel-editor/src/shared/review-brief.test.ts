import { describe, expect, it } from "vitest";

import { buildReviewBrief } from "./review-brief.js";

const base = {
  projectTitle: "灯の街",
  generatedAt: "2026-10-23T00:00:00.000Z",
  chapters: [
    { id: "c1", title: "第一章 港", text: "霧の向こうで鐘が鳴った。\n\n少女は振り返らなかった。" },
    { id: "c2", title: "第二章 灯台", kind: "scene" as const, text: "灯台の窓は開いていた。" }
  ]
};

describe("review brief", () => {
  it("keeps the manuscript verbatim and names every chapter", () => {
    const brief = buildReviewBrief(base);
    expect(brief).toContain("# 査読ブリーフ — 灯の街");
    expect(brief).toContain("生成: 2026-10-23T00:00:00.000Z");
    expect(brief).toContain("1. [章] 第一章 港");
    expect(brief).toContain("2. [場面] 第二章 灯台");
    expect(brief).toContain("霧の向こうで鐘が鳴った。\n\n少女は振り返らなかった。");
    expect(brief).toContain("灯台の窓は開いていた。");
  });

  it("states the evidence rules instead of asking for a longer prompt", () => {
    const brief = buildReviewBrief(base);
    expect(brief).toContain("Warrant");
    expect(brief).toContain("反証条件");
    expect(brief).toContain("G2 根拠");
    expect(brief).toContain("重大度（Critical / Major / Minor / Note）");
  });

  it("lists only open findings and includes notes", () => {
    const brief = buildReviewBrief({
      ...base,
      notes: [{ title: "港の設定", kind: "world", text: "鐘は一日に二度鳴る。" }],
      findings: [
        { role: "evidence", title: "鐘の回数", status: "open", quote: "鐘が鳴った", chapterTitle: "第一章 港" },
        { role: "editor", title: "解決済み", status: "resolved", quote: "灯台", chapterTitle: "第二章 灯台" }
      ]
    });
    expect(brief).toContain("### 港の設定（world）");
    expect(brief).toContain("鐘は一日に二度鳴る。");
    expect(brief).toContain("[evidence / 第一章 港] 鐘の回数");
    expect(brief).not.toContain("解決済み");
  });

  it("truncates oversized manuscripts explicitly", () => {
    const brief = buildReviewBrief({ ...base, maxCharacters: 5 });
    expect(brief).toContain("この章の残り");
    expect(brief).toContain("省略した章");
    expect(brief).toContain("上限を超えたため");
    expect(brief).not.toContain("灯台の窓は開いていた。");
  });

  it("handles a project without manuscript or notes", () => {
    const brief = buildReviewBrief({ projectTitle: "空", chapters: [], generatedAt: base.generatedAt });
    expect(brief).toContain("（本文がありません）");
    expect(brief).toContain("（メモはありません）");
    expect(brief).toContain("（未対応の指摘はありません）");
  });
});
