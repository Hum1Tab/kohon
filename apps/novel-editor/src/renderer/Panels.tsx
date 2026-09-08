import { getRole, ROLE_REGISTRY } from "@kohon/editor-core";
import { useEffect, useState, type ReactNode } from "react";

import type {
  Chapter,
  ChapterMetadata,
  ChapterStatus,
  CheckpointEntry,
  LensFinding,
  LensMessage,
  LensProviderId,
  LensRunResult,
  NoteDocument,
  NoteKind,
  NoteMeta,
  ProjectDiff,
  ReviewLedgerEntry,
  ReviewStatus,
  RoleId,
  SearchHit
} from "../shared/types.js";
import { AppIcon } from "./AppIcon.js";
import { useLocale } from "./LocaleContext.js";
import { useModalFocus } from "./useModalFocus.js";

export type SaveState = "saved" | "dirty" | "saving" | "error";
export type NoteDraft = { id: string; title: string; kind: NoteKind; chapterIds: string[]; text: string };
type ChapterMetadataDraft = { summary: string; pov: string; characters: string; location: string; timeline: string; status: "" | ChapterStatus; tags: string };

export interface TextPromptRequest {
  id: number;
  title: string;
  label: string;
  initialValue: string;
  confirmLabel: string;
}

export type TextPromptOptions = Omit<TextPromptRequest, "id">;
export const ROLE_IDS = Object.keys(ROLE_REGISTRY) as RoleId[];
export const DEFAULT_QUERY = "この範囲で、作者が見直す価値のある箇所を根拠付きで教えてください。";
export const EMPTY_THREADS = (): Record<RoleId, LensMessage[]> => ({ "first-reader": [], editor: [], critic: [], consistency: [], setting: [] });

function formatDate(value: string, locale: "ja" | "en"): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatNumber(value: number, locale: "ja" | "en"): string {
  return value.toLocaleString(locale === "ja" ? "ja-JP" : "en-US");
}

function metadataDraft(metadata: ChapterMetadata | undefined): ChapterMetadataDraft {
  return {
    summary: metadata?.summary ?? "",
    pov: metadata?.pov ?? "",
    characters: metadata?.characters?.join("、") ?? "",
    location: metadata?.location ?? "",
    timeline: metadata?.timeline ?? "",
    status: metadata?.status ?? "",
    tags: metadata?.tags?.join("、") ?? ""
  };
}

function splitMetadataList(value: string): string[] | undefined {
  const items = value.split(/[、,]/u).map((item) => item.trim()).filter(Boolean);
  return items.length === 0 ? undefined : [...new Set(items)];
}

function metadataValue(draft: ChapterMetadataDraft): ChapterMetadata {
  const optional = (value: string): string | undefined => value.trim().length === 0 ? undefined : value.trim();
  const summary = optional(draft.summary);
  const pov = optional(draft.pov);
  const characters = splitMetadataList(draft.characters);
  const location = optional(draft.location);
  const timeline = optional(draft.timeline);
  const tags = splitMetadataList(draft.tags);
  return {
    ...(summary === undefined ? {} : { summary }),
    ...(pov === undefined ? {} : { pov }),
    ...(characters === undefined ? {} : { characters }),
    ...(location === undefined ? {} : { location }),
    ...(timeline === undefined ? {} : { timeline }),
    ...(draft.status === "" ? {} : { status: draft.status }),
    ...(tags === undefined ? {} : { tags })
  };
}

export function ChapterMetadataPanel({ chapter, onSave }: { chapter: Chapter; onSave: (metadata: ChapterMetadata) => Promise<void> }): ReactNode {
  const { t } = useLocale();
  const [draft, setDraft] = useState(() => metadataDraft(chapter.metadata));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const value = metadataValue(draft);
  const dirty = JSON.stringify(value) !== JSON.stringify(chapter.metadata ?? {});
  const patch = (next: Partial<ChapterMetadataDraft>): void => { setDraft((current) => ({ ...current, ...next })); setFailed(false); };
  const save = async (): Promise<void> => {
    setSaving(true); setFailed(false);
    try { await onSave(value); }
    catch { setFailed(true); }
    finally { setSaving(false); }
  };
  return <details className="chapter-metadata">
    <summary><span>{t("くわしく")}</span><small>{Object.keys(chapter.metadata ?? {}).length === 0 ? "" : t("設定済み")}</small></summary>
    <div className="chapter-metadata-form">
      <label>{t("要約")}<textarea rows={3} maxLength={2000} value={draft.summary} onChange={(event) => patch({ summary: event.target.value })} placeholder={t("この場面で起きること")} /></label>
      <div className="metadata-row"><label>{t("視点人物")}<input maxLength={200} value={draft.pov} onChange={(event) => patch({ pov: event.target.value })} /></label><label>{t("場所")}<input maxLength={200} value={draft.location} onChange={(event) => patch({ location: event.target.value })} /></label></div>
      <div className="metadata-row"><label>{t("時系列")}<input maxLength={200} value={draft.timeline} onChange={(event) => patch({ timeline: event.target.value })} placeholder={t("一日目・夕方")} /></label><label>{t("状態")}<select value={draft.status} onChange={(event) => patch({ status: event.target.value as ChapterMetadataDraft["status"] })}><option value="">{t("未設定")}</option><option value="idea">{t("構想")}</option><option value="draft">{t("下書き")}</option><option value="revising">{t("推敲中")}</option><option value="done">{t("完了")}</option></select></label></div>
      <label>{t("登場人物")}<input maxLength={1000} value={draft.characters} onChange={(event) => patch({ characters: event.target.value })} placeholder={t("読点で区切る")} /></label>
      <label>{t("タグ")}<input maxLength={1000} value={draft.tags} onChange={(event) => patch({ tags: event.target.value })} placeholder={t("伏線、回想")} /></label>
      <div className="metadata-actions"><small>{failed ? t("保存できませんでした") : dirty ? t("未保存") : t("保存済み")}</small><button className="text-button" disabled={!dirty || saving} onClick={() => { void save(); }}>{saving ? t("保存中…") : t("保存")}</button></div>
    </div>
  </details>;
}

export function TextPrompt({ request, onCancel, onSubmit }: { request: TextPromptRequest; onCancel: () => void; onSubmit: (value: string) => void }): ReactNode {
  const { t } = useLocale();
  const [value, setValue] = useState(request.initialValue);
  const modal = useModalFocus<HTMLFormElement>(onCancel);

  return <div className="prompt-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <form
      ref={modal.ref}
      className="prompt-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`prompt-title-${request.id}`}
      onKeyDown={modal.onKeyDown}
      onSubmit={(event) => { event.preventDefault(); if (value.trim().length > 0) onSubmit(value.trim()); }}
    >
      <span className="eyebrow">KOHON</span>
      <h2 id={`prompt-title-${request.id}`}>{t(request.title)}</h2>
      <label>{t(request.label)}<input autoFocus maxLength={200} value={value} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setValue(event.target.value)} /></label>
      <div className="prompt-actions"><button type="button" className="secondary" onClick={onCancel}>{t("キャンセル")}</button><button type="submit" className="primary" disabled={value.trim().length === 0}>{t(request.confirmLabel)}</button></div>
    </form>
  </div>;
}

const NOTE_KIND_LABELS: Record<NoteKind, string> = { character: "人物", place: "場所", world: "世界観", plot: "プロット", memo: "メモ" };

export function OutlineNotes({ notes, activeChapterId, activeNote, draft, saveState, showAll, onShowAll, onCreate, onOpen, onDraft, onTogglePin, onSave, onArchive }: { notes: NoteMeta[]; activeChapterId: string | null; activeNote: NoteDocument | null; draft: NoteDraft | null; saveState: SaveState; showAll: boolean; onShowAll: (value: boolean) => void; onCreate: () => void; onOpen: (id: string) => void; onDraft: (patch: Partial<Omit<NoteDraft, "id">>) => void; onTogglePin: () => void; onSave: () => Promise<void>; onArchive: (archived: boolean) => void }): ReactNode {
  const { locale, t } = useLocale();
  const visible = notes.filter((note) => showAll || note.id === activeNote?.note.id || (!note.archived && activeChapterId !== null && note.chapterIds.includes(activeChapterId)));
  return <details className="outline-notes">
    <summary><span>{t("作業メモ")}</span><small>{formatNumber(activeChapterId === null ? notes.filter((note) => !note.archived).length : notes.filter((note) => !note.archived && note.chapterIds.includes(activeChapterId)).length, locale)}{t("件")}</small></summary>
    <div className="note-toolbar"><button className="text-button" onClick={onCreate}>＋ {t("メモ")}</button><button className="text-button" onClick={() => onShowAll(!showAll)}>{showAll ? t("現在章だけ") : t("すべて表示")}</button></div>
    <div className="note-list">{visible.length === 0 ? <p className="empty">{t("現在章にピン留めされたメモはありません。")}</p> : visible.map((note) => <button key={note.id} className={activeNote?.note.id === note.id ? "active" : ""} onClick={() => onOpen(note.id)}><span>{note.title}</span><small>{t(NOTE_KIND_LABELS[note.kind] ?? "メモ")}{note.archived ? `・${t("保管済み")}` : note.chapterIds.includes(activeChapterId ?? "") ? `・${t("現在章")}` : ""}</small></button>)}</div>
    {activeNote !== null && draft !== null && <div className={`note-editor ${activeNote.note.archived ? "archived" : ""}`}><div className="note-editor-head"><span>{t(saveState === "saved" ? "保存済み" : saveState === "saving" ? "保存中…" : saveState === "dirty" ? "未保存" : "保存エラー")}</span>{activeNote.note.archived && <b>{t("保管済み")}</b>}</div><input aria-label={t("メモのタイトル")} maxLength={200} disabled={activeNote.note.archived} value={draft.title} onChange={(event) => onDraft({ title: event.target.value })} /><div className="note-meta-row"><select aria-label={t("メモの分類")} disabled={activeNote.note.archived} value={draft.kind} onChange={(event) => onDraft({ kind: event.target.value as NoteKind })}>{Object.entries(NOTE_KIND_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{t(label)}</option>)}</select><label><input type="checkbox" disabled={activeNote.note.archived || activeChapterId === null} checked={activeChapterId !== null && draft.chapterIds.includes(activeChapterId)} onChange={onTogglePin} /> {t("現在章へピン")}</label></div><textarea aria-label={t("メモ本文")} rows={7} spellCheck={false} disabled={activeNote.note.archived} value={draft.text} onChange={(event) => onDraft({ text: event.target.value })} placeholder={t("Markdownで自由に書けます。")} /><div className="note-actions"><button className="text-button" disabled={activeNote.note.archived || saveState === "saved" || saveState === "saving"} onClick={() => { void onSave().catch(() => undefined); }}>{t("保存")}</button><button className="text-button" onClick={() => onArchive(!activeNote.note.archived)}>{activeNote.note.archived ? t("保管から戻す") : t("保管する")}</button></div></div>}
  </details>;
}

export interface LensPanelProps {
  role: RoleId; setRole: (role: RoleId) => void; provider: LensProviderId;
  codexConnected: boolean; openAIConnected: boolean; onOpenSettings: () => void;
  query: string; setQuery: (value: string) => void;
  scopeTitles: string[]; approved: boolean; setApproved: (value: boolean) => void; thread: LensMessage[]; result: LensRunResult | null;
  running: boolean; onRun: () => void; onClear: () => void; onFinding: (finding: LensFinding) => void;
  reviews: ReviewLedgerEntry[]; onReview: (finding: ReviewLedgerEntry) => void; onReviewStatus: (id: string, status: ReviewStatus) => void; onReviewRecheck: (id: string) => void;
}

export function LensPanel(props: LensPanelProps): ReactNode {
  const { locale, t } = useLocale();
  const definition = getRole(props.role);
  const visibleReviews = props.reviews.slice(0, 200);
  const connectionMissing = (props.provider === "codex" && !props.codexConnected) || (props.provider === "openai" && !props.openAIConnected);
  return <div className="inspector-content lens-panel">
    <div className="section-head"><div><span className="eyebrow">{t("SYNTHETIC READER")}</span><h2>{t("編集レンズ")}</h2></div>{props.thread.length > 0 && <button className="text-button" onClick={props.onClear}>{t("会話を消す")}</button>}</div>
    <select className="lens-role-select" aria-label={locale === "en" ? "Reader role" : "読み手をえらぶ"} value={props.role} onChange={(event) => props.setRole(event.target.value as RoleId)}>{ROLE_IDS.map((id) => <option key={id} value={id}>{t(getRole(id).label)}</option>)}</select>
    <p className="role-description">{t(definition.description)}</p>
    <section className="lens-compose" aria-label={t("編集レンズへ質問")}>
    <label>{t("質問")}<textarea rows={3} value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder={t(DEFAULT_QUERY)} /></label>
    {connectionMissing && <div className="lens-setup-warning"><span>{t(props.provider === "codex" ? "ChatGPT未接続" : "OpenAI未接続")}</span><button className="text-button" onClick={props.onOpenSettings}>{t("接続設定を開く")}</button></div>}
    <details className="scope-preview"><summary>{t("送信範囲")}: {formatNumber(props.scopeTitles.length, locale)}{t("章")}</summary><ul>{props.scopeTitles.map((title) => <li key={title}>{title}</li>)}</ul><p>{t("未選択章、設定画面、履歴、ファイルパスは送信しません。")}</p></details>
    <label className="check"><input type="checkbox" checked={props.approved} onChange={(event) => props.setApproved(event.target.checked)} /> {t("表示された章だけを送信することを確認しました")}</label>
    <button className="primary full" disabled={props.running || !props.approved || props.query.trim().length === 0 || (props.provider === "codex" && !props.codexConnected) || (props.provider === "openai" && !props.openAIConnected)} onClick={props.onRun}>{props.running ? t("検証しながら読んでいます…") : `${t(definition.label)}${t("に聞く")}`}</button>
    <p className="privacy-note">{t("本文の生成・書換え・自動適用は行いません。会話と認証情報はprojectへ保存しません。")}</p>
    </section>
    {props.thread.length > 0 && <div className="thread" aria-label={`${t(definition.label)}${t("との会話")}`}>{props.thread.map((message, index) => <div key={`${message.createdAt}-${index}`} className={`message ${message.sender}`}><b>{message.sender === "author" ? t("あなた") : t(definition.label)}</b><p>{message.text}</p></div>)}</div>}
    {props.result !== null && <div className="finding-list"><div className="coverage">{formatNumber(props.result.coverage.chapterCount, locale)}{t("章")}・{formatNumber(props.result.coverage.characterCount, locale)}{t("字")}{t("を確認")}</div>{props.result.findings.map((finding) => <article className={`finding priority-${finding.priority}`} key={finding.id}><div className="finding-meta"><span>{t(finding.priority)}</span><span>{t(finding.anchorStatus === "attached" ? "根拠確認済み" : finding.anchorStatus === "ambiguous" ? "引用が複数" : "引用未確認")}</span></div><h3>{finding.title}</h3><p>{finding.observation}</p><p className="effect">{t("読者への影響")}: {finding.readerEffect}</p><button className="quote" disabled={finding.anchorStatus !== "attached"} onClick={() => props.onFinding(finding)}>「{finding.quote}」<small>{finding.chapterTitle ?? t("原文へ接続できません")}</small></button></article>)}</div>}
    <details className="review-ledger" open={props.reviews.some((finding) => finding.status === "open")}><summary><span>{t("指摘台帳")}</span><small>{t("未対応")} {formatNumber(props.reviews.filter((finding) => finding.status === "open").length, locale)}{t("件")}</small></summary><div className="review-ledger-list">{props.reviews.length === 0 ? <p className="empty">{t("保存された指摘はまだありません。")}</p> : visibleReviews.map((finding) => <article className={`review-entry ${finding.status}`} key={finding.id}><div className="finding-meta"><span>{finding.role in ROLE_REGISTRY ? t(getRole(finding.role as RoleId).label) : finding.role}</span><span>{t(finding.status === "open" ? "未対応" : finding.status === "resolved" ? "解決" : "見送り")}</span><span>{t(finding.anchorStatus === "attached" ? "根拠確認済み" : finding.anchorStatus === "stale" ? "本文変更あり" : "要再確認")}</span></div><h3>{finding.finding?.title ?? t("無題の指摘")}</h3><p>{finding.finding?.body}</p><button className="quote" disabled={finding.anchorStatus !== "attached"} onClick={() => props.onReview(finding)}>「{finding.exactQuote}」<small>{finding.title}</small></button><div className="review-actions">{finding.anchorStatus !== "attached" && <button className="text-button" onClick={() => props.onReviewRecheck(finding.id)}>{t("現在の本文で再確認")}</button>}{finding.status !== "open" && <button className="text-button" onClick={() => props.onReviewStatus(finding.id, "open")}>{t("未対応へ戻す")}</button>}{finding.status !== "resolved" && <button className="text-button" onClick={() => props.onReviewStatus(finding.id, "resolved")}>{t("解決")}</button>}{finding.status !== "ignored" && <button className="text-button" onClick={() => props.onReviewStatus(finding.id, "ignored")}>{t("見送る")}</button>}</div></article>)}{props.reviews.length > visibleReviews.length && <p className="muted">{t("最新")}{formatNumber(visibleReviews.length, locale)}{t("件を表示しています。")}</p>}</div></details>
  </div>;
}

export function SearchPanel({ query, setQuery, replacement, setReplacement, caseSensitive, setCaseSensitive, hits, previewReady, onSearch, onReplace, onHit }: { query: string; setQuery: (value: string) => void; replacement: string; setReplacement: (value: string) => void; caseSensitive: boolean; setCaseSensitive: (value: boolean) => void; hits: SearchHit[]; previewReady: boolean; onSearch: () => void; onReplace: () => void; onHit: (hit: SearchHit) => void }): ReactNode {
  const { locale, t } = useLocale();
  return <div className="inspector-content"><span className="eyebrow">{t("FULL TEXT")}</span><h2>{t("作品内検索・置換")}</h2>
    <div className="search-box"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSearch(); }} placeholder={t("語句を入力")} /><button onClick={onSearch}>{t("検索")}</button></div>
    <label className="check search-option"><input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} /> {t("大文字と小文字を区別")}</label>
    <details className="replace-disclosure"><summary>{locale === "en" ? "Replace" : "おきかえる"}</summary><div className="workspace-replace"><label>{t("置換後")}<input value={replacement} onChange={(event) => setReplacement(event.target.value)} placeholder={t("空欄なら削除")} /></label><button className="secondary" disabled={!previewReady || hits.length === 0} onClick={onReplace}>{hits.length === 0 ? t("置換する一致なし") : `${formatNumber(hits.length, locale)}${t("件を置換…")}`}</button><small>{t("表示中の一致だけを対象に確認し、実行前に保存点を作ります。")}</small></div></details>
    <p className="result-count">{previewReady ? `${formatNumber(hits.length, locale)}${t("件")}` : t("検索して置換範囲を確認")}</p><div className="search-results">{hits.map((hit, index) => <button key={`${hit.chapterId}-${hit.start}-${index}`} onClick={() => onHit(hit)}><b>{hit.title}</b><p>{hit.excerpt}</p></button>)}</div>
  </div>;
}

export function HistoryPanel({ entries, diff, onCreate, onCompareCurrent, onComparePair, onRestore, onRestoreChapter, onVariation }: { entries: CheckpointEntry[]; diff: ProjectDiff | null; onCreate: () => void; onCompareCurrent: (entry: CheckpointEntry) => void; onComparePair: (leftCommit: string, rightCommit: string) => void; onRestore: (entry: CheckpointEntry) => void; onRestoreChapter: (commit: string, chapterId: string, title: string) => void; onVariation: () => void }): ReactNode {
  const { locale, t } = useLocale();
  const [leftCommit, setLeftCommit] = useState("");
  const [rightCommit, setRightCommit] = useState("");
  useEffect(() => {
    if (!entries.some((entry) => entry.commit === rightCommit)) setRightCommit(entries[0]?.commit ?? "");
    if (!entries.some((entry) => entry.commit === leftCommit)) setLeftCommit(entries[1]?.commit ?? entries[0]?.commit ?? "");
  }, [entries, leftCommit, rightCommit]);
  const changed = diff?.chapters.filter((chapterDiff) => chapterDiff.status !== "same") ?? [];
  return <div className="inspector-content"><span className="eyebrow">{t("RECOVERY")}</span><h2>{t("保存点と差分")}</h2><p className="muted">{t("戻す前に変更内容を読めます。復元前の状態も自動で残します。")}</p>
    <div className="history-actions"><button className="primary" onClick={onCreate}>{t("保存点を作る")}</button><button className="secondary" onClick={onVariation}>{t("別案を複製")}</button></div>
    {entries.length > 1 && <div className="checkpoint-compare"><label>{t("古い保存点")}<select value={leftCommit} onChange={(event) => setLeftCommit(event.target.value)}>{entries.map((entry) => <option key={entry.commit} value={entry.commit}>{entry.subject}</option>)}</select></label><label>{t("新しい保存点")}<select value={rightCommit} onChange={(event) => setRightCommit(event.target.value)}>{entries.map((entry) => <option key={entry.commit} value={entry.commit}>{entry.subject}</option>)}</select></label><button className="secondary" disabled={leftCommit === rightCommit} onClick={() => onComparePair(leftCommit, rightCommit)}>{t("保存点どうしを比較")}</button></div>}
    {diff !== null && <section className="checkpoint-diff" aria-label={t("保存点の差分")}><header><b>{formatNumber(diff.summary.changed + diff.summary.added + diff.summary.removed, locale)}{t("章に変更")}</b><span>+{formatNumber(diff.summary.additions, locale)} / −{formatNumber(diff.summary.removals, locale)}</span></header>{changed.length === 0 ? <p className="empty">{t("本文の変更はありません。")}</p> : changed.map((chapterDiff) => <details key={chapterDiff.chapterId}><summary><span>{chapterDiff.title}</span><small>{chapterDiff.status === "added" ? t("追加") : chapterDiff.status === "removed" ? t("削除") : `+${formatNumber(chapterDiff.additions, locale)} −${formatNumber(chapterDiff.removals, locale)}`}</small></summary>{diff.right === "current" && chapterDiff.status !== "added" && <div className="chapter-diff-actions"><button className="text-button" onClick={() => onRestoreChapter(diff.left, chapterDiff.chapterId, chapterDiff.title)}>{t("この章だけ保存点へ戻す")}</button></div>}<div className="diff-hunks">{chapterDiff.hunks.flatMap((hunk, hunkIndex) => hunk.lines.map((line, lineIndex) => <div className={`diff-line ${line.kind}`} key={`${hunkIndex}-${lineIndex}`}><span>{line.leftLine ?? ""}</span><span>{line.rightLine ?? ""}</span><code>{line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "} {line.text || " "}</code></div>))}{chapterDiff.truncated && <p className="muted">{t("差分が大きいため表示を省略しました。")}</p>}</div></details>)}</section>}
    <div className="history-list">{entries.length === 0 ? <p className="empty">{t("保存点はまだありません。")}</p> : entries.map((entry) => <article key={entry.commit}><div><b>{entry.subject}</b><small>{formatDate(entry.authoredAt, locale)}</small></div><div><button className="text-button" onClick={() => onCompareCurrent(entry)}>{t("現在と比較")}</button><button className="text-button" onClick={() => onRestore(entry)}>{t("ここへ戻る")}</button></div></article>)}</div>
  </div>;
}
