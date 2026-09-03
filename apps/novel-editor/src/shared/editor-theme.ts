export type ManuscriptTheme = "paper" | "sepia" | "gray" | "dark" | "custom";

export interface ManuscriptPalette {
  background: string;
  text: string;
  line: string;
}

export const MANUSCRIPT_PALETTES: Record<Exclude<ManuscriptTheme, "custom">, ManuscriptPalette> = {
  paper: { background: "#fffefa", text: "#25231f", line: "#ebe7df" },
  sepia: { background: "#f2e8d5", text: "#3b3025", line: "#dbccb2" },
  gray: { background: "#e6e8eb", text: "#202124", line: "#cdd1d6" },
  dark: { background: "#1e1e1e", text: "#d4d4d4", line: "#353535" }
};

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value);
}

function rgb(color: string): [number, number, number] {
  return [Number.parseInt(color.slice(1, 3), 16), Number.parseInt(color.slice(3, 5), 16), Number.parseInt(color.slice(5, 7), 16)];
}

function luminance(color: string): number {
  const channels = rgb(color).map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

export function contrastRatio(first: string, second: string): number {
  const brighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (brighter + 0.05) / (darker + 0.05);
}

export function automaticTextColor(background: string): string {
  return contrastRatio(background, "#f2f2f2") >= contrastRatio(background, "#202124") ? "#f2f2f2" : "#202124";
}

function mixedLine(background: string, text: string): string {
  const backgroundRgb = rgb(background);
  const textRgb = rgb(text);
  const mixed = backgroundRgb.map((value, index) => Math.round(value * 0.82 + textRgb[index]! * 0.18));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function resolveManuscriptPalette(theme: ManuscriptTheme, customBackground: string, customText: string | null): ManuscriptPalette {
  if (theme !== "custom") return MANUSCRIPT_PALETTES[theme];
  const background = isHexColor(customBackground) ? customBackground.toLowerCase() : MANUSCRIPT_PALETTES.paper.background;
  const text = isHexColor(customText) ? customText.toLowerCase() : automaticTextColor(background);
  return { background, text, line: mixedLine(background, text) };
}
