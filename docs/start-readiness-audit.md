# Start-readiness audit

> この文書は実装着手前の監査snapshotである。後続依頼によりコードが追加されたため、`code absence`とfile countは現在値ではない。実装後のauthoritative evidenceは[Gate A implementation status](./implementation-status.md)を参照する。

監査日: 2026-08-31  
監査対象: 「2026年の執筆環境を調査し、コードを書かず、新しいOSS小説制作ソフトを作り始められる計画へする」  
判定: **Gate Aのmock-only実装はGO。参加者募集・cloud実験・正本型製品は条件未達のため別判定。**

## 1. 判定の意味

この監査が証明するのは、最初の検証物を何からどの順で作るかが定義・検査されていることだけである。次はまだ証明していない。

- synthetic reader lensが作家に役立つ
- generic ChatGPTより優れる
- 市場規模または支払意思がある
- 長編全体をAIが正しく理解できる
- 新規standalone editorが必要である
- 縦書き、Git backend、正本方式のどれを採用すべきである
- OSS projectを継続できるmaintainerがいる

これらを未検証のままproduct claimへ変えないため、[Gate A](./gate-a-evaluation-protocol.md)と[route decision](./route-decision.md)を置いた。

## 2. 元の依頼に対する要件追跡

|ID|明示要件|現状態の証拠|監査判定|
|---|---|---|---|
|U-01|2026年現在の国内外環境を十分にWeb調査|[市場調査](./2026-writing-environment-research.md)は453行・URL出現109件、[出典台帳](./source-register.md)は232行・URL出現156件。公式、一次repo、研究、作家自身の報告を区分|完了。全製品網羅や市場規模推定とは主張しない|
|U-02|執筆、editor、plot/setting、AI toolを比較|市場地図、直接競合表、日本/海外、AI、OSSの節|完了|
|U-03|機能表だけでなく理由、困り事、併用、不満を見る|「日本の実利用」「海外の実利用」「なぜ複数toolを併用」「横断的課題」|完了。頻度・代表性は未検証として表記|
|U-04|事実、推測、判断を分ける|市場調査の表記規則、事実/推論/未検証表、[Go/No-Go再審査](./pre-build-go-no-go-review.md)|完了|
|U-05|AI自動生成serviceへ置換しない|製品原則、Gate A scope、rewrite/apply/generation禁止|完了|
|U-06|作品会話、箇所参照、役割別chatを再設計|chatと所見を分離し、役割を情報境界・schema・権限を持つlensへ変更。strict evidence jumpを仕様化|完了。Gate A follow-upは評価後3turnまで|
|U-07|Gitの利点を非技術者へ提供|Git採用と履歴価値を分離。SP-07でnative snapshotとGit backendを同じ日常語taskで比較|計画完了、backend選定は意図的に未決|
|U-08|縦書き・横書き・customization|製品提案の主要UXと技術gate、SP-02/SP-05、日本語fixture|長期要件として完了。Gate A画面は横書きread-only|
|U-09|local dataとAI送信を設計|context manifest、hard cutoff、consent、`store:false`要求、provider adapter、erase、data retention|Gate A仕様完了。provider固有policyは実験開始前に記入|
|U-10|OSSとして設計|退出可能性、公開schema、license候補、governance、upstream優先、maintainer条件|計画完了。license法務監査は配布前|
|U-11|市場の穴、差別化、必要機能、UXを自分で判断|「市場の穴」、Go/No-Go反証、製品提案、route不変条件|完了。ただし穴は需要証明でなく検証仮説|
|U-12|不要・危険な案も指摘|AI editor/oracle、auto-canon、Git必須、RAG、greenfield縦書き、premature new coreを降格または禁止|完了|
|U-13|concept、MVP、将来、技術、OSS、開発順を一貫化|[product proposal](./product-proposal.md)と[structure review](./structure-review.md)|完了。Gate A前の長期案は条件付き|
|U-14|今回はコードを書かない|workspace 40 filesはMarkdown 28、JSON 12、その他0|完了。JSONはdata contract/fixtureでproduct codeではない|
|U-15|作り始められる段階へ進める|START HERE、research ops、screen/spec/state/error/NFR、evaluation、spike、route、backlog、schema、fixture|Engineering GOは後述条件で立証|

URL数は調査の質そのものではなく、scope漏れ検査の補助値である。同一URLの重複や、一次・二次の強さは[出典台帳](./source-register.md)の注意欄で読む。

## 3. Gate A開始条件の監査

|開始条件|Authoritative artifact|Evidence|判定|
|---|---|---|---|
|対象scopeと非scope|[START HERE](./START-HERE.md)、[companion spec](./gate-a-companion-spec.md)|file-copy/read-only、一方向pipeline、禁止機能|証明済み|
|user flowと画面|companion spec S1～S8|state transition、error、consent、erase|証明済み|
|data boundary|[schemas](../specs/README.md)|snapshot/output/finding/run/blind result/evidence reviewの6 schema|証明済み|
|AI comparison|[evaluation protocol](./gate-a-evaluation-protocol.md)|same model/input、prompt freeze、condition-label/mapping maskingと限界、metrics|証明済み|
|safety|evaluation protocol、[fixtures](../fixtures/README.md)|cutoff canary、prompt injection、exact anchor、Japanese round-trip|証明済み（test design）。runtimeは未実装|
|research operations|[research operations](./gate-a-research-operations.md)|quota、screener、recruit copy、consent、script、retention、stop rule|証明済み|
|Go/No-Go threshold|evaluation protocol|safety 0件、value/reuse/route thresholds|証明済み|
|technical unknowns|[spike workbook](./technical-spike-workbook.md)|SP-01～09にtimebox、method、pass/fail|証明済み|
|route selection|[route decision](./route-decision.md)|R0～R6、不変条件、順序gate、contact draft|証明済み|
|work order|[backlog](./gate-a-backlog.md)|依存図、DoR/DoD、pd、10日計画、release blockers|証明済み|
|first issue|START HERE / backlog GA-001|input、output、schema、fixture、AT-001|着手可能|

## 4. 機械監査結果

2026-08-31、現在のworkspaceで再実行した。

|Check|Method|Result|
|---|---|---|
|JSON syntax|PowerShell `ConvertFrom-Json`で全JSONをparse|12 / 12 pass|
|JSON Schema meta-validation|`ajv-cli@5` + `ajv-formats@3`、Draft 2020-12。external finding schemaも登録|6 / 6 pass|
|Schema structural contract|全typed objectのclosed propertyとrequired/property対応を再帰検査|open object 0、undeclared required 0|
|relative Markdown links|全Markdown linkをsource file基準でresolve|broken 0|
|anchor fixture|ordinal exact matchとUTF-16 half-open offsetをexpected JSONと比較|5 / 5 pass|
|leakage input fixture|cutoff内2文書にfuture/excludedのforbidden substringがないか確認|5 / 5 absent|
|untrusted render fixture|manuscript HTMLとmalicious model Markdownのcanary contractを確認|2 fixture present。runtime 0-request/0-executionはAT-017で実装後に判定|
|Japanese golden fixture|byte SHA-256とrequired exact substringを確認|hash一致、8 / 8 present|
|acceptance trace|companion specのAT定義とbacklog参照を照合|17 / 17、未参照・未定義0|
|code absence|全file extensionを列挙|Markdown 28、JSON 12、その他0|

JSON Schema適合はsemantic correctnessを証明しない。eligible/sent集合、condition/output整合、exact quote、masked pair定数等は[contract runtime validation](../specs/README.md#runtime-validation-beyond-json-schema)として実装testに残している。

## 5. 意図的な未完成とblockerの分類

### Mock-only実装を妨げない

- exact cloud model ID/API key: GA-001～005はmockで進める
- participant募集: prototypeのoffline pathと並行して準備できる
- product route: Gate A resultで決める
- canonical format/Git/vertical stack: timeboxed spikeで決める
- C1の16本文: biasを避けるためcase authorとannotatorを分離して作る。CORPUS-001/002に計上済み
- narrative case templateのsentinel値と`pending`: author/annotatorが埋める入力欄であり、未完のproduction configではない

### 人の決定前に開始してはいけない

- 参加者募集: product owner、research lead、contact、reviewer、予算、支払、retention root/date
- cloud run: provider、exact model、policy URL、cost cap、API credential handling
- public repository: license、NOTICE、security contact、contribution rule
- full product: Gate A pass、route decision、maintainer plan

空欄の場所は[research operations末尾](./gate-a-research-operations.md#調査開始前に人が埋める欄)に一か所へ集約した。

## 6. 文書間の優先順位

構想が進化したため、古い長期案をそのまま実装すると矛盾する。次の順で解決する。

1. [着手前Go / No-Go再審査](./pre-build-go-no-go-review.md)
2. [START HERE](./START-HERE.md)とGate A仕様群
3. [route decision](./route-decision.md)の最新accepted record
4. [product proposal](./product-proposal.md)の条件付き長期像
5. [市場調査](./2026-writing-environment-research.md)の観察・仮説

したがって、product proposalに新規coreや正本型MVPが書かれていても、Gate A前の実装許可ではない。市場調査に機能が存在すると書かれていても、その機能需要の証明ではない。

## 7. 最終readiness判定

|Activity|判定|理由|
|---|---|---|
|GA-001 immutable snapshot|**GO**|契約、fixture、受入条件、依存が揃う|
|GA-002～005 mock-only companion|**GO after repository hygiene**|`.gitignore`、license header候補、CIをDay 1に作る|
|参加者募集|**HOLD**|人が埋める欄と予算承認が必要|
|cloud AI comparison|**HOLD**|provider/model/policy/cost capが必要|
|4週間pilot|**HOLD**|safety test、packaging、consentが未実施|
|新規standalone editor|**NO-GO**|lens価値とroute必要性が未証明|
|製品のpublic release|**NO-GO**|license、maintainer、security、Gate evidence未完|

次の実作業は`GOV-001`と`GA-001`である。コードを書かないという今回の範囲内では、これより先へ進むとimplementationそのものになるため、ここをhandoff境界とする。
