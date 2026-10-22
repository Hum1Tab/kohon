/** Reveal a target without moving a viewport that already shows it. */
export function revealOffset(position: number, extent: number, viewport: number, current: number, min: number, max: number): number {
  if (viewport <= 0 || !Number.isFinite(position)) return current;
  const margin = Math.min(32, viewport / 4);
  if (position >= current + margin && position + extent <= current + viewport - margin) return current;
  return Math.min(max, Math.max(min, position + extent / 2 - viewport / 2));
}

/** Some React beforeinput events have no native InputEvent metadata. */
export function editOriginForInput(inputType: unknown): "typing" | "input" {
  return typeof inputType === "string" && (inputType === "insertText" || inputType.startsWith("deleteContent")) ? "typing" : "input";
}
