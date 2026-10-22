import { useEffect, useState, type ReactNode, type Ref } from "react";

/** Empty text is an editing draft, not a damaged persisted scene title. */
export function PlanningTitleInput({ value, onChange, inputRef, label }: { value: string; onChange(value: string): void; inputRef?: Ref<HTMLInputElement>; label?: string }): ReactNode {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <input ref={inputRef} aria-label={label} maxLength={200} value={draft} onChange={e => { setDraft(e.target.value); if (e.target.value.trim()) onChange(e.target.value); }} onBlur={() => { if (!draft.trim()) setDraft(value); }} />;
}
