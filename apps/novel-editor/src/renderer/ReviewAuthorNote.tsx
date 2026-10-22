import {useState, type ReactNode} from "react";
import type {ReviewLedgerEntry} from "../shared/types.js";
import {useLocale} from "./LocaleContext.js";

export function ReviewAuthorNote({entry, draft, onDraft, onSave}: {
  entry: ReviewLedgerEntry;
  draft: string | undefined;
  onDraft: (value: string) => void;
  onSave: (value: string) => Promise<void>;
}): ReactNode {
  const {locale} = useLocale();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const value = draft ?? entry.authorNote ?? "";
  const dirty = value !== (entry.authorNote ?? "");
  const tr = (ja: string, en: string): string => locale === "en" ? en : ja;
  const save = async (): Promise<void> => {
    if (!dirty || saving) return;
    setSaving(true); setFailed(false);
    try { await onSave(value); }
    catch { setFailed(true); }
    finally { setSaving(false); }
  };
  return <details className="review-author-note" open={dirty || undefined}>
    <summary>{tr("判断メモ", "Author note")}<small>{dirty ? tr("未保存", "Unsaved") : entry.authorNote ? tr("記録済み", "Recorded") : ""}</small></summary>
    <label><span>{tr("採用・見送りの理由、次に確認したいこと", "Reason for the decision or next revision check")}</span>
      <textarea aria-label={`${tr("判断メモ", "Author note")}: ${entry.finding?.title ?? entry.title}`} rows={3} maxLength={4000} value={value} disabled={saving}
        onChange={event => { onDraft(event.target.value); setFailed(false); }} />
    </label>
    <div className="review-note-actions"><span role="status">{failed ? tr("保存できませんでした。入力は残っています。", "Could not save. Your draft is still here.") : saving ? tr("保存中…", "Saving…") : dirty ? tr("未保存", "Unsaved") : tr("保存済み", "Saved")}</span>
      <button className="text-button" disabled={!dirty || saving} onClick={() => { void save(); }}>{tr("メモを保存", "Save note")}</button>
    </div>
  </details>;
}
