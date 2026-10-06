import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

import { automaticTextColor, contrastRatio, resolveManuscriptPalette, type ManuscriptTheme } from "../shared/editor-theme.js";
import { AppIcon, type IconName } from "./AppIcon.js";
import { useLocale } from "./LocaleContext.js";
import { useModalFocus } from "./useModalFocus.js";

import {
  COMMAND_DEFINITIONS,
  bindingFromKeyboardEvent,
  dockView,
  findViewNode,
  formatKeybinding,
  type AppCommandId,
  type EditorPreferences,
  type UserSettings,
  type UserSettingsPatch
} from "../shared/settings.js";
import { commandCategory, commandLabel } from "../shared/locale.js";
import { defaultLayout, type DockEditorNode, type DockNode, type DockTabsNode, type DockZone, type LayoutPatch, type PhysicalSide, type ViewId } from "../shared/layout.js";
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
  { id: "general", label: "全般", icon: "settings", search: "全般 General 自動保存 Auto Save 起動 Startup 言語 Language" },
  { id: "appearance", label: "外観", icon: "sun", search: "外観 Appearance テーマ Theme 色 Color アクセント Accent 密度 Density" },
  { id: "layout", label: "レイアウト", icon: "layout", search: "レイアウト Layout サイドバー Sidebar インスペクター Inspector パネル Panel 章 Chapter アウトライン Outline レンズ Lens 検索 Search 履歴 History 左 Left 右 Right 下 Bottom Zen" },
  { id: "editor", label: "エディター", icon: "edit", search: "エディター Editor 縦書き Vertical 横書き Horizontal フォント Font テーマ Theme 文字 Text 行間 Line 幅 Width" },
  { id: "ai", label: "AI", icon: "lens", search: "AI OpenAI ChatGPT API model レンズ Lens" },
  { id: "accounts", label: "アカウント", icon: "settings", search: "アカウント Account ChatGPT OpenAI GitHub ログイン Login 認証 Authentication" },
  { id: "keyboard", label: "キーボード", icon: "settings", search: "キーボード Keyboard ショートカット Shortcut キー割り当て Keybinding" },
  { id: "updates", label: "更新", icon: "history", search: "更新 Updates アップデート Update install download version" },
  { id: "about", label: "情報", icon: "check", search: "情報 About version license privacy OSS" }
] as const;

const EMPTY_CONNECTIONS: ConnectionStatus = {
  codex: { installed: false, connected: false, state: "unavailable", message: "Codex実行環境を確認していません。", email: null, planType: null, models: [], modelsUpdatedAt: null, usedPercent: null, resetsAt: null },
  openai: { connected: false, state: "disconnected", storage: "none", message: "OpenAI APIは未接続です。", verifiedAt: null },
  github: { cliInstalled: false, connected: false, state: "unavailable", message: "GitHub CLIの状態を確認していません。" }
};

function projectValue(project: ProjectSummary | null, key: EditorKey): unknown {
  return project?.manifest.settings[key];
}

function settingMatches(query: string, locale: "ja" | "en", ...terms: string[]): boolean {
  const language = locale === "ja" ? "ja-JP" : "en-US";
  const words = query.trim().toLocaleLowerCase(language).split(/\s+/u).filter(Boolean);
  const haystack = terms.join(" ").toLocaleLowerCase(language);
  return words.length === 0 || words.every((word) => haystack.includes(word));
}

const VIEW_LABELS: Record<ViewId, string> = { outline: "章アウトライン", lens: "編集レンズ", search: "作品内検索", history: "履歴", map: "物語マップ" };

function tabGroups(node: DockNode): DockTabsNode[] {
  if (node.type === "tabs") return [node];
  if (node.type === "split") return node.children.flatMap(tabGroups);
  return [];
}

function editorNode(node: DockNode): DockEditorNode | null {
  if (node.type === "editor") return node;
  if (node.type === "split") return node.children.map(editorNode).find((child): child is DockEditorNode => child !== null) ?? null;
  return null;
}

function StatusBadge({ state, children }: { state: "ok" | "warn" | "muted"; children: ReactNode }): ReactNode {
  return <span className={`settings-status ${state}`}>{children}</span>;
}

export function SettingsView(props: SettingsViewProps): ReactNode {
  const { locale, t } = useLocale();
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

  const visibleCategories = useMemo(() => CATEGORIES.filter((item) => settingMatches(query, locale, item.search, t(item.label))), [locale, query, t]);
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
    if (binding === null) { setError(t("Ctrl / ⌘ またはAltを含むショートカットを入力してください。編集用の標準キーは上書きできません。")); return; }
    const conflict = COMMAND_DEFINITIONS.find((item) => item.id !== command && props.settings.keybindings[item.id] === binding);
    if (conflict !== undefined) { setError(`${formatKeybinding(binding)} ${t("は「")}${commandLabel(conflict, locale)}${t("」で使用中です。")}`); return; }
    void run("keybinding", async () => { await props.onUpdateUser({ keybindings: { [command]: binding } }); finishRecording(); });
  };

  const editorPanel = <>
    <div className="settings-scope-tabs" role="tablist" aria-label={t("設定の適用範囲")}>
      <button className={scope === "user" ? "active" : ""} onClick={() => setScope("user")}>{t("ユーザー")}</button>
      <button disabled={props.project === null} className={scope === "workspace" ? "active" : ""} onClick={() => setScope("workspace")}>{t("この作品")}</button>
    </div>
    <p className="settings-lead">{scope === "user" ? t("新しい作品を含むすべての作品の既定値です。") : `${t("「")}${props.project?.manifest.title ?? t("作品")}${t("」だけの上書きです。")}`}</p>
    <SettingRow title={t("組方向")} description={t("本文を横書きまたは日本語の縦書きで表示します。")} inherited={scope === "workspace" && projectValue(props.project, "writingMode") === undefined} onReset={scope === "workspace" && projectValue(props.project, "writingMode") !== undefined ? () => props.onResetProjectSetting("writingMode") : undefined}>
      <select value={editorValue("writingMode")} onChange={(event) => void setEditor("writingMode", event.target.value as EditorPreferences["writingMode"])}><option value="horizontal">{t("横書き")}</option><option value="vertical-rl">{t("縦書き")}</option></select>
    </SettingRow>
    <SettingRow title={t("原稿の配色")} description={t("背景と文字を読みやすい組み合わせで切り替えます。原稿本文には記録しません。")} inherited={scope === "workspace" && projectValue(props.project, "theme") === undefined} onReset={scope === "workspace" && projectValue(props.project, "theme") !== undefined ? () => props.onResetProjectSetting("theme") : undefined}>
      <select value={editorValue("theme")} onChange={(event) => void setEditor("theme", event.target.value as ManuscriptTheme)}><option value="paper">{t("白い紙")}</option><option value="sepia">{t("生成り")}</option><option value="gray">{t("グレー")}</option><option value="dark">{t("黒")}</option><option value="custom">{t("カスタム")}</option></select>
    </SettingRow>
    {editorValue("theme") === "custom" && <>
      <SettingRow title={t("原稿の背景色")} description={customPalette.background} inherited={scope === "workspace" && projectValue(props.project, "canvasBackground") === undefined} onReset={scope === "workspace" && projectValue(props.project, "canvasBackground") !== undefined ? () => props.onResetProjectSetting("canvasBackground") : undefined}>
        <input aria-label={t("原稿の背景色")} type="color" value={editorValue("canvasBackground")} onChange={(event) => void setEditor("canvasBackground", event.target.value)} />
      </SettingRow>
      <SettingRow title={t("本文の文字色")} description={editorValue("canvasText") === null ? `${t("背景に合わせて自動（")}${customPalette.text}${t("）")}` : `${customPalette.text} · ${t("コントラスト")} ${customContrast.toFixed(1)}:1`} inherited={scope === "workspace" && projectValue(props.project, "canvasText") === undefined} onReset={scope === "workspace" && projectValue(props.project, "canvasText") !== undefined ? () => props.onResetProjectSetting("canvasText") : undefined}>
        <div className="color-setting"><label className="toggle"><input type="checkbox" checked={editorValue("canvasText") === null} onChange={(event) => void setEditor("canvasText", event.target.checked ? null : automaticTextColor(editorValue("canvasBackground")))} />{t("自動")}</label><input aria-label={t("本文の文字色")} type="color" disabled={editorValue("canvasText") === null} value={customPalette.text} onChange={(event) => void setEditor("canvasText", event.target.value)} /></div>
      </SettingRow>
      <div className="manuscript-color-preview" style={{ color: customPalette.text, background: customPalette.background, borderColor: customPalette.line }}><span>{t("原稿プレビュー")}</span><p>{t("雨は、古い図書館の窓を静かに叩いていた。")}</p>{customContrast < 4.5 && <strong>{t("文字が読みにくい配色です。自動をおすすめします。")}</strong>}</div>
    </>}
    <SettingRow title={t("本文フォント")} description={t("端末にあるフォントだけを使用します。")} inherited={scope === "workspace" && projectValue(props.project, "font") === undefined} onReset={scope === "workspace" && projectValue(props.project, "font") !== undefined ? () => props.onResetProjectSetting("font") : undefined}>
      <select value={editorValue("font")} onChange={(event) => void setEditor("font", event.target.value)}><option value={'"Yu Mincho", "Hiragino Mincho ProN", serif'}>{t("明朝体")}</option><option value={'"Yu Gothic UI", "Hiragino Sans", sans-serif'}>{t("ゴシック体")}</option><option value={'ui-monospace, "BIZ UDゴシック", monospace'}>{t("等幅")}</option></select>
    </SettingRow>
    <SettingRow title={t("文字サイズ")} description={`${editorValue("fontSize")} px`} inherited={scope === "workspace" && projectValue(props.project, "fontSize") === undefined} onReset={scope === "workspace" && projectValue(props.project, "fontSize") !== undefined ? () => props.onResetProjectSetting("fontSize") : undefined}>
      <input aria-label={t("文字サイズ")} type="range" min="12" max="36" value={editorValue("fontSize")} onChange={(event) => void setEditor("fontSize", Number(event.target.value))} />
    </SettingRow>
    <SettingRow title={t("行間")} description={editorValue("lineHeight").toFixed(1)} inherited={scope === "workspace" && projectValue(props.project, "lineHeight") === undefined} onReset={scope === "workspace" && projectValue(props.project, "lineHeight") !== undefined ? () => props.onResetProjectSetting("lineHeight") : undefined}>
      <input aria-label={t("行間")} type="range" min="1.2" max="3" step="0.1" value={editorValue("lineHeight")} onChange={(event) => void setEditor("lineHeight", Number(event.target.value))} />
    </SettingRow>
    <SettingRow title={t("本文幅")} description={`${editorValue("width")} px`} inherited={scope === "workspace" && projectValue(props.project, "width") === undefined} onReset={scope === "workspace" && projectValue(props.project, "width") !== undefined ? () => props.onResetProjectSetting("width") : undefined}>
      <input aria-label={t("本文幅")} type="range" min="480" max="1200" step="20" value={editorValue("width")} onChange={(event) => void setEditor("width", Number(event.target.value))} />
    </SettingRow>
  </>;

  const codex = connections.codex;
  const codexCard = <div className="connection-card">
    <div className="connection-heading"><div><h3>ChatGPT / Codex</h3><p>{t(codex.message)}</p></div><StatusBadge state={codex.connected ? "ok" : codex.state === "error" || codex.state === "unavailable" ? "warn" : "muted"}>{codex.connected ? codex.planType ?? t("接続済み") : codex.state === "authenticating" ? t("認証中") : t("未接続")}</StatusBadge></div>
    {codex.connected ? <>
      <p className="settings-note">{codex.email ?? t("ChatGPTアカウント")}{codex.usedPercent === null ? "" : ` · ${t("現在の利用枠")} ${Math.round(codex.usedPercent)}% ${t("使用")}`}</p>
      <div className="settings-actions"><button className="secondary" disabled={busy !== null} onClick={() => void run("codex-models", props.onRefreshCodexModels)}>{busy === "codex-models" ? t("更新中…") : t("モデル一覧を更新")}</button><button className="text-button" disabled={busy !== null} onClick={() => { if (window.confirm(t("ChatGPTからログアウトしますか？ Codex CLIのログイン状態にも影響する場合があります。"))) void run("codex-logout", props.onLogoutCodex); }}>{t("ログアウト")}</button></div>
    </> : <button className="primary" disabled={busy !== null || !codex.installed} onClick={() => void run("codex-login", props.onLoginCodex)}>{busy === "codex-login" ? t("ブラウザで認証中…") : t("ChatGPTでログイン")}</button>}
    {!codex.installed && <button className="secondary" disabled={busy !== null} onClick={() => void run("codex-check", props.onRefreshConnections)}>{t("Codex実行環境を再確認")}</button>}
    <p className="settings-note">{t("公式Codex App Serverのbrowser flowを使用します。AIレンズの実行はChatGPTプランのCodex利用枠へ計上され、認証tokenをKOHONのrendererや作品ファイルへ渡しません。")}</p>
  </div>;

  return <div ref={modal.ref} className="settings-view" role="dialog" aria-modal="true" aria-labelledby="settings-title" onKeyDown={modal.onKeyDown}>
      <header className="settings-header">
      <button className="settings-back" onClick={props.onClose} aria-label={t("設定を閉じる")}>←</button>
      <div><span className="eyebrow">{t("PREFERENCES")}</span><h1 id="settings-title">{t("設定")}</h1></div>
      <input className="settings-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("設定を検索")} aria-label={t("設定を検索")} />
      <button className="settings-close" onClick={props.onClose} aria-label={t("設定を閉じる")}>×</button>
    </header>
    <div className="settings-layout">
      <nav className="settings-nav" aria-label={t("設定カテゴリ")}>
        {visibleCategories.map((item) => <button key={item.id} className={props.category === item.id ? "active" : ""} onClick={() => props.setCategory(item.id)}><span><AppIcon name={item.icon} size={16} /></span>{t(item.label)}</button>)}
        {visibleCategories.length === 0 && <p>{t("一致する設定がありません。")}</p>}
      </nav>
      <main className="settings-main">
        {error !== null && <div className="settings-error" role="alert">{error}<button aria-label={t("エラーを閉じる")} onClick={() => setError(null)}>×</button></div>}
        {props.category === "general" && <SettingsSection eyebrow="APPLICATION" title={t("全般")} lead={t("アプリ全体の動作を設定します。作品本文には保存されません。") }>
          <SettingRow title={t("表示言語")} description={t("KOHONの操作画面とメニューの言語を選びます。") }><select value={props.settings.general.language} onChange={(event) => void props.onUpdateUser({ general: { language: event.target.value as "system" | "ja" | "en" } })}><option value="system">{t("OSに合わせる")}</option><option value="ja">{t("日本語")}</option><option value="en">English</option></select></SettingRow>
          <SettingRow title={t("自動保存")} description={t("入力を止めてから保存するまでの時間です。IME変換中は保存しません。") }><select value={props.settings.general.autoSaveDelayMs} onChange={(event) => void props.onUpdateUser({ general: { autoSaveDelayMs: Number(event.target.value) } })}><option value="400">0.4{t("秒")}</option><option value="800">0.8{t("秒")}</option><option value="1500">1.5{t("秒")}</option><option value="3000">3{t("秒")}</option></select></SettingRow>
          <SettingRow title={t("設定の保存場所")} description={t("ユーザー設定はOSのKOHON設定フォルダーに保存します。APIキーとGitHub tokenは含みません。") }><StatusBadge state="ok">{t("ローカルのみ")}</StatusBadge></SettingRow>
        </SettingsSection>}
        {props.category === "appearance" && <SettingsSection eyebrow="APPEARANCE" title={t("外観")} lead={t("作業UIの色と表示密度を設定します。原稿キャンバスの紙色はエディター設定で独立して選べます。") }>
          <SettingRow title={t("カラーテーマ")} description={t("作業UI全体をホワイト、ミント、ダーク、またはOS設定に統一します。")}><select value={props.settings.appearance.colorTheme} onChange={(event) => void props.onUpdateUser({ appearance: { colorTheme: event.target.value as "system" | "default" | "light" | "dark" } })}><option value="light">{t("ホワイト（既定）")}</option><option value="default">{t("ミント")}</option><option value="dark">{t("ダーク")}</option><option value="system">{t("OSに合わせる")}</option></select></SettingRow>
          <SettingRow title={t("アクセントカラー")} description={t("ロゴに合わせた青緑、または金・インクから選びます。")}><select value={props.settings.appearance.accent} onChange={(event) => void props.onUpdateUser({ appearance: { accent: event.target.value as "forest" | "gold" | "ink" } })}><option value="forest">{t("青緑")}</option><option value="gold">{t("金")}</option><option value="ink">{t("インク")}</option></select></SettingRow>
          <SettingRow title={t("表示密度")} description={t("各パネルの余白とコントロールの密度を調整します。")}><select value={props.settings.appearance.density} onChange={(event) => void props.onUpdateUser({ appearance: { density: event.target.value as "comfortable" | "compact" } })}><option value="comfortable">{t("標準")}</option><option value="compact">{t("コンパクト")}</option></select></SettingRow>
        </SettingsSection>}
        {props.category === "layout" && <LayoutSettings layout={props.settings.layout} onUpdate={(layout) => props.onUpdateUser({ layout })} t={t} />}
        {props.category === "editor" && <SettingsSection eyebrow="EDITOR" title={t("エディター")} lead={t("VS Codeと同じように、ユーザー既定値と作品固有の上書きを分けます。")}>{editorPanel}</SettingsSection>}
        {props.category === "ai" && <SettingsSection eyebrow="AI CONNECTION" title={t("AIレンズ")} lead={t("ChatGPTのCodex利用枠、または任意のOpenAI APIキーで、選んだ原稿範囲だけを読みます。")}>
          <SettingRow title={t("既定の接続")} description={t("新しく開いたレンズで最初に選ばれる接続です。")}><select value={props.settings.ai.defaultProvider} onChange={(event) => void props.onUpdateUser({ ai: { defaultProvider: event.target.value as "mock" | "codex" | "openai" } })}><option value="codex">{t("ChatGPT（Codex枠）")}</option><option value="mock">{t("Offline Mock（通信なし）")}</option><option value="openai">{t("OpenAI API（従量課金）")}</option></select></SettingRow>
          <SettingRow title={t("Codexモデル")} description={t("ログイン中のアカウントで現在利用できるモデルです。一覧は接続時と設定表示時に自動更新されます。")}><select value={props.settings.ai.codexModel} disabled={codex.models.length === 0} onChange={(event) => void props.onUpdateUser({ ai: { codexModel: event.target.value } })}>{codex.models.length === 0 && <option value={props.settings.ai.codexModel}>{props.settings.ai.codexModel}</option>}{codex.models.map((model) => <option key={model.id} value={model.id}>{model.displayName}{model.id === "gpt-5.6-luna" ? `${t("（")}${t("初期・節約")}${t("）")}` : ""}</option>)}</select></SettingRow>
          {codexCard}
          <h3>{t("APIキー方式（任意）")}</h3>
          <SettingRow title="OpenAI model ID" description={t("利用者のAPI projectで利用できる正確なmodel IDを指定します。")}><input value={modelDraft} onChange={(event) => setModelDraft(event.target.value)} onBlur={() => { if (modelDraft !== props.settings.ai.openaiModel) void props.onUpdateUser({ ai: { openaiModel: modelDraft } }); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></SettingRow>
          <div className="connection-card">
            <div className="connection-heading"><div><h3>OpenAI API</h3><p>{t(connections.openai.message)}</p></div><StatusBadge state={connections.openai.connected ? "ok" : connections.openai.state === "error" ? "warn" : "muted"}>{connections.openai.connected ? connections.openai.storage === "os" ? t("OSへ保存済み") : t("接続済み") : t("未接続")}</StatusBadge></div>
            {!connections.openai.connected ? <div className="connection-form"><input type="password" autoComplete="off" spellCheck={false} value={openAIKey} onChange={(event) => setOpenAIKey(event.target.value)} placeholder="OpenAI API key" aria-label="OpenAI API key" /><button className="primary" disabled={busy !== null || openAIKey.trim().length < 20} onClick={() => void run("openai", async () => { await props.onConnectOpenAI(openAIKey); setOpenAIKey(""); })}>{t("APIキーを接続して確認")}</button></div> : <button className="secondary" disabled={busy !== null} onClick={() => void run("openai", props.onDisconnectOpenAI)}>{t("接続と保存済みキーを削除")}</button>}
            <div className="connection-links"><button onClick={() => void props.onOpenExternal("openai-api-keys")}>{t("APIキーを作成・管理")}</button></div>
            <p className="settings-note">{t("このAPIキー方式を選んだ場合だけAPI Platformの従量課金が適用されます。確認後のキーはrendererから消去し、利用可能な端末ではOSの暗号化ストレージへ保存します。")}</p>
          </div>
        </SettingsSection>}
        {props.category === "accounts" && <SettingsSection eyebrow="ACCOUNTS" title={t("アカウント")} lead={t("認証情報はKOHONのサーバーを経由しません。")}>
          {codexCard}
          <div className="connection-card">
            <div className="connection-heading"><div><h3>GitHub</h3><p>{t(connections.github.message)}</p></div><StatusBadge state={connections.github.connected ? "ok" : connections.github.state === "error" ? "warn" : "muted"}>{connections.github.connected ? t("接続済み") : connections.github.cliInstalled ? t("未ログイン") : t("CLIなし")}</StatusBadge></div>
            {!connections.github.connected && connections.github.cliInstalled && <button className="primary" disabled={busy !== null} onClick={() => void run("github", props.onLoginGitHub)}>{busy === "github" ? t("ブラウザで確認中…") : t("GitHubへログイン")}</button>}
            {!connections.github.cliInstalled && <button className="secondary" onClick={() => void props.onOpenExternal("github-cli")}>{t("GitHub CLIをinstall")}</button>}
            <div className="connection-links"><button onClick={() => void props.onRefreshConnections()}>{t("状態を再確認")}</button><button onClick={() => void props.onOpenExternal("github-applications")}>{t("GitHub側で認証を管理")}</button></div>
            <p className="settings-note">{t("公式GitHub CLIのbrowser flowを使用します。tokenはOS credential storeまたはGitHub CLIが管理し、KOHONはtoken値を読みません。")}</p>
          </div>
        </SettingsSection>}
        {props.category === "keyboard" && <SettingsSection eyebrow="KEYBOARD" title={t("キーボード ショートカット")} lead={t("キー割り当てをクリックし、使いたい組み合わせを押します。Backspaceで未設定にできます。") }>
          <div className="keybinding-list">{COMMAND_DEFINITIONS.map((command) => <div className="keybinding-row" key={command.id}><div><small>{commandCategory(command, locale)}</small><b>{commandLabel(command, locale)}</b><code>{command.id}</code></div><button autoFocus={recording === command.id} className={recording === command.id ? "recording" : ""} onClick={() => beginRecording(command.id)} onKeyDown={(event) => { if (recording === command.id) recordKey(event, command.id); }}>{recording === command.id ? t("キーを入力…") : t(formatKeybinding(props.settings.keybindings[command.id]))}</button><button className="reset-key" title={t("既定値へ戻す")} onClick={() => void run("keybinding", async () => { await props.onUpdateUser({ keybindings: { [command.id]: command.defaultBinding } }); finishRecording(); })}>↺</button></div>)}</div>
          <button className="secondary" disabled={busy !== null} onClick={() => { if (window.confirm(t("すべてのショートカットを既定値へ戻しますか？"))) void run("reset-keys", async () => { await props.onResetKeybindings(); finishRecording(); }); }}>{t("すべて既定値へ戻す")}</button>
        </SettingsSection>}
        {props.category === "updates" && <SettingsSection eyebrow="UPDATES" title={t("更新")} lead={t("GitHub Releasesを直接確認します。運営者サーバーやGitHub tokenは不要です。")}>
          <SettingRow title={t("起動時に確認")} description={t("packaged版の起動後にGitHubへ1回だけ最新版を問い合わせます。原稿や設定は送りません。")}><label className="toggle"><input type="checkbox" checked={props.settings.updates.checkOnStartup} onChange={(event) => void props.onUpdateUser({ updates: { checkOnStartup: event.target.checked } })} />{props.settings.updates.checkOnStartup ? t("オン") : t("オフ")}</label></SettingRow>
          <div className="update-card"><div><small>{t("現在")}</small><strong>v{props.updateStatus?.currentVersion ?? props.appInfo?.version ?? "-"}</strong></div><span>→</span><div><small>{t("最新版")}</small><strong>{props.updateStatus?.latestVersion === null || props.updateStatus === null ? t("未確認") : `v${props.updateStatus.latestVersion}`}</strong></div></div>
          <p className="settings-note">{props.updateStatus === null ? t("更新はまだ確認していません。") : t(props.updateStatus.message)}</p>
          {props.updateStatus?.progress !== null && props.updateStatus?.progress !== undefined && <div className="update-progress" aria-label={`${t("更新")} ${props.updateStatus.progress}%`}><span style={{ width: `${props.updateStatus.progress}%` }} /></div>}
          <div className="settings-actions"><button className="primary" disabled={busy !== null || props.updateStatus?.state === "checking" || updateInProgress} onClick={() => void run("updates", props.onCheckUpdates)}>{props.updateStatus?.state === "checking" ? t("確認中…") : t("今すぐ確認")}</button><button className="secondary" disabled={busy !== null || updateInProgress || !canInstallUpdate} onClick={() => void run("install", props.onInstallUpdate)}>{props.updateStatus?.state === "downloading" ? `${t("ダウンロード中")} ${props.updateStatus.progress ?? 0}%` : props.updateStatus?.state === "verifying" ? t("SHA-256を確認中…") : props.updateStatus?.state === "installing" ? t("更新を適用中…") : t("ダウンロードして更新")}</button><button className="text-button" disabled={updateInProgress} onClick={() => void props.onOpenUpdatePage()}>{t("Releaseページ")}</button></div>
          {props.appInfo?.platform === "win32" && <p className="settings-note">{t("Windowsでは確認後にアプリを閉じ、画面を出さずに更新して自動で再起動します。")} </p>}
          <p className="settings-note">{t("作品フォルダーはアプリの外にあるため、更新・再install・uninstallで原稿を削除しません。ダウンロードはGitHub ReleaseのSHA-256と照合します。preview版は未署名のため、起動後のOS警告を確認してください。")} </p>
        </SettingsSection>}
        {props.category === "about" && <SettingsSection eyebrow="ABOUT" title="KOHON" lead={t("作者が書くことを中心に置く、ローカル優先のOSS小説制作環境です。")}>
          <div className="about-grid"><span>Version</span><code>{props.appInfo?.version ?? "-"}</code><span>Platform</span><code>{props.appInfo?.platform ?? "desktop"}</code><span>License</span><code>Apache-2.0</code><span>{t("データ")}</span><code>Markdown / local-first</code></div>
          <button className="secondary" onClick={() => void props.onOpenExternal("latest-release")}>{t("GitHub Releases")}</button>
        </SettingsSection>}
      </main>
    </div>
  </div>;
}

function LayoutSettings({ layout, onUpdate, t }: { layout: UserSettings["layout"]; onUpdate: (layout: LayoutPatch) => Promise<void>; t: (text: string) => string }): ReactNode {
  const [mergeTargets, setMergeTargets] = useState<Partial<Record<ViewId, string>>>({});
  const groups = tabGroups(layout.root);
  const editor = editorNode(layout.root);
  const moveZones: readonly { zone: Exclude<DockZone, "center">; label: string }[] = [
    { zone: "left", label: "左" },
    { zone: "right", label: "右" },
    { zone: "top", label: "上" },
    { zone: "bottom", label: "下" }
  ];
  const moveRelativeToEditor = (view: ViewId, zone: Exclude<DockZone, "center">): void => {
    if (editor === null) return;
    void onUpdate(dockView(layout, view, editor.id, zone));
  };
  const mergeIntoGroup = (view: ViewId): void => {
    const targetId = mergeTargets[view];
    if (targetId === undefined || groups.every((group) => group.id !== targetId)) return;
    void onUpdate(dockView(layout, view, targetId, "center"));
  };
  const groupName = (group: DockTabsNode): string => {
    const index = groups.findIndex((item) => item.id === group.id);
    return `${t("グループ")} ${index + 1} · ${group.views.map((view) => t(VIEW_LABELS[view])).join(" / ")}`;
  };

  return <SettingsSection eyebrow="LAYOUT" title={t("レイアウト")} lead={t("ビューを本文の周囲へ移動したり、任意のタブグループへまとめたりできます。")}>
    <SettingRow title={t("アクティビティバー")} description={t("ビュー切り替えバーの表示と位置を設定します。")}>
      <div className="settings-checks">
        <label className="toggle"><input type="checkbox" checked={layout.activityBarVisible} onChange={(event) => void onUpdate({ activityBarVisible: event.target.checked })} />{t("表示")}</label>
        <select aria-label={t("アクティビティバーの位置")} value={layout.activityBar} onChange={(event) => void onUpdate({ activityBar: event.target.value as PhysicalSide })}><option value="left">{t("左")}</option><option value="right">{t("右")}</option></select>
      </div>
    </SettingRow>
    <div className="settings-layout-groups">
      <h3>{t("ビューのタブグループ")}</h3>
      <p className="settings-note">{t("現在の所属を確認し、本文に対する位置または別グループへの中央合流を選びます。")}</p>
      {(["outline", "lens", "search", "history"] as const).map((view) => {
        const current = findViewNode(layout, view);
        const otherGroups = groups.filter((group) => group.id !== current?.id);
        const selectedTarget = mergeTargets[view] ?? "";
        return <div className="settings-layout-view" key={view}>
          <div className="settings-layout-view-heading"><strong>{t(VIEW_LABELS[view])}</strong><span>{current === undefined || current === null ? t("所属不明") : `${t("現在")}：${groupName(current)}`}</span></div>
          <div className="settings-actions" role="group" aria-label={`${t(VIEW_LABELS[view])}${t("を本文の周囲へ移動")}`}>
            {moveZones.map(({ zone, label }) => <button type="button" className="secondary" key={zone} disabled={editor === null} onClick={() => moveRelativeToEditor(view, zone)}>{t(label)}</button>)}
          </div>
          <div className="settings-layout-merge">
            <select aria-label={`${t(VIEW_LABELS[view])}${t("の合流先")}`} value={selectedTarget} onChange={(event) => setMergeTargets((targets) => ({ ...targets, [view]: event.target.value }))} disabled={otherGroups.length === 0}>
              <option value="">{otherGroups.length === 0 ? t("他のタブグループなし") : t("合流先を選択")}</option>
              {otherGroups.map((group) => <option value={group.id} key={group.id}>{groupName(group)}</option>)}
            </select>
            <button type="button" className="secondary" disabled={selectedTarget === "" || otherGroups.every((group) => group.id !== selectedTarget)} onClick={() => mergeIntoGroup(view)}>{t("中央で合流")}</button>
          </div>
        </div>;
      })}
    </div>
    <SettingRow title={t("集中モード（Zen）")} description={t("すべてのドックを隠し、本文に集中します。チェックボックスはTabとSpaceで操作できます。")}>
      <label className="toggle"><input type="checkbox" aria-label={t("集中モード（Zen）")} checked={layout.zenMode} onChange={(event) => void onUpdate({ zenMode: event.target.checked })} />{layout.zenMode ? t("オン") : t("オフ")}</label>
    </SettingRow>
    <div className="settings-actions"><button type="button" className="secondary" onClick={() => void onUpdate(defaultLayout())}>{t("既定レイアウトへ戻す")}</button></div>
  </SettingsSection>;
}

function SettingsSection({ eyebrow, title, lead, children }: { eyebrow: string; title: string; lead: string; children: ReactNode }): ReactNode {
  return <section className="settings-section"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p className="settings-lead">{lead}</p><div className="settings-rows">{children}</div></section>;
}

function SettingRow({ title, description, children, inherited = false, onReset }: { title: string; description: string; children: ReactNode; inherited?: boolean; onReset?: (() => Promise<void>) | undefined }): ReactNode {
  const { t } = useLocale();
  return <div className="setting-row"><div><div className="setting-title"><h3>{title}</h3>{inherited && <span>{t("ユーザー設定を使用中")}</span>}</div><p>{description}</p>{onReset !== undefined && <button className="setting-reset" onClick={() => void onReset()}>{t("ユーザー設定に戻す")}</button>}</div><div className="setting-control">{children}</div></div>;
}
