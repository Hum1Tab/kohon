/** A persisted, recursive workbench layout. Tool views live in tab groups around one editor. */
export type ViewId = "outline" | "lens" | "search" | "history" | "map";
export type SlotId = "primary" | "secondary" | "bottom";
export type PhysicalSide = "left" | "right";
export type BottomPanelAlignment = "editor" | "justify";
export type LayoutPreset = "writing" | "review" | "compare";
export type DockZone = "center" | "left" | "right" | "top" | "bottom";

export interface DockEditorNode { type: "editor"; id: string; }
export interface DockTabsNode { type: "tabs"; id: string; views: ViewId[]; activeView: ViewId | null; visible: boolean; }
export interface DockSplitNode { type: "split"; id: string; direction: "horizontal" | "vertical"; children: DockNode[]; sizes: number[]; }
export type DockNode = DockEditorNode | DockTabsNode | DockSplitNode;
export interface DockSlotState { views: ViewId[]; activeView: ViewId | null; visible: boolean; size: number; }

export interface LayoutPreferences {
  root: DockNode;
  activityBar: PhysicalSide;
  activityBarVisible: boolean;
  zenMode: boolean;
  /** Retained for one-release downgrade compatibility. */
  primarySide: PhysicalSide;
  secondarySameSide: boolean;
  bottomPanelAlignment: BottomPanelAlignment;
  bottomPanelMaximized: boolean;
}

export type LayoutPatch = Partial<Omit<LayoutPreferences, "root">> & { root?: DockNode };

export const VIEW_IDS: readonly ViewId[] = ["outline", "lens", "search", "history", "map"];
export const TOOL_VIEWS: readonly ViewId[] = ["lens", "search", "history"];
export const LAYOUT_LIMITS = {
  primary: { min: 180, max: 420, def: 252 },
  secondary: { min: 280, max: 680, def: 380 },
  bottom: { min: 200, max: 560, def: 310 }
} as const;
export const EDITOR_MIN_WIDTH = 430;
export const EDITOR_SCROLL_MIN_HEIGHT = 240;

const objectValue = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const isViewId = (value: unknown): value is ViewId => VIEW_IDS.includes(value as ViewId);

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeSizes(values: readonly number[], count: number): number[] {
  if (count <= 0) return [];
  const usable = Array.from({ length: count }, (_, index) => positiveNumber(values[index], 1));
  const total = usable.reduce((sum, value) => sum + value, 0);
  return usable.map((value) => value / total);
}

function tabs(id: string, views: ViewId[], visible = true, activeView: ViewId | null = views[0] ?? null): DockTabsNode {
  return {
    type: "tabs", id, views,
    activeView: activeView !== null && views.includes(activeView) ? activeView : views[0] ?? null,
    visible: visible && views.length > 0
  };
}

function editor(id = "editor"): DockEditorNode { return { type: "editor", id }; }

function split(id: string, direction: DockSplitNode["direction"], children: DockNode[], sizes: readonly number[] = []): DockSplitNode {
  return { type: "split", id, direction, children, sizes: normalizeSizes(sizes, children.length) };
}

export function defaultLayout(): LayoutPreferences {
  return {
    root: split("root-vertical", "vertical", [split("root", "horizontal", [tabs("primary", ["outline"]), editor(), tabs("secondary", [...TOOL_VIEWS], false)], [252, 760, 380]), tabs("bottom", ["map"], false)], [760, LAYOUT_LIMITS.bottom.def]),
    activityBar: "left", activityBarVisible: true, zenMode: false,
    primarySide: "left", secondarySameSide: false,
    bottomPanelAlignment: "editor", bottomPanelMaximized: false
  };
}

function cleanNode(raw: unknown, seenViews: Set<ViewId>, seenIds: Set<string>, editorState: { found: boolean }): DockNode | null {
  const value = objectValue(raw);
  const type = value["type"];
  const requestedId = typeof value["id"] === "string" && value["id"].trim().length > 0 ? value["id"] : String(type ?? "node");
  let id = requestedId;
  for (let suffix = 2; seenIds.has(id); suffix += 1) id = `${requestedId}-${suffix}`;
  seenIds.add(id);
  if (type === "editor") {
    if (editorState.found) return null;
    editorState.found = true;
    return editor(id);
  }
  if (type === "tabs") {
    const views: ViewId[] = [];
    if (Array.isArray(value["views"])) {
      for (const candidate of value["views"]) {
        if (!isViewId(candidate) || seenViews.has(candidate)) continue;
        seenViews.add(candidate);
        views.push(candidate);
      }
    }
    if (views.length === 0) return null;
    return tabs(id, views, value["visible"] !== false, isViewId(value["activeView"]) ? value["activeView"] : null);
  }
  if (type !== "split" || (value["direction"] !== "horizontal" && value["direction"] !== "vertical") || !Array.isArray(value["children"])) return null;
  const children: DockNode[] = [];
  const weights: number[] = [];
  const rawSizes = Array.isArray(value["sizes"]) ? value["sizes"] : [];
  value["children"].forEach((child, index) => {
    const cleaned = cleanNode(child, seenViews, seenIds, editorState);
    if (cleaned === null) return;
    children.push(cleaned);
    weights.push(positiveNumber(rawSizes[index], 1));
  });
  if (children.length === 0) return null;
  if (children.length === 1) return children[0]!;
  return split(id, value["direction"], children, weights);
}

function allNodeIds(root: DockNode): Set<string> {
  const ids = new Set<string>();
  const visit = (node: DockNode): void => { ids.add(node.id); if (node.type === "split") node.children.forEach(visit); };
  visit(root);
  return ids;
}

function uniqueNodeId(root: DockNode, prefix: string): string {
  const ids = allNodeIds(root);
  if (!ids.has(prefix)) return prefix;
  let suffix = 2;
  while (ids.has(`${prefix}-${suffix}`)) suffix += 1;
  return `${prefix}-${suffix}`;
}

/** Keep all existing tab placements/sizes; add an absent map to the bottom only. */
function addMapAtBottom(root: DockNode): DockNode {
  const append = (node: DockNode): DockNode | null => {
    if (node.type !== "split") return null;
    // A vertical split's last tab group is an existing bottom dock.
    if (node.direction === "vertical" && node.children.length > 1) {
      const last = node.children[node.children.length - 1]!;
      if (last.type === "tabs") return split(node.id, node.direction, [...node.children.slice(0, -1), tabs(last.id, [...last.views, "map"], last.visible, last.activeView)], node.sizes);
    }
    for (let index = 0; index < node.children.length; index += 1) {
      const changed = append(node.children[index]!);
      if (changed !== null) return split(node.id, node.direction, node.children.map((child, i) => i === index ? changed : child), node.sizes);
    }
    return null;
  };
  return append(root) ?? split(uniqueNodeId(root, "map-vertical"), "vertical", [root, tabs(uniqueNodeId(root, "map-bottom"), ["map"], false)], [760, LAYOUT_LIMITS.bottom.def]);
}

function completeTree(rawRoot: unknown): DockNode {
  const seenViews = new Set<ViewId>();
  const editorState = { found: false };
  let root = cleanNode(rawRoot, seenViews, new Set<string>(), editorState);
  if (root === null) root = editor();
  if (!editorState.found) root = split(uniqueNodeId(root, "root"), "horizontal", [root, editor()], [1, 2]);
  const missing = VIEW_IDS.filter((view) => view !== "map" && !seenViews.has(view));
  if (missing.length > 0) root = split(uniqueNodeId(root, "recovered"), "horizontal", [root, tabs(uniqueNodeId(root, "recovered-tabs"), missing, false)], [3, 1]);
  if (!seenViews.has("map")) root = addMapAtBottom(root);
  return root;
}

export function sanitizeLayout(raw: Record<string, unknown>): LayoutPreferences {
  const defaults = defaultLayout();
  return {
    root: completeTree(raw["root"] ?? defaults.root),
    activityBar: raw["activityBar"] === "right" ? "right" : "left",
    activityBarVisible: raw["activityBarVisible"] !== false,
    zenMode: raw["zenMode"] === true,
    primarySide: raw["primarySide"] === "right" ? "right" : "left",
    secondarySameSide: raw["secondarySameSide"] === true,
    bottomPanelAlignment: raw["bottomPanelAlignment"] === "justify" ? "justify" : "editor",
    bottomPanelMaximized: raw["bottomPanelMaximized"] === true
  };
}

function legacyViews(raw: Record<string, unknown>, fallback: ViewId[]): ViewId[] {
  return Array.isArray(raw["views"]) ? raw["views"].filter(isViewId) : fallback;
}

/** Convert both the original v1 fields and the fixed-slot v2-v4 layout to the dock tree. */
export function migrateSlots(raw: Record<string, unknown>): LayoutPreferences {
  const slotValues = objectValue(raw["slots"]);
  const primaryRaw = objectValue(slotValues["primary"]);
  const secondaryRaw = objectValue(slotValues["secondary"]);
  const bottomRaw = objectValue(slotValues["bottom"]);
  const primarySide: PhysicalSide = raw["primarySide"] === "right" || raw["primarySidebar"] === "right" ? "right" : "left";
  const inspector = raw["inspector"] === "left" || raw["inspector"] === "bottom" ? raw["inspector"] : "right";
  const secondarySameSide = typeof raw["secondarySameSide"] === "boolean" ? raw["secondarySameSide"] : inspector === primarySide;
  const primary = tabs("primary", legacyViews(primaryRaw, ["outline"]), primaryRaw["visible"] !== false && raw["showPrimarySidebar"] !== false, isViewId(primaryRaw["activeView"]) ? primaryRaw["activeView"] : null);
  const secondary = tabs("secondary", legacyViews(secondaryRaw, inspector === "bottom" ? [] : [...TOOL_VIEWS]), secondaryRaw["visible"] !== false && raw["showInspector"] !== false, isViewId(secondaryRaw["activeView"]) ? secondaryRaw["activeView"] : null);
  const bottom = tabs("bottom", legacyViews(bottomRaw, inspector === "bottom" ? [...TOOL_VIEWS] : []), bottomRaw["visible"] !== false && raw["showInspector"] !== false, isViewId(bottomRaw["activeView"]) ? bottomRaw["activeView"] : null);
  const left: DockNode[] = [];
  const right: DockNode[] = [];
  const primaryColumn = secondarySameSide && secondary.views.length > 0
    ? split("primary-stack", "horizontal", [primary, secondary], [positiveNumber(primaryRaw["size"], 252), positiveNumber(secondaryRaw["size"], 380)])
    : primary;
  (primarySide === "left" ? left : right).push(primaryColumn);
  if (!secondarySameSide && secondary.views.length > 0) (primarySide === "left" ? right : left).push(secondary);
  const horizontalChildren = [...left, editor(), ...right];
  const horizontalWeights = horizontalChildren.map((node) => node.id === "primary" ? positiveNumber(primaryRaw["size"], positiveNumber(raw["sidebarWidth"], 252)) : node.id === "secondary" ? positiveNumber(secondaryRaw["size"], positiveNumber(raw["inspectorWidth"], 380)) : node.id === "primary-stack" ? 632 : 760);
  let root: DockNode = split("root", "horizontal", horizontalChildren, horizontalWeights);
  if (bottom.views.length > 0) root = split("root-vertical", "vertical", [root, bottom], [760, positiveNumber(bottomRaw["size"], positiveNumber(raw["bottomPanelHeight"], 310))]);
  return {
    root: completeTree(root), activityBar: raw["activityBar"] === "right" ? "right" : "left",
    activityBarVisible: raw["activityBarVisible"] !== false, zenMode: raw["zenMode"] === true,
    primarySide, secondarySameSide,
    bottomPanelAlignment: raw["bottomPanelAlignment"] === "justify" ? "justify" : "editor",
    bottomPanelMaximized: raw["bottomPanelMaximized"] === true
  };
}

export function migrateLayoutV1(raw: Record<string, unknown>): LayoutPreferences { return migrateSlots(raw); }

export function findDockNode(root: DockNode, id: string): DockNode | null {
  if (root.id === id) return root;
  if (root.type !== "split") return null;
  for (const child of root.children) { const found = findDockNode(child, id); if (found !== null) return found; }
  return null;
}

export function listTabsNodes(layout: LayoutPreferences): DockTabsNode[] {
  const result: DockTabsNode[] = [];
  const visit = (node: DockNode): void => { if (node.type === "tabs") result.push(node); else if (node.type === "split") node.children.forEach(visit); };
  visit(layout.root);
  return result;
}

export function findViewNode(layout: LayoutPreferences, view: ViewId): DockTabsNode | null {
  return listTabsNodes(layout).find((node) => node.views.includes(view)) ?? null;
}

function transformNode(root: DockNode, transform: (node: DockNode) => DockNode | null): DockNode | null {
  const transformed = transform(root);
  if (transformed === null || transformed.type !== "split") return transformed;
  const children: DockNode[] = [];
  const weights: number[] = [];
  transformed.children.forEach((child, index) => {
    const next = transformNode(child, transform);
    if (next === null) return;
    children.push(next);
    weights.push(transformed.sizes[index] ?? 1);
  });
  if (children.length === 0) return null;
  if (children.length === 1) return children[0]!;
  return split(transformed.id, transformed.direction, children, weights);
}

function removeView(root: DockNode, view: ViewId): DockNode | null {
  return transformNode(root, (node) => {
    if (node.type !== "tabs" || !node.views.includes(view)) return node;
    const views = node.views.filter((candidate) => candidate !== view);
    if (views.length === 0) return null;
    return tabs(node.id, views, node.visible, node.activeView === view ? views[0]! : node.activeView);
  });
}

function replaceNode(root: DockNode, id: string, replacement: DockNode): DockNode {
  if (root.id === id) return replacement;
  if (root.type !== "split") return root;
  const children = root.children.map((child) => replaceNode(child, id, replacement));
  return split(root.id, root.direction, children, root.sizes);
}

export function dockView(layout: LayoutPreferences, view: ViewId, targetNodeId: string, zone: DockZone, index?: number): LayoutPreferences {
  const source = findViewNode(layout, view);
  const originalTarget = findDockNode(layout.root, targetNodeId);
  if (originalTarget === null || originalTarget.type === "split") return layout;
  if (zone === "center" && originalTarget.type === "editor") return layout;
  if (source?.id === targetNodeId && source.views.length === 1) return layout;
  const withoutView = removeView(layout.root, view) ?? editor();
  const target = findDockNode(withoutView, targetNodeId);
  if (target === null || target.type === "split") return layout;
  if (zone === "center" && target.type === "tabs") {
    const requested = Math.max(0, Math.min(index ?? target.views.length, source?.id === target.id ? source.views.length : target.views.length));
    let insertion = requested;
    if (source?.id === target.id && index !== undefined) { const oldIndex = source.views.indexOf(view); if (oldIndex >= 0 && oldIndex < requested) insertion -= 1; }
    insertion = Math.max(0, Math.min(insertion, target.views.length));
    const views = [...target.views];
    views.splice(insertion, 0, view);
    return { ...layout, root: completeTree(replaceNode(withoutView, target.id, tabs(target.id, views, true, view))) };
  }
  const direction: DockSplitNode["direction"] = zone === "left" || zone === "right" ? "horizontal" : "vertical";
  const newTabs = tabs(uniqueNodeId(withoutView, `tabs-${view}`), [view]);
  const children = zone === "left" || zone === "top" ? [newTabs, target] : [target, newTabs];
  const replacement = split(uniqueNodeId(withoutView, `split-${view}`), direction, children, [1, 1]);
  return { ...layout, root: completeTree(replaceNode(withoutView, target.id, replacement)) };
}

export const moveViewToZone = dockView;

export function setTabsActive(layout: LayoutPreferences, nodeId: string, view: ViewId): LayoutPreferences {
  const node = findDockNode(layout.root, nodeId);
  return node?.type === "tabs" && node.views.includes(view) ? { ...layout, root: replaceNode(layout.root, nodeId, tabs(node.id, node.views, true, view)) } : layout;
}

export function setTabsVisibility(layout: LayoutPreferences, nodeId: string, visible: boolean): LayoutPreferences {
  const node = findDockNode(layout.root, nodeId);
  return node?.type === "tabs" ? { ...layout, root: replaceNode(layout.root, nodeId, tabs(node.id, node.views, visible, node.activeView)) } : layout;
}

export function setSplitSizes(layout: LayoutPreferences, nodeId: string, values: number[]): LayoutPreferences {
  const node = findDockNode(layout.root, nodeId);
  return node?.type === "split" && values.length === node.children.length ? { ...layout, root: replaceNode(layout.root, nodeId, split(node.id, node.direction, node.children, values)) } : layout;
}

export function toggleViewVisibility(layout: LayoutPreferences, view: ViewId): LayoutPreferences {
  const node = findViewNode(layout, view);
  return node === null ? layout : setTabsVisibility(layout, node.id, !node.visible);
}

export function revealView(layout: LayoutPreferences, view: ViewId): LayoutPreferences {
  const node = findViewNode(layout, view);
  return node === null ? layout : setTabsActive(layout, node.id, view);
}

export function mergeLayout(layout: LayoutPreferences, patch?: LayoutPatch): LayoutPreferences {
  return patch === undefined ? layout : sanitizeLayout({ ...layout, ...patch, root: patch.root ?? layout.root } as unknown as Record<string, unknown>);
}

export function applyLayoutInvariants(layout: LayoutPreferences): LayoutPreferences { return sanitizeLayout(layout as unknown as Record<string, unknown>); }

export function applyLayoutPreset(layout: LayoutPreferences, preset: LayoutPreset): LayoutPreferences {
  const next = defaultLayout();
  next.activityBar = layout.activityBar;
  next.activityBarVisible = layout.activityBarVisible;
  if (preset === "writing") {
    const secondary = findViewNode(next, "lens");
    if (secondary !== null) next.root = setTabsVisibility(next, secondary.id, false).root;
  } else if (preset === "review") {
    const secondary = findViewNode(next, "lens");
    if (secondary !== null) next.root = setTabsVisibility(next, secondary.id, true).root;
    const bottom = findViewNode(next, "map");
    if (bottom !== null) next.root = setTabsVisibility(next, bottom.id, true).root;
  } else if (preset === "compare") {
    next.root = split("root-vertical", "vertical", [
      split("root", "horizontal", [tabs("primary", ["outline"], false), editor(), tabs("secondary", ["lens", "search"], true, "search")], [252, 760, 380]),
      tabs("bottom", ["history", "map"], true, "history")
    ], [3, 1]);
  }
  return sanitizeLayout(next as unknown as Record<string, unknown>);
}

/** Custom arrangements must not be mislabeled as a preset; ignore only split sizes and node IDs. */
export function activeLayoutPreset(layout: LayoutPreferences): LayoutPreset | null {
  if (layout.zenMode) return null;
  const shape = (node: DockNode): unknown => node.type === "editor" ? "editor" : node.type === "tabs"
    ? { views: node.views, activeView: node.activeView, visible: node.visible }
    : { direction: node.direction, children: node.children.map(shape) };
  const current = JSON.stringify(shape(layout.root));
  return (["writing", "review", "compare"] as const).find((preset) => JSON.stringify(shape(applyLayoutPreset(layout, preset).root)) === current) ?? null;
}

/** Flex factors summing to less than one leave unused space when a sibling is hidden.
 * Normalize visible children only, preserving their relative widths/heights. */
export function dockFlexWeights(weights: readonly number[]): number[] {
  return normalizeSizes(weights, weights.length).map((weight) => weight * 100);
}

/** Legacy helpers kept while older renderer code and settings are migrated. */
export function slotOf(layout: LayoutPreferences, view: ViewId): SlotId | null {
  const id = findViewNode(layout, view)?.id;
  return id === "primary" || id === "secondary" || id === "bottom" ? id : null;
}

export function moveView(layout: LayoutPreferences, view: ViewId, destination: SlotId, index?: number): LayoutPreferences {
  const target = findDockNode(layout.root, destination);
  return target?.type === "tabs" ? dockView(layout, view, destination, "center", index) : layout;
}

export function placeViewOnSide(layout: LayoutPreferences, view: ViewId, destination: PhysicalSide | "bottom"): LayoutPreferences {
  const editorNode = findDockNode(layout.root, "editor");
  return editorNode === null ? layout : dockView(layout, view, editorNode.id, destination === "bottom" ? "bottom" : destination);
}

export function moveSlotToSide(layout: LayoutPreferences, _slot: Exclude<SlotId, "bottom">, side: PhysicalSide): LayoutPreferences { return { ...layout, primarySide: side }; }
export function sideOf(slot: Exclude<SlotId, "bottom">, layout: LayoutPreferences): PhysicalSide { return slot === "primary" ? layout.primarySide : layout.secondarySameSide ? layout.primarySide : layout.primarySide === "left" ? "right" : "left"; }

interface DockPathStep { direction: DockSplitNode["direction"]; childIndex: number; }

function pathToNode(root: DockNode, nodeId: string, path: DockPathStep[] = []): DockPathStep[] | null {
  if (root.id === nodeId) return path;
  if (root.type !== "split") return null;
  for (let index = 0; index < root.children.length; index += 1) {
    const found = pathToNode(root.children[index]!, nodeId, [...path, { direction: root.direction, childIndex: index }]);
    if (found !== null) return found;
  }
  return null;
}

function editorNodeId(root: DockNode): string | null {
  if (root.type === "editor") return root.id;
  if (root.type !== "split") return null;
  for (const child of root.children) { const found = editorNodeId(child); if (found !== null) return found; }
  return null;
}

function nodePosition(layout: LayoutPreferences, nodeId: string): "left" | "right" | "top" | "bottom" | "center" {
  const editorId = editorNodeId(layout.root);
  if (editorId === null) return "center";
  const targetPath = pathToNode(layout.root, nodeId);
  const editorPath = pathToNode(layout.root, editorId);
  if (targetPath === null || editorPath === null) return "center";
  const length = Math.min(targetPath.length, editorPath.length);
  for (let index = 0; index < length; index += 1) {
    const target = targetPath[index]!;
    const manuscript = editorPath[index]!;
    if (target.childIndex === manuscript.childIndex) continue;
    if (target.direction === "horizontal") return target.childIndex < manuscript.childIndex ? "left" : "right";
    return target.childIndex < manuscript.childIndex ? "top" : "bottom";
  }
  return "center";
}

export function projectLayoutV1(layout: LayoutPreferences) {
  const outline = findViewNode(layout, "outline");
  const primaryViews = outline?.views ?? ["outline"];
  const primarySet = new Set(primaryViews);
  const secondaryViews: ViewId[] = [];
  const bottomViews: ViewId[] = [];
  const groups = listTabsNodes(layout);
  for (const group of groups) {
    if (group.id === outline?.id) continue;
    const destination = nodePosition(layout, group.id) === "bottom" ? bottomViews : secondaryViews;
    for (const view of group.views) if (!primarySet.has(view)) destination.push(view);
  }
  for (const view of VIEW_IDS) {
    if (primarySet.has(view) || secondaryViews.includes(view) || bottomViews.includes(view)) continue;
    secondaryViews.push(view);
  }
  const secondaryGroup = groups.find((group) => group.views.some((view) => secondaryViews.includes(view))) ?? null;
  const bottomGroup = groups.find((group) => group.views.some((view) => bottomViews.includes(view))) ?? null;
  const primaryPosition = outline === null ? "center" : nodePosition(layout, outline.id);
  const projectedPrimarySide: PhysicalSide = primaryPosition === "left" || primaryPosition === "right" ? primaryPosition : layout.primarySide;
  const secondaryPosition = secondaryGroup === null ? "center" : nodePosition(layout, secondaryGroup.id);
  const inspector: "left" | "right" | "bottom" = bottomViews.length > 0
    ? "bottom"
    : secondaryPosition === "left" || secondaryPosition === "right" ? secondaryPosition : projectedPrimarySide === "left" ? "right" : "left";
  const slot = (views: ViewId[], group: DockTabsNode | null, size: number): DockSlotState => ({
    views,
    activeView: group?.activeView !== null && group?.activeView !== undefined && views.includes(group.activeView) ? group.activeView : views[0] ?? null,
    visible: views.length > 0 && (group?.visible ?? false),
    size
  });
  return {
    primarySidebar: projectedPrimarySide,
    inspector,
    activityBar: layout.activityBar,
    showPrimarySidebar: outline?.visible ?? false,
    showInspector: secondaryGroup?.visible === true || bottomGroup?.visible === true,
    sidebarWidth: LAYOUT_LIMITS.primary.def,
    inspectorWidth: LAYOUT_LIMITS.secondary.def,
    bottomPanelHeight: LAYOUT_LIMITS.bottom.def,
    zenMode: layout.zenMode,
    primarySide: projectedPrimarySide,
    secondarySameSide: secondaryPosition === projectedPrimarySide,
    slots: {
      primary: slot(primaryViews, outline, LAYOUT_LIMITS.primary.def),
      secondary: slot(secondaryViews, secondaryGroup, LAYOUT_LIMITS.secondary.def),
      bottom: slot(bottomViews, bottomGroup, LAYOUT_LIMITS.bottom.def)
    }
  };
}
