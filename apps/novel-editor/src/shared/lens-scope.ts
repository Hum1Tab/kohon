import type { LensScopeMode } from "./types.js";

export function resolveLensScope<T extends { id: string; order: number }>(chapters: readonly T[], scope: LensScopeMode, cutoffChapterId: string | null, approvedChapterIds: readonly string[]): T[] {
  const ordered = [...chapters].sort((left, right) => left.order - right.order);
  const cutoffIndex = cutoffChapterId === null ? -1 : ordered.findIndex((chapter) => chapter.id === cutoffChapterId);
  let expected: T[];
  if (scope === "current") {
    if (cutoffIndex < 0) throw new Error("現在の章を確認してください。");
    expected = [ordered[cutoffIndex]!];
  } else if (scope === "through-current") {
    if (cutoffIndex < 0) throw new Error("読了位置を確認してください。");
    expected = ordered.slice(0, cutoffIndex + 1);
  } else if (scope === "all") {
    if (cutoffChapterId !== null) throw new Error("AIへ渡す読了範囲を確認してください。");
    expected = ordered;
  } else throw new Error("AIへ渡す読了範囲を確認してください。");
  const expectedIds = expected.map((chapter) => chapter.id);
  if (expectedIds.length !== approvedChapterIds.length || expectedIds.some((id, index) => id !== approvedChapterIds[index])) throw new Error("確認後に送信範囲が変わりました。もう一度確認してください。");
  return expected;
}
