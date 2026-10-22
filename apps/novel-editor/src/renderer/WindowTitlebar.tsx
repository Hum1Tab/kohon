import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AppInfo } from "../shared/types.js";
import { AppIcon } from "./AppIcon.js";
import { useLocale } from "./LocaleContext.js";
import { WindowControls } from "./WindowControls.js";

export function WindowTitlebar({ appInfo, children, brand }: { appInfo: AppInfo | null; children: ReactNode; brand?: ReactNode }): ReactNode {
  const { t, locale } = useLocale();
  const platform = appInfo?.platform ?? (typeof navigator !== "undefined" && navigator.platform.startsWith("Mac") ? "darwin" : "win32");
  const [items, setItems] = useState<{ index: number; label: string }[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const menuRef = useRef<HTMLElement>(null);
  useEffect(() => {
    let live = true;
    void window.kohon.appMenu().then((menu) => { if (live) setItems(menu); });
    return () => { live = false; };
  }, [locale]);
  useEffect(() => {
    const focusMenu = (event: KeyboardEvent): void => {
      if (event.key !== "F10" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      if (menuRef.current?.closest(".settings-view") === null && document.querySelector(".settings-view")) return;
      event.preventDefault();
      menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    window.addEventListener("keydown", focusMenu);
    return () => window.removeEventListener("keydown", focusMenu);
  }, []);
  const openMenu = async (index: number, button: HTMLButtonElement): Promise<void> => {
    const rect = button.getBoundingClientRect();
    setActive(index);
    try { await window.kohon.showAppMenu({ index, x: rect.left, y: rect.bottom + 4 }); }
    finally { setActive(null); }
  };
  return <header className={`topbar platform-${platform}`} data-tauri-drag-region>
    {brand ?? <AppIcon name="logo" size={18} />}
    <nav ref={menuRef} className="application-menu" aria-label={t("アプリメニュー")}>
      {items.map((item) => <button key={item.index} type="button" className={active === item.index ? "active" : ""} aria-haspopup="menu" aria-expanded={active === item.index} onClick={(event) => void openMenu(item.index, event.currentTarget)} onKeyDown={(event) => {
        const buttons = [...menuRef.current!.querySelectorAll<HTMLButtonElement>("button")];
        const index = buttons.indexOf(event.currentTarget);
        const next = event.key === "ArrowRight" ? (index + 1) % buttons.length : event.key === "ArrowLeft" ? (index - 1 + buttons.length) % buttons.length : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : null;
        if (next !== null) { event.preventDefault(); buttons[next]?.focus(); }
        else if (event.key === "ArrowDown") { event.preventDefault(); void openMenu(item.index, event.currentTarget); }
        else if (event.key === "Escape") { event.preventDefault(); event.currentTarget.blur(); }
      }}>{item.label}</button>)}
    </nav>
    <button type="button" className="icon-button app-menu-button" aria-label={t("アプリメニュー")} title={t("アプリメニュー")} aria-haspopup="menu" onClick={() => void window.kohon.showAppMenu()}><AppIcon name="menu" size={16} /></button>
    {children}
    {platform === "darwin" ? null : <WindowControls />}
  </header>;
}
