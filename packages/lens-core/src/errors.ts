export type GateAErrorCode =
  | "IMPORT_ENCODING"
  | "IMPORT_BINARY"
  | "IMPORT_TOO_LARGE"
  | "SCOPE_EMPTY"
  | "CONTEXT_TOO_LARGE"
  | "CONSENT_STALE"
  | "PROVIDER_AUTH"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_ERROR"
  | "OUTPUT_SCHEMA"
  | "CITATION_MISSING"
  | "BOUNDARY_VIOLATION"
  | "ANCHOR_AMBIGUOUS"
  | "ANCHOR_STALE"
  | "REQUEST_CANCELLED"
  | "INVALID_REQUEST";

export class GateAError extends Error {
  readonly code: GateAErrorCode;
  readonly safeMessage: string;

  constructor(code: GateAErrorCode, safeMessage: string, options?: ErrorOptions) {
    super(safeMessage, options);
    this.name = "GateAError";
    this.code = code;
    this.safeMessage = safeMessage;
  }
}

