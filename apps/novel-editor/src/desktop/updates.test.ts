import { describe, expect, it } from "vitest";

import { compareVersions } from "./updates.js";

describe("update version comparison", () => {
  it("orders releases by each semantic version segment", () => {
    expect(compareVersions("0.2.0", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("v0.3.0", "0.3.0")).toBe(0);
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "0.99.99")).toBeGreaterThan(0);
  });

  it("rejects versions that are not plain release tags", () => {
    expect(() => compareVersions("0.2", "0.1.0")).toThrow();
    expect(() => compareVersions("0.2.0-beta.1", "0.2.0")).toThrow();
    expect(() => compareVersions("latest", "0.2.0")).toThrow();
  });
});
