import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import {ReviewAuthorNote} from "./ReviewAuthorNote.js";
import {LocaleProvider} from "./LocaleContext.js";
import type {ReviewLedgerEntry} from "../shared/types.js";
const entry:ReviewLedgerEntry={id:"review-1",role:"first-reader",scope:"current",manuscriptVersionHash:"version",chapterId:"chapter-1",file:"manuscript/chapter-1.md",title:"第一章",finding:{title:"時刻の根拠"},exactQuote:"引用",anchor:{offset:0,prefix:"",suffix:"",occurrence:1},status:"ignored",anchorStatus:"attached",createdAt:"now",updatedAt:"now"};
const render=(note:string|undefined,draft:string|undefined,locale:"ja"|"en"="ja")=>renderToStaticMarkup(createElement(LocaleProvider,{locale,children:createElement(ReviewAuthorNote,{entry:{...entry,...(note===undefined?{}:{authorNote:note})},draft,onDraft:()=>{},onSave:async()=>{}})}));
it("shows a saved decision separately from AI evidence without expanding every note",()=>{
  const html=render("前後に説明があるため見送り。",undefined);
  expect(html).toContain("判断メモ");expect(html).toContain("記録済み");
  expect(html).toContain("前後に説明があるため見送り。");
  expect(html).not.toContain(" open=");expect(html).toContain('disabled=""');
  expect(html).toContain("判断メモ: 時刻の根拠");
});
it("keeps a draft visible and distinguishes it from the stored note",()=>{
  const html=render("保存済みの理由","入力途中の理由");
  expect(html).toContain('open=""');expect(html).toContain("未保存");
  expect(html).toContain("入力途中の理由");expect(html).not.toContain("保存済みの理由");
  expect(html).not.toContain('disabled=""');expect(html).toContain('maxLength="4000"');
});
it("provides English labels and per-finding accessible names",()=>{
  const html=render(undefined,undefined,"en");expect(html).toContain("Author note: 時刻の根拠");
  expect(html).toContain("Save note");expect(html).toContain("Reason for the decision");
});
