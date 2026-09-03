# Gate A route decision

更新日: 2026-08-30  
状態: Gate A開始時の仮決定。最終routeはGate A evidence packetで更新する。  
親文書: [START HERE](./START-HERE.md) / [technical spike workbook](./technical-spike-workbook.md)

## 1. 現在の決定

最初に作るのは、既存の執筆環境を置き換えない**ローカル・読み取り専用の研究用companion**である。作者が選んだUTF-8 TXT/Markdownのコピーをimmutable snapshotにし、hard cutoff付きのsynthetic reader lensをblind比較する。

現時点では、次のどれも製品routeとして決定しない。

- 新規standalone editor
- Linetta等への統合またはupstream contribution
- Obsidian等のplugin
- 既存OSSのfork
- file/export adapterだけのcompanion

これは判断の先送りではない。AI lensの価値、安全境界、既存workflowへの挿入点を、editor core・縦書き・Git UIの費用から切り離して検証するための順序である。

## 2. routeをまたいで守る不変条件

どのrouteでも次を満たせない案は棄却する。

|ID|不変条件|最低限の証拠|
|---|---|---|
|R-I01|執筆の主役は作者であり、本文自動生成を主導線にしない|主要画面と既定promptにrewrite/generate CTAがない|
|R-I02|AIが読んだ範囲と読んでいない範囲を明示する|context manifest、cutoff、coverage表示の試験|
|R-I03|未来章・除外資料をAIへ送らない|network payload監査とcanary漏洩0件|
|R-I04|指摘は原文の実在箇所へ安全に結び付く|exact anchor試験で誤付着0件。曖昧時は移動しない|
|R-I05|AI出力が原稿を勝手に変更しない|source write 0件、patch適用機能なし|
|R-I06|原稿と利用先を作者が制御する|送信前manifest、明示consent、消去、telemetry既定off|
|R-I07|ベンダーや本製品から退出できる|lossless text export、公開schema、provider adapter境界|
|R-I08|日本語原稿を壊さない|golden corpus round-trip。縦書きを担うrouteなら実機quality matrix|
|R-I09|履歴は理解できる語彙で提示する|「保存点・比較・別案・復元」を使い、Git知識を要求しない|
|R-I10|検証不能な「作品理解」を主張しない|snapshot ID、coverage、evidence、限界を表示する|

## 3. 候補route

### R0 — Stop / research result publication

AI lensが通常の汎用chatに対して再現可能な価値を示さない、または安全境界を守れない場合は製品を作らない。匿名化した方法・失敗・fixture・schemaを公開できる形へ整理する。

これは失敗ではなく、最も高価な誤投資を避ける正式なrouteである。

### R1 — File-copy companion

作者が既存toolからTXT/Markdownへ書き出し、companionで読む。原稿の直接編集やhost APIは持たない。

強み:

- 最小の権限面積でAI lens価値を検証できる
- Word、一太郎、Nola、Scrivener、テキストエディタ等の利用者を排除しにくい
- route変更時もsnapshot、lens、finding契約を再利用できる

弱み:

- 原稿へ戻るjumpが限定される
- exportの手間と版ずれがある
- 長期利用では二重管理に見えやすい

Gate Aではこのrouteを採用する。製品routeとして残すかはD3の再利用率で判断する。

### R2 — Linetta external MCP / upstream integration

Linettaはローカル作品データ、scene、character、fact等のread toolをMCPで公開し、read-only構成とlocalhost/bearer tokenを持つ。公開されている開発文書からは、外部MCP clientとして接続するsidecarが技術的候補になる。一方、安定したplugin APIとは確認できていないため、forkを前提にしない。

一次資料: [Linetta development guide](https://github.com/devlikebear/linetta/blob/main/docs/DEVELOPMENT.md) / [Linetta repository](https://github.com/devlikebear/linetta)

採用条件:

- SP-01でread-only接続、stable identity、cutoff相当の抽出、version mismatch処理を確認
- maintainerが外部read client用途を明示的に拒否していない
- pilot参加者のworkflowに適合するか、移行意思が観察できる
- 必要な変更を小さなupstream proposalとして分離できる

棄却条件:

- 全文または順序をlosslessに取得できない
- host versionごとの追随費が大きい
- hard cutoffをhost側・client側のいずれでも証明できない
- 安全なsource jumpに必要なstable ID/versionがない

### R3 — Obsidian plugin + existing Japanese writing surface

Obsidianのfile vaultを正本とし、TsumugiMark等の既存日本語執筆pluginと共存するroute。TsumugiMarkは縦書き、ルビ、IMEを考慮したtypewriter mode等を公開しているが、README上でbeta・破壊的変更の可能性も明示している。

一次資料: [TsumugiMark repository](https://github.com/mofukuru/TsumugiMark)

採用条件:

- SP-02で他pluginと共存し、原稿破損・CSS依存の誤anchorがない
- Obsidian利用者または移行意向が対象層に十分ある
- mobileやsyncを含むhost依存を正直に説明できる
- lens dataをvault外へ置くか、Git/syncへ混入させない既定を作れる

棄却条件:

- hostの商用・closed core依存がOSSの退出可能性を実質損なう
- 縦書き/IME品質がplugin競合で再現しない
- AI同意境界をhost上で分かりやすく実装できない

### R4 — novelWriter adapter / upstream contribution

novelWriterはOSSで、公開文書にproject formatとexportの説明がある。成熟したproject structureを利用し、file/export adapterまたは小さなupstream貢献を検討する。

一次資料: [novelWriter documentation](https://novelwriter.io/docs/)

採用条件:

- SP-03でscene order、stable identity、metadataをlosslessに読み、元projectを変更しない
- license・言語stack・maintainer方針と長期保守が整合
- 日本語利用者に必要な表示品質を別surfaceで補えるか、対象routeが海外横書き中心だと明示できる

### R5 — Existing OSS fork

forkは最後から二番目の手段とする。初速は出るが、upstream security fix、format migration、UI差分を永続的に背負う。

採用には以下をすべて要求する。

- upstreamでは受け入れ不能な中核要件が文書化されている
- 新規coreより少なくとも12か月の総保守費が低いと見積もれる
- license互換性と商標・配布条件を確認済み
- fork差分を最小に保つarchitectureがspikeで成立
- 2名以上のmaintainer候補がいる

### R6 — New standalone core

新規standalone editorは、lens、縦書き、local history、open formatを最も一貫して設計できる一方、editor品質・IME・accessibility・import/export・packagingを同時に背負う。

採用条件は「既存製品より魅力的」ではなく、次の全条件とする。

1. Gate Aのsafety gateを全通過する。
2. 5人pilotのうち3人以上が4週間で2回以上自力再利用する。
3. 既存host routeでは不変条件を満たせない具体的なblockerが2件以上ある。
4. 縦書き/日本語editor品質が購入・移行理由だと複数participantの行動で示される。
5. SP-05、SP-06、SP-07の合格案が揃う。
6. 12か月の保守範囲と2名以上のmaintainer計画がある。

## 4. 判定順序

routeは重み付き総合点だけで決めない。弱い点を強い点で相殺できないため、順序付きgateを使う。

```text
safety gate failure? ─ yes → R0 / redesign and re-test
        │ no
lens has reproducible user value? ─ no → R0 or publish narrow utility
        │ yes
file companion reused unaided? ─ yes → R1 remains viable
        │
host route satisfies all invariants? ─ yes → R2/R3/R4, smallest viable surface
        │ no
standalone conditions all met? ─ yes → R6
        │ no
R1 with narrower scope or R0
```

同点なら、次の優先順位で小さいrouteを選ぶ。

1. 原稿へ書き込む権限が少ない
2. 作者の移行費が小さい
3. 正本を増やさない
4. upstreamと共有できる変更が多い
5. 3年間の保守面積が小さい

forkは単純な「最短実装」を理由に選ばない。

## 5. evidence table

Gate exit時に以下を埋める。空欄を0点として合算せず、「未検証」として残す。

|Evidence|R1 file|R2 Linetta|R3 Obsidian|R4 novelWriter|R5 fork|R6 new core|
|---|---:|---:|---:|---:|---:|---:|
|不変条件10件|要記録|要記録|要記録|要記録|要記録|要記録|
|対象participantの現workflow適合|要記録|要記録|要記録|要記録|要記録|要記録|
|移行/導入所要時間中央値|要計測|要計測|要計測|要計測|要計測|要計測|
|source jump成功率|要計測|要計測|要計測|要計測|要計測|要計測|
|lossless round-trip|N/A/read-only|要試験|要試験|要試験|要試験|要試験|
|hard cutoff network audit|要試験|要試験|要試験|要試験|要試験|要試験|
|縦書きquality matrix|N/A|host依存|要試験|host依存|要試験|要試験|
|年間追随工数の範囲|小|要見積|要見積|要見積|大|最大|
|maintainer合意/関心|自分達|要確認|要確認|要確認|要確認|2名必要|
|license/配布blocker|要監査|要監査|要監査|要監査|要監査|要監査|

## 6. maintainerへの質問案

まだ送信しない。SP-01～03で公開情報を確認し、再現例を添えてから送る。

### Linetta向け

> We are prototyping a read-only synthetic-reader companion for novelists. We would like to connect as an external MCP client, request only user-selected scenes up to an explicit cutoff, and never call write tools. Is the external read-only MCP surface intended to be usable by third-party local clients? If not yet stable, which identifiers/version signals should a prototype treat as provisional? We can first share a minimal interoperability report and avoid requesting product-specific changes.

### TsumugiMark向け

> We are testing interoperability for a read-only critique companion, not adding text generation to the editor. Are there documented DOM/source mapping or compatibility expectations that another plugin should follow to avoid breaking vertical layout, IME behavior, and ruby markup? We will reproduce against public fixtures before proposing any integration.

### novelWriter向け

> We are evaluating a read-only adapter that consumes an exported or copied project and never modifies the source. Which documented format/export surface is safest for third-party tooling, and which IDs/order fields should not be assumed stable across versions? We can provide a small lossless-read report before discussing upstream work.

## 7. license and governance checkpoint

Gate Aの新規schema、fixture、検証器のlicenseは、公開前に依存物とfixture出自を監査して決める。現時点の候補はcode/schemaがApache-2.0、完全自作fixtureがCC0-1.0である。調査参加者の原稿、発言、派生fixtureを公開licenseへ自動的に含めない。

製品routeでは、次を別々に記録する。

- repository license
- bundled dependency licenseとNOTICE要件
- host/plugin API利用条件
- model provider termsとdata retention
- name/logo/trademark
- contributor agreementまたはDCO方針
- security report窓口

法的判断が必要な項目はmaintainerの推測で確定せず、公開・配布前に専門家確認へ送る。

## 8. decision record template

```yaml
decision_id: ROUTE-YYYY-MM-DD
status: proposed | accepted | rejected | superseded
decision_owner:
reviewers: []
evidence_packet:
gate_a_safety:
gate_a_value:
pilot_reuse:
candidate_routes: []
invariant_failures: {}
chosen_route:
why_now:
why_not_smaller_route:
reversible_until:
estimated_12_month_maintenance:
license_review:
open_risks: []
next_review_date:
```

decision ownerとreviewerは同一人物にしない。最終判断では「機能数」ではなく、実利用の継続、安全性、退出可能性、保守面積を主な根拠にする。

