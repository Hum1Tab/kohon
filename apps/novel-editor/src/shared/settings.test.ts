import { describe, expect, it } from "vitest";

import { bindingFromKeyboardEvent, defaultUserSettings, mergeUserSettings, normalizeKeybinding, sanitizeUserSettings, serializeUserSettings, validateKeybindings } from "./settings.js";

describe("desktop user settings", () => {
  it("keeps workbench modes separate and validates custom manuscript colors", () => {
    expect(defaultUserSettings().appearance.colorTheme).toBe("light");
    expect(defaultUserSettings().general.language).toBe("system");
    const settings = sanitizeUserSettings({ appearance: { colorTheme: "light" }, editor: { theme: "custom", canvasBackground: "#203040", canvasText: "#f0f0f0" } });
    expect(settings.appearance.colorTheme).toBe("light");
    expect(settings.editor).toMatchObject({ theme: "custom", canvasBackground: "#203040", canvasText: "#f0f0f0" });
    expect(sanitizeUserSettings({ editor: { theme: "custom", canvasBackground: "red" } }).editor.canvasBackground).toBe("#fffefa");
  });

  it("migrates and validates the application language", () => {
    expect(sanitizeUserSettings({ schemaVersion: 3, general: { autoSaveDelayMs: 900 } }).general.language).toBe("system");
    expect(sanitizeUserSettings({ schemaVersion: 4, general: { language: "en" } }).general.language).toBe("en");
    expect(sanitizeUserSettings({ schemaVersion: 4, general: { language: "invalid" } }).general.language).toBe("system");
  });

  it("keeps editable keybindings portable, unique, and away from editor-reserved keys", () => {
    const settings = defaultUserSettings();
    expect(normalizeKeybinding("Ctrl+Shift+l")).toBe("Mod+Shift+L");
    expect(normalizeKeybinding("Ctrl+C")).toBeNull();
    expect(bindingFromKeyboardEvent({ key: "u", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true })).toBe("Mod+Shift+U");
    expect(() => validateKeybindings({ ...settings.keybindings, "file.new": "Mod+O" })).toThrow(/重複/u);
    expect(mergeUserSettings(settings, { general: { autoSaveDelayMs: 1500 }, keybindings: { "file.export": "Mod+Shift+R" } })).toMatchObject({ general: { autoSaveDelayMs: 1500 }, keybindings: { "file.export": "Mod+Shift+R" } });
  });

  it("migrates v1 layout fields and writes a v1 compatibility mirror", () => {
    const settings = sanitizeUserSettings({ schemaVersion: 1, layout: { primarySidebar: "right", inspector: "bottom", showInspector: false } });
    expect(settings.schemaVersion).toBe(5);
    expect(settings.layout.primarySide).toBe("right");
    expect(settings.layout.root.type).toBe("split");
    const serialized = JSON.parse(serializeUserSettings(settings)) as { schemaVersion: number; layout: Record<string, unknown> };
    expect(serialized.schemaVersion).toBe(5);
    expect(serialized.layout["primarySidebar"]).toBe("right");
    expect(serialized.layout["inspector"]).toBe("bottom");
    expect(serialized.layout["root"]).toBeDefined();
    expect(serialized.layout["slots"]).toBeDefined();
  });

  it("moves the old workspace search shortcut without discarding custom bindings", () => {
    const migrated = sanitizeUserSettings({ schemaVersion: 2, keybindings: { "view.search": "Mod+F", "view.lens": "Mod+Alt+L" } });
    expect(migrated.keybindings["editor.find"]).toBe("Mod+F");
    expect(migrated.keybindings["view.search"]).toBe("Mod+Shift+F");
    expect(migrated.keybindings["view.lens"]).toBe("Mod+Alt+L");
  });
});
