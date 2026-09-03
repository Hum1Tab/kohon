# 構造の最終確認と再検討

確認日: 2026-08-30  
対象: [調査報告](./2026-writing-environment-research.md) / [プロダクト提案](./product-proposal.md) / [出典台帳](./source-register.md)  
後続審査: [着手前Go / No-Go再審査](./pre-build-go-no-go-review.md)

## 判定

この文書は最初の構造監査の記録である。その後、Linetta、TsumugiMark、OpenNovel、Vela等の近接実装と2025～2026年のAI講評研究を追加確認し、[着手前Go / No-Go再審査](./pre-build-go-no-go-review.md)で結論を厳しくした。競合判断、正本形式、Git、初期レンズ、着工可否については後続審査を優先する。

中心思想の論理鎖は次のように維持する。

1. **実利用の観察**: 作家は本文、捕捉、設定、校正、共有、出版、安全性のために道具を併用する
2. **市場仮説**: 機能を全部集めるのでなく、作者の原稿と各工程の出入口を安全につなぐ
3. **差別化仮説**: 日本語品質、退出可能性、版付き根拠、時点別の知識境界を統合する
4. **製品構造**: 原稿正本を中心に、履歴、知識、規則・AIレンズ、相互運用を派生層として置く
5. **検証順序**: read-onlyでレンズ価値を先に試し、companion/upstream/plugin/fork/new/stopを選んでから、必要な場合だけ正本型MVPへ進む

したがって、構想の方向は維持する。ただし「Scrivener + Git + AI」という説明は外向けの製品定義として弱いため使わない。検証する製品定義は次とする。

> 作者が所有する日本語原稿へ、誰がどこまで知ってよいかを守り、版に結びつく根拠を返す編集レンズを提供する。最初は既存環境の横で検証し、必要な場合だけ執筆環境へ広げる。

## 監査方法

次の五つの観点で全文を再読した。

1. ユーザーが明示した要件が、調査、判断、MVPのいずれかへ落ちているか
2. 調査事実から製品判断へ、証拠のない飛躍がないか
3. 製品ビジョン、MVP、将来機能が混同されていないか
4. データ、Git、AI、縦書き、OSSの設計が相互に矛盾しないか
5. 開発順序が最大リスクと最大不確実性を早期に検証するか

## 明示要件の追跡

ここでの「充足」は文書・計画上の充足であり、ソフトウェアが実装済みという意味ではない。

|要求|調査上の根拠|計画上の配置|状態|
|---|---|---|---|
|AI自動生成を中心にしない|AI倫理・工程別態度、既存生成製品|製品原則、AI完全無効、MVP除外|明示済み|
|エディタ内で作品について会話|Sudowrite、Novelcrafter等との比較|レンズ別chat thread、対象版、情報境界|明示済み|
|回答から本文の箇所へ移動|既存製品の本文注釈、Web Annotation|stable anchor、所見card、逆参照|明示済み|
|読者・編集者・批評・設定確認|長編記憶研究、AI製品比較|初見読者、編集者、整合性確認の初期レンズ|明示済み|
|役割ごとに異なるchat|personaだけでは模倣容易|目的、情報境界、出力契約、権限、実行条件|強化済み|
|Gitの利点を知識なしで使う|VS Code/Git利用例と学習負担|入力の復元、今日の履歴、節目、別案という日常語|明示済み|
|縦書き・横書き|一太郎、TATEditor、JLReq、IME issue|直接縦書きを正本型MVPのgo/no-go条件|強化済み|
|UIのカスタマイズ|軽量editor、VS Code profile、異化校正の利用例|font、本文幅、行・字間、pane、shortcut、作業profile|追加済み|
|OSS|既存OSSと配布持続性|license候補、DCO、RFC、署名、sustainability|明示済み|
|作家の併用理由と不満を重視|日本・海外の実利用記録|調査報告の併用表と証拠→判断表|強化済み|
|市場の穴|直接競合・近接OSS調査|五条件の同時充足と比較matrix|強化済み|
|ローカルデータ設計|cloud依存、退出不安、plain file利用|data class、canonical/derived/secret/remoteの分離|強化済み|
|MVPと将来機能|同期・組版・mobile等のscope risk|検証companion、正本型MVP、公開1.0、1.x、2.x|修正済み|
|技術構成|縦書き、annotation、Git、SQLite、AI provider調査|新規core時の暫定stackと比較gate|修正済み|
|開発順序|データ損失・縦書き・anchorが最大risk|Gate A/B/Cを伴うPhase 0～7|修正済み|
|事実と推測の区別|一次、実利用、集計のsource tier|確認事実、利用観察、判断、仮説、決定状態|明示済み|

## 再検討で見つけた問題と修正

### 1. 時間軸が一つ足りなかった

**問題:** 「二つの時間」としながら、本文では出来事、読者への開示、改稿の三つを扱っていた。

**修正:** 次の三軸へ明示的に分離した。

- 物語時間
- 叙述・開示順
- 改稿時間

読者レンズは開示順、整合性は物語時間とclaim、所見の古さは改稿時間を使う。

### 2. 製品原則と技術選定が混ざっていた

**問題:** forkの評価前にTauri、libgit2、Vivliostyleを確定案のように記述していた。

**修正:** 決定状態を「固定原則」「検証仮説」「暫定候補」「gate事項」に分け、build/fork判定を技術構成より前へ移した。forkを選ぶ場合、製品原則と品質gateは維持するが、stackは既存projectへ合わせる。

### 3. MVPが三つの意味を持っていた

**問題:** 仮説検証、正本を預けられるclosed beta、署名済み公開製品が一つのMVPへ混在し、規模と完了条件が曖昧だった。

**修正:**

1. read-only検証companion
2. 正本型MVP
3. 公開1.0

の三段階へ分けた。MVPの保存品質を下げず、配布運営までを同じmilestoneへ詰め込まない。

### 4. AIに任せすぎていた

**問題:** 文字数、公募書式、表記候補から感情・整合性まで、一つのAI pipelineに見えた。また、RAGで一部を読んだだけでも「全稿に問題なし」と答えかねなかった。

**修正:** 決定的規則、AIレンズ、作者・人間編集者の責任を分けた。整合性では引用付きclaim indexを広く作り、AIは候補間の意味関係を検討する。対象、直接検査範囲、未検査範囲をcoverage明細へ残し、不在を断定しない。

### 5. chatと成果物が混ざっていた

**問題:** 会話が長くなるほど、有用な結論、前提版、正史への影響が分からなくなる。

**修正:** chat threadはレンズ・範囲・版へ紐づく暫定作業、所見は本文anchorを持つ永続成果物、正史候補は作者承認を要する別物とした。

### 6. ローカル保存とGit remoteが同一視される余地があった

**問題:** local historyへ含めることが、そのままGitHub等へ送るように読めた。API key、raw chat、cursor、embeddingも分類されていなかった。

**修正:** data classごとに、正本、作品に残す所見、作業状態、派生cache、機密、AI監査・chatを分離した。local historyとremote送信を別設定にし、remote前に対象をpreviewする。

### 7. 既存Git・cloud syncとの共存が未検討だった

**問題:** projectがすでにGit repository内、またはOneDrive・Dropbox内にある場合、nested repo、lock、同時更新が衝突し得る。

**修正:** 履歴storeの物理配置を未決gateへ戻し、Phase 1でmatrix試験する。libgit2の採用だけでは解決済みとしない。

### 8. モバイルを外した結果、捕捉の仕事まで落としていた

**問題:** 実利用ではスマートフォンメモ・音声からPC本文への移動が多いが、mobile完全版をMVPから外したことで入口が消えていた。

**修正:** clipboard、TXT、Markdown、音声文字起こし結果を受ける捕捉受信箱を追加した。本文へ自動挿入せず、将来のmobile companionも同じ入口を使う。

### 9. カスタマイズ要件が弱かった

**問題:** 三つの作業面とthemeはあったが、ユーザーが求める「VS Codeのような自由度」をどこまで取り入れるか不明だった。

**修正:** font、本文幅、行・字間、pane、shortcut、project/global profileをMVPへ明示した。任意CSS・任意code plugin・無制限dockは外し、再現性と縦書き品質を守る。

### 10. 縦書きのfallbackが要件を弱めていた

**問題:** WebViewで難しい場合に横書き編集＋縦書き校正だけで段階公開する余地があり、「縦書きでちゃんと書ける」という核を実質的に切る可能性があった。

**修正:** 直接縦書きを正本型MVPの合格条件とした。失敗したらeditor/stackを変えるか公開を遅らせる。横書き＋縦校正は検証物には使えても、MVP合格の代替にしない。

### 11. 乗り換えコストを軽視していた

**問題:** 無名のOSSへ長編の正本を移すこと自体が最大の採用障壁なのに、初回からeditor移行を前提にしていた。

**修正:** read-only companion → copy-importで並行利用 → 正本化という導入経路を追加した。差別化仮説を先に検証し、データ安全の実績がない段階で移行を迫らない。

### 12. 工期が楽観的だった

**問題:** Phaseを合計すると3～4人でも約11～17か月なのに、個人18～24か月は縦書き、回復、配布まで含めると不足しやすい。

**修正:** フルタイム個人30～48か月、兼業はそれ以上という初期見積りへ改めた。工期短縮のためにデータ安全や縦書きを名目だけにしない。

## 最終的な製品構造

### 層

|層|責任|下位層がなくても成立するか|
|---|---|---|
|0. 原稿所有|ローカル本文、構造、作者note、承認済み正史、公開仕様と完全export|製品の中心。物理形式はGate Aで決定|
|1. 執筆|章・場面、横・縦書き、検索、集中、customization、捕捉|AIなしで成立|
|2. 安全性|journal、atomic save、backup、日常履歴、節目、別案|Git UIなしで利用可能|
|3. 証拠・知識|stable anchor、claim、開示位置、正史候補、人間comment|AIなしでも有用|
|4. レンズ|情報境界、規則検査、AI provider、chat、所見、coverage|完全に無効化可能|
|5. 相互運用|TXT、Markdown、DOCX、投稿profile、project export|他toolを置換しない|

横断要件は、日本語IME・縦書き、privacy、accessibility、security、migration、OSS governanceである。

### 依存方向

- 原稿の回収はAI provider、cloud、特定サービスへ依存しない。SQLite/fileのどちらを正本にするかはGate Aで決める
- 執筆層はAI層へ依存しない
- 安全性層はGitの概念をUIへ要求しない
- 証拠・知識層は人間commentだけでも試験できる
- AIレンズは正本へ直接書かず、所見・候補・差分を経由する
- 相互運用は一方向exportだけでなく、損失reportを伴うcopy-importを持つ

この依存方向なら、AI providerが終了しても執筆でき、索引が壊れても再構築でき、Git remoteがなくても履歴を使え、サービスが終了しても本文を回収できる。人可読fileを唯一の正本にすることは、この利用者保証から自動的には導かれない。

## MVPの最終境界

### 検証用companion

- 既存原稿のcopyを読取る
- 初見読者・整合性の二レンズ
- 参照範囲、coverage、根拠jump
- 原稿変更なし

検証するものは「AIが賢いか」ではなく、根拠と情報境界が、一般チャットや既存講評より判断を速くするかである。

### 正本型MVP

- Gate Aがstandaloneまたは統合upstream経路を選んだ場合だけ着手
- Windows/macOS
- 章・場面、横・直接縦書き、検索、基本customization
- ローカル所有、公開仕様、lossless export、回復、backup、履歴、場面別案
- 自由note、最小label、正史・本文claim候補
- stable anchorを使う人間comment
- 初見読者、整合性候補、レンズ別chat
- 一cloud + 一local AI provider
- TXT/Markdown、DOCX copy-import/basic export、投稿profile一つ
- 捕捉受信箱

### MVP外

- realtime collaboration
- full mobile
- Linux公式support
- 高度な自動世界設定、map、timeline
- 人物知識・伏線の全自動推論
- 商用組版相当
- 任意code plugin marketplace
- 自動本文生成

## 残る未決事項

これらは文書不足ではなく、調査・試作なしには決めない意図的なgateである。

|未決事項|決める証拠|決定期限|
|---|---|---|
|companion / upstream / plugin / fork / new / stop|同じ利用task、長編・IME・anchor・recovery試験、maintainer対話|Phase 1 Gate A|
|editor基盤|縦書き、IME、1,000 annotation、accessibility benchmark|Phase 1 Gate A|
|正本表現|Markdown + sidecar / ID付きMarkdown / 構造化正本を、lossless round-trip・anchor・外部編集で比較|Phase 1 Gate A|
|履歴backend|native snapshot / Gitをexisting repo・cloud folder・external edit・partial restoreで比較|Phase 1 Gate A|
|運営目的とlicense|公共財/持続可能な製品、upstream、依存関係、contributor意向、法務監査|Phase 1 Gate A後|
|DOCX保証範囲|Word/LibreOffice/一太郎fixtureと編集者workflow|正本型MVP設計凍結前|
|直接縦書きの実現方式|Windows/macOS IME・caret・selection試験|Phase 1 Gate A|
|レンズの支払・継続価値|read-only companionと4週間の実作品利用|Phase 1 Gate A|
|AI provider初期組合せ|日本語品質、構造化出力、費用、privacy、local導入負担|Phase 6前|

## 最終判断

構想を一般的なAI小説生成サービスへ変える必要はない。ただし、後続の着手前審査により、中心思想の維持と新規エディタ着工は別の判断になった。

- **書く場所**としての最低品質を、AIより先に保証する
- **戻れる正本**を製品の信頼基盤にする
- **レンズ**をpersonaでなく、情報境界と根拠の契約にする
- **全稿理解**を誇張せず、coverageと古さを示す
- **乗り換え**を一度の移行でなく、読むだけ・並行利用・正本化に分ける
- **実装経路**を新規アプリに固定せず、upstream・plugin・停止を成功した判断として扱う

現時点では、既存のNola、Scrivener、一太郎、Word、Linetta、Obsidian等の横でread-only検証を行うことだけがGoである。根拠、知識境界、版追従がgeneric ChatGPTと現在手順を上回り、既存基盤では不可欠条件を満たせない場合に限って、新規の正本型エディタを再審査する。
