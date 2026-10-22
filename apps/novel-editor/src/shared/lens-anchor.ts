import { validateFinding } from "@kohon/editor-core";
import type { LensFinding } from "./types.js";

/** Never use an analysis-time offset against a revised manuscript. */
export function refreshLensAnchor(finding: LensFinding, text: string): LensFinding {
  const current = validateFinding(text, finding.quote);
  return {
    ...finding,
    anchorStatus: current.status,
    startUtf16: current.startUtf16 ?? null,
    endUtf16: current.endUtf16 ?? null
  };
}
