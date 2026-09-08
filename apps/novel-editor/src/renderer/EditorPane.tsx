import type { TextStats } from "@kohon/editor-core";
import type { CSSProperties, DragEvent, MouseEvent, MutableRefObject, ReactNode } from "react";
import type { EditorBuffer } from "../shared/editor-buffers.js";
import type { EditorGroupId, EditorSessionState } from "../shared/editor-session.js";
import type { ManuscriptTheme } from "../shared/editor-theme.js";
import type { Chapter } from "../shared/types.js";
import { AppIcon } from "./AppIcon.js";
import { EditorFindBar } from "./EditorFindBar.js";
import { useLocale } from "./LocaleContext.js";

type EditorTabDrag = { groupId: EditorGroupId; chapterId: string } | null;
type EditorTabDrop = { groupId: EditorGroupId; index: number } | null;

export interface EditorPaneProps {
  group: EditorSessionState["groups"][number];
  groupActive: boolean;
  groupCount: number;
  groupChapterId: string | null;
  groupIndex: number;
  buffer: EditorBuffer | undefined;
  buffers: Readonly<Record<string, EditorBuffer>>;
  groupStats: TextStats | undefined;
  manifestChapters: Chapter[];
  theme: ManuscriptTheme;
  writingMode: "horizontal" | "vertical-rl";
  manuscriptPalette: { background: string; text: string; line: string };
  findOpen: boolean;
  replaceVisible: boolean;
  findQuery: string;
  replacement: string;
  caseSensitive: boolean;
  findMatchCount: number;
  findMatchIndex: number;
  editorTabDrag: EditorTabDrag;
  editorTabDrop: EditorTabDrop;
  editorRefs: MutableRefObject<Partial<Record<EditorGroupId, HTMLTextAreaElement>>>;
  editorRef: MutableRefObject<HTMLTextAreaElement | null>;
  onActivate: () => void;
  onTabDropOver: (groupId: EditorGroupId, index: number, event: DragEvent<HTMLDivElement>) => void;
  onTabDrop: (groupId: EditorGroupId, index: number, event: DragEvent<HTMLDivElement>) => void;
  onDropIndex: (event: DragEvent<HTMLDivElement>, tabIndex: number) => number;
  onBeginTabDrag: (groupId: EditorGroupId, chapterId: string, event: DragEvent<HTMLDivElement>) => void;
  onEndTabDrag: () => void;
  onLoadChapter: (chapterId: string, groupId: EditorGroupId) => void;
  onMoveTab: (groupId: EditorGroupId, chapterId: string, target: number) => void;
  onCloseTab: (chapterId: string, groupId: EditorGroupId) => void;
  onFindQuery: (value: string) => void;
  onFindReplacement: (value: string) => void;
  onToggleReplace: () => void;
  onToggleCase: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onCloseFind: () => void;
  onOpenFind: () => void;
  onSplit: (direction: "right" | "down") => void;
  onCloseGroup: () => void;
  onMoveChapter: (delta: -1 | 1) => void;
  onSplitChapter: () => void;
  onMergeChapter: () => void;
  onRenameChapter: () => void;
  onDeleteChapter: () => void;
  onCaptureInput: (groupId: EditorGroupId, chapterId: string, editor: HTMLTextAreaElement, composing: boolean, inputType: string) => void;
  onCompositionStart: (groupId: EditorGroupId, chapterId: string, editor: HTMLTextAreaElement) => void;
  onCompositionEnd: (groupId: EditorGroupId, chapterId: string, editor: HTMLTextAreaElement) => void;
  onChange: (groupId: EditorGroupId, chapterId: string, editor: HTMLTextAreaElement, active: boolean) => void;
  onHistory: (kind: "undo" | "redo") => void;
  compositionRef: MutableRefObject<unknown>;
  onSelection: (groupId: EditorGroupId, chapterId: string, editor: HTMLTextAreaElement) => void;
  onBlur: (groupId: EditorGroupId, chapterId: string, editor: HTMLTextAreaElement) => void;
  onSave: () => void;
  onTheme: (theme: ManuscriptTheme) => void;
  onWritingMode: () => void;
}

function closeChapterMenu(event: MouseEvent<HTMLButtonElement>): void {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

export function EditorPane(props: EditorPaneProps): ReactNode {
  const { locale, t } = useLocale();
  const { group, groupActive, groupChapterId, groupIndex, buffer, groupStats, manifestChapters } = props;
  const documentSaveState = buffer?.saveState ?? "saved";
  const documentSaveLabel = t(documentSaveState === "saved" ? "保存済み" : documentSaveState === "saving" ? "保存中…" : documentSaveState === "dirty" ? "未保存" : "保存エラー");

  return <main
    className={`editor-pane manuscript-${props.theme} ${props.writingMode === "vertical-rl" ? "vertical" : "horizontal"} ${groupActive && props.findOpen ? "find-open" : ""} ${groupActive ? "active-group" : ""}`}
    style={{ "--ms-bg": props.manuscriptPalette.background, "--ms-text": props.manuscriptPalette.text, "--ms-line": props.manuscriptPalette.line } as CSSProperties}
    onPointerDown={props.onActivate}
  >
    <div
      className={`editor-tabs ${props.editorTabDrag !== null ? "dragging" : ""}`}
      role="tablist"
      aria-label={`${t("開いている章")} ${group.id}`}
      onDragOver={(event) => {
        if (event.target !== event.currentTarget) return;
        props.onTabDropOver(group.id, group.tabs.length, event);
      }}
      onDrop={(event) => {
        if (event.target !== event.currentTarget) return;
        props.onTabDrop(group.id, group.tabs.length, event);
      }}
    >
      {group.tabs.map((tabState, tabIndex) => {
        const item = manifestChapters.find((candidate) => candidate.id === tabState.chapterId);
        if (item === undefined) return null;
        const active = item.id === groupChapterId;
        const tabBuffer = props.buffers[item.id];
        const dropIndex = props.editorTabDrop?.groupId === group.id ? props.editorTabDrop.index : -1;
        const dropClass = dropIndex === tabIndex ? "drop-before" : dropIndex === tabIndex + 1 ? "drop-after" : "";

        return <div
          className={`editor-tab ${active ? "active" : ""} ${props.editorTabDrag?.groupId === group.id && props.editorTabDrag.chapterId === item.id ? "drag-source" : ""} ${dropClass}`}
          key={item.id}
          role="presentation"
          draggable
          onDragStart={(event) => props.onBeginTabDrag(group.id, item.id, event)}
          onDragEnd={props.onEndTabDrag}
          onDragOver={(event) => {
            if (props.editorTabDrag === null) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
            props.onTabDropOver(group.id, props.onDropIndex(event, tabIndex), event);
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.onTabDrop(group.id, props.onDropIndex(event, tabIndex), event);
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`editor-panel-${group.id}`}
            id={`editor-tab-${group.id}-${item.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => props.onLoadChapter(item.id, group.id)}
            onKeyDown={(event) => {
              if (event.altKey && event.shiftKey) {
                const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
                const target = tabIndex + delta;
                if (delta === 0 || target < 0 || target >= group.tabs.length) return;
                event.preventDefault();
                props.onMoveTab(group.id, item.id, target);
                return;
              }
              if (event.altKey || event.ctrlKey || event.metaKey) return;
              const target = event.key === "Home"
                ? 0
                : event.key === "End"
                  ? group.tabs.length - 1
                  : event.key === "ArrowLeft"
                    ? (tabIndex - 1 + group.tabs.length) % group.tabs.length
                    : event.key === "ArrowRight"
                      ? (tabIndex + 1) % group.tabs.length
                      : null;
              if (target === null || target === tabIndex) return;
              const targetTab = group.tabs[target];
              if (targetTab === undefined) return;
              event.preventDefault();
              const buttons = event.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
              buttons?.[target]?.focus();
              props.onLoadChapter(targetTab.chapterId, group.id);
            }}
            title={locale === "en" ? `${item.title} (drag or press Alt+Shift+←/→ to move)` : `${item.title}（ドラッグ、または Alt+Shift+←/→ で移動）`}
          >
            <span>{item.title}</span>
            {tabBuffer !== undefined && tabBuffer.saveState !== "saved" ? <i aria-label={t("未保存")}>●</i> : null}
          </button>
          <button className="editor-tab-close" aria-label={locale === "en" ? `Close ${item.title}` : `${item.title}を閉じる`} title={t("閉じる")} onClick={(event) => { event.stopPropagation(); props.onCloseTab(item.id, group.id); }}><AppIcon name="close" /></button>
        </div>;
      })}
    </div>

    {groupActive && props.findOpen && <EditorFindBar
      replaceVisible={props.replaceVisible}
      query={props.findQuery}
      replacement={props.replacement}
      caseSensitive={props.caseSensitive}
      matchCount={props.findMatchCount}
      currentMatch={Math.max(0, Math.min(props.findMatchIndex, props.findMatchCount - 1))}
      onQuery={props.onFindQuery}
      onReplacement={props.onFindReplacement}
      onToggleReplace={props.onToggleReplace}
      onToggleCase={props.onToggleCase}
      onPrevious={props.onPrevious}
      onNext={props.onNext}
      onReplace={props.onReplace}
      onReplaceAll={props.onReplaceAll}
      onClose={props.onCloseFind}
    />}

    <div className="editor-toolbar">
      {groupActive && <div className="editor-actions">
        {props.groupCount > 1 && <button className="icon-button" onClick={props.onCloseGroup} title={t("このグループを閉じる")} aria-label={t("現在のエディターグループを閉じる")}><AppIcon name="close" /></button>}
        <details className="editor-more">
          <summary aria-label={t("章の操作")} title={t("章の操作")}><AppIcon name="more" size={18} /></summary>
          <div className="editor-more-menu">
            <button disabled={buffer === undefined} onClick={(event) => { closeChapterMenu(event); props.onOpenFind(); }}>{t("本文内を検索")}</button>
            <button onClick={(event) => { closeChapterMenu(event); props.onWritingMode(); }}>{t("横書きと縦書きを切り替える")}</button>
            <label className="editor-palette-setting">{t("原稿の配色")}<select aria-label={t("原稿の配色")} value={props.theme} onChange={(event) => props.onTheme(event.target.value as ManuscriptTheme)}><option value="paper">{t("白い紙")}</option><option value="sepia">{t("生成り")}</option><option value="gray">{t("グレー")}</option><option value="dark">{t("黒")}</option><option value="custom">{t("カスタム")}</option></select></label>
            <span className="editor-menu-label">{t("表示")}</span>
            <button onClick={(event) => { closeChapterMenu(event); props.onSplit("right"); }}>{t("エディターを右に分割")}</button>
            <button onClick={(event) => { closeChapterMenu(event); props.onSplit("down"); }}>{t("エディターを下に分割")}</button>
            <span className="editor-menu-label">{t("章・場面")}</span>
            <button disabled={groupIndex <= 0} onClick={(event) => { closeChapterMenu(event); props.onMoveChapter(-1); }}>{t("前へ移動")}</button>
            <button disabled={groupIndex < 0 || groupIndex >= manifestChapters.length - 1} onClick={(event) => { closeChapterMenu(event); props.onMoveChapter(1); }}>{t("後ろへ移動")}</button>
            <button onClick={(event) => { closeChapterMenu(event); props.onSplitChapter(); }}>{t("カーソル位置で場面分割")}</button>
            <button disabled={groupIndex <= 0} onClick={(event) => { closeChapterMenu(event); props.onMergeChapter(); }}>{t("前の章・場面へ結合")}</button>
            <button onClick={(event) => { closeChapterMenu(event); props.onRenameChapter(); }}>{t("名前を変更")}</button>
            <button className="danger-text" onClick={(event) => { closeChapterMenu(event); props.onDeleteChapter(); }}>{t("章・場面を削除")}</button>
          </div>
        </details>
      </div>}
    </div>

    <div
      className="editor-scroll"
      id={`editor-panel-${group.id}`}
      role="tabpanel"
      aria-labelledby={groupChapterId === null ? undefined : `editor-tab-${group.id}-${groupChapterId}`}
    ><textarea
      ref={(node) => {
        if (node === null) delete props.editorRefs.current[group.id];
        else props.editorRefs.current[group.id] = node;
        if (groupActive) props.editorRef.current = node;
      }}
      aria-label={locale === "en" ? `${buffer?.chapter.title ?? "Novel"} manuscript` : `${buffer?.chapter.title ?? "小説"}の本文`}
      className="manuscript-editor"
      value={buffer?.text ?? ""}
      spellCheck={false}
      onFocus={props.onActivate}
      onBeforeInput={(event) => {
        const input = event.nativeEvent as InputEvent;
        if (groupChapterId !== null) props.onCaptureInput(group.id, groupChapterId, event.currentTarget, input.isComposing, input.inputType);
      }}
      onCompositionStart={(event) => { if (groupChapterId !== null) props.onCompositionStart(group.id, groupChapterId, event.currentTarget); }}
      onCompositionEnd={(event) => { if (groupChapterId !== null) props.onCompositionEnd(group.id, groupChapterId, event.currentTarget); }}
      onChange={(event) => { if (groupChapterId !== null) props.onChange(group.id, groupChapterId, event.currentTarget, groupActive); }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || props.compositionRef.current !== null || (!event.metaKey && !event.ctrlKey) || event.altKey) return;
        const key = event.key.toLowerCase();
        if (key === "z") {
          event.preventDefault();
          props.onHistory(event.shiftKey ? "redo" : "undo");
        } else if (key === "y" && !event.shiftKey) {
          event.preventDefault();
          props.onHistory("redo");
        }
      }}
      onSelect={(event) => { if (groupChapterId !== null) props.onSelection(group.id, groupChapterId, event.currentTarget); }}
      onScroll={(event) => { if (groupChapterId !== null) props.onSelection(group.id, groupChapterId, event.currentTarget); }}
      onBlur={(event) => { if (groupChapterId !== null) props.onBlur(group.id, groupChapterId, event.currentTarget); }}
      disabled={buffer === undefined}
      placeholder={t("ここから物語を書き始めます。")}
    /></div>

    <footer className="statusbar">
      <div className="status-primary">
        <button type="button" className={`document-save-state ${documentSaveState}`} onClick={props.onSave} title={t("今すぐ保存")}><i aria-hidden="true" />{documentSaveLabel}</button>
        <span>{groupStats?.charactersNoWhitespace.toLocaleString(locale) ?? "—"}{t("字")}</span>
      </div>
    </footer>
  </main>;
}
