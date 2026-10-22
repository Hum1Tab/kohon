import { LogicalPosition } from "@tauri-apps/api/dpi";
import {
  Menu,
  PredefinedMenuItem,
  Submenu,
  type MenuItemOptions,
  type PredefinedMenuItemOptions,
  type SubmenuOptions
} from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { commandLabel } from "../shared/locale.js";
import {
  COMMAND_DEFINITIONS,
  toTauriAccelerator,
  type AppCommandId,
  type UserSettings
} from "../shared/settings.js";
import type { AppLocale } from "../shared/locale.js";

import { LATEST_RELEASE_PAGE } from "./updates.js";
import { openExternalUrl } from "./ipc.js";

type MenuEntry = MenuItemOptions | SubmenuOptions | PredefinedMenuItemOptions;

interface MenuGroup {
  id: string;
  label: string;
  entries: MenuEntry[];
}

export interface AppMenuGroup {
  index: number;
  label: string;
}

export interface MenuController {
  groups(): AppMenuGroup[];
  show(options?: { index?: number; x?: number; y?: number }): Promise<void>;
  /** Rebuild and install the native macOS application menu. */
  installApplicationMenu(): Promise<void>;
}

function closeWindow(): void {
  void getCurrentWindow().close();
}

function openReleases(): void {
  void openExternalUrl(LATEST_RELEASE_PAGE).catch(() => undefined);
}

export function createMenuController(options: {
  settings: () => UserSettings;
  locale: () => AppLocale;
  recording: () => boolean;
  dispatch: (action: AppCommandId) => void;
}): MenuController {
  let activeMenu: Menu | Submenu | null = null;
  let applicationMenu: Menu | null = null;
  let applicationInstall: Promise<void> = Promise.resolve();

  const commandItem = (id: AppCommandId, label?: string, includeAccelerator = true): MenuItemOptions => {
    const definition = COMMAND_DEFINITIONS.find((item) => item.id === id)!;
    const accelerator = !includeAccelerator || options.recording()
      ? undefined
      : toTauriAccelerator(options.settings().keybindings[id]);
    return {
      id: `command:${id}`,
      text: label ?? commandLabel(definition, options.locale()),
      ...(accelerator === undefined ? {} : { accelerator }),
      action: () => options.dispatch(id)
    };
  };

  const separator = (): PredefinedMenuItemOptions => ({ item: "Separator" });
  const predefined = (item: PredefinedMenuItemOptions["item"], text?: string): PredefinedMenuItemOptions => ({ item, ...(text === undefined ? {} : { text }) });

  const groups = (forApplicationMenu = false): MenuGroup[] => {
    const locale = options.locale();
    const text = (japanese: string): string => (locale === "ja" ? japanese : englishMenu[japanese] ?? japanese);
    const fileEntries: MenuEntry[] = [
      commandItem("file.new"),
      commandItem("file.open"),
      commandItem("file.renameProject"),
      separator(),
      commandItem("file.save"),
      commandItem("history.checkpoint"),
      commandItem("file.export"),
      commandItem("file.exportText")
    ];
    if (!forApplicationMenu) {
      fileEntries.push(separator(), { id: "app.close-or-quit", text: text("終了"), action: closeWindow });
    }
    return [
      {
        id: "file",
        label: text("ファイル"),
        entries: fileEntries
      },
      {
        id: "edit",
        label: text("編集"),
        entries: [
          commandItem("editor.find"),
          commandItem("editor.replace"),
          separator(),
          {
            text: text("小説向け入力"),
            items: [
              commandItem("editor.ruby"),
              commandItem("editor.emphasis"),
              commandItem("editor.normalizePunctuation"),
              commandItem("editor.indentedParagraph"),
              commandItem("editor.japaneseQuotes"),
              commandItem("editor.tateChuYoko")
            ]
          },
          {
            text: text("構成編集"),
            items: [
              commandItem("editor.splitScene"),
              commandItem("editor.mergePrevious")
            ]
          },
          separator(),
          commandItem("editor.undo"),
          commandItem("editor.redo"),
          separator(),
          predefined("Cut", text("切り取り")),
          predefined("Copy", text("コピー")),
          predefined("Paste", text("貼り付け")),
          predefined("SelectAll", text("すべて選択"))
        ]
      },
      {
        id: "settings",
        label: text("設定"),
        entries: [
          commandItem("view.settings", text("設定を開く…")),
          separator(),
          commandItem("view.settings.appearance"),
          commandItem("view.settings.layout"),
          commandItem("view.settings.editor"),
          commandItem("view.settings.ai"),
          commandItem("view.settings.accounts"),
          commandItem("view.settings.keyboard"),
          commandItem("view.settings.updates")
        ]
      },
      {
        id: "view",
        label: text("表示"),
        entries: [
          commandItem("workbench.commandPalette"),
          commandItem("workbench.quickOpen"),
          separator(),
          commandItem("editor.splitRight"),
          commandItem("editor.splitDown"),
          commandItem("editor.closeGroup"),
          {
            text: text("エディター タブ"),
            items: [
              commandItem("editor.moveTabLeft"),
              commandItem("editor.moveTabRight"),
              commandItem("editor.moveTabToOtherGroup")
            ]
          },
          separator(),
          commandItem("view.outline"),
          commandItem("view.lens"),
          commandItem("view.search"),
          commandItem("view.history"),
          commandItem("view.story"),
          separator(),
          commandItem("view.zen"),
          commandItem("layout.reset"),
          separator(),
          predefined("Fullscreen", text("全画面表示を切り替える")),
          predefined("Minimize", text("最小化")),
          { id: "window.close", text: text("ウィンドウを閉じる"), action: closeWindow }
        ]
      },
      {
        id: "help",
        label: text("ヘルプ"),
        entries: [
          commandItem("updates.check"),
          separator(),
          { id: "help.releases", text: text("GitHub Releasesを開く"), action: openReleases }
        ]
      }
    ];
  };

  const buildSubmenu = async (group: MenuGroup): Promise<Submenu> => Submenu.new({
    id: `menu:${group.id}`,
    text: group.label,
    items: group.entries
  });

  const buildMenu = async (forApplicationMenu = false): Promise<Menu> => Menu.new({
    items: await Promise.all(groups(forApplicationMenu).map((group) => buildSubmenu(group)))
  });

  const buildApplicationMenu = async (): Promise<Menu> => {
    const text = (japanese: string): string => (options.locale() === "ja" ? japanese : englishMenu[japanese] ?? japanese);
    const application = await Submenu.new({
      id: "menu:app",
      text: "KOHON",
      items: [
        predefined({ About: null }),
        separator(),
        commandItem("view.settings", text("設定…")),
        separator(),
        predefined("Hide", text("KOHONを隠す")),
        predefined("HideOthers", text("ほかを隠す")),
        predefined("ShowAll", text("すべてを表示")),
        separator(),
        predefined("Quit", text("KOHONを終了"))
      ]
    });
    const commands = await Promise.all(groups(true).map((group) => buildSubmenu(group)));
    return Menu.new({ id: "menu:application", items: [application, ...commands] });
  };

  return {
    groups: () => groups().map((group, index) => ({ index, label: group.label })),
    async show(position) {
      const all = groups();
      const existing = activeMenu;
      activeMenu = null;
      if (existing !== null) void existing.close().catch(() => undefined);
      let menu: Menu | Submenu;
      let at: LogicalPosition;
      if (position?.index === undefined) {
        menu = await buildMenu();
        at = new LogicalPosition(8, 36);
      } else {
        const group = all[position.index];
        if (group === undefined) throw new Error("Unknown application menu");
        menu = await buildSubmenu(group);
        at = new LogicalPosition(
          Math.max(0, Math.round(position.x ?? 8)),
          Math.max(0, Math.round(position.y ?? 36))
        );
      }
      activeMenu = menu;
      await menu.popup(at, getCurrentWindow());
    },
    installApplicationMenu() {
      const next = applicationInstall.then(async () => {
        const menu = await buildApplicationMenu();
        const previous = await menu.setAsAppMenu();
        const stale = applicationMenu;
        applicationMenu = menu;
        if (stale !== null && stale !== menu && stale !== previous) void stale.close().catch(() => undefined);
        if (previous !== null && previous !== menu) void previous.close().catch(() => undefined);
      });
      applicationInstall = next.catch(() => undefined);
      return next;
    }
  };
}

const englishMenu: Record<string, string> = {
  "ファイル": "File",
  "編集": "Edit",
  "設定": "Settings",
  "表示": "View",
  "ヘルプ": "Help",
  "小説向け入力": "Novel Input Helpers",
  "構成編集": "Structure",
  "エディター タブ": "Editor Tabs",
  "設定を開く…": "Open Settings…",
  "設定…": "Settings…",
  "切り取り": "Cut",
  "コピー": "Copy",
  "貼り付け": "Paste",
  "すべて選択": "Select All",
  "終了": "Quit",
  "全画面表示を切り替える": "Toggle Full Screen",
  "最小化": "Minimize",
  "ウィンドウを閉じる": "Close Window",
  "GitHub Releasesを開く": "Open GitHub Releases",
  "KOHONを隠す": "Hide KOHON",
  "ほかを隠す": "Hide Others",
  "すべてを表示": "Show All",
  "KOHONを終了": "Quit KOHON"
};
