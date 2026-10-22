import type { AppInfo, RecentProject } from "../shared/types.js";
import { AppIcon } from "./AppIcon.js";
import { useLocale } from "./LocaleContext.js";
import { WindowTitlebar } from "./WindowTitlebar.js";

export interface ProjectHomeProps {
  appInfo: AppInfo | null;
  recent: RecentProject[];
  busy: boolean;
  error: string | null;
  colorTheme: "default" | "light" | "dark";
  onToggleTheme: () => void;
  onCreate: () => void;
  onOpen: () => void;
  onOpenRecent: (root: string) => void;
  onSettings: () => void;
}

export function ProjectHome(props: ProjectHomeProps) {
  const { t, locale } = useLocale();
  const latest = props.recent[0];
  return <main className="project-home" aria-busy={props.busy}>
    <WindowTitlebar appInfo={props.appInfo}>
      <span className="home-app-title">KOHON</span>
      <div className="titlebar-drag-space" />
      <nav aria-label={t("作業環境")}><button onClick={props.onToggleTheme} title={t("配色を切り替える")}><AppIcon name={props.colorTheme === "dark" ? "sun" : "moon"} size={17} />{t("配色")}</button><button onClick={props.onSettings}><AppIcon name="settings" size={17} />{t("設定")}</button></nav>
    </WindowTitlebar>
    <div className="home-grid">
      <section className="home-library" aria-labelledby="library-title">
        <div className="library-heading"><h1 id="library-title">{t("作品")}</h1></div>
        {props.error !== null && <p className="home-error" role="alert">{props.error}</p>}
        {latest !== undefined ? <button className="resume-project" disabled={props.busy} onClick={() => props.onOpenRecent(latest.root)}>
          <span className="resume-label">{t("続きから書く")}</span>
          <strong>{latest.title}</strong><span className="resume-path" title={latest.root}>{latest.root}</span><span className="resume-arrow" aria-hidden="true">↗</span>
        </button> : <div className="library-empty"><h3>{t("作品がありません")}</h3><p>{t("新しい作品を作成するか、既存の作品を開いてください。")}</p></div>}
        <div className="library-actions"><button className={latest === undefined ? "library-primary" : "library-secondary"} disabled={props.busy} onClick={props.onCreate}><AppIcon name="add" size={18} />{t("新しい作品")}</button><button className="library-secondary" disabled={props.busy} onClick={props.onOpen}><AppIcon name="open" size={18} />{t("別の作品を開く")}</button></div>
        {props.recent.length > 1 && <div className="recent-projects"><h3>{t("最近の作品")}</h3>{props.recent.slice(1).map((item) => <button key={item.root} disabled={props.busy} onClick={() => props.onOpenRecent(item.root)} title={item.root}><AppIcon name="files" size={18} /><span>{item.title}<small>{new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", { month: "short", day: "numeric" }).format(new Date(item.lastOpenedAt))}</small></span><span aria-hidden="true">↗</span></button>)}</div>}
        <p className="library-hint" role="status">{props.busy ? t("作品を開いています…") : t("作品フォルダー内の kohon.json を選択して開けます。")}</p>
      </section>
    </div>
    <footer className="home-bottom"><span>KOHON {props.appInfo?.version ?? ""}</span></footer>
  </main>;
}
