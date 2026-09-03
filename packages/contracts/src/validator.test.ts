import { describe, expect, it } from "vitest";

import type { ContractName } from "./types.js";
import { validateContract } from "./validator.js";

describe("contract registry", () => {
  it("loads all six Draft 2020-12 schemas including external references", () => {
    const names: ContractName[] = ["corpus-snapshot", "lens-output", "lens-finding", "lens-run", "blind-study-result", "evidence-review"];
    for (const name of names) {
      const result = validateContract(name, {});
      expect(result.ok, name).toBe(false);
    }
  });
});

