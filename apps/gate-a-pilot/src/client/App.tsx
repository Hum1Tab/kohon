import { useEffect, useMemo, useState, type ReactNode } from "react";

import { bootstrap, getJson, postJson } from "./api.js";
import { SafeText } from "./SafeText.js";
import type { Evidence, Finding, MaskedPair, PublicDocument, PublicState, RevealedReview } from "./types.js";

const METRICS = [
  ["usefulness", "役立ち度"],
  ["specificity", "具体性"],
  ["evidence_trust", "根拠の信頼"],
  ["novel_insight", "新しい気づき"],
  ["misleading_risk", "誤解リスク"],
  ["voice_pressure", "文体への圧力"],
  ["decision_confidence", "判断の確信"]
] as const;

type MetricKey = (typeof METRICS)[number][0];
type Ratings = Record<MetricKey, number>;

const initialRatings = (): Ratings => ({ usefulness: 2, specificity: 2, evidence_trust: 2, novel_insight: 2, misleading_risk: 2, voice_pressure: 2, decision_confidence: 2 });

function StepHeader({ current }: { current: number }): ReactNode {
  const labels = ["開始", "取込", "読了位置", "送信確認", "実行", "比較", "根拠確認", "消去"];
  return <nav aria-label="進行状況" className="steps">{labels.map((label, index) => <span key={label} className={index + 1 === current ? "active" : index + 1 < current ? "done" : ""}><b>{index + 1}</b>{label}</span>)}</nav>;
}

function ErrorBanner({ message }: { message: string | null }): ReactNode {
  return message === null ? null : <div role="alert" className="error">{message}</div>;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`${file.name}を読めませんでした。`));
    reader.onload = () => {
      const value = String(reader.result);
      resolve(value.slice(value.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export default function App(): ReactNode {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<PublicState>({ stage: "empty" });
  const [participantId, setParticipantId] = useState("P-DEMO01");
  const [useFixture, setUseFixture] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [cutoffId, setCutoffId] = useState("");
  const [query, setQuery] = useState("この読者が混乱しそうな箇所、感情のつながりが飛んで見える箇所、話者や目的を取り違えそうな箇所を挙げてください。");
  const [providerId, setProviderId] = useState<"mock" | "openai">("mock");
  const [modelId, setModelId] = useState("mock-fixed-v0.1");
  const [apiKey, setApiKey] = useState("");
  const [consentSend, setConsentSend] = useState(false);
  const [consentNoRaw, setConsentNoRaw] = useState(false);
  const [consentMetrics, setConsentMetrics] = useState(false);
  const [pair, setPair] = useState<MaskedPair | null>(null);
  const [ratingsA, setRatingsA] = useState<Ratings>(initialRatings);
  const [ratingsB, setRatingsB] = useState<Ratings>(initialRatings);
  const [preference, setPreference] = useState<"A" | "B" | "tie" | "both-reject">("tie");
  const [guess, setGuess] = useState<"A" | "B" | "cannot-tell">("cannot-tell");
  const [guessConfidence, setGuessConfidence] = useState(0);
  const [review, setReview] = useState<RevealedReview | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  const [vertical, setVertical] = useState(false);
  const [exportValue, setExportValue] = useState<Record<string, unknown> | null>(null);
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void bootstrap<{ csrfToken: string; state: PublicState; defaults: { query: string } }>()
      .then((value) => { setState(value.state); setQuery(value.defaults.query); setReady(true); })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "起動に失敗しました。"));
  }, []);

  const act = async (work: () => Promise<void>): Promise<void> => {
    setError(null);
    setBusy(true);
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : "処理に失敗しました。"); } finally { setBusy(false); }
  };

  const documents = state.snapshot?.documents ?? [];

  const start = (): void => { void act(async () => {
    const next = await postJson<PublicState>("/api/session/start", { participantId, useFixture });
    setState(next);
    setCutoffId(next.snapshot?.documents.at(-2)?.document_id ?? next.snapshot?.documents.at(-1)?.document_id ?? "");
    setScreen(2);
  }); };

  const importFiles = (): void => { void act(async () => {
    const accepted = files.filter((file) => /\.(?:txt|md)$/iu.test(file.name));
    if (accepted.length !== files.length || accepted.length === 0) throw new Error("UTF-8の.txtまたは.mdだけを選んでください。");
    const payload = await Promise.all(accepted.map(async (file) => ({
      name: file.name,
      title: file.name.replace(/\.(?:txt|md)$/iu, ""),
      mediaType: file.name.toLowerCase().endsWith(".md") ? "text/markdown" : "text/plain",
      base64: await fileToBase64(file)
    })));
    const next = await postJson<PublicState>("/api/import", { files: payload });
    setState(next);
    setCutoffId(next.snapshot?.documents.at(-1)?.document_id ?? "");
  }); };

  const prepare = (): void => { void act(async () => {
    const next = await postJson<PublicState>("/api/prepare", { cutoffDocumentId: cutoffId, query, providerId, modelId, maxOutputTokens: 1400 });
    setState(next);
    setScreen(4);
  }); };

  const consent = (): void => { void act(async () => {
    const next = await postJson<PublicState>("/api/consent", { sendApproved: consentSend, rawResponseNotSaved: consentNoRaw, metricsExportApproved: consentMetrics, ...(providerId === "openai" ? { apiKey } : {}) });
    setApiKey("");
    setState(next);
    setScreen(5);
  }); };

  const run = (): void => { void act(async () => {
    const result = await postJson<MaskedPair>("/api/run", {});
    setPair(result);
    setScreen(6);
  }); };

  const cancel = (): void => { void postJson("/api/cancel", {}).catch(() => undefined); };

  const rate = (): void => { void act(async () => {
    const result = await postJson<RevealedReview>("/api/rate", {
      ratings: { A: ratingsA, B: ratingsB }, preference, reasonCodes: [], conditionGuess: guess, guessConfidence
    });
    setReview(result);
    const firstAttached = result.findings.flatMap((finding) => finding.evidence).find((evidence) => evidence.anchor_status === "attached") ?? null;
    setSelectedEvidence(firstAttached);
    setScreen(7);
  }); };

  const loadExport = (): void => { void act(async () => { setExportValue(await getJson<Record<string, unknown>>("/api/export")); setScreen(8); }); };

  const setFindingStatus = (findingId: string, authorStatus: "useful" | "rejected" | "intentional" | "unclear" | "misleading"): void => { void act(async () => {
    setReview(await postJson<RevealedReview>("/api/finding/status", { findingId, authorStatus }));
  }); };

  const erase = (): void => { void act(async () => {
    const value = await postJson<Record<string, unknown>>("/api/erase", {});
    setReceipt(value);
    setState({ stage: "empty" }); setPair(null); setReview(null); setSelectedEvidence(null); setExportValue(null); setApiKey("");
    window.history.replaceState(null, "", window.location.pathname);
  }); };

  const selectedDocument = useMemo(() => review?.documents.find((document) => document.document_id === selectedEvidence?.document_id) ?? null, [review, selectedEvidence]);

  if (!ready) return <main className="shell"><h1>KOHON</h1><ErrorBanner message={error} /><p>{error === null ? "local sessionを確認しています…" : "ターミナルの起動URLを確認してください。"}</p></main>;

  return <main className="shell">
    <header className="masthead"><div><p className="eyebrow">LOCAL · READ ONLY · GATE A</p><h1>KOHON</h1><p>作者の代わりに書かず、読者の視界を原文上で確かめる。</p></div><span className="local-badge">運営サーバーなし</span></header>
    <StepHeader current={screen} />
    <ErrorBanner message={error} />

    {screen === 1 && <section className="card"><h2>1. 調査セッションを始める</h2><p>氏名やメールは入力しません。本文はこの端末のメモリだけで扱い、元ファイルへ書き込みません。</p><label>参加者ID<input value={participantId} onChange={(event) => setParticipantId(event.target.value.toUpperCase())} pattern="P-[A-Z0-9]{4,16}" /></label><label className="check"><input type="checkbox" checked={useFixture} onChange={(event) => setUseFixture(event.target.checked)} /> 公開fixtureで試す（AI費用0円）</label><button disabled={busy} onClick={start}>次へ</button></section>}

    {screen === 2 && <section className="card"><h2>2. 原稿copyを読み込む</h2><p>UTF-8のTXT/Markdownのみ。改行、全角空白、Unicodeを正規化しません。</p>{!useFixture && <><input aria-label="原稿ファイル" type="file" accept=".txt,.md,text/plain,text/markdown" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /><button disabled={busy || files.length === 0} onClick={importFiles}>選んだcopyを読み込む</button></>}<DocumentTable documents={documents} />{state.snapshot && <details><summary>検証用hash</summary><code>{state.snapshot.snapshot_id}</code></details>}<div className="actions"><button className="secondary" onClick={() => setScreen(1)}>戻る</button><button disabled={!state.snapshot} onClick={() => setScreen(3)}>順序と読了位置へ</button></div></section>}

    {screen === 3 && <section className="card"><h2>3. この読者が読んだ位置</h2><p>選んだ文書までを含め、それより後ろは検索・要約・token見積りにも使いません。</p><label>読了位置<select value={cutoffId} onChange={(event) => setCutoffId(event.target.value)}>{documents.filter((document) => !document.empty).map((document) => <option key={document.document_id} value={document.document_id}>{document.order + 1}. {document.title}</option>)}</select></label><label>読者への質問<textarea rows={4} value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="grid-two"><label>AI接続<select value={providerId} onChange={(event) => { const next = event.target.value as "mock" | "openai"; setProviderId(next); setModelId(next === "mock" ? "mock-fixed-v0.1" : "gpt-5-mini"); }}><option value="mock">Offline Mock（費用0円）</option><option value="openai">OpenAI API（利用者のAPIキー）</option></select></label><label>正確なmodel ID<input value={modelId} disabled={providerId === "mock"} onChange={(event) => setModelId(event.target.value)} /></label></div>{providerId === "openai" && <p className="notice">ChatGPT Plus/ProとAPI課金は別です。このアプリの運営者キーは使わず、利用者自身のAPIキーで直接OpenAIへ送信します。</p>}<div className="actions"><button className="secondary" onClick={() => setScreen(2)}>戻る</button><button disabled={busy || cutoffId.length === 0} onClick={prepare}>送信範囲を作る</button></div></section>}

    {screen === 4 && state.prepared && <section className="card"><h2>4. 実際に送る範囲を確認</h2><dl className="facts"><dt>Coverage</dt><dd>{state.prepared.manifest.coverage_percent}%</dd><dt>送信文書</dt><dd>{state.prepared.sentDocumentTitles.join(" / ")}</dd><dt>本文文字数</dt><dd>{state.prepared.totalCharsUtf16.toLocaleString()}</dd><dt>概算token</dt><dd>約 {state.prepared.estimatedTokens.toLocaleString()}</dd><dt>接続</dt><dd>{state.prepared.providerId} / {state.prepared.modelId}</dd><dt>機能</dt><dd>toolなし・Web検索なし・file書込なし・自動省略なし</dd><dt>費用負担</dt><dd>{state.prepared.providerId === "mock" ? "0円" : "利用者のOpenAI API account（実額はmodel pricingによる）"}</dd></dl>{providerId === "openai" && <p className="notice">`store:false`を要求しますが、これはprovider側のabuse-monitoring retentionが必ず0という意味ではありません。通常は最大30日の保持があり得て、ZDR/MAMは利用者organization側の契約・設定です。</p>}<h3>送信対象外</h3><ul>{state.prepared.manifest.non_eligible_documents.map((item) => <li key={item.document_id}>{documents.find((document) => document.document_id === item.document_id)?.title ?? item.document_id} — {item.reason}</li>)}</ul><label className="check"><input type="checkbox" checked={consentSend} onChange={(event) => setConsentSend(event.target.checked)} /> 上に表示された範囲だけをproviderへ送る</label><label className="check"><input type="checkbox" checked={consentNoRaw} onChange={(event) => setConsentNoRaw(event.target.checked)} /> raw responseを端末へ保存しない</label><label className="check"><input type="checkbox" checked={consentMetrics} onChange={(event) => setConsentMetrics(event.target.checked)} /> 本文を含まない匿名指標のexportを許可する</label>{providerId === "openai" && <label>OpenAI APIキー（メモリのみ・実行後即破棄）<input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} /></label>}<div className="actions"><button className="secondary" onClick={() => setScreen(3)}>条件を変える</button><button disabled={busy || !consentSend || !consentNoRaw || (providerId === "openai" && apiKey.length === 0)} onClick={consent}>同意して次へ</button></div></section>}

    {screen === 5 && <section className="card center"><h2>5. 同じ条件で2つの回答を作る</h2><p>同じmodel・本文・質問・出力上限で比較します。自動retryとstreaming表示はしません。</p><button className="primary-large" disabled={busy} onClick={run}>{busy ? "検証しながら実行中…" : "A/Bを実行"}</button>{busy && <button className="danger-link" onClick={cancel}>中止する</button>}</section>}

    {screen === 6 && pair && <section><div className="card"><h2>6. 条件名を見ずに比較</h2><p>どちらが専用lensかは評価送信まで開示しません。引用や文章もリンクとして実行せず、すべて文字として表示します。</p></div><div className="comparison">{pair.displayOrder.map((id) => { const panel = pair.panels.find((item) => item.id === id)!; return <article className="panel" key={id}><h3>回答 {id}</h3>{panel.blocks.map((block, index) => <div className="feedback-block" key={`${block.title}-${index}`}><h4>{block.title}</h4><SafeText className="prewrap" value={block.body} />{block.quotes.map((quote) => <blockquote key={quote}>{quote}</blockquote>)}</div>)}{panel.warningCount > 0 && <p className="warning">検証できない所見: {panel.warningCount}</p>}<RatingEditor label={id} values={id === "A" ? ratingsA : ratingsB} onChange={id === "A" ? setRatingsA : setRatingsB} /></article>; })}</div><section className="card"><label>どちらを使いたいですか<select value={preference} onChange={(event) => setPreference(event.target.value as typeof preference)}><option value="A">A</option><option value="B">B</option><option value="tie">同等</option><option value="both-reject">どちらも使わない</option></select></label><label>専用lensだと思う側<select value={guess} onChange={(event) => setGuess(event.target.value as typeof guess)}><option value="cannot-tell">分からない</option><option value="A">A</option><option value="B">B</option></select></label><label>推測の確信度 0〜4<input type="range" min="0" max="4" value={guessConfidence} onChange={(event) => setGuessConfidence(Number(event.target.value))} /> {guessConfidence}</label><button disabled={busy} onClick={rate}>評価を確定して根拠を見る</button></section></section>}

    {screen === 7 && review && <section><div className="card"><h2>7. 所見から原文へ戻る</h2><p>専用lensは回答 {review.mapping.A === "lens" ? "A" : "B"} でした。Coverage {review.coverage}% 。一意な完全一致引用だけジャンプできます。</p></div><div className="review-layout"><aside>{review.findings.length === 0 ? <p>検証済み所見はありません。</p> : review.findings.map((finding) => <FindingCard key={finding.finding_id} finding={finding} onEvidence={setSelectedEvidence} onStatus={setFindingStatus} />)}</aside><div className="source-wrap"><div className="source-toolbar"><b>{selectedDocument?.title ?? "根拠を選択してください"}</b><button className="secondary small" onClick={() => setVertical((value) => !value)}>{vertical ? "横書き" : "縦書き"}</button></div><SourcePane document={selectedDocument} evidence={selectedEvidence} vertical={vertical} /></div></div><div className="card actions"><button onClick={loadExport}>安全なexport内容を確認</button></div></section>}

    {screen === 8 && <section className="card"><h2>8. Export / Erase</h2>{receipt ? <><p className="success">セッションデータを消去しました。</p><pre className="export">{JSON.stringify(receipt, null, 2)}</pre><p>本文、AI回答、APIキー、評価、server sessionをメモリから外しました。完全なメモリ消去にはこのプロセスも終了してください。</p></> : <>{exportValue && <><p>本文・引用・claim・ファイル名・絶対path・APIキーは含みません。</p><pre className="export">{JSON.stringify(exportValue, null, 2)}</pre><button className="secondary" onClick={() => downloadJson(exportValue)}>JSONを端末へ保存</button></>}<button className="danger" disabled={busy} onClick={erase}>原稿とセッションを消去</button></>}</section>}
  </main>;
}

function DocumentTable({ documents }: { documents: PublicDocument[] }): ReactNode {
  if (documents.length === 0) return <p className="empty">まだ原稿を読み込んでいません。</p>;
  return <div className="table-wrap"><table><thead><tr><th>順</th><th>タイトル</th><th>文字</th><th>改行</th><th>byte hash</th></tr></thead><tbody>{documents.map((document) => <tr key={document.document_id}><td>{document.order + 1}</td><td>{document.title}<small>{document.source_label}</small></td><td>{document.char_count_utf16.toLocaleString()}</td><td>{document.newline_style}</td><td><code>{shortHash(document.source_byte_sha256)}</code></td></tr>)}</tbody></table></div>;
}

function RatingEditor({ label, values, onChange }: { label: string; values: Ratings; onChange: (value: Ratings) => void }): ReactNode {
  return <fieldset className="ratings"><legend>回答 {label} の評価（0〜4）</legend>{METRICS.map(([key, name]) => <label key={key}><span>{name}</span><input type="range" min="0" max="4" value={values[key]} onChange={(event) => onChange({ ...values, [key]: Number(event.target.value) })} /><output>{values[key]}</output></label>)}</fieldset>;
}

function FindingCard({ finding, onEvidence, onStatus }: { finding: Finding; onEvidence: (value: Evidence) => void; onStatus: (findingId: string, status: "useful" | "rejected" | "intentional" | "unclear" | "misleading") => void }): ReactNode {
  return <article className="finding"><div className="finding-meta"><span>{finding.category}</span><span>{finding.salience}</span><span>{finding.validation_status}</span><span>{finding.author_status}</span></div><h3>{finding.claim}</h3><p>{finding.reader_effect}</p>{finding.alternative_interpretations.length > 0 && <p className="alternative">別解釈: {finding.alternative_interpretations.join(" / ")}</p>}{finding.evidence.map((evidence, index) => <button key={`${evidence.document_id}-${index}`} className="quote-button" disabled={evidence.anchor_status !== "attached"} onClick={() => onEvidence(evidence)}>「{evidence.exact_text}」<small>{evidence.anchor_status === "attached" ? "原文で見る" : evidence.anchor_status}</small></button>)}<div className="status-actions" aria-label="この所見を分類">{(["useful", "rejected", "intentional", "unclear", "misleading"] as const).map((status) => <button key={status} className="secondary small" aria-pressed={finding.author_status === status} onClick={() => onStatus(finding.finding_id, status)}>{status}</button>)}</div></article>;
}

function SourcePane({ document, evidence, vertical }: { document: PublicDocument | null; evidence: Evidence | null; vertical: boolean }): ReactNode {
  if (document?.text === undefined || evidence === null) return <div className="source-pane empty">一意に検証できた引用を選ぶと、immutable copy上の位置を表示します。</div>;
  if (evidence.anchor_status !== "attached" || evidence.start_utf16 === null || evidence.end_utf16 === null || document.text_sha256 !== evidence.document_text_sha256) return <div className="source-pane empty">このcopyへ安全に接続できません。</div>;
  return <div className={`source-pane ${vertical ? "vertical" : ""}`} tabIndex={0}>{document.text.slice(0, evidence.start_utf16)}<mark>{document.text.slice(evidence.start_utf16, evidence.end_utf16)}</mark>{document.text.slice(evidence.end_utf16)}</div>;
}

function downloadJson(value: Record<string, unknown>): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "gate-a-pseudonymous-export.json";
  anchor.click();
  URL.revokeObjectURL(url);
}
