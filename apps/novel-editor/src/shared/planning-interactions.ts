import type { StoryMap } from "@kohon/project-store/story-map";
import type { MysteryBoard, KnowledgeState } from "@kohon/project-store/mystery";

export type PlacementKind = "plant" | "reframe" | "payoff" | "knowledge" | "custody" | "deduction";
export interface Placement { kind: PlacementKind; rowId: string; sceneId: string }

/** Relinks the selected occurrence; preserves every other occurrence and its authored detail. */
export function moveMysteryPlacement(map: StoryMap, board: MysteryBoard, placement: Placement, toSceneId: string): MysteryBoard {
  if (!map.scenes.some(s => s.id === toSceneId) || placement.sceneId === toSceneId) return board;
  if (placement.kind === "plant" || placement.kind === "reframe" || placement.kind === "payoff") {
    const found = board.clues.find(c => c.id === placement.rowId);
    if (!found) return board;
    if (placement.kind === "plant" && !found.plantedSceneIds.includes(placement.sceneId)) return board;
    if (placement.kind === "reframe" && found.reinterpretedSceneId !== placement.sceneId) return board;
    if (placement.kind === "payoff" && found.payoffSceneId !== placement.sceneId) return board;
    return { ...board, clues: board.clues.map(c => c.id !== found.id ? c : placement.kind === "plant" ? { ...c, plantedSceneIds: [...new Set(c.plantedSceneIds.map(id => id === placement.sceneId ? toSceneId : id))] } : placement.kind === "reframe" ? { ...c, reinterpretedSceneId: toSceneId } : { ...c, payoffSceneId: toSceneId }) };
  }
  const key = placement.kind === "knowledge" ? "knowledge" : placement.kind === "custody" ? "custody" : "deductions";
  if (!board[key].some(r => r.id === placement.rowId && r.sceneId === placement.sceneId)) return board;
  return { ...board, [key]: board[key].map(r => r.id === placement.rowId ? { ...r, sceneId: toSceneId } : r) };
}

export function recordKnowledge(map: StoryMap, board: MysteryBoard, factId: string, holderId: string, sceneId: string, state: KnowledgeState, id: string): MysteryBoard {
  if (!map.scenes.some(s => s.id === sceneId) || !board.facts.some(f => f.id === factId) || holderId !== "reader" && !map.characters.some(c => c.id === holderId)) return board;
  const existing = board.knowledge.findLast(e => e.factId === factId && e.holderId === holderId && e.sceneId === sceneId);
  if (!existing && board.knowledge.length >= 5000) return board;
  return { ...board, knowledge: existing ? board.knowledge.map(e => e.id === existing.id ? { ...e, state } : e) : [...board.knowledge, { id, factId, holderId, sceneId, state, belief: "", source: "", sourceCharacterId: null }] };
}
