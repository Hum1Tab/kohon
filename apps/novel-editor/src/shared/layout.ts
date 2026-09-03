/**
 * The v2 workbench layout model.
 *
 * A view belongs to exactly one slot.  Keeping this model in shared code means
 * the renderer and the settings store use the same repair and migration rules.
 */
export type ViewId = "outline" | "lens" | "search" | "history";
export type SlotId = "primary" | "secondary" | "bottom";
export type PhysicalSide = "left" | "right";
export type BottomPanelAlignment = "editor" | "justify";

export const VIEW_IDS: readonly ViewId[] = ["outline", "lens", "search", "history"];
export const TOOL_VIEWS: readonly ViewId[] = ["lens", "search", "history"];

export interface DockSlotState {
  views: ViewId[];
  activeView: ViewId | null;
  visible: boolean;
  /** Width for side slots, height for the bottom slot. */
  size: number;
}

export interface LayoutPreferences {
  activityBar: PhysicalSide;
  activityBarVisible: boolean;
  primarySide: PhysicalSide;
  secondarySameSide: boolean;
  bottomPanelAlignment: BottomPanelAlignment;
  bottomPanelMaximized: boolean;
  slots: Record<SlotId, DockSlotState>;
  zenMode: boolean;
}

export const LAYOUT_LIMITS = {
  primary: { min: 180, max: 420, def: 252 },
  secondary: { min: 280, max: 680, def: 380 },
  bottom: { min: 200, max: 560, def: 310 }
} as const;

export const EDITOR_MIN_WIDTH = 430;
export const EDITOR_SCROLL_MIN_HEIGHT = 240;

const SLOT_IDS: readonly SlotId[] = ["primary", "secondary", "bottom"];

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}

function isViewId(value: unknown): value is ViewId {
  return value === "outline" || value === "lens" || value === "search" || value === "history";
}

function defaultSlot(id: SlotId): DockSlotState {
  if (id === "primary") return { views: ["outline"], activeView: "outline", visible: true, size: LAYOUT_LIMITS.primary.def };
  if (id === "secondary") return { views: [...TOOL_VIEWS], activeView: "lens", visible: true, size: LAYOUT_LIMITS.secondary.def };
  return { views: [], activeView: null, visible: false, size: LAYOUT_LIMITS.bottom.def };
}

export function defaultLayout(): LayoutPreferences {
  return {
    activityBar: "left",
    activityBarVisible: true,
    primarySide: "left",
    secondarySameSide: false,
    bottomPanelAlignment: "editor",
    bottomPanelMaximized: false,
    zenMode: false,
    slots: {
      primary: defaultSlot("primary"),
      secondary: defaultSlot("secondary"),
      bottom: defaultSlot("bottom")
    }
  };
}

function overlaySlot(base: DockSlotState, raw: Record<string, unknown>, id: SlotId): DockSlotState {
  // An explicitly supplied [] is meaningful (it hides the slot); an omitted
  // views property inherits the default slot instead.
  const views = Array.isArray(raw["views"]) ? raw["views"].filter(isViewId) : [...base.views];
  const active = raw["activeView"];
  return {
    views,
    activeView: isViewId(active) ? active : base.activeView,
    visible: typeof raw["visible"] === "boolean" ? raw["visible"] : base.visible,
    size: finiteNumber(raw["size"], base.size, LAYOUT_LIMITS[id].min, LAYOUT_LIMITS[id].max)
  };
}

/** Apply v2 values over the default layout and repair its invariants. */
export function sanitizeLayout(raw: Record<string, unknown>): LayoutPreferences {
  const base = defaultLayout();
  const slotsRaw = objectValue(raw["slots"]);
  const next: LayoutPreferences = {
    activityBar: raw["activityBar"] === "right" ? "right" : raw["activityBar"] === "left" ? "left" : base.activityBar,
    activityBarVisible: typeof raw["activityBarVisible"] === "boolean" ? raw["activityBarVisible"] : base.activityBarVisible,
    primarySide: raw["primarySide"] === "right" ? "right" : raw["primarySide"] === "left" ? "left" : base.primarySide,
    secondarySameSide: typeof raw["secondarySameSide"] === "boolean" ? raw["secondarySameSide"] : base.secondarySameSide,
    bottomPanelAlignment: raw["bottomPanelAlignment"] === "justify" ? "justify" : "editor",
    bottomPanelMaximized: typeof raw["bottomPanelMaximized"] === "boolean" ? raw["bottomPanelMaximized"] : base.bottomPanelMaximized,
    zenMode: typeof raw["zenMode"] === "boolean" ? raw["zenMode"] : base.zenMode,
    slots: {
      primary: overlaySlot(base.slots.primary, objectValue(slotsRaw["primary"]), "primary"),
      secondary: overlaySlot(base.slots.secondary, objectValue(slotsRaw["secondary"]), "secondary"),
      bottom: overlaySlot(base.slots.bottom, objectValue(slotsRaw["bottom"]), "bottom")
    }
  };
  return applyLayoutInvariants(next);
}

/**
 * Remove duplicate view IDs (primary wins), put missing views in secondary,
 * and make active/visible state consistent with each slot's contents.
 */
export function applyLayoutInvariants(layout: LayoutPreferences): LayoutPreferences {
  const seen = new Set<ViewId>();
  for (const id of SLOT_IDS) {
    layout.slots[id].views = layout.slots[id].views.filter((view) => {
      if (seen.has(view)) return false;
      seen.add(view);
      return true;
    });
  }
  for (const view of VIEW_IDS) {
    if (!seen.has(view)) {
      layout.slots.secondary.views.push(view);
      seen.add(view);
    }
  }
  for (const id of SLOT_IDS) {
    const slot = layout.slots[id];
    if (slot.views.length === 0) {
      slot.activeView = null;
      slot.visible = false;
    } else if (slot.activeView === null || !slot.views.includes(slot.activeView)) {
      slot.activeView = slot.views[0]!;
    }
    slot.size = finiteNumber(slot.size, LAYOUT_LIMITS[id].def, LAYOUT_LIMITS[id].min, LAYOUT_LIMITS[id].max);
  }
  return layout;
}

/** Convert the v1, all-tools-in-one inspector layout to independent slots. */
export function migrateLayoutV1(raw: Record<string, unknown>): LayoutPreferences {
  const primarySide: PhysicalSide = raw["primarySidebar"] === "right" ? "right" : "left";
  const activityBar: PhysicalSide = raw["activityBar"] === "right" ? "right" : "left";
  const inspector: "left" | "right" | "bottom" = raw["inspector"] === "left" || raw["inspector"] === "bottom" ? raw["inspector"] as "left" | "bottom" : "right";
  const showPrimary = raw["showPrimarySidebar"] !== false;
  const showInspector = raw["showInspector"] !== false;
  const zenMode = raw["zenMode"] === true;
  const primarySize = finiteNumber(raw["sidebarWidth"], LAYOUT_LIMITS.primary.def, LAYOUT_LIMITS.primary.min, LAYOUT_LIMITS.primary.max);
  const secondarySize = finiteNumber(raw["inspectorWidth"], LAYOUT_LIMITS.secondary.def, LAYOUT_LIMITS.secondary.min, LAYOUT_LIMITS.secondary.max);
  const bottomSize = finiteNumber(raw["bottomPanelHeight"], LAYOUT_LIMITS.bottom.def, LAYOUT_LIMITS.bottom.min, LAYOUT_LIMITS.bottom.max);
  const primary: DockSlotState = { views: ["outline"], activeView: "outline", visible: showPrimary, size: primarySize };
  const empty = (size: number): DockSlotState => ({ views: [], activeView: null, visible: false, size });

  if (inspector === "bottom") {
    return {
      activityBar, activityBarVisible: true, primarySide, secondarySameSide: false, bottomPanelAlignment: "editor", bottomPanelMaximized: false, zenMode,
      slots: {
        primary,
        secondary: empty(secondarySize),
        bottom: { views: [...TOOL_VIEWS], activeView: "lens", visible: showInspector, size: bottomSize }
      }
    };
  }
  return {
    activityBar,
    activityBarVisible: true,
    primarySide,
    secondarySameSide: inspector === primarySide,
    bottomPanelAlignment: "editor",
    bottomPanelMaximized: false,
    zenMode,
    slots: {
      primary,
      secondary: { views: [...TOOL_VIEWS], activeView: "lens", visible: showInspector, size: secondarySize },
      bottom: empty(bottomSize)
    }
  };
}

export type LayoutPatch = Partial<Omit<LayoutPreferences, "slots">> & {
  slots?: { [K in SlotId]?: Partial<DockSlotState> };
};

function mergeSlot(current: DockSlotState, patch?: Partial<DockSlotState>): DockSlotState {
  if (patch === undefined) return current;
  return {
    views: patch.views !== undefined ? patch.views : current.views,
    activeView: patch.activeView !== undefined ? patch.activeView : current.activeView,
    visible: patch.visible !== undefined ? patch.visible : current.visible,
    size: patch.size !== undefined ? patch.size : current.size
  };
}

export function mergeLayout(current: LayoutPreferences, patch?: LayoutPatch): LayoutPreferences {
  if (patch === undefined) return current;
  return {
    activityBar: patch.activityBar ?? current.activityBar,
    activityBarVisible: patch.activityBarVisible ?? current.activityBarVisible,
    primarySide: patch.primarySide ?? current.primarySide,
    secondarySameSide: patch.secondarySameSide ?? current.secondarySameSide,
    bottomPanelAlignment: patch.bottomPanelAlignment ?? current.bottomPanelAlignment,
    bottomPanelMaximized: patch.bottomPanelMaximized ?? current.bottomPanelMaximized,
    zenMode: patch.zenMode ?? current.zenMode,
    slots: {
      primary: mergeSlot(current.slots.primary, patch.slots?.primary),
      secondary: mergeSlot(current.slots.secondary, patch.slots?.secondary),
      bottom: mergeSlot(current.slots.bottom, patch.slots?.bottom)
    }
  };
}

function opposite(side: PhysicalSide): PhysicalSide {
  return side === "left" ? "right" : "left";
}

export function sideOf(slot: Exclude<SlotId, "bottom">, layout: LayoutPreferences): PhysicalSide {
  return slot === "primary" ? layout.primarySide : layout.secondarySameSide ? layout.primarySide : opposite(layout.primarySide);
}

export function slotOf(layout: LayoutPreferences, view: ViewId): SlotId | null {
  for (const id of SLOT_IDS) if (layout.slots[id].views.includes(view)) return id;
  return null;
}

/** Move one view, preserving all other slot state and repairing invariants. */
export function moveView(layout: LayoutPreferences, view: ViewId, dest: SlotId, index?: number): LayoutPreferences {
  const next: LayoutPreferences = {
    ...layout,
    slots: {
      primary: { ...layout.slots.primary, views: layout.slots.primary.views.filter((v) => v !== view) },
      secondary: { ...layout.slots.secondary, views: layout.slots.secondary.views.filter((v) => v !== view) },
      bottom: { ...layout.slots.bottom, views: layout.slots.bottom.views.filter((v) => v !== view) }
    }
  };
  const slot = next.slots[dest];
  const at = Math.max(0, Math.min(index ?? slot.views.length, slot.views.length));
  slot.views = [...slot.views.slice(0, at), view, ...slot.views.slice(at)];
  slot.activeView = view;
  slot.visible = true;
  return applyLayoutInvariants(next);
}

/** Move a side slot as a whole, allowing two side columns on one edge. */
export function moveSlotToSide(layout: LayoutPreferences, slot: Exclude<SlotId, "bottom">, side: PhysicalSide): LayoutPreferences {
  if (slot === "primary") {
    return { ...layout, primarySide: side, secondarySameSide: side === sideOf("secondary", layout) };
  }
  return { ...layout, secondarySameSide: side === layout.primarySide };
}

/** Settings/context-menu placement: merge into an existing slot on that side. */
export function placeViewOnSide(layout: LayoutPreferences, view: ViewId, dest: PhysicalSide | "bottom"): LayoutPreferences {
  if (dest === "bottom") return moveView(layout, view, "bottom");
  const onDest: Exclude<SlotId, "bottom">[] = (["primary", "secondary"] as const)
    .filter((id) => sideOf(id, layout) === dest && layout.slots[id].views.length > 0);
  if (onDest.length === 1) return moveView(layout, view, onDest[0]!);
  if (onDest.length >= 2) {
    const target: Exclude<SlotId, "bottom"> = dest === layout.primarySide ? "primary" : "secondary";
    return moveView(layout, view, target);
  }
  // No side slot there: move secondary to that edge, then merge the view.
  return moveView(moveSlotToSide(layout, "secondary", dest), view, "secondary");
}

/** Project v2 state to the legacy fields for one-release downgrade support. */
export function projectLayoutV1(layout: LayoutPreferences): {
  primarySidebar: PhysicalSide;
  inspector: "left" | "right" | "bottom";
  activityBar: PhysicalSide;
  showPrimarySidebar: boolean;
  showInspector: boolean;
  sidebarWidth: number;
  inspectorWidth: number;
  bottomPanelHeight: number;
  zenMode: boolean;
} {
  const toolSlot = (["secondary", "bottom", "primary"] as const)
    .map((id) => ({ id, n: layout.slots[id].views.filter((view) => TOOL_VIEWS.includes(view)).length }))
    .sort((a, b) => b.n - a.n)[0]!;
  let inspector: "left" | "right" | "bottom" = "right";
  if (toolSlot.n > 0 && toolSlot.id === "bottom") inspector = "bottom";
  else if (toolSlot.n > 0 && toolSlot.id === "secondary") inspector = sideOf("secondary", layout);
  return {
    primarySidebar: layout.primarySide,
    inspector,
    activityBar: layout.activityBar,
    showPrimarySidebar: layout.slots.primary.visible,
    showInspector: toolSlot.id === "bottom" ? layout.slots.bottom.visible : layout.slots.secondary.visible,
    sidebarWidth: layout.slots.primary.size,
    inspectorWidth: layout.slots.secondary.size,
    bottomPanelHeight: layout.slots.bottom.size,
    zenMode: layout.zenMode
  };
}
