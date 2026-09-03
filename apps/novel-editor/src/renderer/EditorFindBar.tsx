import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useLocale } from "./LocaleContext.js";

interface EditorFindBarProps {
  replaceVisible: boolean;
  query: string;
  replacement: string;
  caseSensitive: boolean;
  matchCount: number;
  currentMatch: number;
  onQuery: (value: string) => void;
  onReplacement: (value: string) => void;
  onToggleReplace: () => void;
  onToggleCase: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}

export function EditorFindBar(props: EditorFindBarProps): ReactNode {
  const { t } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  const handleFindKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") { event.preventDefault(); props.onClose(); }
    else if (event.key === "Enter") { event.preventDefault(); if (event.shiftKey) props.onPrevious(); else props.onNext(); }
  };

  return <section className="editor-find-bar" aria-label={t("本文内の検索と置換")}>
    <div className="find-row">
      <button className="find-expand" aria-label={t(props.replaceVisible ? "置換を閉じる" : "置換を開く")} aria-expanded={props.replaceVisible} onClick={props.onToggleReplace}>{props.replaceVisible ? "⌄" : "›"}</button>
      <input ref={inputRef} aria-label={t("検索語")} value={props.query} onChange={(event) => props.onQuery(event.target.value)} onKeyDown={handleFindKey} placeholder={t("本文内を検索")} />
      <span className="find-count" aria-live="polite">{props.matchCount === 0 ? t("一致なし") : `${props.currentMatch + 1} / ${props.matchCount}`}</span>
      <button className={props.caseSensitive ? "active" : ""} aria-pressed={props.caseSensitive} onClick={props.onToggleCase} title={t("大文字と小文字を区別")}>Aa</button>
      <button onClick={props.onPrevious} aria-label={t("前の一致")}>↑</button>
      <button onClick={props.onNext} aria-label={t("次の一致")}>↓</button>
      <button onClick={props.onClose} aria-label={t("検索を閉じる")}>×</button>
    </div>
    {props.replaceVisible && <div className="find-row replace-row">
      <span aria-hidden="true" />
      <input aria-label={t("置換後の文字")} value={props.replacement} onChange={(event) => props.onReplacement(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") props.onClose(); }} placeholder={t("置換")} />
      <span />
      <button onClick={props.onReplace} disabled={props.matchCount === 0}>{t("置換")}</button>
      <button className="replace-all" onClick={props.onReplaceAll} disabled={props.matchCount === 0}>{t("すべて置換")}</button>
    </div>}
  </section>;
}
