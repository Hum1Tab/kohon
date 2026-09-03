import {
  defaultLayout,
  mergeLayout,
  migrateLayoutV1,
  projectLayoutV1,
  sanitizeLayout,
  type LayoutPatch,
  type LayoutPreferences
} from "./layout.js";
import { isHexColor, MANUSCRIPT_PALETTES, type ManuscriptTheme } from "./editor-theme.js";

export { applyLayoutPreset, defaultLayout, EDITOR_MIN_WIDTH, EDITOR_SCROLL_MIN_HEIGHT, LAYOUT_LIMITS, mergeLayout, migrateLayoutV1, moveSlotToSide, moveView, placeViewOnSide, projectLayoutV1, sanitizeLayout, sideOf, slotOf, TOOL_VIEWS, VIEW_IDS } from "./layout.js";
export type { BottomPanelAlignment, DockSlotState, LayoutPatch, LayoutPreferences, PhysicalSide, SlotId, ViewId } from "./layout.js";

export type AppCommandId =
  | "file.new"
  | "file.open"
  | "file.save"
  | "workbench.commandPalette"
  | "workbench.quickOpen"
  | "editor.find"
  | "editor.replace"
  | "editor.undo"
  | "editor.redo"
  | "editor.splitRight"
  | "editor.splitDown"
  | "editor.closeGroup"
  | "editor.ruby"
  | "editor.emphasis"
  | "editor.normalizePunctuation"
  | "editor.indentedParagraph"
  | "editor.japaneseQuotes"
  | "editor.tateChuYoko"
  | "editor.moveTabLeft"
  | "editor.moveTabRight"
  | "editor.moveTabToOtherGroup"
  | "editor.splitScene"
  | "editor.mergePrevious"
  | "history.checkpoint"
  | "file.export"
  | "file.exportText"
  | "view.settings"
  | "view.settings.appearance"
  | "view.settings.layout"
  | "view.settings.editor"
  | "view.settings.ai"
  | "view.settings.accounts"
  | "view.settings.keyboard"
  | "view.settings.updates"
  | "view.outline"
  | "view.search"
  | "view.lens"
  | "view.history"
  | "view.zen"
  | "layout.reset"
  | "updates.check";

export interface CommandDefinition {
  id: AppCommandId;
  label: string;
  category: "ファイル" | "編集" | "表示" | "履歴" | "設定" | "更新";
  defaultBinding: string;
}

export const COMMAND_DEFINITIONS: readonly CommandDefinition[] = [
  { id: "file.new", label: "新しい作品", category: "ファイル", defaultBinding: "Mod+N" },
  { id: "file.open", label: "作品を開く", category: "ファイル", defaultBinding: "Mod+O" },
  { id: "file.save", label: "保存", category: "ファイル", defaultBinding: "Mod+S" },
  { id: "workbench.commandPalette", label: "コマンド パレット", category: "表示", defaultBinding: "Mod+Shift+P" },
  { id: "workbench.quickOpen", label: "章をクイック オープン", category: "表示", defaultBinding: "Mod+P" },
  { id: "editor.find", label: "本文内を検索", category: "編集", defaultBinding: "Mod+F" },
  { id: "editor.replace", label: "本文内を置換", category: "編集", defaultBinding: "Mod+Alt+F" },
  { id: "editor.undo", label: "本文の変更を元に戻す", category: "編集", defaultBinding: "Mod+Z" },
  { id: "editor.redo", label: "本文の変更をやり直す", category: "編集", defaultBinding: "Mod+Shift+Z" },
  { id: "editor.splitRight", label: "エディターを右に分割", category: "表示", defaultBinding: "Mod+\\" },
  { id: "editor.splitDown", label: "エディターを下に分割", category: "表示", defaultBinding: "" },
  { id: "editor.closeGroup", label: "現在のエディターグループを閉じる", category: "表示", defaultBinding: "" },
  { id: "editor.ruby", label: "選択範囲にルビ", category: "編集", defaultBinding: "" },
  { id: "editor.emphasis", label: "選択範囲に傍点", category: "編集", defaultBinding: "" },
  { id: "editor.normalizePunctuation", label: "選択範囲の三点リーダー・ダッシュを整える", category: "編集", defaultBinding: "" },
  { id: "editor.indentedParagraph", label: "字下げした段落を挿入", category: "編集", defaultBinding: "" },
  { id: "editor.japaneseQuotes", label: "鉤括弧で囲む", category: "編集", defaultBinding: "" },
  { id: "editor.tateChuYoko", label: "選択範囲を縦中横として注記", category: "編集", defaultBinding: "" },
  { id: "editor.moveTabLeft", label: "章タブを左へ移動", category: "表示", defaultBinding: "" },
  { id: "editor.moveTabRight", label: "章タブを右へ移動", category: "表示", defaultBinding: "" },
  { id: "editor.moveTabToOtherGroup", label: "章タブを別のエディターへ移動", category: "表示", defaultBinding: "" },
  { id: "editor.splitScene", label: "カーソル位置で場面を分割", category: "編集", defaultBinding: "" },
  { id: "editor.mergePrevious", label: "前の章・場面へ結合", category: "編集", defaultBinding: "" },
  { id: "history.checkpoint", label: "保存点を作る", category: "履歴", defaultBinding: "Mod+Shift+S" },
  { id: "file.export", label: "Markdownを書き出す", category: "ファイル", defaultBinding: "Mod+Alt+E" },
  { id: "file.exportText", label: "TXTを書き出す", category: "ファイル", defaultBinding: "" },
  { id: "view.settings", label: "設定を開く", category: "表示", defaultBinding: "Mod+," },
  { id: "view.settings.appearance", label: "外観設定を開く", category: "設定", defaultBinding: "" },
  { id: "view.settings.layout", label: "レイアウト設定を開く", category: "設定", defaultBinding: "" },
  { id: "view.settings.editor", label: "エディター設定を開く", category: "設定", defaultBinding: "" },
  { id: "view.settings.ai", label: "AI接続設定を開く", category: "設定", defaultBinding: "" },
  { id: "view.settings.accounts", label: "アカウント設定を開く", category: "設定", defaultBinding: "" },
  { id: "view.settings.keyboard", label: "キーボード ショートカットを開く", category: "設定", defaultBinding: "" },
  { id: "view.settings.updates", label: "更新設定を開く", category: "設定", defaultBinding: "" },
  { id: "view.outline", label: "章アウトライン", category: "表示", defaultBinding: "Mod+Shift+E" },
  { id: "view.search", label: "作品内検索", category: "表示", defaultBinding: "Mod+Shift+F" },
  { id: "view.lens", label: "編集レンズ", category: "表示", defaultBinding: "Mod+Shift+L" },
  { id: "view.history", label: "履歴", category: "表示", defaultBinding: "Mod+Shift+H" },
  { id: "view.zen", label: "集中モード", category: "表示", defaultBinding: "Mod+K" },
  { id: "layout.reset", label: "レイアウトを既定へ戻す", category: "表示", defaultBinding: "" },
  { id: "updates.check", label: "更新を確認", category: "更新", defaultBinding: "Mod+Shift+U" }
] as const;

export type KeybindingMap = Record<AppCommandId, string>;

export interface EditorPreferences {
  writingMode: "horizontal" | "vertical-rl";
  theme: ManuscriptTheme;
  canvasBackground: string;
  canvasText: string | null;
  font: string;
  fontSize: number;
  lineHeight: number;
  width: number;
}

export interface AppearancePreferences {
  colorTheme: "system" | "default" | "light" | "dark";
  accent: "forest" | "gold" | "ink";
  density: "comfortable" | "compact";
}

export interface UserSettings {
  schemaVersion: 3;
  general: { autoSaveDelayMs: number };
  appearance: AppearancePreferences;
  layout: LayoutPreferences;
  editor: EditorPreferences;
  ai: { defaultProvider: "mock" | "codex" | "openai"; codexModel: string; openaiModel: string };
  updates: { checkOnStartup: boolean };
  keybindings: KeybindingMap;
}

export type UserSettingsPatch = {
  general?: Partial<UserSettings["general"]>;
  appearance?: Partial<UserSettings["appearance"]>;
  layout?: LayoutPatch;
  editor?: Partial<UserSettings["editor"]>;
  ai?: Partial<UserSettings["ai"]>;
  updates?: Partial<UserSettings["updates"]>;
  keybindings?: Partial<KeybindingMap>;
};

const DEFAULT_FONT = '"Yu Mincho", "Hiragino Mincho ProN", serif';
const RESERVED_BINDINGS = new Set(["Mod+C", "Mod+X", "Mod+V", "Mod+A", "Mod+Q"]);

export function defaultKeybindings(): KeybindingMap {
  return Object.fromEntries(COMMAND_DEFINITIONS.map((command) => [command.id, command.defaultBinding])) as KeybindingMap;
}

export function defaultUserSettings(): UserSettings {
  return {
    schemaVersion: 3,
    general: { autoSaveDelayMs: 800 },
    appearance: { colorTheme: "light", accent: "forest", density: "comfortable" },
    layout: defaultLayout(),
    editor: { writingMode: "horizontal", theme: "paper", canvasBackground: MANUSCRIPT_PALETTES.paper.background, canvasText: null, font: DEFAULT_FONT, fontSize: 18, lineHeight: 2, width: 760 },
    ai: { defaultProvider: "codex", codexModel: "gpt-5.6-luna", openaiModel: "gpt-5.6-luna" },
    updates: { checkOnStartup: true },
    keybindings: defaultKeybindings()
  };
}

function finiteNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeKeybinding(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  const rawParts = trimmed.split("+").map((part) => part.trim()).filter(Boolean);
  if (rawParts.length === 0) return null;
  const rawKey = rawParts.at(-1)!;
  const modifierSet = new Set<string>();
  for (const raw of rawParts.slice(0, -1)) {
    const lower = raw.toLowerCase();
    if (["mod", "cmd", "command", "meta", "ctrl", "control", "cmdorctrl", "commandorcontrol"].includes(lower)) modifierSet.add("Mod");
    else if (lower === "alt" || lower === "option") modifierSet.add("Alt");
    else if (lower === "shift") modifierSet.add("Shift");
    else return null;
  }
  const aliases: Record<string, string> = { comma: ",", period: ".", slash: "/", space: "Space", escape: "Escape", enter: "Enter", backspace: "Backspace", delete: "Delete", minus: "-", equal: "=" };
  const keyLower = rawKey.toLowerCase();
  let key = aliases[keyLower] ?? rawKey;
  if (/^[a-z]$/iu.test(key)) key = key.toUpperCase();
  else if (/^f(?:[1-9]|1[0-2])$/iu.test(key)) key = key.toUpperCase();
  else if (!/^[0-9,./;'\[\]\\`=-]$/u.test(key) && !["Space", "Escape", "Enter", "Backspace", "Delete"].includes(key)) return null;
  if (!modifierSet.has("Mod") && !modifierSet.has("Alt") && !/^F(?:[1-9]|1[0-2])$/u.test(key)) return null;
  const result = [...["Mod", "Alt", "Shift"].filter((part) => modifierSet.has(part)), key].join("+");
  return RESERVED_BINDINGS.has(result) ? null : result;
}

export function validateKeybindings(bindings: KeybindingMap): void {
  const used = new Map<string, AppCommandId>();
  for (const definition of COMMAND_DEFINITIONS) {
    const normalized = normalizeKeybinding(bindings[definition.id]);
    if (normalized === null) throw new Error(`「${definition.label}」のショートカットを確認してください。`);
    if (normalized.length === 0) continue;
    const existing = used.get(normalized);
    if (existing !== undefined) {
      const other = COMMAND_DEFINITIONS.find((item) => item.id === existing)?.label ?? existing;
      throw new Error(`ショートカット ${formatKeybinding(normalized)} は「${other}」と重複しています。`);
    }
    used.set(normalized, definition.id);
  }
}

export function sanitizeUserSettings(input: unknown): UserSettings {
  const defaults = defaultUserSettings();
  const source = objectValue(input);
  const general = objectValue(source["general"]);
  const appearance = objectValue(source["appearance"]);
  const layout = objectValue(source["layout"]);
  const editor = objectValue(source["editor"]);
  const ai = objectValue(source["ai"]);
  const updates = objectValue(source["updates"]);
  const rawBindings = objectValue(source["keybindings"]);
  const keybindings = defaultKeybindings();
  for (const definition of COMMAND_DEFINITIONS) {
    const candidate = rawBindings[definition.id];
    if (typeof candidate !== "string") continue;
    const normalized = normalizeKeybinding(candidate);
    if (normalized !== null) keybindings[definition.id] = normalized;
  }
  const storedSchema = typeof source["schemaVersion"] === "number" ? source["schemaVersion"] : 1;
  if (storedSchema < 3 && rawBindings["editor.find"] === undefined && normalizeKeybinding(typeof rawBindings["view.search"] === "string" ? rawBindings["view.search"] : "Mod+F") === "Mod+F") {
    keybindings["view.search"] = "Mod+Shift+F";
    keybindings["editor.find"] = "Mod+F";
  }
  const newCommands: readonly AppCommandId[] = ["workbench.commandPalette", "workbench.quickOpen", "editor.find", "editor.replace", "editor.splitRight", "editor.splitDown", "editor.closeGroup"];
  if (storedSchema < 3) {
    for (const id of newCommands) {
      if (rawBindings[id] !== undefined || keybindings[id].length === 0) continue;
      const collision = COMMAND_DEFINITIONS.some((definition) => definition.id !== id && !newCommands.includes(definition.id) && keybindings[definition.id] === keybindings[id]);
      if (collision) keybindings[id] = "";
    }
  }
  try { validateKeybindings(keybindings); }
  catch { return defaults; }
  const isV2Layout = (typeof source["schemaVersion"] === "number" && source["schemaVersion"] >= 2) || Object.prototype.hasOwnProperty.call(layout, "slots");
  return {
    schemaVersion: 3,
    general: { autoSaveDelayMs: finiteNumber(general["autoSaveDelayMs"], defaults.general.autoSaveDelayMs, 250, 5000) },
    appearance: {
      colorTheme: appearance["colorTheme"] === "default" || appearance["colorTheme"] === "light" || appearance["colorTheme"] === "dark" || appearance["colorTheme"] === "system" ? appearance["colorTheme"] : defaults.appearance.colorTheme,
      accent: appearance["accent"] === "forest" || appearance["accent"] === "gold" || appearance["accent"] === "ink"
        ? appearance["accent"]
        : appearance["accent"] === "amber" ? "gold" : appearance["accent"] === "blue" ? "ink" : appearance["accent"] === "violet" ? "forest" : defaults.appearance.accent,
      density: appearance["density"] === "compact" || appearance["density"] === "comfortable" ? appearance["density"] : defaults.appearance.density
    },
    layout: isV2Layout ? sanitizeLayout(layout) : migrateLayoutV1(layout),
    editor: {
      writingMode: editor["writingMode"] === "vertical-rl" ? "vertical-rl" : editor["writingMode"] === "horizontal" ? "horizontal" : defaults.editor.writingMode,
      theme: editor["theme"] === "custom" || editor["theme"] === "gray" || editor["theme"] === "dark" || editor["theme"] === "sepia" || editor["theme"] === "paper" ? editor["theme"] : defaults.editor.theme,
      canvasBackground: isHexColor(editor["canvasBackground"]) ? editor["canvasBackground"].toLowerCase() : defaults.editor.canvasBackground,
      canvasText: editor["canvasText"] === null || isHexColor(editor["canvasText"]) ? editor["canvasText"]?.toLowerCase() ?? null : defaults.editor.canvasText,
      font: typeof editor["font"] === "string" && editor["font"].length <= 200 ? editor["font"] : defaults.editor.font,
      fontSize: finiteNumber(editor["fontSize"], defaults.editor.fontSize, 12, 36),
      lineHeight: finiteNumber(editor["lineHeight"], defaults.editor.lineHeight, 1.2, 3),
      width: finiteNumber(editor["width"], defaults.editor.width, 480, 1600)
    },
    ai: {
      defaultProvider: ai["defaultProvider"] === "openai" || ai["defaultProvider"] === "codex" ? ai["defaultProvider"] : ai["defaultProvider"] === "mock" ? "mock" : defaults.ai.defaultProvider,
      codexModel: typeof ai["codexModel"] === "string" && /^[A-Za-z0-9._:-]{1,128}$/u.test(ai["codexModel"]) ? ai["codexModel"] : defaults.ai.codexModel,
      openaiModel: typeof ai["openaiModel"] === "string" && /^[A-Za-z0-9._:-]{1,128}$/u.test(ai["openaiModel"]) ? ai["openaiModel"] : defaults.ai.openaiModel
    },
    updates: { checkOnStartup: typeof updates["checkOnStartup"] === "boolean" ? updates["checkOnStartup"] : defaults.updates.checkOnStartup },
    keybindings
  };
}

export function mergeUserSettings(current: UserSettings, patch: UserSettingsPatch): UserSettings {
  const candidate = sanitizeUserSettings({
    schemaVersion: 3,
    general: { ...current.general, ...patch.general },
    appearance: { ...current.appearance, ...patch.appearance },
    layout: mergeLayout(current.layout, patch.layout),
    editor: { ...current.editor, ...patch.editor },
    ai: { ...current.ai, ...patch.ai },
    updates: { ...current.updates, ...patch.updates },
    keybindings: { ...current.keybindings, ...patch.keybindings }
  });
  validateKeybindings(candidate.keybindings);
  return candidate;
}

/** Serialize settings and include a legacy layout mirror until the KOHON migration is complete. */
export function serializeUserSettings(settings: UserSettings): string {
  const layout = { ...settings.layout, ...projectLayoutV1(settings.layout) };
  return `${JSON.stringify({ ...settings, schemaVersion: 3, layout }, null, 2)}\n`;
}

export function toElectronAccelerator(binding: string): string | undefined {
  const normalized = normalizeKeybinding(binding);
  if (normalized === null || normalized.length === 0) return undefined;
  return normalized.split("+").map((part) => part === "Mod" ? "CommandOrControl" : part).join("+");
}

export function formatKeybinding(binding: string): string {
  if (binding.length === 0) return "未設定";
  return binding.replace("Mod", "Ctrl / ⌘").replaceAll("+", " + ");
}

export function bindingFromKeyboardEvent(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): string | null {
  if (["Control", "Meta", "Alt", "Shift"].includes(event.key)) return null;
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  const aliases: Record<string, string> = { " ": "Space", ",": ",", ".": ".", "/": "/" };
  const key = aliases[event.key] ?? (/^[a-z]$/iu.test(event.key) ? event.key.toUpperCase() : event.key);
  return normalizeKeybinding([...parts, key].join("+"));
}
