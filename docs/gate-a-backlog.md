# Gate A execution backlog

更新日: 2026-08-30  
状態: 実装着手可能な順序付きbacklog  
親文書: [START HERE](./START-HERE.md) / [companion spec](./gate-a-companion-spec.md) / [evaluation protocol](./gate-a-evaluation-protocol.md)

## 1. scopeと見積りの読み方

このbacklogは標準10～12暦週のGate Aだけを対象にする。新規editor、縦書き編集面、Git UI、作品wiki、自動rewrite、embedding/RAGは含めない。6～8週は、builderを二人置く、C1 corpusを別teamが先行する、route spikeの一部をGate exit後へ送る、のいずれかがある短縮caseに限る。

- `pd`: 集中した1人日。会議・参加者待ち・審査待ちは含まない。
- 実装見積りは研究用prototype品質。公開製品品質ではない。
- 1人が研究と実装を兼務すると、待ち時間を含むcalendarは伸びる。
- research leadとprototype builderは兼務可能だが、blind mappingを知るoperatorと評価者は分ける。
- 各issueは小さなreview可能単位に分けて着手する。表のIDはepic/acceptance unitである。

## 2. Definition of Ready

issueは次を満たしてから`in progress`へ移す。

- ownerが一人決まっている
- 入力、出力、非対象、依存issueが書かれている
- 該当schemaまたは画面仕様がversion固定されている
- test fixtureとacceptance test IDが結び付いている
- 原稿・API key・participant dataの扱いが明示されている
- modelを呼ぶ場合、送信範囲と費用上限が明示されている

## 3. Definition of Done

すべての実装issueに共通する完了条件:

1. acceptance testが再実行可能で、結果をartifactとして残す。
2. source copyのhash/mtimeを変更しない。
3. debug log、Git、analyticsに原稿・API key・raw model responseを残さない。
4. error時にsilent fallback、silent truncation、fuzzy reattachmentをしない。
5. keyboardのみで主要flowを完了できる。
6. schema/prompt/study config versionがrun recordに残る。
7. mock providerでnetworkなしのdemoが通る。
8. reviewerがDoDと対応testを確認する。

research issueは[research operations](./gate-a-research-operations.md)のconsent、retention、除外規則を満たす。

## 4. 依存関係

```text
GOV-001 ─── RES-001 ─ RES-002 ─ RES-003 ─────────────┐
                       └─ CORPUS-001 ─ CORPUS-002 ────┤
                                                      │
GA-001 ─ GA-002 ─ GA-003 ─ GA-004 ────────────┐      │
  └───────────── GA-005 ───────────────────────┼─ GA-006 ─ GA-007 ─ GA-008
                     └─ GA-009 ─ GA-010 ───────┤          │          │
                                              ├─ QA-001 ─┤          │
                                              └──────────┼─ OPS-001 ┘
                                                          │
SP-01/SP-02/SP-04/SP-08 ──────────────────────────────────┤
                                                          v
                                      RES-004 workflow → RES-005 blind
                                                          │
                                      OPS-002 pilot ─ RES-006 longitudinal
                                                          │
                                      SP-03/05/06/07/09 ──┤
                                                          v
                                                    GATE-001
```

## 5. ordered backlog

### P0 — governance and study lock

|Order|ID|Outcome|Depends|pd|Acceptance / artifact|
|---:|---|---|---|---:|---|
|1|GOV-001|予算、decision owner、research lead、privacy reviewer、API spend capを記名|—|0.5|[START HERE](./START-HERE.md)の外部決定欄が埋まる|
|2|RES-001|study ID、claims、threshold、除外規則をpre-register可能な版へ凍結|GOV-001|0.5|署名付きprotocol hashと変更log|
|3|RES-002|screener、recruit copy、consent、謝礼、retentionをpilot review|RES-001|0.5|2名のguide pilotで理解不能な設問0件|
|4|RES-003|recruiting開始とquota board作成|RES-002|1.0+待ち|candidateはparticipant IDだけで管理、quotaが見える|
|4a|CORPUS-001|C1の16 caseをcontractに従い新規執筆|RES-001|8.0|全primary issue、control、cutoff caseが揃う|
|4b|CORPUS-002|annotator A/Bの独立labelとadjudication|CORPUS-001|6.0|evidence実在、forbidden conclusion、sealed hashを確認|

### P0 — immutable source and safety boundary

|Order|ID|Outcome|Depends|pd|Acceptance / artifact|
|---:|---|---|---|---:|---|
|5|GA-001|UTF-8 TXT/MDからimmutable corpus snapshotを作る|—|1.5|AT-001、[snapshot schema](../specs/corpus-snapshot.schema.json)、同入力で同ID|
|6|GA-002|document orderとinclusive cutoffを固定しeligible scopeだけ返す|GA-001|1.0|AT-002、leakage fixtureのfuture textがruntime inputにない|
|7|GA-003|context manifest、同意、cancelをrun前に表示|GA-002|1.0|AT-003/AT-014、同意前network request 0件|
|8|GA-004|固定応答mock providerでend-to-end runを作る|GA-003|1.0|AT-013、offlineでS1～S8をdemo可能|
|9|GA-005|finding/run schema validatorとstrict exact anchorを実装|GA-001|2.0|AT-005/AT-006、anchor fixture誤付着0、ambiguousはjumpなし|
|10|QA-001|payload recorderとcanary漏洩test harness|GA-002, GA-004|1.0|AT-002/AT-010/AT-012、未来章canary、除外資料、path、API keyの送信0件|

### P0 — controlled AI comparison

|Order|ID|Outcome|Depends|pd|Acceptance / artifact|
|---:|---|---|---|---:|---|
|11|GA-006|1つのcloud provider adapterを明示設定で接続|GOV-001, GA-003, GA-004, GA-005|2.0|AT-009/AT-015、`store:false`要求、truncation拒否、費用表示|
|12|GA-007|generic baseline v0.1とlens v0.1を同model/snapshot/queryで実行|GA-006|1.5|AT-004、prompt/schema hash、sampling、coverageがrun recordに残る|
|13|GA-008|A/B assignment、表示順、mappingをseed付きでmask|GA-007|1.5|AT-007、participant viewにcondition label、prompt名、mapping metadataがない。guessは別記録|
|14|GA-009|valid evidenceから原文copyの該当箇所へjump/highlight|GA-005|1.5|AT-006、exact/stale/ambiguous全case|
|15|GA-010|評価記録のexportとsession/raw data erase|GA-008, GA-009|1.0|AT-008/AT-016、exportに本文/絶対path/raw responseなし|
|16|QA-002|prompt injection、malformed JSON、timeout、oversize、malicious HTML/Markdownのfailure test|GA-006, GA-010|1.5|AT-005/AT-009/AT-017、各error codeが説明可能、script/remote load 0、retryは明示操作|
|17|QA-003|keyboard、screen reader labels、contrast、1M字性能のprototype audit|GA-010|1.5|AT-011とNFR結果表。blockerはpilot前に修正または明示除外|

### P0 — research execution

|Order|ID|Outcome|Depends|pd|Acceptance / artifact|
|---:|---|---|---|---:|---|
|18|RES-004|既存workflow比較sessionを実施|RES-003, GA-004|4.0+日程|最低4名、観察/発言/推論を分離したnotes|
|19|RES-005|condition-label masked comparisonを実施|RES-003, CORPUS-002, GA-008, QA-001, QA-002|4.0+日程|最低8名・24 pair、有効/除外理由、sealed mapping|
|20|RES-007|independent evidence review|RES-005|4.0|2 rater、20%以上overlap、supported/misleading/harm rubric、mapping-masked review record|

### P1 — route and durability spikes

|Order|ID|Outcome|Depends|pd cap|Acceptance / artifact|
|---:|---|---|---|---:|---|
|21|SP-01|Linetta external read-only MCP feasibility|GA-002|2.0|[spike workbook](./technical-spike-workbook.md) report|
|22|SP-02|Obsidian + TsumugiMark interoperability|GA-002|2.0|同上|
|23|SP-04|anchor algorithmを全fixtureで反証|GA-005|2.0|誤付着0、failure taxonomy|
|24|SP-08|長文context budgetとhonest coverage|GA-006|1.0|silent truncation 0、上限時の説明|
|25|SP-03|novelWriter read-only/export feasibility|RES-004|1.5|route evidence report|
|26|SP-05|縦書き・IME実機quality matrix|RES-005 value gate通過後|4.0+Mac待ち|Windows/macOS結果。新規core判断用|
|27|SP-06|正本A/B/Cのlossless prototype|RES-005 value gate通過後|4.0|round-trip/diff/migration結果|
|28|SP-07|native snapshotとGit backend比較|RES-005 value gate通過後|4.0|復元・分岐・非Git UXのtask test|
|29|SP-09|pilot packaging、network endpoint、uninstall audit|GA-010, QA-003|3.0|clean VM 2台、許可外endpoint 0|

### P1 — longitudinal pilot and decision

|Order|ID|Outcome|Depends|pd|Acceptance / artifact|
|---:|---|---|---|---:|---|
|30|OPS-001|versioned research buildとoperator runbook|QA-001～003|1.0|checksum、known issues、rollback/uninstall手順|
|31|OPS-002|5人pilot onboarding|SP-09, OPS-001|1.5+日程|各自が自分のcopyでimport/run/eraseを一度完了|
|32|RES-006|4週間のunaided reuseとexit interview|OPS-002|3.0+4週|利用eventは最小集計、3/5再利用判定|
|33|GATE-001|evidence packetとroute decision|RES-006, SP結果|2.0|thresholdごとのpass/fail/unknown、署名decision record|

## 6. 推定量と人員

表の見積りを合計すると、研究用companionのP0実装・QAは18人日、governance・研究設計・corpus作成・session・分析・最終判断は35人日、operator build/runbookは1人日、P1 spikeは最大23.5人日である。これはrecruiting待ち、4週間pilotの暦日、bug rework、meetingを含まない。planningには20%のrework余裕を別に置く。価値gate不通過時はSP-05～09の一部を開始せず、費用を止める。

推奨する最小体制:

- prototype builder: 1名、P0実装とspike
- research lead/moderator: 1名、recruit・session・analysis
- privacy/safety reviewer: 兼務可だが実装owner以外
- evidence rater: 2名、condition mappingを知らない。少なくとも一人は実装・moderationから独立
- macOS/IME test協力者: SP-05のみ

1名だけで進める場合、mapping-masked rater二人を外部協力に置き、同時進行を前提にしない。標準calendarを10～12週とし、recruitingまたはsafety修正で越える時は品質gateを削らず日程を延ばす。

## 7. 最初の10営業日

|Day|Builder|Research lead|終了条件|
|---:|---|---|---|
|1|GA-001 testから開始|GOV-001/RES-001|snapshot schemaとstudy version凍結|
|2|GA-001|RES-002 guide review|同入力同snapshot ID|
|3|GA-002|RES-003 recruit開始|cutoff canary test red→green|
|4|GA-003/004|workflow session予約|offline S1～S8 skeleton|
|5|GA-005|guide pilot 1|strict anchor失敗分類|
|6|QA-001|guide pilot修正|payload evidenceを保存できる|
|7|GA-006|workflow session 1|cloud callをconsent境界内で1回|
|8|GA-007|workflow session 2|同条件baseline/lens run|
|9|GA-008|session notes coding|masked viewからcondition label/prompt/mapping metadata 0|
|10|GA-009/010|中間synthesis|blind study rehearsal完了|

## 8. release blockers

次のいずれかが未解決ならparticipantへcloud buildを渡さない。

- consent前またはcancel後にmodel requestが出る
- future/excluded textのcanaryがpayloadに出る
- providerの保存設定を確認できない
- silent truncationまたはpartial coverageを「全文」と表示する
- invalid/stale/ambiguous anchorから自動jumpする
- raw manuscript/responseがlog、crash report、study exportへ残る
- eraseが成功したか検証できない
- masked viewにcondition label、prompt名、model差、mapping等の直接metadataがある（lens固有interactionは除く）
- participantが未成年、または自作でない原稿のuploadを求められる

## 9. 変更規則

- scope追加は`GATE-CHANGE-NNN`として、検証するclaim、追加費用、schedule影響、代替案を記録する。
- thresholdはblind resultを開封した後に下げない。変更が必要なら旧版の判定も併記する。
- prompt/schema/fixture変更はversionとhashを更新し、異なるversionの結果を無条件に合算しない。
- production editor機能の要望は`post-gate candidate`へ隔離し、このbacklogへ直接入れない。
- blockerの回避に原稿書込権限が必要になった場合は実装せず、[route decision](./route-decision.md)へ送る。

## 10. Gate A completion packet

GATE-001に必要なartifact:

- signed study protocol and amendments
- participant flow/quota and exclusion log
- blinded pair-level result and sealed mapping
- leakage/anchor/network/privacy test reports
- workflow observation themes with counter-evidence
- four-week reuse summary
- technical spike reports
- spend and model/version record
- pass/fail/unknown table for every threshold
- accepted route decision or explicit R0
- next 90-day backlog only if route is accepted

packetが揃うまで、product roadmapを「確定」と表現しない。
