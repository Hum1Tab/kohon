import { useEffect, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { useLocale } from "./LocaleContext.js";

/** Native-looking window buttons for the undecorated Windows and Linux window. */
export function WindowControls(): ReactNode {
  const { t } = useLocale();
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let live = true;
    let unlisten: (() => void) | null = null;
    void appWindow.isMaximized().then((value) => { if (live) setMaximized(value); }).catch(() => undefined);
    void appWindow.onResized(() => {
      void appWindow.isMaximized().then((value) => { if (live) setMaximized(value); }).catch(() => undefined);
    }).then((stop) => {
      if (live) unlisten = stop;
      else stop();
    }).catch(() => undefined);
    return () => {
      live = false;
      unlisten?.();
    };
  }, []);
  return <div className="window-controls">
    <button type="button" className="window-control" aria-label={t("最小化")} title={t("最小化")} onClick={() => void getCurrentWindow().minimize()}>
      <svg aria-hidden="true" viewBox="0 0 10 10"><path d="M2 5.5h6" /></svg>
    </button>
    <button type="button" className="window-control" aria-label={maximized ? t("元のサイズに戻す") : t("最大化")} title={maximized ? t("元のサイズに戻す") : t("最大化")} onClick={() => void getCurrentWindow().toggleMaximize()}>
      {maximized
        ? <svg aria-hidden="true" viewBox="0 0 10 10"><path d="M3 3V1.5h5.5V7H7M1.5 3H7v5.5H1.5z" /></svg>
        : <svg aria-hidden="true" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" /></svg>}
    </button>
    <button type="button" className="window-control window-close" aria-label={t("閉じる")} title={t("閉じる")} onClick={() => void getCurrentWindow().close()}>
      <svg aria-hidden="true" viewBox="0 0 10 10"><path d="m2 2 6 6M8 2 2 8" /></svg>
    </button>
  </div>;
}
