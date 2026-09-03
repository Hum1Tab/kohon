import type { CorpusSnapshot, LensFinding, LensOutput, ModelFinding } from "@kohon/contracts";
import { SCHEMA_VERSION } from "@kohon/contracts";
import { validateContract } from "@kohon/contracts/validator";

import { stableId } from "./hash.js";
import { validateEvidence } from "./anchor.js";

export interface LensValidationResult {
  findings: LensFinding[];
  invalidFindingCount: number;
  errors: string[];
}

function duplicateMaterial(finding: ModelFinding): unknown {
  return {
    claim: finding.claim,
    evidence: finding.evidence.map((evidence) => ({ document_id: evidence.document_id, exact_text: evidence.exact_text }))
  };
}

export function validateLensOutput(
  value: unknown,
  snapshot: CorpusSnapshot,
  sentDocumentIds: readonly string[]
): LensValidationResult {
  const schemaResult = validateContract<LensOutput>("lens-output", value);
  if (!schemaResult.ok) return { findings: [], invalidFindingCount: 1, errors: schemaResult.errors };
  const output = schemaResult.value;
  const allowed = new Set(sentDocumentIds);
  const documents = new Map(snapshot.documents.map((document) => [document.document_id, document]));
  const findings: LensFinding[] = [];
  const errors: string[] = [];
  const seen = new Map<string, string>();
  let invalidFindingCount = 0;

  for (const modelFinding of output.findings) {
    const missingDocument = modelFinding.evidence.find((evidence) => !allowed.has(evidence.document_id) || !documents.has(evidence.document_id));
    if (missingDocument !== undefined) {
      invalidFindingCount += 1;
      errors.push(`Evidence document is outside sent scope: ${missingDocument.document_id}`);
      continue;
    }
    const evidence = modelFinding.evidence.map((item) => validateEvidence(documents.get(item.document_id)!, item));
    const hasMissing = evidence.some((item) => item.anchor_status === "missing");
    const hasAmbiguous = evidence.some((item) => item.anchor_status === "ambiguous");
    if (hasMissing) {
      invalidFindingCount += 1;
      errors.push("Evidence quote is not an exact substring of the sent document.");
      continue;
    }
    if (hasAmbiguous) invalidFindingCount += 1;
    const material = duplicateMaterial(modelFinding);
    const findingId = stableId("f", { snapshot_id: snapshot.snapshot_id, lens_id: output.lens_id, material });
    const duplicateKey = stableId("dup", material, 64);
    const duplicateOf = seen.get(duplicateKey) ?? null;
    if (duplicateOf === null) seen.set(duplicateKey, findingId);
    const finding: LensFinding = {
      schema_version: SCHEMA_VERSION,
      finding_id: findingId,
      snapshot_id: snapshot.snapshot_id,
      lens_id: output.lens_id,
      lens_version: output.lens_version,
      category: modelFinding.category,
      claim: modelFinding.claim,
      reader_effect: modelFinding.reader_effect,
      salience: modelFinding.salience,
      model_confidence: modelFinding.model_confidence,
      alternative_interpretations: modelFinding.alternative_interpretations,
      evidence,
      validation_status: hasMissing ? "stale" : hasAmbiguous ? "ambiguous" : "valid",
      duplicate_of: duplicateOf,
      author_status: "unreviewed"
    };
    const findingSchema = validateContract<LensFinding>("lens-finding", finding);
    if (!findingSchema.ok) {
      invalidFindingCount += 1;
      errors.push(...findingSchema.errors.map((error) => `${findingId}: ${error}`));
      continue;
    }
    findings.push(finding);
  }
  return { findings, invalidFindingCount, errors };
}
