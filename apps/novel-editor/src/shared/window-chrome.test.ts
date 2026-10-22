import { describe, expect, it } from "vitest";
import { TITLEBAR_HEIGHT, windowChromeOptions, windowChromePalette } from "./window-chrome.js";

describe("native window chrome", () => {
  it("keeps native controls in the custom title row on Windows and Linux", () => {
    for (const platform of ["win32", "linux"]) {
      expect(windowChromeOptions(platform, "light", false)).toMatchObject({
        titleBarStyle: "hidden", autoHideMenuBar: false,
        titleBarOverlay: { height: TITLEBAR_HEIGHT, color: "#f8f8f8", symbolColor: "#262626" }
      });
    }
  });
  it("preserves macOS inset traffic lights without Windows overlay options", () => {
    const options = windowChromeOptions("darwin", "dark", false);
    expect(options.titleBarStyle).toBe("hiddenInset");
    expect(options).not.toHaveProperty("titleBarOverlay");
  });
  it("follows the system theme only in system mode, and supports the legacy default", () => {
    expect(windowChromePalette("system", true)).toEqual(windowChromePalette("dark", false));
    expect(windowChromePalette("light", true)).toEqual(windowChromePalette("default", false));
    expect(windowChromePalette("system", false)).toEqual(windowChromePalette("light", false));
  });
});
