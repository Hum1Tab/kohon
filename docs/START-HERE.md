# START HERE — Gate A開始パッケージ

更新日: 2026-08-30  
対象: 実装担当、調査担当、プロダクト責任者  
支配的判断: [着手前Go / No-Go再審査](./pre-build-go-no-go-review.md)

> 2026-08-31追記: 後続の「実装して」という依頼によりGate A companionの実装を開始した。現在のbuild/test証拠は[implementation status](./implementation-status.md)、運営側従量課金ゼロの境界は[利用者所有サービス設計](./zero-operator-cost-architecture.md)を参照する。本書の「未実装」「Day 1」記述は計画時点のbaselineとして残す。

## 今、何を開始してよいか

開始してよいのは、**既存原稿のコピーだけを読むGate A検証用companion**と、それを使った比較調査である。正本型エディタ、Tauri製品本体、独自同期、Git内蔵、本文書換えAIは開始しない。

Gate Aの問いは一つである。

> 読了位置を守り、版と根拠を明示する合成読者は、同一モデルへの一般的な質問と現在の作家ワークフローより、実作品の見直しを明確に助けるか。

「作り始められる状態」は、次の意味で使う。

1. 実装範囲、非範囲、画面、データ契約、受入試験が決まっている
2. 調査対象、同意、課題、謝礼、記録、分析方法が決まっている
3. 比較baseline、無作為化、指標、Go / No-Go閾値が事前登録できる
4. 縦書き、anchor、正本、履歴、既存OSSのspikeに手順と終了条件がある
5. 一つ目のissueからGate A会議まで、依存順のbacklogがある
6. 未決事項は「開始を妨げない外部入力」か「Gate Aで決める事項」として分離されている

このパッケージは上記を満たすための仕様であり、Gate Aの実測結果を捏造して製品本体を承認するものではない。

## 読む順序

|順序|文書|何を決めるか|
|---:|---|---|
|1|この文書|開始範囲、役割、初日、readiness|
|2|[調査運用](./gate-a-research-operations.md)|誰に、何を、どう観察するか|
|3|[companion仕様](./gate-a-companion-spec.md)|何を実装し、何を実装しないか|
|4|[評価protocol](./gate-a-evaluation-protocol.md)|baseline、condition-label masking、指標、漏洩・anchor試験|
|5|[technical spike workbook](./technical-spike-workbook.md)|縦書き、正本、履歴、anchor、既存OSS|
|6|[route判定](./route-decision.md)|companion/upstream/plugin/fork/new/stopの選び方|
|7|[実行backlog](./gate-a-backlog.md)|issue順、依存、完了定義、概算|
|8|[データ契約](../specs/README.md)|snapshot、run、finding、評価記録の機械可読schema|
|9|[fixture案内](../fixtures/README.md)|漏洩、anchor、日本語形式の再現入力|
|10|[開始監査](./start-readiness-audit.md)|元の依頼、開始条件、機械検査、残る人間判断の追跡|

背景と長期像は[市場調査](./2026-writing-environment-research.md)と[条件付きプロダクト提案](./product-proposal.md)にある。実装判断で両者と本パッケージが衝突する場合は、着手前Go / No-Go再審査と本パッケージを優先する。

## 固定した判断

|項目|Gate Aの判断|
|---|---|
|製品形態|未決。Gate Aはroute-neutral companion|
|対象|日本語長編をdesktopで書き、複数ツールを併用する成人作家|
|価値仮説|読了位置、版、根拠、coverageを持つ見直し|
|初期レンズ|初見読者、整合性候補の二つ|
|AI権限|read-only。本文、正史、元ファイルを変更できない|
|baseline|同じsnapshot、query、model、出力上限を使うgeneric prompt|
|入力|UTF-8 TXT / Markdownのcopy。元ファイルを直接開かない|
|出力|検証済みfinding、context manifest、run export|
|source表示|横書きread-only。Gate Aの価値検証に縦書き実装を混ぜない|
|provider|adapter化。最初はmock + 一つのcloud provider。model IDは研究開始時に固定|
|永続化|原稿本文とraw responseは既定で保存しない。明示同意時だけ研究領域へ保存|
|実装言語|Gate A検証物はTypeScript / Node.js。製品本体のstackは未決|
|license|Gate A用に新規作成する汎用code/schemaはApache-2.0候補。公開前に依存監査し、製品routeのlicenseとは分ける|

TypeScriptを選ぶ理由は、現在の開発環境でNode.jsとpnpmが利用でき、browser UI、JSON Schema、Obsidian系への再利用可能性を最小時間で試せるためである。これはTauri/Reactを製品本体へ採用する決定ではない。

## Gate Aで決めること

- レンズ価値が本当にgeneric baselineを上回るか
- standaloneではなくcompanion/pluginで十分か
- Linettaのread-only MCPまたはupstream変更を使えるか
- Obsidian + TsumugiMark経路が対象者に受容されるか
- anchorを厳格一致だけで実用にできるか
- Markdown + sidecar、ID付きMarkdown、構造化正本のどれが安全か
- native snapshotとGit backendのどちらが利用者契約を満たすか
- 直接縦書きが移行理由になるか、既存基盤を使うべきか
- 公共財型OSSか、持続可能な製品か

これらを実装担当が好みで決めてはいけない。

## 実装物の境界

Gate A companionは、次の一方向pipelineだけを持つ。

    TXT / Markdown copy
      → immutable snapshot + SHA-256
      → scene order / reader cutoff
      → context manifest preview
      → generic run と lens run
      → schema・引用・境界検証
      → condition-label masked A/B review
      → findingからcopy内の根拠へjump
      → pseudonymous metrics export / erase

元ファイルへの書込み、watch、autosave、Git、同期、設定DB、RAG、embedding、自動Wiki、rewrite、続き生成はない。

## 開発環境の現状

2026-08-30にこのworkspaceで確認した。

|tool|状態|Gate Aへの意味|
|---|---|---|
|Node.js|v24.17.0|利用可能|
|npm|11.13.0|利用可能|
|pnpm|11.19.0|利用可能、package manager候補|
|Git|2.54系|利用可能。workspace自体はまだrepositoryではない|
|Python|3.12.10|分析補助に利用可能|
|Rust / Cargo|未導入|Gate A companionには不要。Tauri判断前に入れない|
|Go|未導入|Linettaをlocal buildするspike開始時だけ導入|

初日にNodeの正確なlockfile、engine範囲、CI versionを固定する。グローバル環境へ依存する設計にしない。

## 役割

一人で兼任してよいが、判断時は帽子を分ける。

|役割|責任|兼任時の防止策|
|---|---|---|
|Product owner|対象、予算、停止判断、route決定|好意的コメントより事前閾値を優先|
|Research lead|同意、moderation、記録、分析|実装者の意図を参加者へ説明し過ぎない|
|Prototype engineer|companionとfixture、計測|参加者データをdebug fixtureへ転用しない|
|Independent reviewer|mapping-masked outputとGate A資料の監査|少なくともGate A会議前に別人が確認|
|Second evidence rater|20%以上のoverlapとharm確認|condition mappingを渡さず、独立値を残す|

独立reviewerを確保できない場合、Gate Aの結論は暫定に留め、正本型製品を承認しない。

## 推奨する開始時予算

以下はparticipant謝礼だけの暫定値である。外部recruiting fee、税務、AI利用料、rater/reviewerの労務費を含まない。

|用途|人数・条件|既定案|
|---|---|---:|
|発見・比較session|12人、各75～90分|1人8,000円、計96,000円|
|4週間pilot|上記から5人、週次短報 + 終了面談|1人15,000円、計75,000円|
|予備・no-show対応|2枠相当|16,000円|
|合計|—|187,000円 + 実費|

2026年の国内調査会社の公開目安では、30～60分のusability testが2,000～5,000円程度、専門性のある60分以上の面談はより高い。[マクロミルの解説](https://www.macromill.com/service/words/interview-reward/) 本計画は長編原稿の準備と75～90分拘束を含むため、その上側へ置いた。謝礼、実費、支払時期は募集時に明示し、回答内容で増減させない。[AMEDの市民参画guide](https://www.amed.go.jp/ppi/guidebooktxt.html)も費用負担と謝礼条件の事前明示を勧める。

予算が不足する場合は、無償協力へ置換せず人数・課題・拘束時間を縮小し、Gate Aの結論を「探索継続」にする。

## 最初の10営業日

Gate A全体の標準日程は、prototype builder 1名 + research lead 1名が並行する場合で10～12暦週とする。4週間pilotを含み、安全incidentまたはrecruit遅延では延長する。6～8週へ短縮する場合は、builder追加、corpus別team、または後段spikeの正式なscope変更が必要であり、単にtestを省かない。

|日|Product / Research|Engineering|終了条件|
|---:|---|---|---|
|1|同意文、screening、募集文を確定|repository、workspace、contracts package、CIの骨格を作る|PIIや原稿をcommitしないguardがある|
|2|候補者募集開始|fixture loader、snapshot hash、document order|同じinputから同じsnapshot ID|
|3|最初の2件を日程確定|hard cutoffとcontext manifest|future documentがpayloadへ入らない|
|4|既存tool比較sessionをpilot実施|mock providerとschema validation|AIなしでend-to-end demo|
|5|guideを修正、調査項目を凍結|cloud adapter、`store:false`、request ledger|raw keyをlogしない|
|6|本番session 1～2|generic baselineとlens run|same model/input budgetを検査|
|7|本番session 3～4|citation verifier、invalid output隔離|引用捏造がcardにならない|
|8|中間品質監査。閾値は変更しない|read-only source jump、masked randomization|condition label/prompt/mappingをUI・exportから隠す|
|9|本番session 5～6|metrics export、erase、crash recovery|一操作でparticipant data削除|
|10|学びを記録。結論はまだ出さない|leakage/anchor fixture suite、pilot package|Gate A前半demoとtest report|

研究参加者の確保が遅れても、実装範囲を広げない。待ち時間はfixture、privacy、route spikeに使う。

## Day 1で作る最初のissue

`GA-001: immutable corpus snapshot contract`

完了条件:

- UTF-8 TXT / Markdownのcopyを受け取る
- 文書順、title、text、SHA-256からimmutable snapshotを作る
- 元pathを永続化せず、元ファイルを一度も変更しない
- 同じ正規化規則・inputから同じcontent hashを返す
- 改行またはUnicode正規化を変更した場合、勝手に同一視せずmanifestへ記録する
- [corpus-snapshot schema](../specs/corpus-snapshot.schema.json)へ適合する
- leakage fixtureを読み、cutoffより後のdocumentをeligible setから除外できる

実装順の全体は[Gate A backlog](./gate-a-backlog.md)を使う。

## 開始前checklist

### 仕様

- [x] Gate Aの価値仮説が一文で定義されている
- [x] 初期二レンズとread-only権限が固定されている
- [x] screen、状態、schema、error、非機能要件が定義されている
- [x] generic baselineとcondition-label masked比較、その限界が定義されている
- [x] leakage、anchor、privacyの非交渉条件がある
- [x] routeと製品stackをGate A前に固定していない

### 運用

- [x] screening、同意、募集文、interview guide、task scriptがある
- [x] 謝礼の既定予算と縮小時の扱いがある
- [x] raw manuscript、recording、連絡先の保存期限が分離されている
- [x] session noteとGate A decision recordのtemplateがある
- [ ] Product ownerが予算と支払方法を承認した
- [ ] Research leadと連絡先を決めた
- [ ] Mapping-masked evidence raterを二人確保した（少なくとも一人は独立reviewer）

### 実装

- [x] runtime候補がlocalで利用可能
- [x] contractとfixtureの初版がある
- [x] issue順、依存、受入試験がある
- [ ] repositoryを初期化し、license方針をheaderへ反映した
- [ ] AI test用project/API keyまたはmock-only開始を選んだ
- [ ] 原稿を含まないCI環境を作った

未checkの項目は、コードのDay 1開始または参加者募集の直前に人が承認すべき外部入力である。製品設計の未決ではない。

## 絶対に開始しないもの

- 正本型editor shell
- 本文の自動生成、rewrite、apply
- Git branch UIまたはGitHub同期
- vector database、embedding、agent framework
- AIによるcanon自動更新
- 縦書きeditorのgreenfield実装
- mobile、共同編集、plugin marketplace
- participant manuscriptを含む公開issue、fixture、telemetry

これらが必要に見えた時は、scopeを広げず[route判定](./route-decision.md)のdecision logへ理由を書く。

## Gate Aの出口

Gate A終了時に許される結論は六つだけである。

1. read-only companionとして続ける
2. Linettaへupstream貢献する
3. Obsidian/TsumugiMark pluginとして続ける
4. 別の既存OSSへ貢献する
5. 不可欠条件を既存基盤で満たせず、統合需要が強いため新規coreを提案する
6. 停止する

「もう少し機能を足せば分かる」は結論にしない。証拠不足ならGate Aを延長し、正本型開発はNo-Goのままにする。
