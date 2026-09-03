import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useModalFocus } from "./useModalFocus.js";
import { useLocale } from "./LocaleContext.js";

export interface QuickAccessItem {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
}

interface QuickAccessProps {
  title: string;
  placeholder: string;
  query: string;
  items: readonly QuickAccessItem[];
  onQuery: (value: string) => void;
  onChoose: (item: QuickAccessItem) => void;
  onClose: () => void;
}

export function QuickAccess(props: QuickAccessProps): ReactNode {
  const { locale, t } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState(0);
  const modal = useModalFocus<HTMLElement>(props.onClose);
  const visible = useMemo(() => {
    const query = props.query.trim().toLocaleLowerCase(locale === "ja" ? "ja-JP" : "en-US");
    if (query.length === 0) return props.items.slice(0, 100);
    return props.items.filter((item) => `${item.label} ${item.description ?? ""}`.toLocaleLowerCase(locale === "ja" ? "ja-JP" : "en-US").includes(query)).slice(0, 100);
  }, [locale, props.items, props.query]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setSelected(0); }, [props.query]);

  const handleKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") { event.preventDefault(); props.onClose(); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (visible.length > 0) setSelected((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + visible.length) % visible.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = visible[selected];
      if (item !== undefined) props.onChoose(item);
    }
  };

  return <div className="quick-access-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
    <section ref={modal.ref} className="quick-access" role="dialog" aria-modal="true" aria-label={props.title} onKeyDown={modal.onKeyDown}>
      <header><span>{props.title}</span><kbd>Esc</kbd></header>
      <input ref={inputRef} role="combobox" aria-expanded="true" aria-controls="quick-access-results" aria-activedescendant={visible[selected] === undefined ? undefined : `quick-item-${visible[selected]!.id}`} value={props.query} onChange={(event) => props.onQuery(event.target.value)} onKeyDown={handleKey} placeholder={props.placeholder} />
      <div id="quick-access-results" className="quick-access-results" role="listbox">
        {visible.length === 0 ? <p>{t("候補がありません。")}</p> : visible.map((item, index) => <button id={`quick-item-${item.id}`} key={item.id} role="option" aria-selected={index === selected} className={index === selected ? "selected" : ""} onMouseEnter={() => setSelected(index)} onClick={() => props.onChoose(item)}>
          <span><b>{item.label}</b>{item.description === undefined ? null : <small>{item.description}</small>}</span>{item.shortcut === undefined || item.shortcut.length === 0 ? null : <kbd>{item.shortcut}</kbd>}
        </button>)}
      </div>
    </section>
  </div>;
}
