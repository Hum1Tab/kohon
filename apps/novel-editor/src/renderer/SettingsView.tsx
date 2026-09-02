import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

import { automaticTextColor, contrastRatio, resolveManuscriptPalette, type ManuscriptTheme } from "../shared/editor-theme.js";
import { AppIcon, type IconName } from "./AppIcon.js";
import { useModalFocus } from "./useModalFocus.js";

import {
  COMMAND_DEFINITIONS,
  bindingFromKeyboardEvent,
  formatKeybinding,
  placeViewOnSide,
  type AppCommandId,
  type EditorPreferences,
  type UserSettings,
  type UserSettingsPatch
} from "../shared/settings.js";
import { defaultLayout, LAYOUT_LIMITS, type PhysicalSide, type SlotId, type ViewId } from "../shared/layout.js";
import type { AppInfo, ConnectionStatus, ProjectSettings, ProjectSummary, UpdateStatus } from "../shared/types.js";

export type SettingsCategory = "general" | "appearance" | "layout" | "editor" | "ai" | "accounts" | "keyboard" | "updates" | "about";
type EditorKey = keyof EditorPreferences;

interface SettingsViewProps {
  category: SettingsCategory;
  setCategory: (category: SettingsCategory) => void;
  settings: UserSettings;
  project: ProjectSummary | null;
  appInfo: AppInfo | null;
  connections: ConnectionStatus;
  updateStatus: UpdateStatus | null;
  onClose: () => void;
  onUpdateUser: (patch: UserSettingsPatch) => Promise<void>;
  onUpdateProject: (patch: ProjectSettings) => Promise<void>;
  onResetProjectSetting: (key: EditorKey) => Promise<void>;
  onRefreshConnections: () => Promise<void>;
  onLoginCodex: () => Promise<void>;
  onLogoutCodex: () => Promise<void>;
  onRefreshCodexModels: () => Promise<void>;
  onConnectOpenAI: (key: string) => Promise<void>;
  onDisconnectOpenAI: () => Promise<void>;
  onLoginGitHub: () => Promise<void>;
  onResetKeybindings: () => Promise<void>;
  onCheckUpdates: () => Promise<void>;
  onInstallUpdate: () => Promise<void>;
  onOpenUpdatePage: () => Promise<void>;
  onOpenExternal: (page: "chatgpt" | "openai-api-keys" | "github-cli" | "github-applications" | "latest-release") => Promise<void>;
}

const CATEGORIES: readonly { id: SettingsCategory; label: string; icon: IconName; search: string }[] = [
  { id: "general", label: "全般", icon: "settings", search: "全般 自動保存 起動" },
  { id: "appearance", label: "外観", icon: "sun", search: "外観 テーマ 色 アクセント 密度" },
  { id: "layout", label: "レイアウト", icon: "layout", search: "レイアウト サイドバー インスペクター パネル 章 アウトライン レンズ 検索 履歴 左 右 下 Zen" },
  { id: "editor", label: "エディター", icon: "edit", search: "エディター 縦書き 横書き フォント テーマ 文字 行間 幅" },
  { id: "ai", label: "AI", icon: "lens", search: "AI OpenAI ChatGPT API model レンズ" },
  { id: "accounts", label: "アカウント", icon: "settings", search: "アカウント ChatGPT OpenAI GitHub ログイン 認証" },
  { id: "keyboard", label: "キーボード", icon: "settings", search: "キーボード ショートカット キー割り当て" },
  { id: "updates", label: "更新", icon: "history", search: "更新 アップデート install download version" },
  { id: "about", label: "情報", icon: "check", search: "情報 version license privacy OSS" }
] as const;

const EMPTY_CONNECTIONS: ConnectionStatus = {
  codex: { installed: false, connected: false, state: "unavailable", message: "Codex実行環境を確認していません。", email: null, planType: null, models: [], modelsUpdatedAt: null, usedPercent: null, resetsAt: null },
  openai: { connected: false, state: "disconnected", storage: "none", message: "OpenAI APIは未接続です。", verifiedAt: null },
  github: { cliInstalled: false, connected: false, state: "unavailable", message: "GitHub CLIの状態を確認していません。" }
};

function projectValue(project: ProjectSummary | null, key: EditorKey): unknown {
  return project?.manifest.settings[key];
}

function settingMatches(query: string, ...terms: string[]): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  return normalized.length === 0 || terms.join(" ").toLocaleLowerCase().includes(normalized);
}

const VIEW_LABELS: Record<ViewId, string> = { outline: "章アウトライン", lens: "編集レンズ", search: "作品内検索", history: "履歴" };

function viewSlot(layout: UserSettings["layout"], view: ViewId): SlotId {
  if (layout.slots.primary.views.includes(view)) return "primary";
  if (layout.slots.secondary.views.includes(view)) return "secondary";
  return "bottom";
}

function viewSide(layout: UserSettings["layout"], view: ViewId): PhysicalSide | "bottom" {
  const slot = viewSlot(layout, view);
  if (slot === "bottom") return "bottom";
  if (slot === "primary") return layout.primarySide;
  return layout.secondarySameSide ? layout.primarySide : layout.primarySide === "left" ? "right" : "left";
}

function StatusBadge({ state, children }: { state: "ok" | "warn" | "muted"; children: ReactNode }): ReactNode {
  return <span className={`settings-status ${state}`}>{children}</span>;
}

export function SettingsView(props: SettingsViewProps): ReactNode {
  const modal = useModalFocus<HTMLDivElement>(props.onClose);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"user" | "workspace">("user");
  const [openAIKey, setOpenAIKey] = useState("");
  const [modelDraft, setModelDraft] = useState(props.settings.ai.openaiModel);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<AppCommandId | null>(null);

  useEffect(() => { setModelDraft(props.settings.ai.openaiModel); }, [props.settings.ai.openaiModel]);
  useEffect(() => { void props.onRefreshConnections(); }, []);
  useEffect(() => () => { void window.kohon.setKeybindingRecording(false); }, []);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => { if (event.key === "Escape" && recording === null) props.onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [props.onClose, recording]);

  const visibleCategories = useMemo(() => CATEGORIES.filter((item) => settingMatches(query, item.search)), [query]);
  const connections = props.connections ?? EMPTY_CONNECTIONS;
  const updateInProgress = props.updateStatus?.state === "downloading" || props.updateStatus?.state === "verifying" || props.updateStatus?.state === "installing";
  const canInstallUpdate = (props.updateStatus?.state === "available" && props.updateStatus.downloadUrl !== null) || props.updateStatus?.state === "ready";

  useEffect(() => {
    if (visibleCategories.length > 0 && !visibleCategories.some((item) => item.id === props.category)) props.setCategory(visibleCategories[0]!.id);
  }, [props.category, props.setCategory, visibleCategories]);

  const run = async (name: string, action: () => Promise<void>): Promise<void> => {
    setBusy(name); setError(null);
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message.replace(/^Error invoking remote method '[^']+': Error:\s*/u, "") : String(cause)); }
    finally { setBusy(null); }
  };

  const setEditor = async <K extends EditorKey>(key: K, value: EditorPreferences[K]): Promise<void> => {
    if (scope === "workspace" && props.project !== null) await props.onUpdateProject({ [key]: value });
    else await props.onUpdateUser({ editor: { [key]: value } });
  };

  const editorValue = <K extends EditorKey>(key: K): EditorPreferences[K] => {
    const workspace = projectValue(props.project, key);
    if (scope === "workspace" && workspace !== undefined) return workspace as EditorPreferences[K];
    return props.settings.editor[key];
  };

  const customPalette = resolveManuscriptPalette("custom", editorValue("canvasBackground"), editorValue("canvasText"));
  const customContrast = contrastRatio(customPalette.background, customPalette.text);

  const beginRecording = (command: AppCommandId): void => {
    setRecording(command); setError(null); void window.kohon.setKeybindingRecording(true);
  };

  const finishRecording = (): void => {
    setRecording(null); void window.kohon.setKeybindingRecording(false);
  };

  const recordKey = (event: ReactKeyboardEvent<HTMLButtonElement>, command: AppCommandId): void => {
    event.preventDefault(); event.stopPropagation();
    if (event.key === "Escape") { finishRecording(); return; }
    if (event.key === "Backspace" || event.key === "Delete") {
      void run("keybinding", async () => { await props.onUpdateUser({ keybindings: { [command]: "" } }); finishRecording(); });
      return;
    }
    const binding = bindingFromKeyboardEvent(event.nativeEvent);
    if (binding === null) { setError("Ctrl / ⌘ またはAltを含むショートカットを入力してください。編集用の標準キーは上書きできません。"); return; }
    const conflict = COMMAND_DEFINITIONS.find((item) => item.id !== command && props.settings.keybindings[item.id] === binding);
    if (conflict !== undefined) { setError(`${formatKeybinding(binding)} は「${conflict.label}」で使用中です。`); return; }
    void run("keybinding", async () => { await props.onUpdateUser({ keybindings: { [command]: binding } }); finishRecording(); });
  };

  const editorPanel = <>
    <div className="settings-scope-tabs" role="tablist" aria-label="設定の適用範囲">
      <button className={scope === "user" ? "active" : ""} onClick={() => setScope("user")}>ユーザー</button>
      <button disabled={props.project === null} className={scope === "workspace" ? "active" : ""} onClick={() => setScope("workspace")}>この作品</button>
    </div>
    <p className="settings-lead">{scope === "user" ? "新しい作品を含むすべての作品の既定値です。" : `「${props.project?.manifest.title ?? "作品"}」だけの上書きです。`}</p>
    <SettingRow title="組方向" description="本文を横書きまたは日本語の縦書きで表示します。" inherited={scope === "workspace" && projectValue(props.project, "writingMode") === undefined} onReset={scope === "workspace" && projectValue(props.project, "writingMode") !== undefined ? () => props.onResetProjectSetting("writingMode") : undefined}>
      <select value={editorValue("writingMode")} onChange={(event) => void setEditor("writingMode", event.target.value as EditorPreferences["writingMode"])}><option value="horizontal">横書き</option><option value="vertical-rl">縦書き</option></select>
    </SettingRow>
    <SettingRow title="原稿の配色" description="背景と文字を読みやすい組み合わせで切り替えます。原稿本文には記録しません。" inherited={scope === "workspace" && projectValue(props.project, "theme") === undefined} onReset={scope === "workspace" && projectValue(props.project, "theme") !== undefined ? () => props.onResetProjectSetting("theme") : undefined}>
      <select value={editorValue("theme")} onChange={(event) => void setEditor("theme", event.target.value as ManuscriptTheme)}><option value="paper">白い紙</option><option value="sepia">生成り</option><option value="gray">グレー</option><option value="dark">黒</option><option value="custom">カスタム</option></select>
    </SettingRow>
    {editorValue("theme") === "custom" && <>
      <SettingRow title="原稿の背景色" description={customPalette.background} inherited={scope === "workspace" && projectValue(props.project, "canvasBackground") === undefined} onReset={scope === "workspace" && projectValue(props.project, "canvasBackground") !== undefined ? () => props.onResetProjectSetting("canvasBackground") : undefined}>
        <input aria-label="原稿の背景色" type="color" value={editorValue("canvasBackground")} onChange={(event) => void setEditor("canvasBackground", event.target.value)} />
      </SettingRow>
      <SettingRow title="本文の文字色" description={editorValue("canvasText") === null ? `背景に合わせて自動（${customPalette.text}）` : `${customPalette.text} · コントラスト ${customContrast.toFixed(1)}:1`} inherited={scope === "workspace" && projectValue(props.project, "canvasText") === undefined} onReset={scope === "workspace" && projectValue(props.project, "canvasText") !== undefined ? () => props.onResetProjectSetting("canvasText") : undefined}>
        <div className="color-setting"><label className="toggle"><input type="checkbox" checked={editorValue("canvasText") === null} onChange={(event) => void setEditor("canvasText", event.target.checked ? null : automaticTextColor(editorValue("canvasBackground")))} />自動</label><input aria-label="本文の文字色" type="color" disabled={editorValue("canvasText") === null} value={customPalette.text} onChange={(event) => void setEditor("canvasText", event.target.value)} /></div>
      </SettingRow>
      <div className="manuscript-color-preview" style={{ color: customPalette.text, background: customPalette.background, borderColor: customPalette.line }}><span>原稿プレビュー</span><p>雨は、古い図書館の窓を静かに叩いていた。</p>{customContrast < 4.5 && <strong>文字が読みにくい配色です。自動をおすすめします。</strong>}</div>
    </>}
    <SettingRow title="本文フォント" description="端末にあるフォントだけを使用します。" inherited={scope === "workspace" && projectValue(props.project, "font") === undefined} onReset={scope === "workspace" && projectValue(props.project, "font") !== undefined ? () => props.onResetProjectSetting("font") : undefined}>
      <select value={editorValue("font")} onChange={(event) => void setEditor("font", event.target.value)}><option value={'"Yu Mincho", "Hiragino Mincho ProN", serif'}>明朝体</option><option value={'"Yu Gothic UI", "Hiragino Sans", sans-serif'}>ゴシック体</option><option value={'ui-monospace, "BIZ UDゴシック", monospace'}>等幅</option></select>
    </SettingRow>
    <SettingRow title="文字サイズ" description={`${editorValue("fontSize")} px`} inherited={scope === "workspace" && projectValue(props.project, "fontSize") === undefined} onReset={scope === "workspace" && projectValue(props.project, "fontSize") !== undefined ? () => props.onResetProjectSetting("fontSize") : undefined}>
      <input aria-label="文字サイズ" type="range" min="12" max="36" value={editorValue("fontSize")} onChange={(event) => void setEditor("fontSize", Number(event.target.value))} />
    </SettingRow>
    <SettingRow title="行間" description={editorValue("lineHeight").toFixed(1)} inherited={scope === "workspace" && projectValue(props.project, "lineHeight") === undefined} onReset={scope === "workspace" && projectValue(props.project, "lineHeight") !== undefined ? () => props.onResetProjectSetting("lineHeight") : undefined}>
      <input aria-label="行間" type="range" min="1.2" max="3" step="0.1" value={editorValue("lineHeight")} onChange={(event) => void setEditor("lineHeight", Number(event.target.value))} />
    </SettingRow>
    <SettingRow title="本文幅" description={`${editorValue("width")} px`} inherited={scope === "workspace" && projectValue(props.project, "width") === undefined} onReset={scope === "workspace" && projectValue(props.project, "width") !== undefined ? () => props.onResetProjectSetting("width") : undefined}>
      <input aria-label="本文幅" type="range" min="480" max="1200" step="20" value={editorValue("width")} onChange={(event) => void setEditor("width", Number(event.target.value))} />
    </SettingRow>
  </>;

  const codex = connections.codex;
  const codexCard = <div className="connection-card">
    <div className="connection-heading"><div><h3>ChatGPT / Codex</h3><p>{codex.message}</p></div><StatusBadge state={codex.connected ? "ok" : codex.state === "error" || codex.state === "unavailable" ? "warn" : "muted"}>{codex.connected ? codex.planType ?? "接続済み" : codex.state === "authenticating" ? "認証中" : "未接続"}</StatusBadge></div>
    {codex.connected ? <>
      <p className="settings-note">{codex.email ?? "ChatGPTアカウント"}{codex.usedPercent === null ? "" : ` · 現在の利用枠 ${Math.round(codex.usedPercent)}% 使用`}</p>
      <div className="settings-actions"><button className="secondary" disabled={busy !== null} onClick={() => void run("codex-models", props.onRefreshCodexModels)}>{busy === "codex-models" ? "更新中…" : "モデル一覧を更新"}</button><button className="text-button" disabled={busy !== null} onClick={() => { if (window.confirm("ChatGPTからログアウトしますか？ Codex CLIのログイン状態にも影響する場合があります。")) void run("codex-logout", props.onLogoutCodex); }}>ログアウト</button></div>
    </> : <button className="primary" disabled={busy !== null || !codex.installed} onClick={() => void run("codex-login", props.onLoginCodex)}>{busy === "codex-login" ? "ブラウザで認証中…" : "ChatGPTでログイン"}</button>}
    {!codex.installed && <button className="secondary" disabled={busy !== null} onClick={() => void run("codex-check", props.onRefreshConnections)}>Codex実行環境を再確認</button>}
    <p className="settings-note">公式Codex App Serverのbrowser flowを使用します。AIレンズの実行はChatGPTプランのCodex利用枠へ計上され、認証tokenをKOHONのrendererや作品ファイルへ渡しません。</p>
  </div>;

  return <div ref={modal.ref} className="settings-view" role="dialog" aria-modal="true" aria-labelledby="settings-title" onKeyDown={modal.onKeyDown}>
    <header className="settings-header">
      <button className="settings-back" onClick={props.onClose} aria-label="設定を閉じる">←</button>
      <div><span className="eyebrow">PREFERENCES</span><h1 id="settings-title">設定</h1></div>
      <input className="settings-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="設定を検索" aria-label="設定を検索" />
      <button className="settings-close" onClick={props.onClose} aria-label="設定を閉じる">×</button>
    </header>
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="設定カテゴリ">
        {visibleCategories.map((item) => <button key={item.id} className={props.category === item.id ? "active" : ""} onClick={() => props.setCategory(item.id)}><span><AppIcon name={item.icon} size={16} /></span>{item.label}</button>)}
        {visibleCategories.length === 0 && <p>一致する設定がありません。</p>}
      </nav>
      <main className="settings-main">
        {error !== null && <div className="settings-error" role="alert">{error}<button aria-label="エラーを閉じる" onClick={() => setError(null)}>×</button></div>}
        {props.category === "general" && <SettingsSection eyebrow="APPLICATION" title="全般" lead="アプリ全体の動作を設定します。作品本文には保存されません。">
          <SettingRow title="自動保存" description="入力を止めてから保存するまでの時間です。IME変換中は保存しません。"><select value={props.settings.general.autoSaveDelayMs} onChange={(event) => void props.onUpdateUser({ general: { autoSaveDelayMs: Number(event.target.value) } })}><option value="400">0.4秒</option><option value="800">0.8秒</option><option value="1500">1.5秒</option><option value="3000">3秒</option></select></SettingRow>
          <SettingRow title="設定の保存場所" description="ユーザー設定はOSのKOHON設定フォルダーに保存します。APIキーとGitHub tokenは含みません。"><StatusBadge state="ok">ローカルのみ</StatusBadge></SettingRow>
        </SettingsSection>}
        {props.category === "appearance" && <SettingsSection eyebrow="APPEARANCE" title="外観" lead="作業UIの色と表示密度を設定します。原稿キャンバスの紙色はエディター設定で独立して選べます。">
          <SettingRow title="カラーテーマ" description="ブランド既定、純白、VS Code風の黒を明確に分けます。"><select value={props.settings.appearance.colorTheme} onChange={(event) => void props.onUpdateUser({ appearance: { colorTheme: event.target.value as "system" | "default" | "light" | "dark" } })}><option value="default">既定（森と紙）</option><option value="light">ホワイト</option><option value="dark">ダーク</option><option value="system">OSに合わせる</option></select></SettingRow>
          <SettingRow title="アクセントカラー" description="アイコン由来の森・金・インクから選びます。"><select value={props.settings.appearance.accent} onChange={(event) => void props.onUpdateUser({ appearance: { accent: event.target.value as "forest" | "gold" | "ink" } })}><option value="forest">森</option><option value="gold">金</option><option value="ink">インク</option></select></SettingRow>
          <SettingRow title="表示密度" description="各パネルの余白とコントロールの密度を調整します。"><select value={props.settings.appearance.density} onChange={(event) => void props.onUpdateUser({ appearance: { density: event.target.value as "comfortable" | "compact" } })}><option value="comfortable">標準</option><option value="compact">コンパクト</option></select></SettingRow>
        </SettingsSection>}
        {props.category === "layout" && <SettingsSection eyebrow="LAYOUT" title="レイアウト" lead="タブや左端のアイコンをドラッグして移動できます。ここでは同じ配置を選択操作で設定できます。">
          <SettingRow title="メインサイドバー" description="章アウトラインの基準辺です。"><select value={props.settings.layout.primarySide} onChange={(event) => void props.onUpdateUser({ layout: { primarySide: event.target.value as PhysicalSide } })}><option value="left">左</option><option value="right">右</option></select></SettingRow>
          <SettingRow title="アクティビティバー" description="ビュー切り替えバーを表示し、左右を選べます。"><div className="settings-checks"><label className="toggle"><input type="checkbox" checked={props.settings.layout.activityBarVisible} onChange={(event) => void props.onUpdateUser({ layout: { activityBarVisible: event.target.checked } })} />表示</label><select value={props.settings.layout.activityBar} onChange={(event) => void props.onUpdateUser({ layout: { activityBar: event.target.value as PhysicalSide } })}><option value="left">左</option><option value="right">右</option></select></div></SettingRow>
          {(["outline", "lens", "search", "history"] as const).map((view) => <SettingRow key={view} title={VIEW_LABELS[view]} description="ビュー単位で左・右・下へ配置します。"><select aria-label={`${VIEW_LABELS[view]}の位置`} value={viewSide(props.settings.layout, view)} onChange={(event) => void props.onUpdateUser({ layout: placeViewOnSide(props.settings.layout, view, event.target.value as PhysicalSide | "bottom") })}><option value="left">左</option><option value="right">右</option><option value="bottom">下</option></select></SettingRow>)}
          <SettingRow title="表示するパネル" description="スロットごとの表示を切り替えます。ビューの所属は保持されます。"><div className="settings-checks"><label className="toggle"><input type="checkbox" checked={props.settings.layout.slots.primary.visible} onChange={(event) => void props.onUpdateUser({ layout: { slots: { primary: { visible: event.target.checked } } } })} />章アウトライン</label><label className="toggle"><input type="checkbox" checked={props.settings.layout.slots.secondary.visible} onChange={(event) => void props.onUpdateUser({ layout: { slots: { secondary: { visible: event.target.checked } } } })} />左右パネル</label><label className="toggle"><input type="checkbox" checked={props.settings.layout.slots.bottom.visible} onChange={(event) => void props.onUpdateUser({ layout: { slots: { bottom: { visible: event.target.checked } } } })} />下部パネル</label></div></SettingRow>
          <SettingRow title="サイドバー幅" description={`${props.settings.layout.slots.primary.size} px`}><input aria-label="サイドバー幅" type="range" min={LAYOUT_LIMITS.primary.min} max={LAYOUT_LIMITS.primary.max} step="4" value={props.settings.layout.slots.primary.size} onChange={(event) => void props.onUpdateUser({ layout: { slots: { primary: { size: Number(event.target.value) } } } })} /></SettingRow>
          <SettingRow title="インスペクター幅" description={`${props.settings.layout.slots.secondary.size} px`}><input aria-label="インスペクター幅" type="range" min={LAYOUT_LIMITS.secondary.min} max={LAYOUT_LIMITS.secondary.max} step="10" value={props.settings.layout.slots.secondary.size} onChange={(event) => void props.onUpdateUser({ layout: { slots: { secondary: { size: Number(event.target.value) } } } })} /></SettingRow>
          <SettingRow title="下部パネルの高さ" description={`${props.settings.layout.slots.bottom.size} px`}><input aria-label="下部パネルの高さ" type="range" min={LAYOUT_LIMITS.bottom.min} max={LAYOUT_LIMITS.bottom.max} step="10" value={props.settings.layout.slots.bottom.size} onChange={(event) => void props.onUpdateUser({ layout: { slots: { bottom: { size: Number(event.target.value) } } } })} /></SettingRow>
          <SettingRow title="下部パネルの幅" description="本文列だけ、または左右パネルを含む全幅で表示します。"><select value={props.settings.layout.bottomPanelAlignment} onChange={(event) => void props.onUpdateUser({ layout: { bottomPanelAlignment: event.target.value as "editor" | "justify" } })}><option value="editor">本文幅</option><option value="justify">全幅</option></select></SettingRow>
          <SettingRow title="下部パネルの最大化" description="下部ビューだけを作業領域いっぱいに表示します。"><label className="toggle"><input type="checkbox" checked={props.settings.layout.bottomPanelMaximized} disabled={!props.settings.layout.slots.bottom.visible} onChange={(event) => void props.onUpdateUser({ layout: { bottomPanelMaximized: event.target.checked } })} />{props.settings.layout.bottomPanelMaximized ? "最大" : "通常"}</label></SettingRow>
          <SettingRow title="集中モード（Zen）" description="サイドバーとインスペクターを隠し、本文に集中します。"><label className="toggle"><input type="checkbox" checked={props.settings.layout.zenMode} onChange={(event) => void props.onUpdateUser({ layout: { zenMode: event.target.checked } })} />{props.settings.layout.zenMode ? "オン" : "オフ"}</label></SettingRow>
          <div className="settings-actions"><button className="secondary" onClick={() => void props.onUpdateUser({ layout: defaultLayout() })}>既定レイアウトへ戻す</button></div>
        </SettingsSection>}
        {props.category === "editor" && <SettingsSection eyebrow="EDITOR" title="エディター" lead="VS Codeと同じように、ユーザー既定値と作品固有の上書きを分けます。">{editorPanel}</SettingsSection>}
        {props.category === "ai" && <SettingsSection eyebrow="AI CONNECTION" title="AIレンズ" lead="ChatGPTのCodex利用枠、または任意のOpenAI APIキーで、選んだ原稿範囲だけを読みます。">
          <SettingRow title="既定の接続" description="新しく開いたレンズで最初に選ばれる接続です。"><select value={props.settings.ai.defaultProvider} onChange={(event) => void props.onUpdateUser({ ai: { defaultProvider: event.target.value as "mock" | "codex" | "openai" } })}><option value="codex">ChatGPT（Codex枠）</option><option value="mock">Offline Mock（通信なし）</option><option value="openai">OpenAI API（従量課金）</option></select></SettingRow>
          <SettingRow title="Codexモデル" description="ログイン中のアカウントで現在利用できるモデルです。一覧は接続時と設定表示時に自動更新されます。"><select value={props.settings.ai.codexModel} disabled={codex.models.length === 0} onChange={(event) => void props.onUpdateUser({ ai: { codexModel: event.target.value } })}>{codex.models.length === 0 && <option value={props.settings.ai.codexModel}>{props.settings.ai.codexModel}</option>}{codex.models.map((model) => <option key={model.id} value={model.id}>{model.displayName}{model.id === "gpt-5.6-luna" ? "（初期・節約）" : ""}</option>)}</select></SettingRow>
          {codexCard}
          <h3>APIキー方式（任意）</h3>
          <SettingRow title="OpenAI model ID" description="利用者のAPI projectで利用できる正確なmodel IDを指定します。"><input value={modelDraft} onChange={(event) => setModelDraft(event.target.value)} onBlur={() => { if (modelDraft !== props.settings.ai.openaiModel) void props.onUpdateUser({ ai: { openaiModel: modelDraft } }); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></SettingRow>
          <div className="connection-card">
            <div className="connection-heading"><div><h3>OpenAI API</h3><p>{connections.openai.message}</p></div><StatusBadge state={connections.openai.connected ? "ok" : connections.openai.state === "error" ? "warn" : "muted"}>{connections.openai.connected ? connections.openai.storage === "os" ? "OSへ保存済み" : "接続済み" : "未接続"}</StatusBadge></div>
            {!connections.openai.connected ? <div className="connection-form"><input type="password" autoComplete="off" spellCheck={false} value={openAIKey} onChange={(event) => setOpenAIKey(event.target.value)} placeholder="OpenAI API key" aria-label="OpenAI API key" /><button className="primary" disabled={busy !== null || openAIKey.trim().length < 20} onClick={() => void run("openai", async () => { await props.onConnectOpenAI(openAIKey); setOpenAIKey(""); })}>APIキーを接続して確認</button></div> : <button className="secondary" disabled={busy !== null} onClick={() => void run("openai", props.onDisconnectOpenAI)}>接続と保存済みキーを削除</button>}
            <div className="connection-links"><button onClick={() => void props.onOpenExternal("openai-api-keys")}>APIキーを作成・管理</button></div>
            <p className="settings-note">このAPIキー方式を選んだ場合だけAPI Platformの従量課金が適用されます。確認後のキーはrendererから消去し、利用可能な端末ではOSの暗号化ストレージへ保存します。</p>
          </div>
        </SettingsSection>}
        {props.category === "accounts" && <SettingsSection eyebrow="ACCOUNTS" title="アカウント" lead="認証情報はKOHONのサーバーを経由しません。">
          {codexCard}
          <div className="connection-card">
            <div className="connection-heading"><div><h3>GitHub</h3><p>{connections.github.message}</p></div><StatusBadge state={connections.github.connected ? "ok" : connections.github.state === "error" ? "warn" : "muted"}>{connections.github.connected ? "接続済み" : connections.github.cliInstalled ? "未ログイン" : "CLIなし"}</StatusBadge></div>
            {!connections.github.connected && connections.github.cliInstalled && <button className="primary" disabled={busy !== null} onClick={() => void run("github", props.onLoginGitHub)}>{busy === "github" ? "ブラウザで確認中…" : "GitHubへログイン"}</button>}
            {!connections.github.cliInstalled && <button className="secondary" onClick={() => void props.onOpenExternal("github-cli")}>GitHub CLIをinstall</button>}
            <div className="connection-links"><button onClick={() => void props.onRefreshConnections()}>状態を再確認</button><button onClick={() => void props.onOpenExternal("github-applications")}>GitHub側で認証を管理</button></div>
            <p className="settings-note">公式GitHub CLIのbrowser flowを使用します。tokenはOS credential storeまたはGitHub CLIが管理し、KOHONはtoken値を読みません。</p>
          </div>
        </SettingsSection>}
        {props.category === "keyboard" && <SettingsSection eyebrow="KEYBOARD" title="キーボード ショートカット" lead="キー割り当てをクリックし、使いたい組み合わせを押します。Backspaceで未設定にできます。">
          <div className="keybinding-list">{COMMAND_DEFINITIONS.map((command) => <div className="keybinding-row" key={command.id}><div><small>{command.category}</small><b>{command.label}</b><code>{command.id}</code></div><button autoFocus={recording === command.id} className={recording === command.id ? "recording" : ""} onClick={() => beginRecording(command.id)} onKeyDown={(event) => { if (recording === command.id) recordKey(event, command.id); }}>{recording === command.id ? "キーを入力…" : formatKeybinding(props.settings.keybindings[command.id])}</button><button className="reset-key" title="既定値へ戻す" onClick={() => void run("keybinding", async () => { await props.onUpdateUser({ keybindings: { [command.id]: command.defaultBinding } }); finishRecording(); })}>↺</button></div>)}</div>
          <button className="secondary" disabled={busy !== null} onClick={() => { if (window.confirm("すべてのショートカットを既定値へ戻しますか？")) void run("reset-keys", async () => { await props.onResetKeybindings(); finishRecording(); }); }}>すべて既定値へ戻す</button>
        </SettingsSection>}
        {props.category === "updates" && <SettingsSection eyebrow="UPDATES" title="更新" lead="GitHub Releasesを直接確認します。運営者サーバーやGitHub tokenは不要です。">
          <SettingRow title="起動時に確認" description="packaged版の起動後にGitHubへ1回だけ最新版を問い合わせます。原稿や設定は送りません。"><label className="toggle"><input type="checkbox" checked={props.settings.updates.checkOnStartup} onChange={(event) => void props.onUpdateUser({ updates: { checkOnStartup: event.target.checked } })} />{props.settings.updates.checkOnStartup ? "オン" : "オフ"}</label></SettingRow>
          <div className="update-card"><div><small>現在</small><strong>v{props.updateStatus?.currentVersion ?? props.appInfo?.version ?? "-"}</strong></div><span>→</span><div><small>最新版</small><strong>{props.updateStatus?.latestVersion === null || props.updateStatus === null ? "未確認" : `v${props.updateStatus.latestVersion}`}</strong></div></div>
          <p className="settings-note">{props.updateStatus?.message ?? "更新はまだ確認していません。"}</p>
          {props.updateStatus?.progress !== null && props.updateStatus?.progress !== undefined && <div className="update-progress" aria-label={`更新 ${props.updateStatus.progress}%`}><span style={{ width: `${props.updateStatus.progress}%` }} /></div>}
          <div className="settings-actions"><button className="primary" disabled={busy !== null || props.updateStatus?.state === "checking" || updateInProgress} onClick={() => void run("updates", props.onCheckUpdates)}>{props.updateStatus?.state === "checking" ? "確認中…" : "今すぐ確認"}</button><button className="secondary" disabled={busy !== null || updateInProgress || !canInstallUpdate} onClick={() => void run("install", props.onInstallUpdate)}>{props.updateStatus?.state === "downloading" ? `ダウンロード中 ${props.updateStatus.progress ?? 0}%` : props.updateStatus?.state === "verifying" ? "SHA-256を確認中…" : props.updateStatus?.state === "installing" ? "更新を適用中…" : "ダウンロードして更新"}</button><button className="text-button" disabled={updateInProgress} onClick={() => void props.onOpenUpdatePage()}>Releaseページ</button></div>
          {props.appInfo?.platform === "win32" && <p className="settings-note">Windowsでは確認後にアプリを閉じ、画面を出さずに更新して自動で再起動します。</p>}
          <p className="settings-note">作品フォルダーはアプリの外にあるため、更新・再install・uninstallで原稿を削除しません。ダウンロードはGitHub ReleaseのSHA-256と照合します。preview版は未署名のため、起動後のOS警告を確認してください。</p>
        </SettingsSection>}
        {props.category === "about" && <SettingsSection eyebrow="ABOUT" title="KOHON" lead="作者が書くことを中心に置く、ローカル優先のOSS小説制作環境です。">
          <div className="about-grid"><span>Version</span><code>{props.appInfo?.version ?? "-"}</code><span>Platform</span><code>{props.appInfo?.platform ?? "desktop"}</code><span>License</span><code>Apache-2.0</code><span>データ</span><code>Markdown / local-first</code></div>
          <button className="secondary" onClick={() => void props.onOpenExternal("latest-release")}>GitHub Releases</button>
        </SettingsSection>}
      </main>
    </div>
  </div>;
}

function SettingsSection({ eyebrow, title, lead, children }: { eyebrow: string; title: string; lead: string; children: ReactNode }): ReactNode {
  return <section className="settings-section"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p className="settings-lead">{lead}</p><div className="settings-rows">{children}</div></section>;
}

function SettingRow({ title, description, children, inherited = false, onReset }: { title: string; description: string; children: ReactNode; inherited?: boolean; onReset?: (() => Promise<void>) | undefined }): ReactNode {
  return <div className="setting-row"><div><div className="setting-title"><h3>{title}</h3>{inherited && <span>ユーザー設定を使用中</span>}</div><p>{description}</p>{onReset !== undefined && <button className="setting-reset" onClick={() => void onReset()}>ユーザー設定に戻す</button>}</div><div className="setting-control">{children}</div></div>;
}
