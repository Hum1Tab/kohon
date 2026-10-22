import { describe, expect, it } from "vitest";

import { localizeApiErrors } from "./localized-api.js";

describe("localizeApiErrors", () => {
  it("stays usable after the renderer freezes the API", () => {
    const api = {
      greet: (name: string) => `hi ${name}`,
      onMenuAction: () => () => undefined
    };
    const frozen = Object.freeze(localizeApiErrors(api, (error) => `localized: ${String(error)}`));
    expect(frozen.greet("kohon")).toBe("hi kohon");
    expect(frozen.onMenuAction()).toBeTypeOf("function");
  });

  it("translates thrown and rejected errors", async () => {
    const api = {
      fail: () => Promise.reject(new Error("boom")),
      sync: () => {
        throw new Error("sync");
      }
    };
    const wrapped = localizeApiErrors(api, (error) => `localized: ${(error as Error).message}`);
    await expect(wrapped.fail()).rejects.toThrow("localized: boom");
    expect(() => wrapped.sync()).toThrow("localized: sync");
  });

  it("keeps non-method members as they are", () => {
    const marker = { id: "kohon" };
    const wrapped = localizeApiErrors({ marker, ping: () => "pong" }, String);
    expect(wrapped.marker).toBe(marker);
    expect(wrapped.ping()).toBe("pong");
  });
});
