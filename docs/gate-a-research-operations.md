# Gate A ユーザー調査・比較試用 運用書

版: 0.1  
更新日: 2026-08-30  
親文書: [START HERE](./START-HERE.md) / [評価protocol](./gate-a-evaluation-protocol.md)

## 目的

この調査は、参加者がAIを好むか、新しいUIを褒めるかを尋ねるものではない。次の行動仮説を反証する。

> 日本語長編作家は、既存環境を残したままでも、読了位置・版・根拠・coverageを持つread-onlyの合成読者を繰り返し使い、現在の一般AI質問または人手の回避策より見直し判断を速くできる。

副次目的は、正本を移す必要があるか、companion/pluginで十分かを見極めることである。

## 調査で答える質問

1. 作家が最後に「見落とした」「戻れなかった」「設定が分からなくなった」実例は何か
2. どの工程でNola、Scrivener、Word、Google Docs、Obsidian、VS Code、一太郎等を切り替えるか
3. 初見読者と整合性候補のどちらが、いつ再利用されるか
4. 根拠、版、coverage、読了位置は、回答の信頼と判断速度を変えるか
5. generic baselineよりlens outputを選ぶか。選ぶ理由は内容か表示か
6. 誤検出、最大問題の見逃し、文体を均す圧力にどこで耐えられなくなるか
7. 元toolの横に置く、pluginとして使う、正本を移す、使わないのどれを選ぶか
8. 縦書き、open file、履歴、AIのうち、実際の切替理由になるのはどれか
9. OSS、local、BYOK、署名済み配布のどれが導入条件で、どれは好意的意見に留まるか
10. 公共財型OSSへの寄付、有料support/同期/署名版への支払意思が行動としてあるか

## 調査構成

|stage|人数|方法|主な出力|
|---|---:|---|---|
|D0: guide pilot|2|60～75分、fixture中心|質問順、時間、誤解の修正|
|D1: workflow観察|全12枠のうち最低4|75～90分、prototypeを見せる前|直近の失敗、道具間移動、現在の回避策|
|D2: condition-label masked comparison|D0以外で最低8|75～90分、同一model A/B|選好、時間、理由、誤り|
|D3: parallel pilot|可能なら5|4週間、既存toolと併用|自発的再利用、使わなかった理由、incident|
|D4: exit interview|D3参加者|45～60分|route選好、switching barrier、継続意思|

D0の2人をD2へ含めない。D1とD2は同一参加者でもよいが、workflow観察を必ず先に行い、製品説明で記憶を汚さない。謝礼対象は合計12枠を既定とし、D0 2名 + D2有効8名を最低構成、残り2枠をquota補完または有効数追加へ使う。no-show用の予備2枠は別予算である。

## 対象者

### 必須条件

- 18歳以上
- 日本語で小説を書いている
- 直近12か月にdesktopで5万字以上の作品またはseriesを扱った
- 章・場面をまたぐ改稿、設定確認、レビューのいずれかを経験した
- screen sharingまたはmoderator同席で操作を説明できる

参加者自身の原稿を見せることは必須条件にしない。契約・公募・未発表作品を共有できない人は、用意したfixtureで参加できる。

### 最大差を取るquota

厳密な市場比率ではなく、仮説が壊れやすい差を含める。

|軸|最低限含める|
|---|---|
|作り方|事前plot型3、発見型3、混合2以上|
|発表形態|Web連載3、同人/公募3、商業または編集者との受渡し2。重複可|
|主tool|Nola系2、Scrivener系2、Word/Docs系2、Obsidian/VS Code系2|
|AI態度|拒否・強い慎重2、限定利用3、日常利用3|
|縦書き|直接縦書き重視2、校正時だけ2、不要2|
|経験|初長編2、複数作4以上|

quotaを満たすために不適格者を採用しない。人数が不足した軸は結果の限界として残す。

## Screening questionnaire

募集formは次の順で尋ねる。自由記述を公開しない。

1. 年齢区分: 18歳未満 / 18～24 / 25～34 / 35～44 / 45～54 / 55以上
2. 主に書く言語
3. 直近12か月に扱った最長作品のおおよその文字数
4. 主な発表形態: 未発表 / Web / 同人 / 公募 / 商業 / その他
5. 現在使う道具をすべて選択
6. 本文、設定、校正、backup、共有、出版で道具を分けるか。最近の例を100～300字で説明
7. 縦書きをどの段階で使うか
8. AI利用: 使わない / 発想だけ / 調査・校正 / 講評 / 書換え / 本文生成
9. AIへ未発表原稿を送ることへの態度
10. 既存原稿を見せずfixtureだけで参加したいか
11. 画面録画、音声録音、操作logの各同意可否
12. 4週間pilotへの参加可否
13. 利害関係: 執筆softwareまたは生成AI productの開発・販売に関与するか
14. 連絡先。回答dataとは別IDで保存する

自動除外は18歳未満、日本語小説を書いていない、desktop執筆経験なしだけとする。競合関係者は除外せず、分析segmentを分ける。

## 募集文template

> 日本語で長編小説を書く方を対象に、現在の執筆・見直し方法を観察する調査を行います。新しいAI小説生成サービスの評価ではなく、作者自身が書いた原稿を読み返す補助方法の研究です。本文を書き換える機能は使いません。
>
> ご自身の未発表原稿を共有する必要はありません。こちらで用意した架空の原稿でも参加できます。参加時には、送信される文章、保存する情報、削除期限を説明し、項目ごとに同意を確認します。
>
> 所要時間: 75～90分  
> 謝礼: 8,000円（終了後、事前に案内した方法で支払います）  
> 条件: 18歳以上、日本語で5万字以上の小説またはseriesをdesktopで扱った経験がある方
>
> 良い感想は必要ありません。使えない、信用できない、現在の方法の方が良いという判断も同じように重要です。

募集場所ごとに規約を確認する。公開投稿へ作品名、未発表内容、AI態度を返信させない。

## 参加説明と同意

これは法的・学術倫理審査の代替文書ではない。組織研究または公開論文へ使う場合は、所属組織の倫理・法務手続きを先に行う。

### 説明すべき項目

- 目的、所要時間、操作内容
- 参加は任意で、中断しても謝礼を不当に失わないこと
- 作者の能力や作品品質を採点しないこと
- 著作権、出版権、学習利用権を取得しないこと
- 自分の原稿を使うかfixtureを使うか選べること
- own-copyを使う場合、共同著者・依頼主・公募/出版契約等により第三者AI送信を制限されていないこと。判断できなければfixtureを使うこと
- どの範囲をどのAI providerへ送るか、実行前に確認できること
- recording、screen capture、原稿一時保持、raw response保持を別々に選べること
- 連絡先、研究記録、本文、録音の保存場所と削除期限
- 匿名化した集計と短い引用を公開する可能性。原稿本文は公開しないこと
- 問合せ、撤回、削除依頼の方法
- 予測できるrisk: 未発表情報の露出、不快な講評、provider送信、誤った所見
- 直接の利益を保証しないこと

### 口頭確認script

Moderatorは次を一項目ずつ尋ね、`yes / no / fixture only`を記録する。

1. 調査参加に同意しますか
2. 音声録音に同意しますか
3. 画面録画に同意しますか
4. 自分の原稿copyを使いますか、fixtureを使いますか
5. own-copyの場合、その原稿を指定providerへ送る権限があり、契約上の制限がないとご自身で確認できますか。分からない場合はfixtureへ切り替えます
6. 選んだ範囲を表示中のcloud providerへ送ることに同意しますか
7. raw AI responseを分析終了まで保存してよいですか
8. 匿名化した操作・評価dataを集計へ含めてよいですか
9. 終了後に連絡できる4週間pilot候補へ登録しますか

一つの包括checkboxへまとめない。cloud送信に同意しない参加者はmock/fixtureでUX taskを行い、D1の観察と「なぜ送らないか」を結果へ残す。事前登録した同一local modelを両conditionで使える別cohortを組まない限り、そのpairをcloud primary comparisonへ混ぜない。AI利用拒否者を参加者flowから消さず、primary pair未実施として母数・理由を報告する。

## Data handling

|data class|例|既定保存|期限|公開|
|---|---|---|---|---|
|連絡・支払PII|氏名、mail、振込情報|暗号化し研究dataと分離|支払・監査要件後に削除|しない|
|同意記録|participant ID、項目別yes/no|保存|project終了 + 1年を上限に要件確認|しない|
|原稿copy|TXT/Markdown本文|session memoryのみ|session終了時に消去。pilot同意時も端末内|しない|
|content hash|snapshot/document SHA-256|保存可|12か月|単独では公開しない|
|raw provider payload/response|送信本文、未検証出力|既定OFF|明示同意時30日|しない|
|recording|音声、画面|項目別同意|transcript確認後30日以内|しない|
|session note|観察、発言要約、task time|pseudonymous|12か月|集計のみ|
|masked A/B rating|A/B、理由、尺度、condition guess|pseudonymous|長期比較用12か月|匿名集計可|
|incident|漏洩、誤anchor、data loss|本文を除き保存|修正・監査に必要な期間|匿名化した再現例のみ|

原稿、PII、API key、raw responseをGit repository、issue tracker、analytics、crash reportへ入れない。debugには[公開fixture](../fixtures/README.md)だけを使う。

Participant IDは`P-` + 無作為8文字とする。連絡先との対応表はResearch leadだけが持ち、session artifactに氏名を書かない。

## Session準備

Moderatorは前日までに確認する。

- 同意文とprovider policy linkが現在版か
- participant IDとsession sheetを作ったか
- fixture modeとown-copy modeのどちらか
- prototypeがoffline mockで起動し、network endpointを確認できるか
- API key、連絡先、原稿がscreen recordingへ映らないか
- baseline/lensの順序が事前乱数表で決まっているか
- task終了条件と最大時間があるか
- erase操作をsession終了前にdemoできるか
- incident発生時の停止連絡先があるか

## Workflow observation guide

### 冒頭 0～10分

1. 同意を確認する
2. 「softwareのtestではなく、現在のやり方を学ぶ」と伝える
3. 思考発話を依頼するが、説明が途切れても促し過ぎない
4. 作品内容や文章力を評価しないと再確認する

### 現在の仕事 10～30分

次を「一般論」ではなく最後の実例で聞く。

- 最後に長編を開いた時、どのfile/appから始めたか
- 移動中の断片をどこから本文へ移したか
- 設定を探すのに時間がかかった場面
- 読者または編集者の指摘を本文へ戻した手順
- 大改稿前に戻った、または戻れなかった例
- 縦書き、font、画面幅を変えた時に見つかったこと
- AIを使った最後の質問と、その回答を信用・却下した理由
- 最後にbackupを確認した時と、restoreを試した経験

「もし理想の機能があれば」は最後まで聞かない。画面を見せられる場合は操作を実演してもらい、tool名より切替理由を記録する。

### 現行tool task 30～45分

参加者自身の安全な作品またはfixtureで、次から二つを行う。普段使っていない製品の購入・install・移行は求めず、現行workflowを観察する。

1. 「第3章で出た鍵の持ち主を探し、根拠を示す」
2. 「二週間前の版へ戻らずに差を確認する」
3. 「指定章まで読んだ人が知らない情報を分ける」
4. 「縦書きまたは別表示で推敲する」
5. 「編集者へ渡せる形式へ出す」

開始時刻、完了時刻、tool切替、copy/paste、検索回数、迷い、abortを記録する。助けを求められた場合は時刻と内容を記録してから最小限答える。

## Condition-label masked comparison session

詳細は[評価protocol](./gate-a-evaluation-protocol.md)を使う。Moderator向けの順序は次である。

1. snapshotと読了位置をparticipantに読み上げてもらう
2. context manifestを見て、送ってよい範囲を確認する
3. 同じqueryでA/Bを実行する。condition label、prompt、mappingは隠す
4. 最初の30秒は声を出さず読んでもらう
5. A/Bそれぞれで、役立つ、誤解、根拠不足、声を均す圧力をmarkする
6. 強制選択: A / B / 同等 / どちらも使わない
7. 選択理由を自由記述し、後から尺度を尋ねる
8. mapping reveal前に、専用lensだと思う側と確信度を記録する
9. mappingを開示した後、lens特有の表示が判断を変えたか確認する
10. findingから原稿copyへjumpし、位置の正しさを本人に確認してもらう
11. erase操作を行い、残るdataを説明する

出力の正しさをModeratorが弁護しない。「その解釈もあり得る」と誘導しない。

## 4週間parallel pilot

### 参加条件

- D2を完了した成人
- 自分のcopyを端末内へ置くことに同意
- 週一回、5分以内の短報を提出できる
- prototypeを唯一の正本にしないことを理解

### 依頼

- 必要を感じた時だけ起動する。利用回数のquotaを課さない
- 起動した理由、使わなかった理由、代わりに使った方法を一行記録する
- 所見を採用、却下、意図的、未判断に分類する
- future leak、誤anchor、元file変更、予期しないnetwork送信を見たら直ちに停止
- 毎週、総所要時間と最大一件の役立ち・害を報告する

利用を促すnotificationを送らない。週次連絡はdata提出と安全確認だけにし、自発利用を汚さない。

### 終了質問

- prototypeが消えたら何へ戻るか
- 一週間後も使う具体的な場面があるか
- companion、Obsidian plugin、Linetta内、独立editorのどれなら導入するか
- 原稿を移すために不足する信頼は何か
- OSSであることに何を期待し、何には対価を払うか
- 最も害があった所見と、見逃した問題は何か

## Session note template

各sessionは次のheadingだけを持つMarkdownまたは構造化formで記録する。

    participant_id:
    date:
    moderator:
    segment_tags:
    consent_profile:
    artifact_mode: fixture | own_copy
    tools_observed:
    last_real_failure:
    current_workaround:
    task_events:
    a_b_assignments:
    preference_and_reason:
    misleading_findings:
    biggest_issue_missed:
    future_leak:
    anchor_incident:
    switching_intent:
    quote_candidates:
    moderator_interventions:
    deletion_confirmed:
    follow_up:

発言の要約と観察を分ける。推測には`[inference]`、直接発言には`[participant]`、操作には`[observed]`を付ける。

## 分析手順

### Sessionごと

1. 24時間以内にnoteを整理する
2. 作者の発言と操作の不一致を残す
3. prototype bug、AI error、仮説反証を別tagにする
4. critical incidentを即日security/privacy担当へ送る
5. quote候補は本人の原稿本文を含まないよう再確認する

### 4sessionごと

- 新しい参加者を止めず、guideの理解不能箇所だけ修正する
- primary metric、閾値、baseline prompt、lens promptを変更しない
- 重大な漏洩またはdata lossがあれば全sessionを停止する
- 同じ問題が三回出ても「飽和」と断定せず、segmentを確認する

### Gate A前

- 数値結果を[評価protocol](./gate-a-evaluation-protocol.md)の事前式で集計する
- 反証例を少なくとも五つ、成功例と同じ粒度で読む
- AI拒否、AI利用、tool cluster、縦書き重視別に方向が反転しないか見る
- 「欲しい」と「二回目を起動した」を分ける
- prototype品質の問題で仮説を検査できなかったcaseを成功・失敗へ無理に入れない
- 独立reviewerがraw session IDと集計の対応をsample監査する

## 研究上の停止条件

次が一件でも起きたら、新しいsessionとpilot配布を停止し、incidentを解決する。

- cutoff外本文またはcanaryがoutgoing payloadへ入った
- 元原稿fileのmtimeまたはcontentが変わった
- API key、氏名、原稿本文がlog/issue/repositoryへ入った
- findingが別箇所へ無言で誤付着した
- erase後も説明していないparticipant dataが残った
- 同意していないproviderへ本文が送られた
- participantが中断を求めたのに操作・recordingを継続した

停止は製品仮説の失敗と同じではないが、安全条件を満たすまで再開しない。

## 調査開始前に人が埋める欄

    product_owner:
    research_lead:
    independent_reviewer:
    evidence_rater_a:
    evidence_rater_b:
    participant_contact:
    incident_contact:
    budget_approved_by:
    payment_method:
    recruitment_channels:
    cloud_provider:
    exact_model_id:
    provider_policy_url:
    raw_data_root:
    pii_root:
    deletion_date:
    preregistration_hash:

空欄のまま参加者を募集しない。prototypeのmock実装は開始できる。
