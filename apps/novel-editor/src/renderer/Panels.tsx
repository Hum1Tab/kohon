import { getRole, ROLE_REGISTRY } from "@kohon/editor-core";
import { useEffect, useState, type ReactNode } from "react";

import type {
  AppInfo,
  Chapter,
  ChapterMetadata,
  ChapterStatus,
  CheckpointEntry,
  CodexModelOption,
  LensFinding,
  LensMessage,
  LensProviderId,
  LensRunResult,
  LensScopeMode,
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

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(date);
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
    <summary><span>章・場面情報</span><small>{Object.keys(chapter.metadata ?? {}).length === 0 ? "任意" : "設定済み"}</small></summary>
    <div className="chapter-metadata-form">
      <label>要約<textarea rows={3} maxLength={2000} value={draft.summary} onChange={(event) => patch({ summary: event.target.value })} placeholder="この場面で起きること" /></label>
      <div className="metadata-row"><label>視点人物<input maxLength={200} value={draft.pov} onChange={(event) => patch({ pov: event.target.value })} /></label><label>場所<input maxLength={200} value={draft.location} onChange={(event) => patch({ location: event.target.value })} /></label></div>
      <div className="metadata-row"><label>時系列<input maxLength={200} value={draft.timeline} onChange={(event) => patch({ timeline: event.target.value })} placeholder="一日目・夕方" /></label><label>状態<select value={draft.status} onChange={(event) => patch({ status: event.target.value as ChapterMetadataDraft["status"] })}><option value="">未設定</option><option value="idea">構想</option><option value="draft">下書き</option><option value="revising">推敲中</option><option value="done">完了</option></select></label></div>
      <label>登場人物<input maxLength={1000} value={draft.characters} onChange={(event) => patch({ characters: event.target.value })} placeholder="読点で区切る" /></label>
      <label>タグ<input maxLength={1000} value={draft.tags} onChange={(event) => patch({ tags: event.target.value })} placeholder="伏線、回想" /></label>
      <div className="metadata-actions"><small>{failed ? "保存できませんでした" : dirty ? "未保存" : "保存済み"}</small><button className="text-button" disabled={!dirty || saving} onClick={() => { void save(); }}>{saving ? "保存中…" : "保存"}</button></div>
    </div>
  </details>;
}

export function TextPrompt({ request, onCancel, onSubmit }: { request: TextPromptRequest; onCancel: () => void; onSubmit: (value: string) => void }): ReactNode {
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
      <h2 id={`prompt-title-${request.id}`}>{request.title}</h2>
      <label>{request.label}<input autoFocus maxLength={200} value={value} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setValue(event.target.value)} /></label>
      <div className="prompt-actions"><button type="button" className="secondary" onClick={onCancel}>キャンセル</button><button type="submit" className="primary" disabled={value.trim().length === 0}>{request.confirmLabel}</button></div>
    </form>
  </div>;
}

export function Welcome({ appInfo, busy, error, colorTheme, onToggleTheme, onCreate, onOpen, onSettings }: { appInfo: AppInfo | null; busy: boolean; error: string | null; colorTheme: "default" | "light" | "dark"; onToggleTheme: () => void; onCreate: () => void; onOpen: () => void; onSettings: () => void }): ReactNode {
  return <main className="welcome">
    <header className="welcome-header">
      <div className="welcome-brand"><AppIcon name="logo" size={30} tile /><span><b>KOHON</b><small>Writing workspace</small></span></div>
      <div className="welcome-header-actions"><button className="icon-button" onClick={onToggleTheme} title="配色を切り替える" aria-label="配色を切り替える"><AppIcon name={colorTheme === "dark" ? "sun" : "moon"} /></button><button className="icon-button" onClick={onSettings} title="設定" aria-label="設定を開く"><AppIcon name="settings" /></button></div>
    </header>

    <section className="welcome-hero">
      <div className="welcome-copy-block">
        <p className="eyebrow">01 / LOCAL-FIRST WRITING WORKSPACE</p>
        <h1>物語を、<br /><span>書く。</span></h1>
        <p className="welcome-copy">余計なものを脇へ置き、本文を真ん中に。Markdownの原稿、章立て、保存点、必要なときだけ呼べる読み手を、ひとつの静かな机にまとめました。</p>
        {error !== null && <p className="welcome-error">{error}</p>}
        <div className="welcome-actions">
          <button className="home-action" disabled={busy} onClick={onCreate}><span className="home-action-number">01</span><span className="home-action-icon"><AppIcon name="new" /></span><span><b>新しい作品</b><small>空白から物語を始める</small></span><span className="action-arrow">↗</span></button>
          <button className="home-action" disabled={busy} onClick={onOpen}><span className="home-action-number">02</span><span className="home-action-icon"><AppIcon name="open" /></span><span><b>作品を開く</b><small>既存のフォルダーを選択</small></span><span className="action-arrow">→</span></button>
          <button className="home-action" onClick={onSettings}><span className="home-action-number">03</span><span className="home-action-icon"><AppIcon name="layout" /></span><span><b>作業環境を整える</b><small>テーマとパネル配置を変える</small></span><span className="action-arrow">→</span></button>
        </div>
      </div>

      <aside className="welcome-art" aria-hidden="true">
        <span className="welcome-art-index">KOHON / 2026</span>
        <div className="welcome-art-mark"><AppIcon name="logo" size={196} tile /></div>
        <p>THE MANUSCRIPT<br />BELONGS TO THE AUTHOR.</p>
        <span className="welcome-art-side">LOCAL / MARKDOWN / PRIVATE</span>
      </aside>
    </section>

    <footer className="welcome-footer"><div className="welcome-features"><span><AppIcon name="edit" /> 縦書き・横書き</span><span><AppIcon name="checkpoint" /> 自動保存と保存点</span><span><AppIcon name="lens" /> 根拠付きAIレンズ</span></div><small>KOHON {appInfo?.version ?? ""} · {appInfo?.platform ?? "desktop"}</small></footer>
  </main>;
}

const NOTE_KIND_LABELS: Record<NoteKind, string> = { character: "人物", place: "場所", world: "世界観", plot: "プロット", memo: "メモ" };

export function OutlineNotes({ notes, activeChapterId, activeNote, draft, saveState, showAll, onShowAll, onCreate, onOpen, onDraft, onTogglePin, onSave, onArchive }: { notes: NoteMeta[]; activeChapterId: string | null; activeNote: NoteDocument | null; draft: NoteDraft | null; saveState: SaveState; showAll: boolean; onShowAll: (value: boolean) => void; onCreate: () => void; onOpen: (id: string) => void; onDraft: (patch: Partial<Omit<NoteDraft, "id">>) => void; onTogglePin: () => void; onSave: () => Promise<void>; onArchive: (archived: boolean) => void }): ReactNode {
  const visible = notes.filter((note) => showAll || note.id === activeNote?.note.id || (!note.archived && activeChapterId !== null && note.chapterIds.includes(activeChapterId)));
  return <details className="outline-notes">
    <summary><span>作業メモ</span><small>{activeChapterId === null ? notes.filter((note) => !note.archived).length : notes.filter((note) => !note.archived && note.chapterIds.includes(activeChapterId)).length}件</small></summary>
    <div className="note-toolbar"><button className="text-button" onClick={onCreate}>＋ メモ</button><button className="text-button" onClick={() => onShowAll(!showAll)}>{showAll ? "現在章だけ" : "すべて表示"}</button></div>
    <div className="note-list">{visible.length === 0 ? <p className="empty">現在章にピン留めされたメモはありません。</p> : visible.map((note) => <button key={note.id} className={activeNote?.note.id === note.id ? "active" : ""} onClick={() => onOpen(note.id)}><span>{note.title}</span><small>{NOTE_KIND_LABELS[note.kind]}{note.archived ? "・保管済み" : note.chapterIds.includes(activeChapterId ?? "") ? "・現在章" : ""}</small></button>)}</div>
    {activeNote !== null && draft !== null && <div className={`note-editor ${activeNote.note.archived ? "archived" : ""}`}><div className="note-editor-head"><span>{saveState === "saved" ? "保存済み" : saveState === "saving" ? "保存中…" : saveState === "dirty" ? "未保存" : "保存エラー"}</span>{activeNote.note.archived && <b>保管済み</b>}</div><input aria-label="メモのタイトル" maxLength={200} disabled={activeNote.note.archived} value={draft.title} onChange={(event) => onDraft({ title: event.target.value })} /><div className="note-meta-row"><select aria-label="メモの分類" disabled={activeNote.note.archived} value={draft.kind} onChange={(event) => onDraft({ kind: event.target.value as NoteKind })}>{Object.entries(NOTE_KIND_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select><label><input type="checkbox" disabled={activeNote.note.archived || activeChapterId === null} checked={activeChapterId !== null && draft.chapterIds.includes(activeChapterId)} onChange={onTogglePin} /> 現在章へピン</label></div><textarea aria-label="メモ本文" rows={7} spellCheck={false} disabled={activeNote.note.archived} value={draft.text} onChange={(event) => onDraft({ text: event.target.value })} placeholder="Markdownで自由に書けます。" /><div className="note-actions"><button className="text-button" disabled={activeNote.note.archived || saveState === "saved" || saveState === "saving"} onClick={() => { void onSave().catch(() => undefined); }}>保存</button><button className="text-button" onClick={() => onArchive(!activeNote.note.archived)}>{activeNote.note.archived ? "保管から戻す" : "保管する"}</button></div></div>}
  </details>;
}

export interface LensPanelProps {
  role: RoleId; setRole: (role: RoleId) => void; provider: LensProviderId; setProvider: (provider: LensProviderId) => void;
  modelId: string; setModelId: (value: string) => void; codexModels: CodexModelOption[]; codexConnected: boolean; openAIConnected: boolean; onOpenSettings: () => void;
  query: string; setQuery: (value: string) => void; scopeMode: LensScopeMode; setScopeMode: (value: LensScopeMode) => void;
  scopeTitles: string[]; approved: boolean; setApproved: (value: boolean) => void; thread: LensMessage[]; result: LensRunResult | null;
  running: boolean; onRun: () => void; onClear: () => void; onFinding: (finding: LensFinding) => void;
  reviews: ReviewLedgerEntry[]; onReview: (finding: ReviewLedgerEntry) => void; onReviewStatus: (id: string, status: ReviewStatus) => void; onReviewRecheck: (id: string) => void;
}

export function LensPanel(props: LensPanelProps): ReactNode {
  const definition = getRole(props.role);
  const visibleReviews = props.reviews.slice(0, 200);
  return <div className="inspector-content lens-panel">
    <div className="section-head"><div><span className="eyebrow">SYNTHETIC READER</span><h2>編集レンズ</h2></div>{props.thread.length > 0 && <button className="text-button" onClick={props.onClear}>会話を消す</button>}</div>
    <div className="role-grid">{ROLE_IDS.map((id) => <button key={id} className={props.role === id ? "role active" : "role"} title={getRole(id).description} onClick={() => props.setRole(id)}>{getRole(id).label}</button>)}</div>
    <p className="role-description">{definition.description}</p>
    <section className="lens-compose" aria-label="編集レンズへ質問">
    <label>質問<textarea rows={3} value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder={DEFAULT_QUERY} /></label>
    <div className="form-row"><label>接続<select value={props.provider} onChange={(event) => props.setProvider(event.target.value as LensProviderId)}><option value="codex">ChatGPT（Codex枠）</option><option value="mock">Offline Mock</option><option value="openai">OpenAI API</option></select></label><label>読了位置<select value={props.scopeMode} onChange={(event) => props.setScopeMode(event.target.value as LensScopeMode)}><option value="current">現在の章だけ</option><option value="through-current">現在の章まで</option><option value="all">全章</option></select></label></div>
    {props.provider === "codex" && <div className="lens-connection"><label>モデル<select value={props.modelId} onChange={(event) => props.setModelId(event.target.value)}>{props.codexModels.length === 0 && <option value={props.modelId}>{props.modelId}</option>}{props.codexModels.map((model) => <option key={model.id} value={model.id}>{model.displayName}{model.id === "gpt-5.6-luna" ? "（節約）" : ""}</option>)}</select></label><div className="lens-connection-state"><span className={props.codexConnected ? "connected" : "disconnected"}>{props.codexConnected ? "ChatGPT接続済み" : "ChatGPT未接続"}</span><button className="text-button" onClick={props.onOpenSettings}>接続設定を開く</button></div></div>}
    {props.provider === "openai" && <div className="lens-connection"><label>Model ID<input value={props.modelId} onChange={(event) => props.setModelId(event.target.value)} /></label><div className="lens-connection-state"><span className={props.openAIConnected ? "connected" : "disconnected"}>{props.openAIConnected ? "OpenAI接続済み" : "OpenAI未接続"}</span><button className="text-button" onClick={props.onOpenSettings}>接続設定を開く</button></div></div>}
    <details className="scope-preview" open><summary>送信範囲: {props.scopeTitles.length}章</summary><ul>{props.scopeTitles.map((title) => <li key={title}>{title}</li>)}</ul><p>未選択章、設定画面、履歴、ファイルパスは送信しません。</p></details>
    <label className="check"><input type="checkbox" checked={props.approved} onChange={(event) => props.setApproved(event.target.checked)} /> 表示された章だけを送信することを確認しました</label>
    <button className="primary full" disabled={props.running || !props.approved || props.query.trim().length === 0 || (props.provider === "codex" && !props.codexConnected) || (props.provider === "openai" && !props.openAIConnected)} onClick={props.onRun}>{props.running ? "検証しながら読んでいます…" : `${definition.label}に聞く`}</button>
    <p className="privacy-note">本文の生成・書換え・自動適用は行いません。会話と認証情報はprojectへ保存しません。</p>
    </section>
    {props.thread.length > 0 && <div className="thread" aria-label={`${definition.label}との会話`}>{props.thread.map((message, index) => <div key={`${message.createdAt}-${index}`} className={`message ${message.sender}`}><b>{message.sender === "author" ? "あなた" : definition.label}</b><p>{message.text}</p></div>)}</div>}
    {props.result !== null && <div className="finding-list"><div className="coverage">{props.result.coverage.chapterCount}章・{props.result.coverage.characterCount.toLocaleString()}字を確認</div>{props.result.findings.map((finding) => <article className={`finding priority-${finding.priority}`} key={finding.id}><div className="finding-meta"><span>{finding.priority}</span><span>{finding.anchorStatus === "attached" ? "根拠確認済み" : finding.anchorStatus === "ambiguous" ? "引用が複数" : "引用未確認"}</span></div><h3>{finding.title}</h3><p>{finding.observation}</p><p className="effect">読者への影響: {finding.readerEffect}</p><button className="quote" disabled={finding.anchorStatus !== "attached"} onClick={() => props.onFinding(finding)}>「{finding.quote}」<small>{finding.chapterTitle ?? "原文へ接続できません"}</small></button></article>)}</div>}
    <details className="review-ledger" open={props.reviews.some((finding) => finding.status === "open")}><summary><span>指摘台帳</span><small>未対応 {props.reviews.filter((finding) => finding.status === "open").length}件</small></summary><div className="review-ledger-list">{props.reviews.length === 0 ? <p className="empty">保存された指摘はまだありません。</p> : visibleReviews.map((finding) => <article className={`review-entry ${finding.status}`} key={finding.id}><div className="finding-meta"><span>{finding.role in ROLE_REGISTRY ? getRole(finding.role as RoleId).label : finding.role}</span><span>{finding.status === "open" ? "未対応" : finding.status === "resolved" ? "解決" : "見送り"}</span><span>{finding.anchorStatus === "attached" ? "根拠確認済み" : finding.anchorStatus === "stale" ? "本文変更あり" : "要再確認"}</span></div><h3>{finding.finding?.title ?? "無題の指摘"}</h3><p>{finding.finding?.body}</p><button className="quote" disabled={finding.anchorStatus !== "attached"} onClick={() => props.onReview(finding)}>「{finding.exactQuote}」<small>{finding.title}</small></button><div className="review-actions">{finding.anchorStatus !== "attached" && <button className="text-button" onClick={() => props.onReviewRecheck(finding.id)}>現在の本文で再確認</button>}{finding.status !== "open" && <button className="text-button" onClick={() => props.onReviewStatus(finding.id, "open")}>未対応へ戻す</button>}{finding.status !== "resolved" && <button className="text-button" onClick={() => props.onReviewStatus(finding.id, "resolved")}>解決</button>}{finding.status !== "ignored" && <button className="text-button" onClick={() => props.onReviewStatus(finding.id, "ignored")}>見送る</button>}</div></article>)}{props.reviews.length > visibleReviews.length && <p className="muted">最新{visibleReviews.length}件を表示しています。</p>}</div></details>
  </div>;
}

export function SearchPanel({ query, setQuery, replacement, setReplacement, caseSensitive, setCaseSensitive, hits, previewReady, onSearch, onReplace, onHit }: { query: string; setQuery: (value: string) => void; replacement: string; setReplacement: (value: string) => void; caseSensitive: boolean; setCaseSensitive: (value: boolean) => void; hits: SearchHit[]; previewReady: boolean; onSearch: () => void; onReplace: () => void; onHit: (hit: SearchHit) => void }): ReactNode {
  return <div className="inspector-content"><span className="eyebrow">FULL TEXT</span><h2>作品内検索・置換</h2>
    <div className="search-box"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSearch(); }} placeholder="語句を入力" /><button onClick={onSearch}>検索</button></div>
    <label className="check search-option"><input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} /> 大文字と小文字を区別</label>
    <div className="workspace-replace"><label>置換後<input value={replacement} onChange={(event) => setReplacement(event.target.value)} placeholder="空欄なら削除" /></label><button className="secondary" disabled={!previewReady || hits.length === 0} onClick={onReplace}>{hits.length === 0 ? "置換する一致なし" : `${hits.length}件を置換…`}</button><small>表示中の一致だけを対象に確認し、実行前に保存点を作ります。</small></div>
    <p className="result-count">{previewReady ? `${hits.length}件` : "検索して置換範囲を確認"}</p><div className="search-results">{hits.map((hit, index) => <button key={`${hit.chapterId}-${hit.start}-${index}`} onClick={() => onHit(hit)}><b>{hit.title}</b><p>{hit.excerpt}</p></button>)}</div>
  </div>;
}

export function HistoryPanel({ entries, diff, onCreate, onCompareCurrent, onComparePair, onRestore, onRestoreChapter, onVariation }: { entries: CheckpointEntry[]; diff: ProjectDiff | null; onCreate: () => void; onCompareCurrent: (entry: CheckpointEntry) => void; onComparePair: (leftCommit: string, rightCommit: string) => void; onRestore: (entry: CheckpointEntry) => void; onRestoreChapter: (commit: string, chapterId: string, title: string) => void; onVariation: () => void }): ReactNode {
  const [leftCommit, setLeftCommit] = useState("");
  const [rightCommit, setRightCommit] = useState("");
  useEffect(() => {
    if (!entries.some((entry) => entry.commit === rightCommit)) setRightCommit(entries[0]?.commit ?? "");
    if (!entries.some((entry) => entry.commit === leftCommit)) setLeftCommit(entries[1]?.commit ?? entries[0]?.commit ?? "");
  }, [entries, leftCommit, rightCommit]);
  const changed = diff?.chapters.filter((chapterDiff) => chapterDiff.status !== "same") ?? [];
  return <div className="inspector-content"><span className="eyebrow">RECOVERY</span><h2>保存点と差分</h2><p className="muted">戻す前に変更内容を読めます。復元前の状態も自動で残します。</p>
    <div className="history-actions"><button className="primary" onClick={onCreate}>保存点を作る</button><button className="secondary" onClick={onVariation}>別案を複製</button></div>
    {entries.length > 1 && <div className="checkpoint-compare"><label>古い保存点<select value={leftCommit} onChange={(event) => setLeftCommit(event.target.value)}>{entries.map((entry) => <option key={entry.commit} value={entry.commit}>{entry.subject}</option>)}</select></label><label>新しい保存点<select value={rightCommit} onChange={(event) => setRightCommit(event.target.value)}>{entries.map((entry) => <option key={entry.commit} value={entry.commit}>{entry.subject}</option>)}</select></label><button className="secondary" disabled={leftCommit === rightCommit} onClick={() => onComparePair(leftCommit, rightCommit)}>保存点どうしを比較</button></div>}
    {diff !== null && <section className="checkpoint-diff" aria-label="保存点の差分"><header><b>{diff.summary.changed + diff.summary.added + diff.summary.removed}章に変更</b><span>+{diff.summary.additions} / −{diff.summary.removals}</span></header>{changed.length === 0 ? <p className="empty">本文の変更はありません。</p> : changed.map((chapterDiff) => <details key={chapterDiff.chapterId}><summary><span>{chapterDiff.title}</span><small>{chapterDiff.status === "added" ? "追加" : chapterDiff.status === "removed" ? "削除" : `+${chapterDiff.additions} −${chapterDiff.removals}`}</small></summary>{diff.right === "current" && chapterDiff.status !== "added" && <div className="chapter-diff-actions"><button className="text-button" onClick={() => onRestoreChapter(diff.left, chapterDiff.chapterId, chapterDiff.title)}>この章だけ保存点へ戻す</button></div>}<div className="diff-hunks">{chapterDiff.hunks.flatMap((hunk, hunkIndex) => hunk.lines.map((line, lineIndex) => <div className={`diff-line ${line.kind}`} key={`${hunkIndex}-${lineIndex}`}><span>{line.leftLine ?? ""}</span><span>{line.rightLine ?? ""}</span><code>{line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "} {line.text || " "}</code></div>))}{chapterDiff.truncated && <p className="muted">差分が大きいため表示を省略しました。</p>}</div></details>)}</section>}
    <div className="history-list">{entries.length === 0 ? <p className="empty">保存点はまだありません。</p> : entries.map((entry) => <article key={entry.commit}><div><b>{entry.subject}</b><small>{formatDate(entry.authoredAt)}</small></div><div><button className="text-button" onClick={() => onCompareCurrent(entry)}>現在と比較</button><button className="text-button" onClick={() => onRestore(entry)}>ここへ戻る</button></div></article>)}</div>
  </div>;
}
