import { revealOffset } from "../shared/editor-navigation.js";

const layoutProperties = [
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "fontVariant",
  "fontFeatureSettings", "fontKerning", "lineHeight", "letterSpacing", "wordSpacing",
  "textIndent", "textAlign", "textTransform", "textOrientation", "writingMode", "direction",
  "wordBreak", "overflowWrap", "lineBreak", "tabSize", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"
] as const;

/** Measure the actual wrapped glyph position, including Japanese vertical text.
 * The mirror is invisible, never editable, and does not change manuscript text.
 */
export function revealManuscriptRange(editor: HTMLTextAreaElement, start: number, end: number): void {
  start = Math.max(0, Math.min(editor.value.length, start));
  end = Math.max(start, Math.min(editor.value.length, end));
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(start, end);
  if (editor.clientWidth === 0 || editor.clientHeight === 0) return;
  const doc = editor.ownerDocument;
  const style = doc.defaultView!.getComputedStyle(editor);
  const mirror = doc.createElement("div");
  mirror.setAttribute("aria-hidden", "true");
  Object.assign(mirror.style, {
    position: "fixed", left: "-100000px", top: "0", visibility: "hidden",
    pointerEvents: "none", boxSizing: "border-box", margin: "0", border: "0",
    width: `${editor.clientWidth}px`, height: `${editor.clientHeight}px`, overflow: "hidden",
    whiteSpace: editor.wrap === "off" ? "pre" : "pre-wrap"
  });
  for (const property of layoutProperties) mirror.style[property] = style[property];
  const marker = doc.createElement("span");
  const glyph = String.fromCodePoint(editor.value.codePointAt(start) ?? 0x200b);
  marker.textContent = glyph === "\n" ? "\u200b" : glyph;
  mirror.append(doc.createTextNode(editor.value.slice(0, start)), marker, doc.createTextNode(editor.value.slice(start + (start < editor.value.length ? glyph.length : 0))));
  doc.body.append(mirror);
  try {
    const origin = mirror.getBoundingClientRect();
    const target = marker.getBoundingClientRect();
    const vertical = style.writingMode.startsWith("vertical");
    if (vertical) {
      const reverse = style.writingMode === "vertical-rl";
      const overflow = Math.max(0, editor.scrollWidth - editor.clientWidth);
      editor.scrollLeft = revealOffset(target.left - origin.left, target.width, editor.clientWidth, editor.scrollLeft, reverse ? -overflow : 0, reverse ? 0 : overflow);
    } else {
      editor.scrollTop = revealOffset(target.top - origin.top, target.height, editor.clientHeight, editor.scrollTop, 0, Math.max(0, editor.scrollHeight - editor.clientHeight));
    }
    // A tall/wide editor can also be inside a scrolled pane.
    editor.scrollIntoView({ block: "nearest", inline: "nearest" });
  } finally {
    mirror.remove();
  }
}
