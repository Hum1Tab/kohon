import { createHash, randomBytes } from "node:crypto";

export interface SealedAssignment {
  participant: { first: "A" | "B"; second: "A" | "B"; pairId: string };
  sealed: { A: "generic" | "lens"; B: "generic" | "lens"; seedHash: string };
}

export function createBlindAssignment(pairId: string, seed = randomBytes(32)): SealedAssignment {
  const digest = createHash("sha256").update(seed).update("\0").update(pairId).digest();
  const lensIsA = (digest[0] ?? 0) % 2 === 0;
  const aFirst = (digest[1] ?? 0) % 2 === 0;
  return {
    participant: { first: aFirst ? "A" : "B", second: aFirst ? "B" : "A", pairId },
    sealed: {
      A: lensIsA ? "lens" : "generic",
      B: lensIsA ? "generic" : "lens",
      seedHash: createHash("sha256").update(seed).digest("hex")
    }
  };
}

