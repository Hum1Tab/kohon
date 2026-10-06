import { describe, expect, it } from "vitest";

import {
  defaultLayout,
  activeLayoutPreset,
  applyLayoutPreset,
  dockFlexWeights,
  dockView,
  findDockNode,
  findViewNode,
  listTabsNodes,
  migrateLayoutV1,
  projectLayoutV1,
  sanitizeLayout,
  setSplitSizes,
  setTabsActive,
  toggleViewVisibility,
  type DockNode
} from "./layout.js";

function flatten(node: DockNode): DockNode[] {
  return node.type === "split" ? [node, ...node.children.flatMap(flatten)] : [node];
}

describe("recursive dock layout", () => {
  it("fills the available space even when hidden siblings leave fractional weights", () => {
    const factors = dockFlexWeights([.18, .55]);
    expect(factors.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100);
    expect(factors[0]! / factors[1]!).toBeCloseTo(.18 / .55);
    expect(dockFlexWeights([.2])).toEqual([100]);
    expect(dockFlexWeights([])).toEqual([]);
  });
  it("starts with room to write while keeping review tools one click away", () => {
    const layout = defaultLayout();
    expect(findViewNode(layout, "outline")?.visible).toBe(true);
    expect(findViewNode(layout, "lens")?.visible).toBe(false);
    expect(findViewNode(layout, "map")?.visible).toBe(false);
    expect(activeLayoutPreset(layout)).toBe("writing");
    const review = applyLayoutPreset(layout, "review");
    expect(findViewNode(review, "lens")?.visible).toBe(true);
    expect(findViewNode(review, "map")?.visible).toBe(true);
    expect(activeLayoutPreset(review)).toBe("review");
    expect(activeLayoutPreset(applyLayoutPreset(layout, "compare"))).toBe("compare");
    expect(activeLayoutPreset(dockView(review, "outline", "editor", "right"))).toBeNull();
    expect(activeLayoutPreset({ ...review, zenMode: true })).toBeNull();
  });
  it("keeps one editor and every tool view exactly once", () => {
    const all = flatten(defaultLayout().root);
    expect(all.filter((node) => node.type === "editor")).toHaveLength(1);
    expect(all.flatMap((node) => node.type === "tabs" ? node.views : []).sort()).toEqual(["history", "lens", "map", "outline", "search"]);
  });

  it("repairs malformed persisted trees and round-trips the result", () => {
    const layout = sanitizeLayout({
      root: {
        type: "split", id: "root", direction: "horizontal", sizes: [0, -4, 2],
        children: [
          { type: "editor", id: "editor" },
          { type: "editor", id: "editor" },
          { type: "tabs", id: "tools", views: ["lens", "lens"] }
        ]
      }
    });
    const all = flatten(layout.root);
    expect(all.filter((node) => node.type === "editor")).toHaveLength(1);
    expect(all.flatMap((node) => node.type === "tabs" ? node.views : []).sort()).toEqual(["history", "lens", "map", "outline", "search"]);
    expect(sanitizeLayout(JSON.parse(JSON.stringify(layout)) as Record<string, unknown>)).toEqual(layout);
  });

  it("adds an absent map to a hidden bottom without changing saved dock widths", () => {
    const original = {
      root: { type: "split", id: "root-v", direction: "vertical", sizes: [0.7, 0.3], children: [
        { type: "split", id: "root", direction: "horizontal", sizes: [0.35, 0.65], children: [
          { type: "tabs", id: "primary", views: ["outline"], activeView: "outline", visible: true },
          { type: "editor", id: "editor" }
        ] },
        { type: "tabs", id: "bottom", views: ["history", "search", "lens"], activeView: "history", visible: false }
      ] },
      activityBar: "right", primarySide: "right", secondarySameSide: true
    } as const;
    const restored = sanitizeLayout(original as unknown as Record<string, unknown>);
    const bottom = findViewNode(restored, "map");
    expect(bottom?.id).toBe("bottom");
    expect(bottom?.visible).toBe(false);
    expect(bottom?.activeView).toBe("history");
    expect(restored.activityBar).toBe("right");
    expect(restored.primarySide).toBe("right");
    expect(restored.root.type).toBe("split");
    if (restored.root.type === "split") {
      expect(restored.root.sizes).toEqual([0.7, 0.3]);
      const inside = restored.root.children[0];
      if (inside?.type === "split") expect(inside.sizes).toEqual([0.35, 0.65]);
    }
  });

  it("migrates fixed slots without dropping sides, sizes, tabs, or visibility", () => {
    const layout = migrateLayoutV1({
      primarySide: "right", secondarySameSide: false,
      slots: {
        primary: { views: ["outline"], activeView: "outline", visible: false, size: 310 },
        secondary: { views: ["lens", "search"], activeView: "search", visible: true, size: 440 },
        bottom: { views: ["history"], activeView: "history", visible: true, size: 280 }
      }
    });
    expect(layout.primarySide).toBe("right");
    expect(layout.secondarySameSide).toBe(false);
    expect(findViewNode(layout, "outline")?.visible).toBe(false);
    expect(findViewNode(layout, "search")?.activeView).toBe("search");
    expect(findViewNode(layout, "history")?.id).toBe("bottom");
    expect(findViewNode(layout, "map")?.id).toBe("bottom");
    expect(layout.root.type).toBe("split");
  });

  it("projects a usable fixed-slot mirror from a freely docked tree", () => {
    let layout = defaultLayout();
    layout = dockView(layout, "outline", "editor", "right");
    layout = dockView(layout, "history", "editor", "bottom");
    const legacy = projectLayoutV1(layout);
    expect(legacy.primarySidebar).toBe("right");
    expect(legacy.slots.bottom.views).toContain("history");
    expect([...legacy.slots.primary.views, ...legacy.slots.secondary.views, ...legacy.slots.bottom.views].sort()).toEqual(["history", "lens", "map", "outline", "search"]);
  });

  it("joins tab groups, reorders tabs, and makes edge drops into nested splits", () => {
    let layout = defaultLayout();
    layout = dockView(layout, "search", "primary", "center", 1);
    expect(findViewNode(layout, "search")?.id).toBe("primary");
    expect(findViewNode(layout, "search")?.views).toEqual(["outline", "search"]);
    layout = dockView(layout, "outline", "primary", "center", 2);
    expect(findViewNode(layout, "outline")?.views).toEqual(["search", "outline"]);
    layout = dockView(layout, "history", "primary", "bottom");
    expect(flatten(layout.root).some((node) => node.type === "split" && node.direction === "vertical")).toBe(true);
  });

  it("can split around the editor repeatedly and generates stable unique IDs", () => {
    let layout = defaultLayout();
    layout = dockView(layout, "lens", "editor", "left");
    layout = dockView(layout, "search", "editor", "right");
    layout = dockView(layout, "history", "editor", "top");
    layout = dockView(layout, "outline", "editor", "bottom");
    const all = flatten(layout.root);
    expect(all.filter((node) => node.type === "editor")).toHaveLength(1);
    expect(new Set(all.map((node) => node.id)).size).toBe(all.length);
    expect(listTabsNodes(layout)).toHaveLength(5);
  });

  it("updates active tabs, group visibility, and the intended split weights", () => {
    let layout = defaultLayout();
    layout = setTabsActive(layout, "secondary", "history");
    expect(findViewNode(layout, "history")?.activeView).toBe("history");
    layout = toggleViewVisibility(layout, "history");
    expect(findViewNode(layout, "history")?.visible).toBe(false);
    const root = findDockNode(layout.root, "root");
    expect(root?.type).toBe("split");
    if (root?.type !== "split") return;
    layout = setSplitSizes(layout, root.id, [3, 2, 1]);
    const changed = findDockNode(layout.root, root.id);
    expect(changed?.type).toBe("split");
    if (changed?.type === "split") {
      expect(changed.sizes.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
      expect(changed.sizes[0]).toBeCloseTo(0.5);
    }
  });
});
