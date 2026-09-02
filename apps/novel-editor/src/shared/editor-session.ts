export type EditorGroupId = "group-1" | "group-2";
export type EditorSplit = "none" | "right" | "down";

export interface EditorTabState {
  chapterId: string;
  selectionStart: number;
  selectionEnd: number;
  scrollTop: number;
  scrollLeft: number;
}

export interface EditorGroupState {
  id: EditorGroupId;
  tabs: EditorTabState[];
  activeChapterId: string | null;
}

export interface EditorSessionState {
  schemaVersion: 1;
  split: EditorSplit;
  activeGroupId: EditorGroupId;
  groups: EditorGroupState[];
}

const GROUP_IDS: readonly EditorGroupId[] = ["group-1", "group-2"];

function finiteOffset(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function tab(chapterId: string): EditorTabState {
  return { chapterId, selectionStart: 0, selectionEnd: 0, scrollTop: 0, scrollLeft: 0 };
}

export function defaultEditorSession(firstChapterId?: string): EditorSessionState {
  return {
    schemaVersion: 1,
    split: "none",
    activeGroupId: "group-1",
    groups: [{ id: "group-1", tabs: firstChapterId === undefined ? [] : [tab(firstChapterId)], activeChapterId: firstChapterId ?? null }]
  };
}

export function sanitizeEditorSession(raw: unknown, chapterIds: readonly string[]): EditorSessionState {
  const validIds = new Set(chapterIds);
  const source = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const rawGroups = Array.isArray(source["groups"]) ? source["groups"] : [];
  const groups: EditorGroupState[] = [];
  for (const [index, rawGroup] of rawGroups.slice(0, 2).entries()) {
    const value = typeof rawGroup === "object" && rawGroup !== null && !Array.isArray(rawGroup) ? rawGroup as Record<string, unknown> : {};
    const id = GROUP_IDS[index]!;
    const tabs: EditorTabState[] = [];
    const seen = new Set<string>();
    for (const rawTab of (Array.isArray(value["tabs"]) ? value["tabs"] : []).slice(0, Math.max(1, chapterIds.length))) {
      const candidate = typeof rawTab === "object" && rawTab !== null && !Array.isArray(rawTab) ? rawTab as Record<string, unknown> : {};
      const chapterId = candidate["chapterId"];
      if (typeof chapterId !== "string" || !validIds.has(chapterId) || seen.has(chapterId)) continue;
      seen.add(chapterId);
      const selectionStart = finiteOffset(candidate["selectionStart"]);
      const selectionEnd = Math.max(selectionStart, finiteOffset(candidate["selectionEnd"]));
      tabs.push({ chapterId, selectionStart, selectionEnd, scrollTop: finiteOffset(candidate["scrollTop"]), scrollLeft: finiteOffset(candidate["scrollLeft"]) });
    }
    const requestedActive = value["activeChapterId"];
    const activeChapterId = typeof requestedActive === "string" && tabs.some((item) => item.chapterId === requestedActive) ? requestedActive : tabs[0]?.chapterId ?? null;
    if (tabs.length > 0 || index === 0) groups.push({ id, tabs, activeChapterId });
  }
  if (groups.length === 0) return defaultEditorSession(chapterIds[0]);
  if (groups[0]!.tabs.length === 0 && chapterIds[0] !== undefined) groups[0] = { id: "group-1", tabs: [tab(chapterIds[0])], activeChapterId: chapterIds[0] };
  const split = groups.length === 2 && (source["split"] === "right" || source["split"] === "down") ? source["split"] : "none";
  if (split === "none") groups.splice(1);
  const requestedGroup = source["activeGroupId"];
  const activeGroupId = typeof requestedGroup === "string" && groups.some((group) => group.id === requestedGroup) ? requestedGroup as EditorGroupId : groups[0]!.id;
  return { schemaVersion: 1, split, activeGroupId, groups };
}

export function openEditorTab(session: EditorSessionState, chapterId: string, groupId: EditorGroupId = session.activeGroupId): EditorSessionState {
  return { ...session, activeGroupId: groupId, groups: session.groups.map((group) => group.id !== groupId ? group : { ...group, tabs: group.tabs.some((item) => item.chapterId === chapterId) ? group.tabs : [...group.tabs, tab(chapterId)], activeChapterId: chapterId }) };
}

export function activateEditorTab(session: EditorSessionState, groupId: EditorGroupId, chapterId: string): EditorSessionState {
  if (!session.groups.some((group) => group.id === groupId && group.tabs.some((item) => item.chapterId === chapterId))) return session;
  return { ...session, activeGroupId: groupId, groups: session.groups.map((group) => group.id === groupId ? { ...group, activeChapterId: chapterId } : group) };
}

export function closeEditorTab(session: EditorSessionState, groupId: EditorGroupId, chapterId: string): EditorSessionState {
  const groups = session.groups.map((group) => {
    if (group.id !== groupId) return group;
    const index = group.tabs.findIndex((item) => item.chapterId === chapterId);
    if (index < 0) return group;
    const tabs = group.tabs.filter((item) => item.chapterId !== chapterId);
    const activeChapterId = group.activeChapterId === chapterId ? tabs[Math.min(index, tabs.length - 1)]?.chapterId ?? null : group.activeChapterId;
    return { ...group, tabs, activeChapterId };
  });
  return { ...session, groups };
}

export function splitEditor(session: EditorSessionState, direction: Exclude<EditorSplit, "none">, chapterId?: string): EditorSessionState {
  const current = session.groups.find((group) => group.id === session.activeGroupId) ?? session.groups[0]!;
  const desiredChapter = chapterId ?? current.activeChapterId;
  const second: EditorGroupState = session.groups[1] ?? { id: "group-2", tabs: desiredChapter === null ? [] : [tab(desiredChapter)], activeChapterId: desiredChapter };
  return { ...session, split: direction, activeGroupId: "group-2", groups: [session.groups[0]!, second] };
}

export function closeEditorGroup(session: EditorSessionState, groupId: EditorGroupId): EditorSessionState {
  if (session.groups.length === 1) return session;
  const remaining = session.groups.find((group) => group.id !== groupId)!;
  return { ...session, split: "none", activeGroupId: "group-1", groups: [{ ...remaining, id: "group-1" }] };
}

export function updateEditorTabView(session: EditorSessionState, groupId: EditorGroupId, chapterId: string, patch: Partial<Omit<EditorTabState, "chapterId">>): EditorSessionState {
  return { ...session, groups: session.groups.map((group) => group.id !== groupId ? group : { ...group, tabs: group.tabs.map((item) => item.chapterId === chapterId ? { ...item, ...patch } : item) }) };
}
