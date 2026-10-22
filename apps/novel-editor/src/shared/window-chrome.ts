export const TITLEBAR_HEIGHT = 36;

export function windowChromePalette(theme: string, systemDark: boolean): { background: string; titlebar: string; symbols: string } {
  const dark = theme === "dark" || (theme === "system" && systemDark);
  return dark
    ? { background: "#181818", titlebar: "#202020", symbols: "#e4e4e4" }
    : { background: "#f5f5f5", titlebar: "#f8f8f8", symbols: "#262626" };
}

export function windowChromeOptions(platform: string, theme: string, systemDark: boolean) {
  const palette = windowChromePalette(theme, systemDark);
  return {
    titleBarStyle: platform === "darwin" ? "hiddenInset" as const : "hidden" as const,
    // A custom menu row owns F10 navigation; do not reveal an extra OS row.
    autoHideMenuBar: false,
    ...(platform === "darwin" ? {} : { titleBarOverlay: { color: palette.titlebar, symbolColor: palette.symbols, height: TITLEBAR_HEIGHT } })
  };
}
