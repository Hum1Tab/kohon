# Gate A read-only companion 仕様

版: 0.1  
status: Ready for implementation  
更新日: 2026-08-30  
親文書: [START HERE](./START-HERE.md) / [評価protocol](./gate-a-evaluation-protocol.md) / [contracts](../specs/README.md)

## Product brief

### 一文

既存小説のコピーから、読了位置を超えない範囲だけを同一モデルへ渡し、一般的な講評と根拠・版・coverage付き講評をcondition-label masked比較できる、ローカル実行のread-only研究用companion。

### 検証する価値

- 読了位置が物理的に守られる安心
- 回答が本文の引用へ戻れる速さ
- どこを読んだか、読まなかったかが見えること
- 改稿版を読み直した時にfindingが継続・古い・曖昧と分かること
- chat personaではなく、情報境界と出力契約を持つlens

### 検証しない価値

- 小説を書く快適さ
- 縦書きeditor品質
- Git/history UX
- 設定DB、自動Wiki、RAG
- 本文生成・rewriteの品質
- 正本形式、同期、共同編集

Gate Aでこれらを混ぜると、lens仮説の失敗とeditor完成度の失敗を区別できない。

## User stories

### US-01 Copyを読む

作家として、現在の原稿を壊す心配なく試したいので、元fileではなく明示的に選んだcopyを読み込ませたい。

### US-02 読者の到達点を決める

作家として、第N章までの初見読者に見える問題を知りたいので、scene orderとcutoffを確認してから実行したい。

### US-03 送信範囲を知る

作家として、未発表原稿をどこへ送るか判断したいので、provider、model、document、文字数、除外範囲を実行前に見たい。

### US-04 同じ条件で比べる

調査参加者として、説明に誘導されず有用性を比べたいので、generic outputとlens outputをA/Bの匿名表示で見たい。

### US-05 根拠へ戻る

作家として、所見が本当に本文に支えられているか判断したいので、引用を押してcopy内の正確な箇所へ移動したい。

### US-06 誤接続を避ける

作家として、改稿後に古い所見を別文へ誤って付けたくないので、一意に解決できないfindingを古い・曖昧として見たい。

### US-07 消す

参加者として、調査後に原稿とoutputを残したくないので、保存状況を見て一操作でsession dataを消したい。

## Actorと権限

|actor|できること|できないこと|
|---|---|---|
|Participant|copy import、scope、consent、query、rating、erase|元file更新、prompt/model変更、blind label閲覧|
|Moderator|study case選択、session開始、incident停止、export|参加者の選好変更、raw manuscriptの恒久保存|
|Research lead|study config、randomization seed、pseudonymous export|API keyやPIIをstudy resultへ混ぜる|
|Provider adapter|許可済みcontextを送信しresponseを返す|file system access、scope拡張、本文変更|
|Lens validator|schema、citation、cutoffを検査|文学的正しさを保証、findingを補作|

## State machine

|state|entry|許される遷移|不変条件|
|---|---|---|---|
|EMPTY|起動直後|IMPORTED|network callなし|
|IMPORTED|copy解析・hash完了|SCOPED / ERASED|元pathへwrite handleを持たない|
|SCOPED|order、cutoff、query確定|CONSENTED / IMPORTED|eligible documentが決定済み|
|CONSENTED|context manifest承認|RUNNING / SCOPED|provider/model/payload hash固定|
|RUNNING|A/B request開始|VALIDATING / FAILED|同じsnapshot/model/output budget|
|VALIDATING|response受信|REVIEW / FAILED|model outputをまだfindingとして信用しない|
|REVIEW|両output検証完了|RATED / SCOPED / ERASED|source labelを隠す|
|RATED|選好と理由を保存|REVEALED / ERASED|rating後までsource非公開|
|REVEALED|A/B source開示|SCOPED / EXPORTED / ERASED|過去ratingを変更不可|
|FAILED|request/validation失敗|SCOPED / ERASED|失敗を空の成功へ変えない|
|EXPORTED|pseudonymous result出力|ERASED|export内容をpreview済み|
|ERASED|session data削除|EMPTY|説明外dataなし|

browser reloadまたはserver restartでRUNNINGを成功扱いしない。session recoveryは原稿を再importさせるか、明示同意した一時sessionだけに限定する。

## Screen specification

### S1 Start / Study code

- study version、privacy summary、research use表示
- participant ID入力。氏名・mailは禁止
- `fixtureを使う` / `自分のcopyを使う`
- offline mock modeの表示
- 過去session dataがある場合は内容と削除button

Exit criteria: PIIを入力せずS2へ進める。

### S2 Import

- UTF-8 `.txt` / `.md`を複数選択
- folder名またはfile pathは表示用session memoryに留め、exportへ入れない
- document titleとorderをpreview
- encoding error、binary、巨大file、重複を明示
- import後に各document SHA-256と全snapshot IDを表示できるdebug drawer
- 「元fileは変更しません」を説明し、読み込んだcopyのeraseを常時表示

Gate AではDOCX、EPUB、Nola/Scrivener native projectを直接importしない。参加者は安全なTXT/Markdown copyを用意する。

### S3 Order and reader cutoff

- document listを手動並替え
- `この読者はここまで読んだ` cutoffを一つ選択
- cutoff後をlock表示
- 初見読者lensではfuture document、作者note、canonをeligible setへ入れない
- 整合性候補では明示選択したdocumentだけをeligibleにする。既定で全未来章を足さない
- query入力。presetは二つだけ

Preset:

1. `この読者が混乱しそうな箇所、感情のつながりが飛んで見える箇所、話者や目的を取り違えそうな箇所を挙げてください。`
2. `選択範囲の中で両立しにくい記述を候補として挙げ、両側の根拠を示してください。嘘、誤認、時点差、意図的未確定の可能性を区別してください。`

queryへ「続きを書いて」「rewrite」等が入った場合、研究scope外として拒否する。

### S4 Context manifest and consent

表示項目:

- lens ID/version
- snapshot ID
- cutoff document
- eligible / sent / omitted document title
- documentごとの文字数とhash短縮表示
- sent total chars、推定token、output上限
- provider、exact model ID、endpoint domain
- retention link、`store`設定、local/raw保存設定
- toolsなし、web searchなし、file writeなし
- outgoing payloadのhuman-readable preview

Checkboxは一つずつ確認する。

- 表示範囲をproviderへ送る
- raw responseをlocalに保存する／しない
- pseudonymous metricsを研究exportへ含める

raw responseのlocal保存は既定offとする。manifest生成後にsnapshot、cutoff、model、prompt、output budgetが変わった場合、同意を無効にしてS3へ戻す。

### S5 Running

- A/Bのどちらを先に生成しているか見せない
- cancel可能
- provider/model、経過時間、request ID短縮表示
- token streamingは表示しない。途中出力で先入観を作らない
- application-levelとSDK内の自動retryは無効にする。無効化またはattempt観測ができないSDKはstudy adapterに使わない。timeoutは結果不明として記録し、Moderatorまたはparticipantが一回だけ明示retryできる
- retryは新しいattempt IDを使い、同じstudy runへ紐付ける。providerが公式にidempotency機構を保証する場合だけadapter capabilityとして使い、未確認headerを仮定しない

### S6 Blind A/B

- A/Bを同じ幅、font、heading hierarchyで表示
- lens側の引用・coverageは機能として残すが、brand/用語を隠す
- output順は事前randomizationで決定し、reloadで変えない
- A/Bそれぞれにmark:
  - 役立つ
  - 根拠が弱い
  - 誤解または害がある
  - 文体を均しそう
  - 最大の問題を見逃した
- task完了までのtimer。参加者には常時見せない
- 強制選択: A / B / 同等 / どちらも使わない
- 自由理由を先、尺度を後に記録
- mapping reveal前に専用lensだと思う側（A / B / 分からない）と確信度0～4を記録

rating送信前にcondition mappingを開示しない。DOM、network response、export file名にも`baseline/lens`を露出しないparticipant modeを持つ。

### S7 Finding review and source jump

rating後、lens側だけを構造化findingとして表示する。

Card fields:

- claim
- category
- salience: low / medium / high。作品品質scoreではない
- model self-confidence: low / medium / high。正しさの確率ではない
- 一つ以上のevidence quote
- alternate interpretation
- coverage summary
- validation status

card clickでread-only source paneへjumpし、exact quoteをhighlightする。複数evidenceはtabで切替。位置が一意でなければjumpせず`ambiguous`。見つからなければ`stale`。

Participant action:

- useful
- rejected
- intentional
- unclear
- misleading

本文・canonを変更するbuttonは置かない。

### S8 Export / Erase

Export previewはアクセス制御されたprivate research領域向けであり、public datasetではない。

- participant ID
- study/lens/prompt/schema version
- snapshot/document hashと文字数。本文なし
- model/provider、latency、token usage、validation count
- randomization、rating、task time、reason、condition guess/confidence
- findingのcategory/status/count。claim、quote、raw outputは含めない
- incident flags

Public reportへは集計値だけを別processで作り、participant ID、run ID、snapshot/document hash、free textを出さない。

Erase:

- memory中のtext、raw request/response、temporary file、browser storage、server sessionを列挙
- 一操作で削除
- deletion receiptは本文を含まず、session ID、timestamp、deleted classだけ

## Corpus snapshot

### Input rules

- file bytesはdecode前にSHA-256
- Gate AはUTF-8のみ。BOMは検出・記録し、textから除く
- newlineは変換せず、`LF / CRLF / mixed`をmanifestへ記録
- Unicode normalizationを勝手に行わず、NFC/NFD差を記録
- document orderは参加者が確認した整数
- titleはfile名から候補を作るが編集可能
- empty documentはsnapshotへ保持できるが`non-eligible: empty-document`とし、providerへ送らない
- duplicate contentを警告し、勝手に除外しない

Snapshot IDは、schema version、ordered document IDs、byte hashes、order、titleのcanonical serializationからSHA-256で作る。絶対path、作成者名、mtimeは含めない。

Gate Aの`document_id`は[source contractのdocument ID v1](../specs/README.md#gate-a-document-id-v1)で決定論的に作る。random UUID、絶対path、mtimeを使わない。これはcopy比較用であり、将来の正本に必要な永続scene IDの採用判断ではない。

schema: [corpus-snapshot.schema.json](../specs/corpus-snapshot.schema.json)

## Scope and context assembly

### Hard boundary

初見読者lensのeligible setは、`document.order <= cutoff_order`かつnon-emptyのdocumentだけで作る。未来documentとempty documentはlocal manifestの`non_eligible_documents`へ理由だけを記録し、検索、要約、provider向けtoken estimate、prompt cacheのいずれにも渡さない。整合性lensでは未選択documentも同じくnon-eligibleにする。

Gate AではRAG、embedding、provider file upload、hosted file searchを使わない。選択範囲の全文を直接送る。model contextへ収まらない場合は次のいずれかにする。

1. cutoffまたは選択範囲を狭める
2. より大きいcontextを持つ事前承認modelへ変更し、同意を取り直す
3. runを`coverage-failed`として中止する

自動truncationや「関連箇所だけ読んだのに全体を検査した」表示を禁止する。

### Context manifest invariant

`eligible_doc_ids = sent_doc_ids + omitted_doc_ids`が重複なく成立する。snapshot documentはeligibleまたはnon-eligibleのどちらか一方に属する。omitted/non-eligibleには理由が必要である。初期studyの有効runは原則`omitted_doc_ids = []`、coverage 100%とする。provider requestへはsent documentだけを渡し、non-eligibleのID、title、hash、textを含むlocal manifest全体を渡さない。

## Generic baseline

Lensとの差はprompt契約だけにする。

同一条件:

- snapshot
- eligible text
- user query
- exact model ID
- provider endpoint
- max output tokens
- temperatureまたはsampling設定
- request時刻block内のmodel version。providerが返すIDを記録

Baseline instructionの初版:

> あなたは小説原稿へのフィードバックを行います。以下の原稿だけを読み、ユーザーの質問へ日本語で具体的に答えてください。改善に役立つ箇所があれば本文を短く引用して説明してください。本文の続きを書かず、原稿を変更しないでください。

Baselineにはlens固有のcoverage schema、evidence validation、読者persona以上のaccess contractを与えない。ただしfuture documentを送らない安全境界は両群に共通とする。危険なbaselineを作ってlensを有利にしない。

## Lens contract

Lens instructionは次の順で構成する。

1. `role`: synthetic reader, not author/editor/oracle
2. `scope`: supplied documents only; no outside story facts
3. `reader cutoff`: future information is unavailable, not merely secret
4. `task`: first-reader or consistency-candidate
5. `epistemic rule`: absence of finding is not absence of problem
6. `evidence`: exact quote required; never invent or normalize quote
7. `alternatives`: lie, misunderstanding, time difference, intentional ambiguity
8. `output`: supplied JSON Schema only
9. `permission`: no rewrite, continuation, canon update, tool call

Prompt textは[評価protocol](./gate-a-evaluation-protocol.md)でhashを固定し、session途中に変更しない。

## Finding validation

Model outputは次の順で検査する。

1. JSON parse
2. schema version and enum
3. finding count limit
4. evidence documentがsent setにある
5. quoteがdocument textのexact substringである
6. local validatorが一致箇所ごとのUTF-16 half-open rangeを計算する
7. local validatorがprefix/suffixをsourceから取得する
8. 同一quoteの候補数を数える
9. query scope違反、future canary、rewrite payloadを検査
10. duplicate findingを同一claim/evidence hashでmark

検証できないfindingを修正するために別のmodel callをしない。runを`invalid-model-output`として数え、participantへ「検証できなかった所見」と表示する。捏造引用を本文なしの主張へ降格させない。

Gate Aの通常jumpはimmutable snapshot内だけで行う。`snapshot_id`または`document_text_sha256`が異なるsourceへは自動attachせず、`source-version-mismatch`にする。同一snapshot内の位置解決は保守的にする。

- exact quote + prefix/suffixが一意 → attached
- exact quoteが複数でcontextにより一意 → attached
- exact quoteが複数で決められない → ambiguous
- quoteがない → stale
- fuzzy/semantic match → 使用禁止

別snapshotへの再接続はGate Aのparticipant flowに含めず、SP-04だけで明示操作として検証する。その場合も元findingを更新せず、別版で見つかった位置を`reattachment-candidate`として提示する。

modelへ渡すschema: [lens-output.schema.json](../specs/lens-output.schema.json)  
local検証後のschema: [lens-finding.schema.json](../specs/lens-finding.schema.json)

Modelにはoffset、prefix、suffix、occurrence count、validation statusを生成させない。`document_id + exact_text`だけを受け取り、位置情報はlocalのimmutable snapshotから計算する。

## Follow-up conversation

Blind A/B primary taskはsingle-turnとする。rating後の探索だけ、最大3 follow-upを許す。

- 同じimmutable snapshotとcutoffを使う
- 毎回context manifestを再計算し、scope拡張時は再同意
- provider conversation storageへ依存せず、必要なuser-visible historyをlocalから再送
- prior outputをcanon/memoryとして扱わない
- thread deleteでlocal historyを消す

OpenAI adapterを使う場合、Responses APIの`store`をfalseとし、structured outputを`text.format`のJSON Schemaで要求する。公式APIは`store`がresponseを後で取得するために保存するかを制御し、structured JSON形式を指定できる。[OpenAI Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) `truncation`はdisabled相当を使い、長過ぎる入力を先頭から黙って落とさない。providerの保持条件そのものは別途study説明へ記す。

## Provider adapter

Interface contract:

    ProviderRequest
      provider_id
      endpoint_origin
      exact_model_id
      instructions
      input_documents
      user_query
      output_schema?      # lens only
      max_output_tokens
      sampling_config
      store_requested
      study_run_id

    ProviderResponse
      provider_request_id
      exact_model_id_returned
      status
      output_text
      token_usage
      latency_ms
      provider_error_code?

最初のadapter:

1. **Mock**: fixture responseを返し、networkを使わない
2. **OpenAI Responses API候補**: structured output、`store:false`、toolなし

Ollama/local adapterはcloud refusal participant用として有用だが、Gate A primary comparisonに異なるmodelを混ぜない。実装はcloud primaryがend-to-endを通った後のstretchとする。

API key:

- environmentまたはsession-only入力
- browser localStorage、project folder、run export、logへ保存しない
- UIには末尾4文字も表示しない
- error bodyをそのままparticipant画面へ出さない
- request headerをdebug logへ出さない

## Local architecture

Gate Aの推奨構成:

    browser UI on 127.0.0.1
      ↕ session token + JSON
    local Node.js process
      ├─ import/snapshot
      ├─ scope/context manifest
      ├─ provider adapters
      ├─ schema/citation validator
      ├─ blind assignment
      └─ consented study export

Workspace候補:

    apps/gate-a-pilot/       local server + browser UI
    packages/contracts/      generated TypeScript types + JSON Schema
    packages/lens-core/      pure snapshot/scope/anchor/validation logic
    packages/provider-openai/
    packages/provider-mock/
    research/                study config; no participant raw data in Git
    fixtures/

Rules:

- serverは`127.0.0.1`だけへbind。`0.0.0.0`禁止
- 起動ごとにrandom session token
- OSにrandom available portを割り当て、固定portを前提にしない
- `Host`をexact `127.0.0.1:<assigned-port>`へ限定し、CORSを許可しない
- browser origin、SameSite session cookieまたは同等token、CSRFを検証
- file pickerで得たpathはimport後に破棄
- file watcherなし
- provider以外のnetwork endpointなし
- analytics、update check、font CDN、remote imageなし
- production cloud backendなし
- core logicはUIとproviderから分離し、fixtureでpure testできる
- manuscript、model output、finding、titleをuntrusted textとして扱い、raw HTMLを解釈しない
- Markdown rendererはscript、style、iframe、image、audio/video、form、active linkを無効化し、URLはcopy可能なtextだけにする
- browser CSPは最低でも`default-src 'self'; img-src 'self' data:; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'`を満たし、browserからproviderへ直接接続しない

UI frameworkとHTTP libraryは実装者が既存標準から選べるが、contractとsecurity ruleを変えない。Gate Aでframework比較をしない。

## Research storage layout

研究者端末だけの例。Git root外へ置く。

    gate-a-private/
      contacts.enc
      consent/
      sessions/
        P-XXXXXXXX/
          session.json
          ratings.json
          deletion-receipt.json
          raw/             # explicit opt-in only
      exports/
        pseudonymous/

Applicationはprivate rootを自動発見しない。Research leadが起動時に選び、repository配下なら警告して拒否する。

## Error model

|code|participant表示|処理|
|---|---|---|
|IMPORT_ENCODING|UTF-8として読めません|原file無変更、別copyを案内|
|SCOPE_EMPTY|読む範囲がありません|S3へ戻る|
|CONTEXT_TOO_LARGE|全文を省略せず送れません|範囲またはmodelを選び直し、再同意|
|CONSENT_STALE|送信条件が変わりました|manifestを再表示|
|PROVIDER_AUTH|接続設定を確認してください|keyをlogせず停止|
|PROVIDER_RATE_LIMIT|providerの利用上限です|手動retry。A/B片側だけを評価しない|
|OUTPUT_SCHEMA|回答を構造として検証できません|invalid count、run失敗|
|OUTPUT_UNSAFE|安全に表示できない内容を除外しました|raw HTML/active resourceを実行せずtext化|
|CITATION_MISSING|本文で確認できない引用がありました|card化せずincident count|
|BOUNDARY_VIOLATION|許可外の情報が検出されました|全study停止対象|
|ANCHOR_AMBIGUOUS|同じ引用が複数あります|jumpしない|
|ANCHOR_STALE|現在のcopyに引用がありません|古い表示|
|ERASE_FAILED|一部を削除できませんでした|残存classを列挙、終了扱いにしない|

## Non-functional requirements

### Safety

- 元fileのbyte hashとmtimeがsession前後で同一
- write operationを提供するAPI routeがない
- outgoing document IDsはmanifestのsent setのsubset
- critical errorはfail closed

### Privacy

- network requestはprovider originだけ
- telemetry 0
- raw content log 0
- API key persistence 0
- export前preview 100%

### Performance

参照Windows機での工学目標:

- 1,000 document / 合計100万日本語文字のimportとhash: 5秒以内
- document切替とexact quote jump: 200ms以内
- finding 100件のrender: 500ms以内
- UI操作中に原稿全文をDOMへ同時展開しない

AI latencyはprovider別に記録し、製品処理と分離する。

### Accessibility

- keyboardだけでimport後の主要flowを完了
- A/Bを色だけで区別しない
- source highlightへscreen reader label
- focus orderがvisual orderと一致
- timerを読み上げない
- font size 200%でrating controlsが隠れない

## Acceptance test

### P0 — 実装完了に必須

|ID|Given|When|Then|
|---|---|---|---|
|AT-001|TXT/MD fixture|import|snapshot schemaに適合し、元hash/mtime不変|
|AT-002|future canary fixture、cutoff=2|manifest生成|future doc ID/text/canaryがpayloadに0|
|AT-003|manifest承認後|modelまたはscope変更|consentがstaleになり送信不可|
|AT-004|同一study case|A/B request|snapshot/model/max output/samplingが一致|
|AT-005|捏造quote response|validation|finding cardにならずinvalid countへ入る|
|AT-006|重複quote|source jump|contextで一意でなければambiguous|
|AT-007|rating前|participant DOM/export確認|baseline/lens labelが見えない|
|AT-008|erase|process/browser/private root確認|説明済みreceipt以外のsession data 0|
|AT-009|provider error|retry/exit|片側だけでA/B rating不可、raw error非表示|
|AT-010|API keyを含むtest value|log/export/error|secret value 0件|
|AT-011|1M char fixture|import/navigation|工学目標内、crash 0|
|AT-012|network capture|full session|provider以外のorigin 0|
|AT-013|mock providerと公開fixture|S1からS8まで実行|networkなしでimport、run、review、export preview、eraseを完走|
|AT-014|未同意またはstale consent|run操作|provider request 0件、manifestへ戻る|
|AT-015|cloud adapter request capture|lens run|`store=false`、toolsなし、external searchなし、truncation disabled|
|AT-016|study export|本文、引用、raw response、絶対pathを検索|該当値0件でpseudonymous metricsだけを含む|
|AT-017|script、raw HTML、remote image/linkを含むmanuscript/model fixture|全screenでrenderしnetwork capture|script/navigation/form送信0、provider以外のrequest 0、危険要素はescaped text|

### P1 — 最初のmoderated session前

- study configとprompt hashを画面・exportに記録
- Moderatorがincident stopを一操作で実行
- fixture modeでkeyなしend-to-end
- randomization seedを固定して再現
- consent profileでraw data保存を切替
- exportとeraseをsession rehearsalで完走

### P2 — 4週間pilot前

- crash後に元原稿が不変
- participant向けinstall/uninstall手順
- private data rootのpermission確認
- automatic updateなし
- OSのoutbound firewall/proxyでendpoint監査
- uninstall後の残存data一覧と手動消去手順

## Definition of done

Gate A companion実装が「Done」と言えるのは、画面が動くだけではなく、次を満たした時である。

1. P0/P1 test reportがcommit hashへ結びつく
2. schema、prompt、study configがversioned
3. leakage、anchor、日本語format fixtureがCIで通る
4. security/privacy checklistを実装者以外が確認
5. D0 rehearsalをfixtureだけで二回完走
6. source file write、future payload、silent anchor、secret logが0
7. 既知の失敗と非範囲をparticipant画面とmanualへ記載

この条件を満たしても、製品本体を作るGoではない。ユーザー結果は別のGate A判定である。
