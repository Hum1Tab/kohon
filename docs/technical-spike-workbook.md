# Gate A Technical Spike Workbook

版: 0.1  
更新日: 2026-08-30  
親文書: [START HERE](./START-HERE.md) / [route判定](./route-decision.md)

## 目的

このworkbookは技術選定を正当化するためでなく、製品本体へ進めない理由を早く発見するために使う。各spikeはtimebox、同じfixture、事前の終了条件を持つ。

原則:

- production codeへ流用できた量を成功指標にしない
- frameworkの好みより利用者保証を測る
- failを「もう少し作る」に変えない
- participant原稿を技術fixtureに使わない
- 破壊試験は専用temp directoryだけで行う
- upstream候補はfork前にread-only integrationとmaintainer対話を試す

## 実行順

|順序|ID|問い|timebox|Gate Aへの影響|
|---:|---|---|---:|---|
|1|SP-01|Linettaを外部read-only sourceにできるか|2日|upstream/companion route|
|1|SP-02|Obsidian + TsumugiMarkを既存執筆面として使えるか|2日|plugin route|
|1|SP-04|strict anchorで誤付着0を守れるか|2日|lens safety|
|1|SP-08|全文送信でcoverageを偽らず長編taskを扱えるか|1日|AI experiment validity|
|2|SP-03|novelWriterをexport/file adapterで扱えるか|1.5日|mature OSS route|
|2|SP-05|既存縦書き基盤がquality matrixを満たすか|4日 + mac実機|standalone/plugin route|
|2|SP-06|正本表現三方式のtrade-off|4日|Gate A後のcore判断|
|2|SP-07|native snapshotとGit backendのtrade-off|4日|Gate A後のhistory判断|
|3|SP-09|4週間pilotを安全に配布できるか|3日|D3開始条件|

順序1はユーザーsession実装と並行できる。SP-05～07はlens価値が全く出なければ完遂せず、記録して停止してよい。

## 共通report template

各spikeは`docs/spikes/SP-XX-result.md`相当のartifactを残す。

    spike_id:
    date:
    owner:
    source_commit_or_version:
    environment:
    question:
    hypothesis:
    timebox:
    fixtures:
    procedure:
    raw_artifacts:
    pass_criteria:
    observed:
    failures:
    security_or_data_incident:
    result: pass | fail | inconclusive
    route_effect:
    follow_up_allowed:
    follow_up_prohibited:

Screenshotだけを証拠にしない。input hash、操作log、output hash、test resultを残す。

## SP-01 — Linetta read-only MCP / upstream feasibility

### Evidence before spike

[Linetta development guide](https://github.com/devlikebear/linetta/blob/main/docs/DEVELOPMENT.md)は、app内MCP serverが既定OFF、`127.0.0.1`限定、bearer token必須であり、read-only modeではwrite toolを`tools/list`から除くと説明する。read toolにはwork一覧、outline、story context、scene読取、character、fact、search等があり、write側にはcheckpointやundoまである。これは、Linetta本体をforkせず外部lens clientを試せる可能性を示す。

### Question

Linettaを正本型候補として改造する前に、外部companionがread-only MCPから順序付き本文を取得し、client側でreader cutoffを強制できるか。

### Setup

1. 署名済みprebuilt Linettaを専用test profileで使う
2. fixture projectだけをimport
3. external agentをread-only modeで有効化
4. tokenをsession secretとして設定
5. MCP trafficをloopback captureし、tool listとargumentsを保存

Go/Rust toolchainはこの段階では不要。prebuilt appとMCPだけで判定できない時だけ、source buildを別spikeへ上げる。現在のworkspaceにはGo/Cargoがないため、惰性でinstallしない。

### Procedure

- `tools/list`でwrite toolが0か確認
- work、outline、scene order、各scene textを読む
- chapter 2 cutoffでscene 1～2だけをclient snapshotへ入れる
- future canaryのsceneをMCP callしないことをtrafficで確認
- source textとMarkdown exportのloss差をhash/visible diffで確認
- snapshot/version IDまたはcontent versionがread resultへあるか確認
- client findingからLinetta内sceneへdeep linkまたは識別子jumpできるか確認
- Linettaを編集中にstale readが起きた場合のversion guardを確認
- external client停止後、Linetta projectが不変か確認

### Pass

- read-only tool surfaceにmutationがない
- ordered scene textをlossなく取得できる
- clientが未来sceneを呼ばないことでhard cutoffを作れる
- stable scene IDとcontent version相当を取得できる、または追加upstream変更が局所的
- 元projectを変更せずcompanion prototypeへ接続できる

### Fail / route effect

- read-onlyでもimplicit mutation/AI callがある → Linetta adapter停止
- scene order/text/versionを得られない → upstream RFCが必要
- stable anchorに必要なID/version追加がdata model全面変更 → standaloneまたは別routeと比較
- passした場合 → new coreよりLinetta sidecar/upstreamを優先

### Maintainer questions — まだ送信しないdraft

1. MCP read resultへscene content versionとstable text selectorを追加する方針は受入可能か
2. reader cutoffをclientで保証するため、story contextではなく指定sceneだけを読む推奨方法は何か
3. read-only lens findingをLinettaへ保存せずdeep linkする公式extension pointはあるか
4. Japanese vertical editingについて既存方針またはissueがあるか
5. Markdown exportのround-trip保証範囲は何か

Product ownerが公開連絡を承認するまでissueを作らない。

## SP-02 — Obsidian + TsumugiMark interoperability

### Question

Open Markdownと直接縦書きを既に持つObsidian/TsumugiMarkへ、read-only lensをpluginまたは外部companionとして安全に足せるか。

### Setup

- 専用copy vault
- current TsumugiMark release
- Git pluginなし、ありを別case
- Windows Microsoft IME、可能ならmacOS日本語IME
- format fixtureとanchor versions

### Procedure

- TsumugiMarkでfixtureを縦書き編集しround-trip
- plugin外からfileを変更してreload
- blank line、ruby 7記法、emphasis、protected block、literal escapeを確認
- lens external appがvaultをread-only scanするcase
- Obsidian plugin APIからactive file/order metadataを得るcaseの設計確認
- finding deep linkがfile + heading/block/quoteのどこまで安定するか
- original Markdownと保存後をsemantic/byte diff
- 既存Git、sync、TsumugiMark autosaveとの同時操作を記録

### Pass

- 対象作家がObsidian導入を受容
- direct verticalでP0 IME/round-trip caseにsilent loss 0
- lensがvaultへwriteせずsource jump可能
- plugin間競合がrecoverableで、元Markdownを一級の出口にできる

### Fail

- Obsidian利用そのものが対象者の大半で導入障壁
- TsumugiMark round-tripにsilent semantic loss
- plugin updateで保証できないprivate API依存
- anchorをfile位置だけで安全に保持できない

PassしてもTsumugiMarkを無断forkしない。interop reportを先に共有する。

## SP-03 — novelWriter file/export adapter

### Evidence before spike

[novelWriter 26.1 documentation](https://novelwriter.io/docs/)は、人可読textをproject storageに使い、開発者向けfile format specを公開している。これはUI forkより、変換・読取adapterを先に試す理由になる。

### Question

novelWriterの公開formatまたはstandard exportから、scene order、text、title、metadataをlossなくread-only snapshotへ変換できるか。

### Procedure

- official sample projectを使う
- project file specのversionを記録
- novel/notesを区別し、本文だけのreader cutoffと作者note除外を作る
- heading、comment、synopsis、reference、scene breakをsnapshotへmapping
- compile/export結果とproject sourceの差を記録
- file update時のstable ID有無を確認
- findingからfile/headingへjumpする外部link方法を確認

### Pass

- official specだけでread-only adapterを実装可能
- 作者noteとreader-visible textを決定的に分離
- source UUIDまたは安定識別子を保持
- upstream UI改造なしにcompanion価値を試せる

Spec不明点を推測でparserへ入れない。version mismatchはfail closed。

## SP-04 — Strict anchor and reattachment

### Question

Semantic/fuzzy matchingを使わず、TextQuote + prefix/suffix + snapshot hashで、実用的なattachment率とsilent misattachment 0を両立できるか。

### Candidate algorithm v0

1. same snapshot hash + stored positionでexact quote確認
2. same snapshot内でposition不一致ならdocument全体をexact検索
3. 一件ならattached
4. 複数ならprefix/suffix exact一致で絞る
5. 一件ならattached
6. 0件ならstale
7. 2件以上ならambiguous
8. snapshot hashが異なる場合、通常jumpは`source-version-mismatch`で停止
9. userが明示的に別版検索を選んだ時だけ2～7を新snapshotへ適用し、一意なら`reattachment-candidate`
10. candidateを開いても元findingのsnapshot/hash/positionは更新しない
11. Unicode normalizationまたはfuzzy候補は表示しない

### Procedure

- [anchor fixtures](../fixtures/anchor/)を全versionで実行
- Japanese surrogate pair、combining mark、variation selector、CRLFを含める
- index単位をUTF-16/code point/byteで混同しない
- 1,000 finding × 100k charsの性能を測る
- false attachmentへ至るadversarial duplicateを追加
- cross-version candidateは元anchor objectと別objectであることを確認

### Pass

- silent misattachment 0
- expected stale/ambiguous 100%
- same snapshotの一意quote attachment 100%
- cross-versionの一意quoteはreattachment candidate 100%、silent attachment 0
- 1,000 finding re-resolutionが参照機で1秒以内を暫定目標

### Decision

- pass → Gate A finding jumpへ採用
- attachment recallが低いがfalse 0 → product UXでstaleを受容できるか調査
- false attachment 1件以上 → study停止。fuzzy調整禁止

## SP-05 — Japanese vertical editing benchmark

### Question

Greenfield editorを作らず、既存基盤で「唯一の原稿を預けられる直接縦書き」の品質gateに到達できるか。

### Comparators

- TsumugiMark
- TATEditor
- Nolaの現行縦書きsurface
- 一太郎2026
- candidate WebView editorは価値Gate後だけ

### Environment matrix

|OS|IME|必須|
|---|---|---:|
|Windows 11|Microsoft IME|yes|
|Windows 11|Google日本語入力|desirable|
|macOS current supported|標準日本語IME|yes|
|Windows/macOS|US keyboard + Japanese input|desirable|

mac実機を確保できなければstandalone vertical gateは`inconclusive`であり、passにしない。

### Operation matrix

- composition開始/変換/候補移動/確定/cancel
- composition中のscrollとtypewriter mode
- 左右arrow、上下arrow、Home/End相当
- mouse/trackpad selection、shift selection
- delete/backspace、範囲置換
- undo/redo 50 steps
- multiline paste、plain/rich clipboard
- ruby insert/edit/delete、複数記法
- emphasis、縦中横、欧文、数字、括弧、約物
- 禁則、ぶら下がり、line head/end
- search highlight、1,000 annotation
- screen zoom 200%、keyboard only、screen reader smoke
- external file change、autosave race、crash/reopen

### Pass

- P0 operationでtext loss/duplication/caret jump 0
- round-trip silent semantic loss 0
- crash recoveryで確定text loss 0
- annotationが誤った文字へ移らない
- target segmentの比較sessionで既存横書き+previewより明確に選ばれる

TsumugiMark等がpassすれば、そのengine/routeを優先し、CSS writing-modeからgreenfieldを始めない。

## SP-06 — Canonical representation A/B/C

### Candidates

A. Markdown + sidecar  
B. Stable block IDを含むMarkdown  
C. Structured canonical store + lossless Markdown/TXT/JSON export

### Common minimal model

- project
- ordered chapter/scene
- title
- prose blocks
- ruby/emphasis/scene break
- author note
- accepted canon claim
- human/AI finding with anchor
- asset reference

AI index、embedding、chat raw dataを正本へ含めない。

### Operations

1. create, edit, delete, reorder, rename scene
2. add/delete paragraph before anchor
3. duplicate and move quoted paragraph
4. external edit text
5. external rename file
6. sidecar delete/corrupt
7. interrupted atomic save
8. old version migration and rollback
9. export → independent parser → import
10. app removal後、仕様だけで本文・order・ruby・note・findingを回収

### Metrics

- semantic round-trip loss
- silent loss
- human readability without app
- anchor correctness
- external edit conflict clarity
- diff quality
- migration complexity
- recovery from partial corruption
- Git friendliness
- export fidelity

### Non-negotiable

- prose/ruby/emphasis/scene orderのsilent semantic loss 0
- index/cache削除で正本不変
- appなしの完全export recovery手順
- corruptionを成功として開かない
- stable anchor false attachment 0

### Decision rule

平均点で選ばない。上のnon-negotiableを満たした候補だけを、対象者の外部編集需要とmaintainer costで比較する。A/BがID安全性を満たさずCが退出性を満たすならCを選んでよい。「MarkdownでなければOSSらしくない」を理由にしない。

## SP-07 — History backend A/B

### User-facing contract

- 入力の復元
- 今日の履歴
- 名前付き節目
- 別案
- 日本語prose diff
- 全体/scene部分復元
- 外部backup

Backend candidate:

A. application-managed immutable/content-addressed snapshot  
B. Git object store through library/CLI adapter

### Controlled environments

専用temp root配下だけに作る。

- normal local folder
- existing parent Git repo
- simulated sync folder with concurrent copier
- case-only path、Unicode path、long path
- read-only/disk-full/permission-denied injection
- process kill during journal/save/snapshot

実ユーザーのOneDrive/Dropbox root、home、workspace rootを破壊試験に使わない。

### Operations

- 1,000 autosave-equivalent changes
- daily retention thinning
- named checkpoint
- alternate branch/snapshot
- switch and restore
- single scene partial restore
- merge/selected import
- rename/reorder across scenes
- binary asset add
- external edit between checkpoints
- concurrent process attempt
- backup copy and new machine restore
- backend metadata corruption

### Metrics

- data loss/recovery point
- operation latency and store size
- Japanese diff usefulness
- partial restore complexity
- conflict frequency
- parent repo/sync interference
- repair workflow steps
- implementation/license/distribution cost

### Non-negotiable

- confirmed manuscript loss 0 in defined fault matrix
- corrupt/incomplete snapshotをvalidとして表示しない
- backend terminologyを通常UIへ要求しない
- existing Git remoteへimplicit push 0
- API key/chat/cacheをhistoryへimplicit include 0
- new environment restore 100%

GitがpassしてもGitHub必須にしない。Native snapshotがpassしてGit interopだけ不足する場合、Git export adapterを別機能にできる。

## SP-08 — Long-context and honest coverage

### Question

RAGなしで、Gate Aのselected scopeを全文送信し、model limitを超える時に正直に止められるか。

### Procedure

- 10k / 50k / 100k / 300k / 1M Japanese charsのfixture
- tokenizer estimateとprovider-reported input tokensを比較
- `truncation disabled`相当でoversizeをfail
- output schemaとmax tokenを含むbudget計算
- manifest chars/tokens/omittedの正しさ
- same snapshotでbaseline/lens request size差を記録
- cost/latency上限をstudy configへ入れる

### Pass

- providerへ送った全文がmanifestと一致
- oversizeをsilent truncationせず実行前または明示errorで停止
- partial scopeをwhole manuscriptと表示しない
- per-run cost estimateとactual usageを記録

Gate AでRAGを追加して「全体を読んだ」ように見せることは禁止。長編全体が入らない場合、問いとscopeを狭めること自体をUX評価する。

## SP-09 — Pilot packaging and endpoint audit

### Question

開発toolを持たない5人へ、原稿をcloud appへ預けず、安全にinstall/uninstallできるか。

### Stage

1. D0/D1は研究者端末のlocalhostでmoderated。配布なし
2. D2後、価値信号がある場合だけportable local packageを作る
3. Windows packageを先に監査し、macOSは署名/notarizationまたは研究者同席なしに配らない

Node SEA、Electron wrapper、その他のpackagerはこのspikeで比較し、製品stackと同一視しない。

### Tests

- clean VM install/start/stop/uninstall
- no admin privilege where possible
- allowed endpoint capture
- API key/session data location
- crash/restart
- Windows Defender/macOS Gatekeeper表示
- app removal後のprivate data説明とerase
- package hash/signature配布
- update checkなし

### Pass

- participantがmanualだけで起動・eraseできる
- endpoint、data root、残存fileが説明と一致
- warningを回避する危険なOS手順を要求しない
- package provenance/hashを確認可能

Passできなければ4週間self-useを行わず、moderated localhost sessionに留める。

## Spike completion board

|ID|owner|start|result|report|route effect|
|---|---|---|---|---|---|
|SP-01||||||
|SP-02||||||
|SP-03||||||
|SP-04||||||
|SP-05||||||
|SP-06||||||
|SP-07||||||
|SP-08||||||
|SP-09||||||

空欄は未実施を意味する。計画があることをpassと数えない。
