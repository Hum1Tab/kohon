import { randomBytes, randomUUID } from "node:crypto";

import type {
  CorpusSnapshot,
  LensFinding,
  LensRun,
  ProviderMetadata,
  ReaderCutoff,
  TokenUsage
} from "@kohon/contracts";
import { SCHEMA_VERSION } from "@kohon/contracts";
import { readContractSchema, validateContract } from "@kohon/contracts/validator";
import {
  assertAnalysisQuery,
  assertProviderPayloadBoundary,
  createBlindAssignment,
  createCorpusSnapshot,
  cutoffFromDocument,
  GateAError,
  instructionsFor,
  selectFirstReaderContext,
  sha256Canonical,
  sha256Text,
  validateLensOutput,
  type ImportSource,
  type LensProvider,
  type ProviderRequest,
  type ProviderResponse,
  type ScopedContext,
  type SealedAssignment
} from "@kohon/core";
import { MockProvider } from "@kohon/provider-mock";
import { OpenAIProvider } from "@kohon/provider-openai";

const STUDY_ID = "gate-a-local-pilot";
const STUDY_VERSION = "0.1.0";
const RENDERER_VERSION = "plain-text-v0.1";
const DEFAULT_QUERY = "この読者が混乱しそうな箇所、感情のつながりが飛んで見える箇所、話者や目的を取り違えそうな箇所を挙げてください。";

export interface ImportFileInput {
  name: string;
  title: string;
  mediaType: "text/plain" | "text/markdown";
  base64: string;
}

export interface PrepareInput {
  cutoffDocumentId: string;
  query: string;
  providerId: "mock" | "openai";
  modelId: string;
  maxOutputTokens: number;
  maxInputChars?: number;
}

export interface ConsentInput {
  sendApproved: boolean;
  rawResponseNotSaved: boolean;
  metricsExportApproved: boolean;
  apiKey?: string;
}

export interface RatingValues {
  usefulness: number;
  specificity: number;
  evidence_trust: number;
  novel_insight: number;
  misleading_risk: number;
  voice_pressure: number;
  decision_confidence: number;
}

export interface RatingInput {
  ratings: { A: RatingValues; B: RatingValues };
  preference: "A" | "B" | "tie" | "both-reject";
  reasonCodes: string[];
  conditionGuess: "A" | "B" | "cannot-tell";
  guessConfidence: number;
}

type AuthorStatus = "useful" | "rejected" | "intentional" | "unclear" | "misleading";

interface PreparedRun {
  context: ScopedContext;
  cutoff: ReaderCutoff;
  query: string;
  providerId: "mock" | "openai";
  modelId: string;
  maxOutputTokens: number;
  configHash: string;
}

interface CompletedPair {
  pairId: string;
  assignment: SealedAssignment;
  runs: { generic: LensRun; lens: LensRun };
  startedAt: number;
  ratedAt: number | null;
  ratingRecord: Record<string, unknown> | null;
}

interface SessionState {
  participantId: string;
  stage: "started" | "imported" | "prepared" | "consented" | "completed" | "rated";
  snapshot: CorpusSnapshot | null;
  prepared: PreparedRun | null;
  consent: { metricsExportApproved: boolean; at: string } | null;
  apiKey: string | null;
  pair: CompletedPair | null;
  abortController: AbortController | null;
}

function fixtureSources(): ImportSource[] {
  const encoder = new TextEncoder();
  return [
    {
      order: 0,
      title: "第一場　駅の灯り",
      sourceLabel: "scene-01.md",
      mediaType: "text/markdown",
      bytes: encoder.encode("# 第一場　駅の灯り\n\n　雨は九時を過ぎても止まなかった。\n\n「来ないと思っていた」\n\n　美冬は濡れた切符を握りしめた。誰を待っていたのかは、まだ言わなかった。\n")
    },
    {
      order: 1,
      title: "第二場　空のホーム",
      sourceLabel: "scene-02.md",
      mediaType: "text/markdown",
      bytes: encoder.encode("# 第二場　空のホーム\n\n　発車ベルが鳴ると、美冬は初めて顔を上げた。\n\n「兄さんには、ここにいることを知らせていない」\n\n　だが、向かいのホームには赤い傘が一本だけ残っていた。\n")
    },
    {
      order: 2,
      title: "第三場　未読の章",
      sourceLabel: "scene-03-future.md",
      mediaType: "text/markdown",
      bytes: encoder.encode("# 第三場　未読の章\n\n　この章は読了位置より後ろにあり、AIへ送られません。\n")
    }
  ];
}

function decodeFile(file: ImportFileInput, order: number): ImportSource {
  if (file.base64.length > 14_000_000) throw new GateAError("IMPORT_TOO_LARGE", "1ファイルが大き過ぎます。");
  let bytes: Uint8Array;
  try {
    bytes = Buffer.from(file.base64, "base64");
  } catch (cause) {
    throw new GateAError("INVALID_REQUEST", "ファイルを読み込めませんでした。", { cause });
  }
  if (bytes.byteLength > 10_000_000) throw new GateAError("IMPORT_TOO_LARGE", "1ファイルは10MB以下にしてください。");
  return { order, title: file.title, sourceLabel: file.name, mediaType: file.mediaType, bytes };
}

function publicDocument(document: CorpusSnapshot["documents"][number], includeText: boolean): Record<string, unknown> {
  return {
    document_id: document.document_id,
    order: document.order,
    title: document.title,
    source_label: document.source_label,
    media_type: document.media_type,
    source_byte_sha256: document.source_byte_sha256,
    text_sha256: document.text_sha256,
    source_byte_count: document.source_byte_count,
    char_count_utf16: document.char_count_utf16,
    newline_style: document.newline_style,
    unicode_normalization: document.unicode_normalization,
    bom: document.bom,
    empty: document.empty,
    ...(includeText ? { text: document.text } : {})
  };
}

function providerInput(prepared: PreparedRun, condition: "generic" | "lens", runId: string): ProviderRequest {
  return {
    condition,
    provider_id: prepared.providerId,
    endpoint_origin: prepared.providerId === "mock" ? "urn:kohon:mock" : "https://api.openai.com",
    exact_model_id: prepared.modelId,
    instructions: instructionsFor(condition, "first-reader"),
    input_documents: prepared.context.documents.map((document) => ({
      document_id: document.document_id,
      order: document.order,
      title: document.title,
      media_type: document.media_type,
      text: document.text
    })),
    user_query: prepared.query,
    lens_id: "first-reader",
    ...(condition === "lens" ? { output_schema: schemaForProvider(readContractSchema("lens-output")) } : {}),
    max_output_tokens: prepared.maxOutputTokens,
    sampling_config: { temperature: null, seed: null },
    store_requested: false,
    study_run_id: runId
  };
}

function schemaForProvider(schema: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(schema);
  delete clone["$schema"];
  delete clone["$id"];
  delete clone["title"];
  return clone;
}

function providerMetadata(request: ProviderRequest, response: ProviderResponse): ProviderMetadata {
  return {
    provider_id: request.provider_id,
    endpoint_origin: request.endpoint_origin,
    requested_model_id: request.exact_model_id,
    returned_model_id: response.exact_model_id_returned,
    max_output_tokens: request.max_output_tokens,
    sampling: request.sampling_config,
    store_requested: false,
    truncation_policy: "disabled",
    request_id: response.provider_request_id,
    latency_ms: response.latency_ms
  };
}

function makeRun(
  condition: "generic" | "lens",
  request: ProviderRequest,
  response: ProviderResponse,
  snapshot: CorpusSnapshot,
  prepared: PreparedRun,
  requestedAt: string,
  completedAt: string
): LensRun {
  const common = {
    schema_version: SCHEMA_VERSION,
    run_id: request.study_run_id,
    study_id: STUDY_ID,
    study_version: STUDY_VERSION,
    condition,
    snapshot_id: snapshot.snapshot_id,
    query_id: sha256Text(prepared.query).slice(0, 24),
    query_text: prepared.query,
    cutoff: prepared.cutoff,
    context_manifest: prepared.context.manifest,
    provider: providerMetadata(request, response),
    prompt_hash: sha256Text(request.instructions),
    output_schema_hash: condition === "lens" ? sha256Canonical(request.output_schema) : null,
    renderer_version: RENDERER_VERSION,
    requested_at: requestedAt,
    completed_at: completedAt,
    usage: response.token_usage
  };
  let run: LensRun;
  if (condition === "generic" && response.output.kind === "generic") {
    run = { ...common, status: "completed", output: { kind: "generic-markdown", markdown: response.output.markdown } };
  } else if (condition === "lens" && response.output.kind === "lens") {
    const validated = validateLensOutput(response.output.value, snapshot, prepared.context.manifest.sent_documents.map((document) => document.document_id));
    run = {
      ...common,
      status: validated.invalidFindingCount === 0 ? "completed" : "invalid-model-output",
      output: {
        kind: "validated-findings",
        lens_id: response.output.value.lens_id,
        lens_version: response.output.value.lens_version,
        findings: validated.findings,
        invalid_finding_count: validated.invalidFindingCount
      }
    };
  } else {
    throw new GateAError("OUTPUT_SCHEMA", "provider回答の種類が要求と一致しません。");
  }
  const valid = validateContract<LensRun>("lens-run", run);
  if (!valid.ok) throw new GateAError("OUTPUT_SCHEMA", "run記録をschemaで検証できませんでした。", { cause: new Error(valid.errors.join("; ")) });
  return valid.value;
}

function maskedPanel(id: "A" | "B", run: LensRun): Record<string, unknown> {
  if (run.output.kind === "generic-markdown") {
    return { id, blocks: [{ title: "フィードバック", body: run.output.markdown, quotes: [] }], warningCount: 0 };
  }
  if (run.output.kind === "validated-findings") {
    return {
      id,
      blocks: run.output.findings.map((finding, index) => ({
        title: `所見 ${index + 1}`,
        body: `${finding.claim}\n\n読者への影響: ${finding.reader_effect}`,
        quotes: finding.evidence.filter((evidence) => evidence.anchor_status === "attached").map((evidence) => evidence.exact_text)
      })),
      warningCount: run.output.invalid_finding_count
    };
  }
  return { id, blocks: [{ title: "結果なし", body: "回答を検証できませんでした。", quotes: [] }], warningCount: 1 };
}

function assertLikert(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 4) throw new GateAError("INVALID_REQUEST", "評価値は0〜4で指定してください。");
}

export class SessionManager {
  private state: SessionState | null = null;

  start(participantId: string, useFixture: boolean): Record<string, unknown> {
    if (!/^P-[A-Z0-9]{4,16}$/u.test(participantId)) throw new GateAError("INVALID_REQUEST", "参加者IDは P- と4〜16桁の英大文字・数字で入力してください。");
    this.erase();
    this.state = {
      participantId,
      stage: "started",
      snapshot: null,
      prepared: null,
      consent: null,
      apiKey: null,
      pair: null,
      abortController: null
    };
    if (useFixture) this.setSnapshot(fixtureSources());
    return this.publicState(false);
  }

  import(files: ImportFileInput[]): Record<string, unknown> {
    this.requireState();
    if (files.length === 0 || files.length > 100) throw new GateAError("INVALID_REQUEST", "1〜100個のTXT/Markdownを選んでください。");
    const totalBase64 = files.reduce((sum, file) => sum + file.base64.length, 0);
    if (totalBase64 > 28_000_000) throw new GateAError("IMPORT_TOO_LARGE", "選択した原稿の合計が大き過ぎます。");
    this.setSnapshot(files.map(decodeFile));
    return this.publicState(false);
  }

  prepare(input: PrepareInput): Record<string, unknown> {
    const state = this.requireState();
    const snapshot = this.requireSnapshot();
    assertAnalysisQuery(input.query);
    if (input.providerId === "mock" && input.modelId !== "mock-fixed-v0.1") throw new GateAError("INVALID_REQUEST", "Mock model IDが不正です。");
    if (input.providerId === "openai" && !/^[A-Za-z0-9._:-]{1,128}$/u.test(input.modelId)) throw new GateAError("INVALID_REQUEST", "OpenAI model IDを確認してください。");
    if (!Number.isInteger(input.maxOutputTokens) || input.maxOutputTokens < 128 || input.maxOutputTokens > 16_384) {
      throw new GateAError("INVALID_REQUEST", "出力上限は128〜16384 tokenで指定してください。");
    }
    const consentPlaceholder = new Date().toISOString();
    const providerDefaultMaxInputChars = input.providerId === "openai" ? 250_000 : 1_000_000;
    const context = selectFirstReaderContext(
      snapshot,
      input.cutoffDocumentId,
      consentPlaceholder,
      input.maxInputChars ?? providerDefaultMaxInputChars
    );
    const cutoffDocument = snapshot.documents.find((document) => document.document_id === input.cutoffDocumentId)!;
    const preparedMaterial = {
      snapshot_id: snapshot.snapshot_id,
      cutoff: input.cutoffDocumentId,
      query: input.query,
      provider_id: input.providerId,
      model_id: input.modelId,
      max_output_tokens: input.maxOutputTokens,
      sent: context.manifest.sent_documents.map((document) => document.text_sha256)
    };
    state.prepared = {
      context,
      cutoff: cutoffFromDocument(cutoffDocument),
      query: input.query,
      providerId: input.providerId,
      modelId: input.modelId,
      maxOutputTokens: input.maxOutputTokens,
      configHash: sha256Canonical(preparedMaterial)
    };
    state.consent = null;
    state.apiKey = null;
    state.pair = null;
    state.stage = "prepared";
    return this.publicState(false);
  }

  consent(input: ConsentInput): Record<string, unknown> {
    const state = this.requireState();
    const prepared = this.requirePrepared();
    if (!input.sendApproved || !input.rawResponseNotSaved) throw new GateAError("INVALID_REQUEST", "送信範囲とraw response非保存を確認してください。");
    if (prepared.providerId === "openai" && (input.apiKey?.trim().length ?? 0) === 0) throw new GateAError("PROVIDER_AUTH", "OpenAI APIキーをこのセッション用に入力してください。");
    const at = new Date().toISOString();
    prepared.context.manifest.user_consented_at = at;
    state.consent = { metricsExportApproved: input.metricsExportApproved, at };
    state.apiKey = prepared.providerId === "openai" ? input.apiKey!.trim() : null;
    state.stage = "consented";
    return this.publicState(false);
  }

  async run(): Promise<Record<string, unknown>> {
    const state = this.requireState();
    const snapshot = this.requireSnapshot();
    const prepared = this.requirePrepared();
    if (state.consent === null || state.stage !== "consented") throw new GateAError("CONSENT_STALE", "送信条件をもう一度確認してください。");
    const provider: LensProvider = prepared.providerId === "mock" ? new MockProvider() : new OpenAIProvider();
    const pairId = `pair-${randomUUID()}`;
    const assignment = createBlindAssignment(pairId);
    const controller = new AbortController();
    state.abortController = controller;
    const requests = {
      generic: providerInput(prepared, "generic", `run-${randomUUID()}`),
      lens: providerInput(prepared, "lens", `run-${randomUUID()}`)
    };
    for (const request of Object.values(requests)) {
      assertProviderPayloadBoundary(request, prepared.context.manifest.sent_documents.map((document) => document.document_id));
    }
    const requestedAt = new Date().toISOString();
    try {
      const genericResponse = await provider.invoke(requests.generic, { signal: controller.signal, ...(state.apiKey === null ? {} : { apiKey: state.apiKey }) });
      const lensResponse = await provider.invoke(requests.lens, { signal: controller.signal, ...(state.apiKey === null ? {} : { apiKey: state.apiKey }) });
      const completedAt = new Date().toISOString();
      const pair: CompletedPair = {
        pairId,
        assignment,
        runs: {
          generic: makeRun("generic", requests.generic, genericResponse, snapshot, prepared, requestedAt, completedAt),
          lens: makeRun("lens", requests.lens, lensResponse, snapshot, prepared, requestedAt, completedAt)
        },
        startedAt: Date.now(),
        ratedAt: null,
        ratingRecord: null
      };
      state.pair = pair;
      state.stage = "completed";
      return this.maskedPair();
    } finally {
      state.abortController = null;
      state.apiKey = null;
    }
  }

  cancel(): Record<string, unknown> {
    const state = this.requireState();
    state.abortController?.abort();
    return { cancelled: true };
  }

  maskedPair(): Record<string, unknown> {
    const state = this.requireState();
    const pair = state.pair;
    if (pair === null) throw new GateAError("INVALID_REQUEST", "比較結果がありません。");
    const runA = pair.assignment.sealed.A === "generic" ? pair.runs.generic : pair.runs.lens;
    const runB = pair.assignment.sealed.B === "generic" ? pair.runs.generic : pair.runs.lens;
    return {
      pairId: pair.pairId,
      displayOrder: [pair.assignment.participant.first, pair.assignment.participant.second],
      panels: [maskedPanel("A", runA), maskedPanel("B", runB)],
      mappingRevealed: false
    };
  }

  rate(input: RatingInput): Record<string, unknown> {
    const state = this.requireState();
    const pair = state.pair;
    const snapshot = this.requireSnapshot();
    if (pair === null || state.stage !== "completed") throw new GateAError("INVALID_REQUEST", "評価できる比較結果がありません。");
    for (const values of [input.ratings.A, input.ratings.B]) for (const value of Object.values(values)) assertLikert(value);
    assertLikert(input.guessConfidence);
    const allowedReasons = new Set(["more-specific", "better-evidence", "more-relevant", "less-generic", "less-prescriptive", "better-prioritised", "safer-uncertainty", "easier-to-use", "misleading", "other"]);
    if (input.reasonCodes.some((reason) => !allowedReasons.has(reason))) throw new GateAError("INVALID_REQUEST", "評価理由コードが不正です。");
    const seconds = Math.max(0, Math.round((Date.now() - pair.startedAt) / 1000));
    const record = {
      schema_version: SCHEMA_VERSION,
      study_id: STUDY_ID,
      study_version: STUDY_VERSION,
      participant_id: state.participantId,
      pair_id: pair.pairId,
      case_id: "local-copy",
      snapshot_id: snapshot.snapshot_id,
      query_id: sha256Text(this.requirePrepared().query).slice(0, 24),
      run_a_id: pair.assignment.sealed.A === "generic" ? pair.runs.generic.run_id : pair.runs.lens.run_id,
      run_b_id: pair.assignment.sealed.B === "generic" ? pair.runs.generic.run_id : pair.runs.lens.run_id,
      display_order: pair.assignment.participant.first === "A" ? "A-then-B" : "B-then-A",
      ratings: input.ratings,
      preference: input.preference,
      preference_reason_codes: [...new Set(input.reasonCodes)],
      condition_guess: input.conditionGuess,
      guess_confidence: input.guessConfidence,
      free_text_redacted: null,
      timing: { a_review_seconds: 0, b_review_seconds: 0, total_task_seconds: seconds },
      protocol_status: "valid",
      exclusion_reason: null,
      sealed_mapping: {
        A: pair.assignment.sealed.A,
        B: pair.assignment.sealed.B,
        randomization_seed_hash: pair.assignment.sealed.seedHash,
        unsealed_at: new Date().toISOString()
      }
    };
    const valid = validateContract<Record<string, unknown>>("blind-study-result", record);
    if (!valid.ok) throw new GateAError("OUTPUT_SCHEMA", "評価記録をschemaで検証できませんでした。", { cause: new Error(valid.errors.join("; ")) });
    pair.ratingRecord = valid.value;
    pair.ratedAt = Date.now();
    state.stage = "rated";
    return this.revealedReview();
  }

  revealedReview(): Record<string, unknown> {
    const state = this.requireState();
    const snapshot = this.requireSnapshot();
    const pair = state.pair;
    if (pair === null || state.stage !== "rated") throw new GateAError("INVALID_REQUEST", "mappingは評価後にだけ確認できます。");
    const findings = pair.runs.lens.output.kind === "validated-findings" ? pair.runs.lens.output.findings : [];
    return {
      mapping: { A: pair.assignment.sealed.A, B: pair.assignment.sealed.B },
      findings,
      documents: snapshot.documents.map((document) => publicDocument(document, true)),
      coverage: pair.runs.lens.context_manifest.coverage_percent
    };
  }

  setFindingStatus(findingId: string, authorStatus: AuthorStatus): Record<string, unknown> {
    const state = this.requireState();
    const pair = state.pair;
    if (pair === null || state.stage !== "rated" || pair.runs.lens.output.kind !== "validated-findings") {
      throw new GateAError("INVALID_REQUEST", "評価後の所見だけを分類できます。");
    }
    const finding = pair.runs.lens.output.findings.find((item) => item.finding_id === findingId);
    if (finding === undefined) throw new GateAError("INVALID_REQUEST", "所見が見つかりません。");
    finding.author_status = authorStatus;
    return this.revealedReview();
  }

  exportPreview(): Record<string, unknown> {
    const state = this.requireState();
    const snapshot = this.requireSnapshot();
    const pair = state.pair;
    if (pair === null || pair.ratingRecord === null) throw new GateAError("INVALID_REQUEST", "評価後にexportできます。");
    if (state.consent?.metricsExportApproved !== true) throw new GateAError("INVALID_REQUEST", "匿名指標のexportに同意していません。");
    const lensFindings: LensFinding[] = pair.runs.lens.output.kind === "validated-findings" ? pair.runs.lens.output.findings : [];
    const usage = (run: LensRun): TokenUsage => run.usage;
    return {
      schema_version: SCHEMA_VERSION,
      study_id: STUDY_ID,
      study_version: STUDY_VERSION,
      participant_id: state.participantId,
      snapshot: {
        snapshot_id: snapshot.snapshot_id,
        documents: snapshot.documents.map((document) => ({
          document_id: document.document_id,
          source_byte_sha256: document.source_byte_sha256,
          text_sha256: document.text_sha256,
          source_byte_count: document.source_byte_count,
          char_count_utf16: document.char_count_utf16
        }))
      },
      pair_result: pair.ratingRecord,
      runs: [pair.runs.generic, pair.runs.lens].map((run) => ({
        run_id: run.run_id,
        condition: run.condition,
        status: run.status,
        prompt_hash: run.prompt_hash,
        output_schema_hash: run.output_schema_hash,
        provider: run.provider,
        usage: usage(run),
        validation_count: run.output.kind === "validated-findings" ? run.output.findings.length : null,
        invalid_finding_count: run.output.kind === "validated-findings" ? run.output.invalid_finding_count : null
      })),
      finding_summary: lensFindings.map((finding) => ({ category: finding.category, validation_status: finding.validation_status, author_status: finding.author_status })),
      content_included: false,
      operator_variable_cost_policy: "user-owned-services-only"
    };
  }

  publicState(includeText: boolean): Record<string, unknown> {
    const state = this.state;
    if (state === null) return { stage: "empty" };
    return {
      stage: state.stage,
      participantId: state.participantId,
      snapshot: state.snapshot === null ? null : {
        snapshot_id: state.snapshot.snapshot_id,
        created_at: state.snapshot.created_at,
        documents: state.snapshot.documents.map((document) => publicDocument(document, includeText))
      },
      prepared: state.prepared === null ? null : {
        cutoff: state.prepared.cutoff,
        query: state.prepared.query,
        providerId: state.prepared.providerId,
        modelId: state.prepared.modelId,
        maxOutputTokens: state.prepared.maxOutputTokens,
        configHash: state.prepared.configHash,
        manifest: state.prepared.context.manifest,
        totalCharsUtf16: state.prepared.context.totalCharsUtf16,
        estimatedTokens: state.prepared.context.estimatedTokens,
        sentDocumentTitles: state.prepared.context.documents.map((document) => document.title)
      },
      consented: state.consent !== null,
      hasPair: state.pair !== null,
      rated: state.stage === "rated"
    };
  }

  erase(): { sessionId: string; deletedAt: string; deletedClasses: string[] } {
    if (this.state !== null) {
      this.state.abortController?.abort();
      this.state.apiKey = null;
      this.state.snapshot = null;
      this.state.prepared = null;
      this.state.pair = null;
      this.state.consent = null;
    }
    this.state = null;
    return {
      sessionId: `erased-${randomBytes(6).toString("hex")}`,
      deletedAt: new Date().toISOString(),
      deletedClasses: ["manuscript-text", "provider-request-response", "api-key", "ratings", "server-session"]
    };
  }

  private setSnapshot(sources: ImportSource[]): void {
    const state = this.requireState();
    const { snapshot } = createCorpusSnapshot(sources);
    state.snapshot = snapshot;
    state.prepared = null;
    state.consent = null;
    state.apiKey = null;
    state.pair = null;
    state.stage = "imported";
  }

  private requireState(): SessionState {
    if (this.state === null) throw new GateAError("INVALID_REQUEST", "先にセッションを開始してください。");
    return this.state;
  }

  private requireSnapshot(): CorpusSnapshot {
    const snapshot = this.requireState().snapshot;
    if (snapshot === null) throw new GateAError("INVALID_REQUEST", "先に原稿copyを読み込んでください。");
    return snapshot;
  }

  private requirePrepared(): PreparedRun {
    const prepared = this.requireState().prepared;
    if (prepared === null) throw new GateAError("INVALID_REQUEST", "先に送信範囲を確認してください。");
    return prepared;
  }
}

export { DEFAULT_QUERY };
