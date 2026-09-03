import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";

import type { ContractName } from "./types.js";

export interface ValidationSuccess<T> {
  ok: true;
  value: T;
}

export interface ValidationFailure {
  ok: false;
  errors: string[];
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

const schemaFiles: Record<ContractName, string> = {
  "corpus-snapshot": "corpus-snapshot.schema.json",
  "lens-output": "lens-output.schema.json",
  "lens-finding": "lens-finding.schema.json",
  "lens-run": "lens-run.schema.json",
  "blind-study-result": "blind-study-result.schema.json",
  "evidence-review": "evidence-review.schema.json"
};

const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addFormat("date-time", (value: string) => !Number.isNaN(Date.parse(value)));
ajv.addFormat("uri", (value: string) => {
  try {
    void new URL(value);
    return true;
  } catch {
    return false;
  }
});
const validators = new Map<ContractName, ValidateFunction>();
let schemasLoaded = false;

function ensureSchemasLoaded(): void {
  if (schemasLoaded) return;
  for (const [name, file] of Object.entries(schemaFiles) as Array<[ContractName, string]>) {
    const schemaUrl = new URL(`../../../specs/${file}`, import.meta.url);
    const schema = JSON.parse(readFileSync(fileURLToPath(schemaUrl), "utf8")) as Record<string, unknown>;
    ajv.addSchema(schema, name);
  }
  schemasLoaded = true;
}

function loadValidator(name: ContractName): ValidateFunction {
  const existing = validators.get(name);
  if (existing !== undefined) return existing;
  ensureSchemasLoaded();
  const compiled = ajv.getSchema(name);
  if (compiled === undefined) throw new Error(`Schema not registered: ${name}`);
  validators.set(name, compiled);
  return compiled;
}

function formatError(error: ErrorObject): string {
  const location = error.instancePath === "" ? "/" : error.instancePath;
  return `${location}: ${error.message ?? error.keyword}`;
}

export function validateContract<T>(name: ContractName, value: unknown): ValidationResult<T> {
  const validate = loadValidator(name);
  if (validate(value)) return { ok: true, value: value as T };
  return { ok: false, errors: (validate.errors ?? []).map(formatError) };
}

export function assertContract<T>(name: ContractName, value: unknown): T {
  const result = validateContract<T>(name, value);
  if (!result.ok) throw new Error(`Contract ${name} failed: ${result.errors.join("; ")}`);
  return result.value;
}

export function readContractSchema(name: ContractName): Record<string, unknown> {
  const schemaUrl = new URL(`../../../specs/${schemaFiles[name]}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(schemaUrl), "utf8")) as Record<string, unknown>;
}
