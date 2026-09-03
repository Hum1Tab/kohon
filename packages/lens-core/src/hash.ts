import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";

export function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256Text(value: string): string {
  return sha256Bytes(new TextEncoder().encode(value));
}

export function sha256Canonical(value: unknown): string {
  return sha256Text(canonicalize(value));
}

export function stableId(prefix: string, value: unknown, hexLength = 24): string {
  return `${prefix}-${sha256Canonical(value).slice(0, hexLength)}`;
}

