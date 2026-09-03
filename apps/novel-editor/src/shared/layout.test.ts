import { describe, expect, it } from "vitest";

import {
  defaultLayout,
  mergeLayout,
  migrateLayoutV1,
  placeViewOnSide,
  sanitizeLayout,
  type LayoutPreferences
} from "./layout.js";

describe("layout schema v2", () => {
  it("keeps a partial v2 patch on top of defaults", () => {
    const layout = sanitizeLayout({ zenMode: true, activityBarVisible: false, bottomPanelAlignment: "justify", bottomPanelMaximized: true });
    expect(layout.slots.primary.views).toEqual(["outline"]);
    expect(layout.slots.secondary.views).toEqual(["lens", "search", "history"]);
    expect(layout.zenMode).toBe(true);
    expect(layout.activityBarVisible).toBe(false);
    expect(layout.bottomPanelAlignment).toBe("justify");
    expect(layout.bottomPanelMaximized).toBe(true);
  });

  it("preserves independent slots during a deep merge", () => {
    const current = placeViewOnSide(defaultLayout(), "search", "bottom");
    const merged = mergeLayout(current, { slots: { primary: { visible: false } } });
    expect(merged.slots.primary.visible).toBe(false);
    expect(merged.slots.bottom.views).toEqual(["search"]);
    expect(merged.slots.secondary.views).toEqual(["lens", "history"]);
    expect(mergeLayout(merged, { bottomPanelMaximized: true }).bottomPanelMaximized).toBe(true);
  });

  it("migrates the v1 inspector without dropping visibility or dimensions", () => {
    const layout = migrateLayoutV1({ primarySidebar: "left", inspector: "left", sidebarWidth: 300, inspectorWidth: 400, showPrimarySidebar: false, showInspector: false });
    expect(layout.primarySide).toBe("left");
    expect(layout.secondarySameSide).toBe(true);
    expect(layout.slots.primary).toMatchObject({ views: ["outline"], visible: false, size: 300 });
    expect(layout.slots.secondary).toMatchObject({ views: ["lens", "search", "history"], visible: false, size: 400 });
  });

  it("uses an existing side slot for settings placement", () => {
    const layout = defaultLayout();
    const placed = placeViewOnSide(layout, "search", "left");
    expect(placed.slots.primary.views).toEqual(["outline", "search"]);
    expect(placed.secondarySameSide).toBe(false);
  });

  it("is idempotent for a complete layout", () => {
    const layout: LayoutPreferences = defaultLayout();
    expect(sanitizeLayout(layout as unknown as Record<string, unknown>)).toEqual(layout);
  });
});
