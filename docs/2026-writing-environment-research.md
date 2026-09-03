# 2026年 小説執筆環境リサーチ

調査基準日: 2026-08-30  
対象: 日本・海外の小説家向け執筆、構成、設定管理、校正、組版、共同レビュー、AI、OSS  
関連文書: [着手前Go / No-Go再審査](./pre-build-go-no-go-review.md) / [プロダクト提案](./product-proposal.md) / [構造再検討](./structure-review.md) / [出典台帳](./source-register.md)

## 結論

2026年に新しく作る価値がある可能性があるのは、単なる「Scrivener + Git + AI」ではない。この組み合わせの構成要素は、Linetta、Vela、OpenNovel、Novalist等の新興OSSと複数の商用製品が既に持っている。候補として残るのは、次の四つを一つの信頼モデルで成立させることだ。

1. 日本語小説を本気で書ける縦書き・横書き・ルビ・禁則・投稿形式対応
2. 原稿をローカルで所有し、公開仕様と損失のない出口を持ち、壊れにくく、過去や別案へ安心して戻れること
3. AIの指摘が必ず本文中の根拠へ結びつき、改稿後には「古くなった指摘」と判定できること
4. 「読者」「登場人物」「編集者」「整合性確認」を、単なる人格プロンプトではなく、見せてよい情報範囲と出力形式を含む役割として扱うこと

この組み合わせを、本報告では仮に「ローカルファーストの編集伴走型・小説制作環境」と呼ぶ。AI自動生成を中心にせず、作者が書いたものを、読んだ範囲と限界を明示した合成読者で読み返すための道具にする。ただし、これは発見済みの市場の穴ではなく、比較試用で棄却可能にすべき仮説である。現時点では統合エディタの本開発は推奨せず、read-only検証と既存OSSの採否判定だけを推奨する。

## 調査方法と証拠の扱い

### 調べたもの

- 製品公式サイト、ヘルプ、変更履歴、App Store、GitHub
- 2025～2026年を優先した作家のブログ、カクヨム近況ノート、コミュニティ投稿
- 執筆支援、長文生成、物語記憶に関する研究
- W3C、Git、SQLite、エディタ基盤などの一次技術資料

### 調査質問

製品名の機能比較だけで終わらないよう、次の順序で調べた。

1. 作家は執筆工程のどこで道具を切り替えるか
2. その切替は、好み、端末、共同作業、互換性、性能、信頼のどれが原因か
3. 既存製品が強い仕事は何で、置き換えるべきでない部分はどこか
4. AI講評、設定管理、履歴、縦書き、ローカル保存の各要素は、どこまで既に実装されているか
5. 複数の要素を同時に成立させた時だけ生じる、未充足の仕事は何か
6. 新製品へ正本を移すほどの価値と信頼を、どう段階的に証明できるか

### 比較軸

|軸|確認内容|
|---|---|
|書く|起動・入力の軽さ、長編性能、章・場面、集中、縦横、IME、ルビ|
|考える|自由記述、人物・場所・出来事、カード、時系列、本文との二重入力|
|見直す|検索、校正、読み上げ、コメント、根拠箇所への移動|
|変える|自動回復、履歴、比較、別案、選択的取込み|
|渡す|DOCX、TXT、Markdown、EPUB、PDF、投稿記法、共同レビュー|
|所有する|ローカル正本、公開形式、アカウント不要、サービス終了時の退出|
|AIを使う|参照範囲、引用根拠、改稿後の有効性、権限、provider選択、AIなしの成立|
|続ける|価格、署名済み配布、保守人数、migration、OSS governance|

### 表記

- **確認事実**: 公式資料、一次資料、リポジトリから直接確認できたこと
- **利用観察**: 個々の利用者の報告。実在する困りごとの証拠だが、普及率には一般化しない
- **判断**: 複数の証拠から導いた本提案の解釈
- **仮説**: ユーザー調査や試作で検証すべきこと

App Storeの評価数、GitHubのスター数、コミュニティ投稿数は採用の強い証明ではない。地域、ジャンル、商業・同人・Web小説、プロット型・発見型で行動が異なるため、本調査から市場シェアは推定していない。

## 市場を一枚で見る

|仕事|代表的な製品|使われる主な理由|残る摩擦|
|---|---|---|---|
|原稿と資料を一体管理|Nola、Scrivener、Dabble、LivingWriter、Novlr|章・場面、資料、目標、プレビューを一か所に置ける|機能やフォームが思考を支配する、長編性能、独自形式、出力時の摩擦|
|汎用執筆・共同編集|Word、Google Docs、一太郎|編集者との互換性、変更履歴、コメント、入稿形式|長編の構造管理が弱い、資料と本文が分離|
|軽量・集中執筆|iA Writer、Ulysses、TATEditor、NOVEWRITE、メモ帳系|速い、余計なUIがない、プレーンテキスト|設定・プロット・参照・共同レビューは別の道具になる|
|プロット・世界設定|Plottr、Aeon Timeline、Campfire、World Anvil、Obsidian|時系列、人物、場所、関係を可視化|二重入力、世界設定そのものが目的化、本文との同期切れ|
|校正・分析|一太郎、ProWritingAid、AutoCrit|表記、反復、構造、読みやすさを検査|誤検出、作品固有の意図を理解しない、AIの根拠と更新状態が曖昧|
|組版・出版|Vellum、Atticus、Reedsy Studio、Vivliostyle|EPUB、印刷PDF、書籍らしい体裁|執筆や構成の最適解とは別で、往復が損失を生む|
|AI支援|Sudowrite、Novelcrafter、ProWritingAid、各汎用LLM|質問、講評、設定参照、発想、書き直し|生成偏重への抵抗、プライバシー、費用、引用根拠、全編理解の信頼性|
|開発者型ワークフロー|VS Code、Markdown、Git、Obsidian|検索、拡張、差分、復元、AIの複数ファイル参照|Gitと設定の学習、縦書き・IME・ルビ・入稿が弱い|
|OSS小説環境|Linetta、novelWriter、Manuskript、Quoll Writer、Novalist、xnovelist、Vela、OpenNovel|所有権、ローカル、改造、長期可読性|日本語組版、配布署名、保守人数、洗練、同期・AI品質|

この表から分かるのは、「一製品がすべて下手」なのではなく、それぞれが異なる仕事をかなり上手く解いていることだ。新製品は既存機能を集めるだけでは、巨大で不安定な二番手になる。

### 直接競合を構想の核で比較する

記号は、○が公式資料で中核機能を確認、△が部分対応または別の形で対応、—が本調査で中核機能として確認できなかったことを表す。「—」は機能が世界のどこにも存在しないという意味ではない。

|製品|日本語縦書き実務|開いたローカル正本|履歴・別案|本文根拠付きAI|時点別の知識境界|AIなしで成立|OSS|
|---|---:|---:|---:|---:|---:|---:|---:|
|[Nola](https://apps.apple.com/jp/app/nola-%E5%B0%8F%E8%AA%AC%E3%82%92%E6%9B%B8%E3%81%8F%E4%BA%BA%E3%81%AE%E3%81%9F%E3%82%81%E3%81%AE%E5%9F%B7%E7%AD%86%E3%82%A8%E3%83%87%E3%82%A3%E3%82%BF%E3%83%84%E3%83%BC%E3%83%AB/id1468307521?platform=ipad)|△|△|△|△|—|○|—|
|[Scrivener](https://www.literatureandlatte.com/scrivener/overview)|—|△|△|—|—|○|—|
|[Sudowrite](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/feedback/7Ew1KgpEwabQSgvijq8QNr)|—|—|△|○|△|△|—|
|[Novelcrafter](https://www.novelcrafter.com/)|—|—|△|△|△|○|—|
|[ProWritingAid](https://help.prowritingaid.com/article/318-what-is-manuscript-analysis)|—|△|—|○|—|—|—|
|[Dabble](https://www.dabblewriter.com/docs/reference/whats-new-in-3)|—|—|○|△|—|○|—|
|[novelWriter](https://github.com/vkbo/novelWriter)|—|○|△|—|—|○|○|
|[Novalist](https://github.com/Drommedhar/novalist-official)|—|○|○|△|—|○|○|
|[Linetta](https://github.com/devlikebear/linetta)|—|△|○|△|—|○|○|
|[Obsidian + TsumugiMark](https://github.com/mofukuru/TsumugiMark)|△|○|△|—|—|○|○|
|[OpenNovel](https://github.com/Yaemikoreal/OpenNovel)|—|○|○|○|△|—|○|
|[Manuscript](https://github.com/DoktorDaveJoos/manuscript)|—|△|○|△|—|○|—|

この比較で特に重要なのは、○の数ではない。Linettaは本構想の一般機能へ非常に近く、OpenNovelは開いた原稿、Git、正史、安全柵、根拠付き批評を既に組み合わせ、TsumugiMarkは直接縦書きMarkdown編集を実装している。したがって差別化候補は、**日本語品質・退出可能性・版付き根拠・読了位置による知識境界を、一つの信頼モデルとして実作品で成立させること**まで狭まる。成熟製品の未発見は、利用者が乗り換える市場需要の証明ではない。

## 日本の実利用

### Nolaは「全部入り」の基準だが、全員が全部を使うわけではない

**確認事実。** Nolaはテーマ、プロット、本文、人物、世界観、相関、端末同期、縦書きプレビューを一つにまとめ、モバイルアプリではオフライン執筆も提供している。2026年にはWord・PDF・EPUB出力、履歴、AIフィードバックなども拡張されている。[App Storeの現行機能と更新履歴](https://apps.apple.com/jp/app/nola-%E5%B0%8F%E8%AA%AC%E3%82%92%E6%9B%B8%E3%81%8F%E4%BA%BA%E3%81%AE%E3%81%9F%E3%82%81%E3%81%AE%E5%9F%B7%E7%AD%86%E3%82%A8%E3%83%87%E3%82%A3%E3%82%BF%E3%83%84%E3%83%BC%E3%83%AB/id1468307521?platform=ipad)では4.5、7,791件の評価があり、[Google Play](https://play.google.com/store/apps/details?hl=ja&id=com.nola.app)では10万以上のダウンロードが表示される。これは日本語圏で無視できない利用規模の信号である。

**利用観察。**

- 2026年の利用者には、長年WordとGoogle Docsを使った後、句読点・ルビ・傍点・話単位管理を理由にNolaへ移った例がある。[利用記録](https://note.com/kouboguide/n/nd948cc0d745c)
- 一方、Nolaの詳細なプロット、テーマ、人物フォームをほぼ空欄にし、本文エディタとしてだけ使う人もいる。[2026年のコメント](https://kakuyomu.jp/works/2912051597161503199/episodes/2912051597175010160/comments)
- 100万字近いメモを抱える発見型の書き手は、設定の検索は欲しいが、詳細な人物カードやプロット欄を埋める行為自体が思考を中断すると述べる。[2026年の利用批評](https://note.com/lovely_slug9455/n/n1afdcf8beaf7)
- 60万字規模で初回読込に数分かかり、作品全体検索と確実な書き出し・バックアップを求める報告がある。[長編プロジェクトの報告](https://kakuyomu.jp/works/16817330663566077854/episodes/2912051599675202943/comments)
- スマートフォンで3万字ほどから変換やスクロールが重くなったという個別報告もある。ただし端末・作品構造に依存するため、製品全体の性能とは断定できない。[2026年の質問](https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q13326287723)

**判断。** 「設定管理を用意する」ことと「設定入力を強制する」ことは別である。最初は自由記述一枚でも使え、必要になった時だけ人物・場所・時系列へ構造化できる段階的開示が必要だ。

### 一太郎、Word、Google Docsは「最後に渡せること」で残る

**確認事実。** 一太郎2026は、縦書き、ルビ、傍点、約物、ダッシュや三点リーダー、ジャンル別校正、原稿用紙・公募・KDP・紙面向けレイアウト、PDFや電子書籍・投稿向け出力まで扱う。[一太郎2026の執筆機能](https://www.justsystems.com/jp/products/ichitaro/features/feature03.html)は、縦書きが単なる文字方向ではなく、日本語組版と入稿の集合であることを示す。

**利用観察。**

- 2026年の商業作家は、一太郎を変換・校正と本文執筆、Wordをプロットと出版社との交換に使い分ける。両者で異なる誤りが見つかり、出版社側はWordを要求すると述べる。[現役作家の道具記録](https://note.com/tender_eel304/n/nc25fd371be1a)
- 別の利用者はWordで下書きし、秀丸で推敲・文字数確認、iPhoneメモと音声入力で場面の断片を捕まえる。[2026年の実例](https://kakuyomu.jp/users/Tico_Ruzel/news/2912051605002529662)
- Mac利用者は一太郎を使えず、NolaのPDFでは禁則が不足すると感じ、LibreOfficeで公募原稿を作ると報告している。[2026年の個別報告](https://note.com/zx_cv_bn_m/n/n3bb339a19c9c)
- 集英社オレンジ文庫の公式作成手順は20字×20行の縦書きレイアウトとテキスト保存を案内する。[応募原稿作成マニュアル](https://orangebunko.shueisha.co.jp/novel-award/manual)

**判断。** DOCXを捨てるのは現実的でない。しかしDOCXを唯一の正本にすると、差分、安定した注釈、外部ツールとの往復が難しい。正本は開いたテキスト形式とし、DOCXは高品質な受け渡し境界にするのがよい。

### 軽量エディタは「書き始める摩擦の低さ」で選ばれる

**確認事実。**

- [TATEditor](https://tateditor.app/)は縦書き、ルビ、PDF、複数プラットフォームを持つ無料エディタで、古いデスクトップ版には正規表現、ツリー、履歴・バックアップ、縦中横や割注もある。[デスクトップ版機能](https://www.cc4966.net/)
- [NOVEWRITE](https://novewrite.tech/)は日本語小説向け入力と、カクヨム、小説家になろう、pixivなど複数投稿先へのルビ変換を提供する。投稿サイトごとの記法差が、独立した機能になるほど残っている。
- [Novel Airline](https://apps.apple.com/jp/app/novel-airline/id1499642698?platform=ipad)はiPhone・iPadで縦書きプレビュー、ルビ・傍点、プロット・登場人物・場所、履歴、TXT・ZIP・PDF出力を提供し、4.7、6,244件の評価がある。

**利用観察。** Novel Airlineのレビューには、縦書きをプレビューだけでなく直接編集したい、フォントを増やしてほしいという要望がある一方、実際の執筆はegwordを好むという声もある。[同App Storeレビュー](https://apps.apple.com/jp/app/novel-airline/id1499642698?platform=ipad)

**判断。** 書き手は機能の最大数ではなく、「開いてすぐ書ける」「手になじむ」「気分が乗る」を買っている。起動直後に設定DBやAIチャットを見せるべきではない。

### VS Code + Markdown + Git + AIは実在するが、対象はまだ技術寄り

**利用観察。**

- 2026年のカクヨム利用者は、設定・プロット・本文をMarkdownで置き、Gitの差分・復元とCodexの複数ファイル参照を使うワークフローを公開している。[2026年7月の実例](https://kakuyomu.jp/users/gramglan/news/2912051604453292437)
- 別の書き手は、Word、一太郎、Nola、Evernote、Google Docsを経て、オフライン、高速、大量テキスト、汎用ファイルを理由にVS Codeを選び、仕上げはWord・一太郎・InDesignへ渡す。弱点はモバイル、縦書き、最終紙面の確認だという。[執筆環境の記録](https://note.com/ide_shirura/n/n23780cdb0477)
- 2026年にも、VS Codeの拡張で十分だがセットアップは難しいため自作エディタを作ったという報告がある。[2026年の記録](https://kakuyomu.jp/users/baribori/news/822139842679778097)

**確認事実。** VS Code自身はステージング、コミット、ブランチ、競合、グラフ、タイムラインをGUI化しているが、概念はGitのままである。[VS Codeのソース管理](https://code.visualstudio.com/docs/sourcecontrol/overview)

**判断。** 技術者の実例は構想の実現可能性を示すが、一般作家の需要規模を示さない。移植すべきなのはコマンドや専門用語ではなく、「戻れる」「比較できる」「別案を安全に試せる」という結果である。

## 海外の実利用

### Scrivenerの価値はBinder、弱点は外へ出す瞬間

**確認事実。** Scrivenerは原稿を小さな単位へ分けるBinder、コルクボード、アウトライナー、分割表示、資料管理、柔軟なCompileを持つ。[公式概要](https://www.literatureandlatte.com/scrivener/overview)

**利用観察。**

- 2026年の利用者はBinderやコルクボードを日常の中心にする一方、同期で苦労している。[利用者スレッド](https://www.reddit.com/r/scrivener/comments/1us9dx4/what_scrivener_features_do_you_actually_use_and/)
- 整理の仕組みを作り込むことが義務や先延ばしになり、別の場所で下書きしてScrivenerへ戻す人もいる。[2026年のワークフロー](https://www.reddit.com/r/scrivener/comments/1vfbksy/what_does_your_actual_day_to_day_writing_workflow/)
- オフラインと構造管理にはScrivener、批評パートナーとの共有にはGoogle Docsへコピーするという併用がある。[2026年の比較](https://www.reddit.com/r/RomanceWriters/comments/1sovhoi/scrivener_or_google_docs/)
- 10年以上の利用者でもCompileを直感的でないとし、Binderは優秀だが編集者への受け渡しはWord、出版はVellumへ出すと述べる。[Compileへの不満](https://www.reddit.com/r/scrivener/comments/1l4i7ie/scrivener_compile_has_made_me_want_to_cry/)

**判断。** 章・場面ツリーは強い定番である。しかし「内部で完結する万能組版」より、Word、Webレビュー、EPUB組版へ予測可能に出せることの方がMVPでは重要だ。

### クラウド共同執筆は便利だが、同期と履歴は高リスク

**確認事実。**

- Dabble 3は2026年7月に全面刷新され、共同作者・編集者・レビュー担当・読者の権限、変更追跡、コメント、Review Copy、Version History、Quick Open、読み上げなどを提供する。[リリースノート](https://www.dabblewriter.com/docs/reference/release-notes) [Dabble 3の機能](https://www.dabblewriter.com/docs/reference/whats-new-in-3)
- Review Copyは本体から隔離した版へBeta Reader等を招き、変更を選択的に戻せる。Time Machineは全体復元に加え、一文書だけ現在へ持ち戻せる。[Dabble 3の機能](https://www.dabblewriter.com/docs/reference/whats-new-in-3)
- 同じリリースノートには、入力が黙って破棄される、同期、巨大作品、マージに関する多数の修正が並ぶ。[Dabbleの変更履歴](https://www.dabblewriter.com/docs/reference/release-notes)
- Reedsy Studioはブラウザ、クラウド同期、共同編集、変更追跡、コメント、自動組版を提供するが、ダウンロード型・オフライン版はない。[公式執筆機能](https://reedsy.com/studio/write-a-book/) [オフラインに関するFAQ](https://reedsy.com/faq/studio-app/about-reedsy-studio/find-studio-app)
- Google Docsは変更履歴と提案モードを持ち、Wordは共同編集と変更履歴を持つ。[Docsの版履歴](https://support.google.com/docs/answer/190843?hl=en_) [Docsの提案](https://support.google.com/docs/answer/6033474?hl=en-4) [Wordの共同作業](https://support.microsoft.com/en-US/Word/training/collaborate-in-word)

**利用観察。** Reedsy利用者には、更新でノートが有料領域へ移ったことや停止に怒る例、複製や再取り込みで構成情報を失うことを不安視する例がある。[更新への反応](https://www.reddit.com/r/writing/comments/1jjg4rq/reedsy_just_pissed_me_off_they_randomly_updated/) [退避性への質問](https://www.reddit.com/r/writing/comments/1q3zxq8/is-there-any_reason_not_to_use_reedsy_for_novel/)

**判断。** リアルタイム共同編集は目立つが、データ損失、競合、権限、履歴の組合せは製品の信頼を一度で壊す。MVPから外し、まず孤立したレビュー用コピーと差分取込みを設計するべきだ。

### 集中エディタ、ノート、世界設定は別の長所を持つ

**確認事実。**

- [iA Writer](https://ia.net/writer/)はプレーンテキスト、フォーカス、構文強調、Wikiリンク、Content Block、書き出しを中心にする。
- [Ulysses](https://ulysses.app/)はApple環境でMarkdown、目標、公開、同期を磨いている。
- [Obsidian](https://obsidian.md/help/sync-notes)はローカルVaultを正本にし、[Canvas](https://obsidian.md/help/Plugins/Canvas)でノートを空間配置できる。
- [Plottr](https://plottr.com/features/)はカードとプロット線の視覚的タイムライン、人物・場所・シリーズ管理、30以上のテンプレートを提供し、2026年時点でAIを使わない方針も明示する。
- [Aeon Timeline](https://www.aeontimeline.com/guides/sync-with-scrivener)は物語の出来事と人物・場所・関係を時間上で扱い、Scrivener同期を提供する。
- [Campfire](https://campfirewriting.com/write)と[World Anvil](https://www.worldanvil.com/learn/workflows/writer-workflow)は本文より広い世界設定を扱う。

**利用観察。**

- AeonとScrivenerの同期でメタデータが消えることを恐れ、初期同期後は切り離した利用者がいる。[同期を止めた例](https://www.reddit.com/r/scrivener/comments/1j7my0d/scrivener_aeon_timeline/)
- World Anvil利用者には、世界設定を続けすぎていつ本文を書き始めるべきか迷う例がある。[2025年の相談](https://www.reddit.com/r/WorldAnvil/comments/1oe1m5t/when_do_i_start_to_write_my_book/)
- 2026年のEllipsus利用者は、外出と共同作業にEllipsus、主執筆とノートにScrivener、退避にObsidianを使い、Ellipsusにはオフラインとネイティブアプリを求める。[併用例](https://www.reddit.com/r/AO3/comments/1vkzywy/ellipsus_software_how_did_i_not_know_about_this/)

**判断。** 視覚化は有用だが、別ツールにすると本文と二重管理になる。同じ場面・人物データからアウトライン、カード、タイムラインを投影し、ビューのために再入力させないことが重要である。

### 組版ツールは執筆ツールの競合ではなく、出口である

**確認事実。**

- [Atticus](https://www.atticus.io/quick-start-guide/)はEPUB・PDF・DOCX・JSONバックアップを扱うが、DOCXの往復では基本的な本文以外の情報が落ちうる。[サポート](https://www.atticus.io/support/)は外部からの貼付けが破損、クラッシュ、恒久的損失につながり得るとも警告する。
- [Vellum](https://vellum.pub/specs/)はMac専用で、検証済みEPUB、印刷PDF/X、アクセシビリティを重視する。
- [Vivliostyle](https://github.com/vivliostyle/vivliostyle.js/)はHTML/CSSのページ組版を行う活発なAGPL OSSで、縦書きのプレビュー・書き出し基盤候補になる。

**判断。** 最初からVellumや一太郎の全組版機能を再現するのは誤りである。「本文と意味情報を失わず外へ出す」「戻しても壊れない」ことを先に解く。

## AI小説ツールの現在地

### ユーザー案と直接重なる機能はすでにある

**確認事実。**

- SudowriteのFeedbackは本文とStory Bibleを読み、場面・章・全編に対して、発達編集、行編集、対話、コピー編集や複数の仮想読者の注釈を本文余白へ結びつける。Chatはプロジェクト、Story Bible、文書、シリーズを参照し、許可すれば編集も行う。[Feedback](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/feedback/7Ew1KgpEwabQSgvijq8QNr) [Chat](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/chat/5vbuELXf6LZQnGfVzsEXCV)
- NovelcrafterはCodexで人物・場所・設定を自動リンクし、複数作品、共同作業、カスタムプロンプトを扱う。OpenAI、Claude、Gemini、Mistral、OpenRouter、Ollama、LM Studioなどの選択肢があり、AIを必須にしていない。[公式概要](https://www.novelcrafter.com/)
- ProWritingAidのManuscript Analysisは6,000～300,000語を対象に、筋、人物、舞台、テーマ、穴や不整合を分析し、具体的箇所へ移動できる。[公式ヘルプ](https://help.prowritingaid.com/article/318-what-is-manuscript-analysis)
- AutoCritにも全稿を対象とするStory Analyzerがある。[公式ヘルプ](https://help.autocrit.com/en/articles/12333513-what-is-the-story-analyzer-plus)

**判断。** 「作品を理解するチャット」「本文の箇所を指す」「役割別に講評する」だけでは差別化にならない。差は、指摘の根拠、どこまで読ませたか、改稿後の有効性、作者が宣言した設定とAI推測の区別、ローカル所有に置くべきだ。

### AIへの態度は二極ではなく、工程ごとに異なる

**確認事実。**

- BookBubが1,200人超の著者へ行った調査では、45%がAIを現在利用し、48%は利用しておらず今後も使わない、7%は未定だった。利用者では調査用途が81%で最も多く、非利用者では84%が倫理を懸念した。この標本はBookBubに接続するインディー・ジャンル作家へ偏る。[BookBub調査](https://insights.bookbub.com/how-authors-are-thinking-about-ai-survey/)
- Cambridgeの調査は、出版経験のある小説家258人を含む関係者を対象とし、著作権、収入、独創性への懸念を記録した。[調査報告PDF](https://api.repository.cam.ac.uk/server/api/core/bitstreams/afd278e0-bf2c-4720-b747-eccb5c26b063/content)
- Authors Guildは2026年のベストプラクティスで、生成文を自作として提示すること、存命作家の作風模倣、契約や開示を論点にしている。[Authors Guildの指針](https://authorsguild.org/resource/ai-best-practices-for-authors/)
- 301人の職業作家と36人の対話調査では、多言語、誤情報、専門領域、文体、使い勝手の課題が報告された。[2025年研究](https://arxiv.org/abs/2504.05008)

**判断。** AIを一つのON/OFFにまとめてはいけない。「読むだけ」「整理案」「書換え案」「新規文章生成」「自動適用」を別権限にする。AIなしでも製品の主要価値が成立し、AI機能を完全に隠せる必要がある。

### 長編理解には「どの時点で誰が何を知るか」が必要

**研究上の確認事実。** 2026年のNarrative World Models研究は、長編の質問が単なる固有名詞検索では足りず、出来事が起きた時点と読者へ開示された時点、秘密を知る人物、伏線と回収、関係変化を扱う必要があると論じる。物語論に基づく時間状態グラフと混合検索が、一般的な時間知識グラフやGraphRAGより良い結果を報告する。これはプレプリントであり、製品での再現性は未検証である。[NWM論文](https://arxiv.org/abs/2607.05577)

**判断。** 新しい製品の核心は「巨大なStory Bible」ではなく、少なくとも次の真実を分けるデータモデルである。

1. 作者が明示した正史
2. 本文で実際に述べられた事実
3. 登場人物が信じていること
4. その章までに読者が知り得ること
5. 作者が意図的に未確定・矛盾・誤認として残したこと

AIが本文から抽出した事実は正史へ自動登録せず、「候補受信箱」へ置くべきである。

## OSSと近接競合

### 成熟したOSS

- **novelWriter**: GPLv3、PyQt6、人が読めるテキスト、バージョン管理や同期に向く構成を持ち、2026年にも活発に更新されている。[GitHub](https://github.com/vkbo/novelWriter) [2026年リリース](https://github.com/vkbo/novelWriter/releases)
- **Manuskript**: GPLv3で、アウトライン、人物、Snowflake方式を持つ。[GitHub](https://github.com/olivierkes/manuskript)
- **Quoll Writer**: Apache 2.0、Java、集中モード、問題検出、目標、暗号化、監査、版管理を掲げる。[公式サイト](https://quollwriter.com/)

novelWriterではmacOS配布に必要な署名、ハードウェア、維持費と担当者不足が議論されている。[macOS配布の議論](https://github.com/vkbo/novelWriter/discussions/2618) これはOSSでコードを書くことと、一般作家が安心して導入できる署名済みバイナリを継続提供することが別の仕事だと示す。

### 構想に近い新興OSS

- **Linetta**: AGPL-3.0-only、Tauri 2・React・Go・SQLite。場面編集、アウトライン、人物・場所・関係・資料、版スナップショット、日次バックアップ、Markdown入出力、任意Git同期、任意AIを持つ。AI変更は提案→確認→適用で、AIなし・アカウントなしでも成立する。日本語UI、署名済みmacOS版、Windows/Linux配布もある。[GitHub](https://github.com/devlikebear/linetta) [変更履歴](https://github.com/devlikebear/linetta/blob/main/CHANGELOG.md) 公開資料上の正本は`library.db`で、直接縦書きと版追従アンカーは確認できない。2026年8月時点では非常に新しく、GitHub上の利用規模も小さいため、機能の存在を成熟度や需要へ一般化しない。
- **TsumugiMark**: MITのObsidian plugin。Markdownを専用paneで直接縦書き編集し、ルビ記法、タイプライターモード、往復保存、外部変更検知、表示設定を持つ。[GitHub](https://github.com/mofukuru/TsumugiMark) β版で重要ファイルのcopyを推奨しており、禁則・注釈・全IME edge caseを含む製品品質の証明ではない。一方、縦書きと開いたMarkdownを既存生態系へ足す経路を比較対象から外せなくなった。
- **Novalist**: MIT、Electron・React・.NET 8。ローカルのプロジェクトフォルダ、本文・世界・プロット・時系列・地図・出力・Git・拡張・AIを掲げる。READMEには継続保守を保証しない旨もある。[GitHub](https://github.com/Drommedhar/novalist-official) [マニュアル](https://github.com/Drommedhar/novalist-official/blob/main/docs/manual/README.md)
- **xnovelist**: 2026年の小規模プロジェクト。ブラウザ内IndexedDB、Bible、スナップショットと差分、DOCX、複数プロバイダを持ち、AIを0から5の段階に分ける。[GitHub](https://github.com/giapnguyen74/xnovelist) [AIレベル](https://github.com/giapnguyen74/xnovelist/blob/main/docs/AI_LEVELS.md) ただし小規模で、README内のライセンス記述にも曖昧さが残る。
- **Vela**: GPL-3.0、Electron・React・SQLite。ローカル／BYOKの複数モデル、RAG、MCP、IDE風panel、生成・書換え・レビューを持つ。[GitHub](https://github.com/heider-x/vela) 中国語Web小説と生成workflow寄りで、本構想の非生成中心、日本語縦書き、版付き所見とは異なるが、「ローカルAI小説IDE」というカテゴリは既に混雑している。
- **OpenNovel**: Markdownを人間向け層、YAML/SQLiteを機械向け層として分け、Git、semantic layer、正史、安全柵、根拠付きcritic、提案・承認、snapshot・diff・rollback、MCPを組み合わせる。[GitHub](https://github.com/Yaemikoreal/OpenNovel) 自動生成と評価pipelineが中心で対象は異なるが、open canonical、machine shadow、Git、anchored feedbackの着想は独自性にならない。
- **Novel Studio AI**: 受理済み章だけが正史・人物状態・関係・記憶を更新し、draftをcanonへ混ぜないlocal-first workbenchである。[GitHub](https://github.com/YfengJ/novel-studio-ai) 生成中心だが、「承認前候補」と「正史」を分ける設計も既に複数実装がある。
- **NovelForge**: Electron・React・SQLite・LanceDBによるローカル優先AI執筆IDEを掲げるが、生成寄りで小規模である。[GitHub](https://github.com/LunaRime/novelforge)
- **StoryWeave**: 章の進行に応じて見えてよい情報を変える、ローカル優先の物語知識グラフを試す小規模プロジェクトである。[GitHub](https://github.com/Shashank-ssls/StoryWeave)

**判断。** 2026年には「ローカル + Git + AI + Story Bible」だけでなく、「提案→確認→適用」「draftとcanonの分離」「根拠付きcritic」も着想として希少ではない。個人がAI支援で類似機能を短期間に作れるため、機能数は防御力にならない。勝負になるのは次である。

- データを失わない実績
- 日本語IMEと縦書きの品質
- AIの根拠と情報境界
- 長編での性能
- 交換可能な公開形式
- 署名済み配布、移行、文書、コミュニティ運営を含む信頼
- 日本語の実作品で公開できる評価fixtureと失敗率

## なぜ複数ツールを併用するのか

複数の実例を、道具名ではなく仕事で整理すると一貫性がある。

|切替の理由|典型的な流れ|まだ解けていない問題|
|---|---|---|
|移動中の捕捉|スマホメモ・音声 → PC本文|断片の所在、重複、取り込み忘れ|
|長編構造|Scrivener/Nola → Docs/Word|レビュー時に構造・注釈が落ちる|
|日本語校正|Nola/VS Code → 一太郎|往復で変更を照合しにくい|
|共同レビュー|ローカル本文 → Google Docs/Ellipsus|どの指摘をどの版へ戻したか曖昧|
|世界設定|本文 → Obsidian/Plottr/Aeon|二重入力と同期破損|
|出版|本文 → Word/Vellum/Atticus|書式変換、ルビ、改ページの損失|
|安全性|クラウド → ローカルコピー/Obsidian|正本がどれか分からなくなる|
|見え方の変更|横書き執筆 → 縦書き・別フォント・スマホ幅|同じUIでは見落とす誤りがある|

2026年の日本の利用者にも、Nola、Google Docs、Scrivenerを端末と目的で使い分け、画面幅を変えて確認する例がある。[実例](https://kakuyomu.jp/users/Imomushi2/news/2912051604732140235) Nolaで書き、ローカルのメモ帳へ退避し、投稿先用ルビに貼り戻す例もある。[実例](https://kakuyomu.jp/users/mashirooo/news/2912051602313297231)

**判断。** 「一つのアプリですべてを囲う」ことを目標にすると失敗する。正しい目標は、作者の正本を一つにし、他の優れた道具へ損失なく出入りできることだ。

## 横断的な未解決課題

### 1. 整理機能が創作を助ける時と、儀式になる時がある

115のツール、67本の研究、アンケート、RedditをまとめたCHI 2025の研究は、執筆が非線形で好みが個人的であり、事前構想と視覚化は有用だが、ツールが創造活動を支配してはいけないとする。[論文](https://arxiv.org/abs/2502.13320) [著者PDF](https://zixin.ca/data/pdf/chi25-78.pdf)

必要なのは固定テンプレートではなく、本文から少しずつ構造を育てられる自由度である。

### 2. 「履歴」と「物語の別案」は違う

Gitの差分は基本的に行単位で、単語差分も既定では空白を境界にする。[git diff](https://git-scm.com/docs/git-diff.html) 空白を単語境界にしない日本語小説へそのまま見せると読みにくい。Gitはカスタムdiff driverやword regexを設定できるが、製品側で文・句・段落・書記素クラスタを意識した表示が必要である。[gitattributes](https://git-scm.com/docs/gitattributes)

また、クラッシュ直前の救済は「コミット」ではない。次の三層を分ける必要がある。

1. 入力を失わない自動保存・追記ジャーナル
2. 日付で戻れる日常履歴
3. 作者が名付ける節目と別案

Gitは2と3の内部エンジンになれるが、1の代わりにはならない。

### 3. 縦書きはCSSの一行ではない

W3Cの日本語組版要件は、ページ、行組版、禁則、欧文混在、縦中横、ルビ、圏点、割注などを扱う。[JLReq](https://www.w3.org/TR/jlreq/?lang=en) CSS Writing Modesは文字方向の基盤を提供するが、エディタのIME、キャレット、範囲選択、ポップアップ、注釈位置まで保証しない。[CSS Writing Modes](https://www.w3.org/TR/css-writing-modes-3/) Tiptapでは2026年にも縦書きでメニューや装飾の挙動を個別検証する必要が議論され、過去には日本語IMEの不具合報告もある。[縦書きの議論](https://github.com/ueberdosis/tiptap/discussions/7750) [IMEのissue](https://github.com/ueberdosis/tiptap/issues/5416)

**判断。** 縦書きは後から足すテーマではなく、採用するエディタ基盤を決める最初の技術ゲートである。

### 4. AI指摘は「座標」ではなく「証拠」として保存すべき

W3C Web Annotationは、文字オフセットだけでなく、引用そのものと前後文脈を併用するTextQuoteSelector、TextPositionSelectorを定義する。[Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) 編集中はエディタのトランザクションで範囲を追従できるが、外部編集や大幅改稿では再付着できない場合がある。[CodeMirrorのDecoration例](https://codemirror.net/examples/decoration/)

**判断。** AI所見は、文書UUID、ブロックUUID、版ハッシュ、開始・終了位置、正確な引用、前後文脈を持つ。再付着に確信がなければ勝手に別箇所へ移さず、「古い」「曖昧」と表示する。

### 5. AIは「編集者」ではなく、限界を表示する合成読者である

[ACL 2025の創作フィードバック評価](https://aclanthology.org/2025.acl-long.1254/)は、意図的な問題を入れた1,300作品で、モデルが具体的で概ね正確な所見を出す一方、最大の問題を見落とし、批判と肯定を使い分ける判断を誤ることが多いと報告する。

日本語についても楽観できない。[LREC 2026のショートショート理解評価](https://aclanthology.org/2026.lrec-1.159/)では、8人の日本語母語話者を基準に複数LLMを比較し、全体では人間を下回り、皮肉、含意、感情の反転に難しさがあった。

作品の良さをLLMに採点させる方法にも限界がある。[LitBench](https://aclanthology.org/2026.eacl-long.362/)では最良の汎用judgeでも人間の選好との一致は73%で、専用モデルでも78%だった。[Style over Story](https://aclanthology.org/2026.findings-acl.1361/)では、六つのLLMが出来事・人物・設定より文体を一貫して優先し、内容面ではモデル間差も大きかった。

**判断。** 「AIが作品を理解する」「弱点を見つける」という包括的な約束はできない。製品が保証できるのは、読ませた範囲、除外した範囲、根拠、版、モデル、失効状態である。所見は仮説として比較し、単一品質score、「問題なし」、人間編集者の代替を提供しない。評価はgeneric condition、異なるモデル、人間読者とのmasked comparisonを含め、見た目やinteractionからconditionを推測できる限界を報告する。

### 6. ローカル優先はオフライン機能ではなく、退出可能性である

ローカル優先を名乗るだけでは足りない。確認項目は次である。

- アカウントなしで作成・検索・履歴・出力が使える
- 人が読めるUTF-8の本文がアプリ外から読める
- インデックスやAI派生情報を消しても再構築できる
- サービス終了時に作品、構造、注釈、履歴を回収できる
- AIを無効にした時にネットワーク送信がない
- 同期先をGitHub一社へ固定しない

SQLite FTS5は全文検索を提供し、trigram tokenizerは一般Unicodeの部分文字列検索に使える。[SQLite FTS5](https://www.sqlite.org/fts5.html) ベクトル検索は後から足せるが、sqlite-vecは2026年時点でもalphaであるため、MVPの正本や唯一の検索へ依存させるべきでない。[sqlite-vec](https://github.com/asg017/sqlite-vec)

ただし「退出可能」と「人可読ファイルが唯一の正本」は同義ではない。Markdown + sidecarは外部編集でID対応が壊れやすく、構造化正本は安定IDを持ちやすい。固定すべきなのは、ローカル所有、公開仕様、損失のない完全export、再構築可能な派生データ、試験済みrestoreである。正本の物理形式は比較試作で決める。

## 構想への厳しい評価

### 残すべき核

- 作者が書くことを中心にする
- AIとの会話を本文と直接つなぐ
- 複数の読み方を切り替える
- Gitの恩恵を専門用語なしで提供する
- 縦書き・横書きの双方を一級機能にする
- カスタマイズ可能でOSS、ローカル所有を基本にする

### そのままでは弱い、または危険な点

|元の発想|評価|改善|
|---|---|---|
|AIが作品を理解する|「理解」は検証不能で過大な約束|読んだ範囲、参照した設定、引用根拠、モデル、版を表示する|
|役割ごとのチャット|人格プロンプトだけなら簡単に模倣される|情報アクセス規則と出力schemaを持つ「レンズ」にする|
|Git/GitHub|GitHub必須はローカル優先と矛盾し、Git概念は重い。Gitが最適な内部storeとも限らない|復元・日常履歴・節目・別案・比較の契約を先に定義し、native snapshotとGit backendを比較する。remoteは任意|
|設定矛盾チェック|小説には嘘、誤解、伏線、意図的矛盾がある|断定ではなく仮説、二つ以上の証拠、確信度、意図的扱いを持つ|
|AIによる設定抽出|誤抽出が正史を汚染する|候補受信箱に置き、人が承認して初めて正史になる|
|AIが本文を直接修正|声を失い、誤修正と責任境界が見えない|差分案を提示し、明示承認、適用前に節目を作る|
|全部入り|既存ツールと同じ肥大化を招く|書く・見直す・設計するの三つの作業面と段階的開示|
|リアルタイム共同編集|信頼性コストが極めて高い|まず隔離レビュー版と差分取込み|
|縦書き|表示だけでは不十分|編集、IME、選択、ルビ、注釈、禁則、印刷確認を品質ゲート化|

## 市場の穴

### 確認できたこと

- SudowriteとProWritingAidは根拠箇所に近いAI講評を持つ。
- Novelcrafterは複数AIプロバイダとローカルモデルを選べる。
- DabbleとEllipsusは履歴・レビューを強くしている。
- Linetta、Novalist、xnovelist、Velaはローカル・履歴・AIへ近い。
- OpenNovelは開いた原稿、Git、正史、安全柵、根拠付き批評を既に組み合わせる。
- TsumugiMarkはObsidian上でMarkdownの直接縦書き編集を実装する。
- Nolaと一太郎は日本語執筆・出力を強くしている。

### 本調査からの推論

主要製品と確認できたOSSの範囲では、次を同時に満たし、実作品での成熟度を確認できる製品は見つからなかった。

1. 日本語の直接編集可能な縦書きと投稿・入稿実務
2. ローカル所有、公開仕様、損失のない出口と、専門語を隠した堅牢な版管理
3. 原稿の版に結びつく、再付着可能で古さを判定するAI所見
4. 章時点の読者知識、人物知識、作者正史を分ける情報境界
5. AIを完全に外しても一級の執筆環境として成立

これは本提案の**市場の穴の候補**である。「世界に一つもない」という主張ではなく、「この五条件なら乗り換える人がいる」と確認したわけでもない。Linettaのような近接製品が急速に現れたため、機能差ではなく、対象ユーザーへの比較試用、同一modelのgeneric conditionとのlabel-masked比較、4週間の並行利用で価値を検証する必要がある。

### 証拠から製品判断への追跡

|観察された事実|導ける判断|まだ導けないこと|
|---|---|---|
|作家は執筆、校正、共有、出版で道具を切り替える|万能化より、正本と損失の少ない出入口を優先する|一製品へ完全統合すれば必ず乗り換える、とは言えない|
|詳細な設定フォームを使わない例が複数ある|自由記述から段階的に構造化する|構造化機能が不要、とは言えない|
|Gitを使う作家の実例があるが設定負担も報告される|履歴の結果だけを日常語で提供し、Gitは候補backendまたはexpert modeにする|一般作家のbranch需要と、Git採用自体の必要性は未確認|
|AI講評と本文ジャンプは既存製品にある|引用ジャンプだけを差別化にしない|版追従・知識境界に支払意思があるかは未確認|
|Linetta等が近接機能を既に実装する|新規コアを既定にせず、upstream・plugin・companionを先に比較する|公開機能だけで成熟度や継続利用は判断できない|
|AIへの態度は利用工程で分かれる|読む、書換え案、生成、適用を別権限にする|AI拒否層がAI任意製品を受容するとは限らない|
|縦書きはIME・禁則・ルビ等を含む|最初の技術gateにする|直接縦書きが全対象者の必須条件かは未確認|
|同期・共同編集の障害は信頼を損ねる|realtime collaborationをMVPから外す|将来も需要が小さい、とは言えない|

## 優先すべき利用者

最初の対象を「すべての小説家」にしない。

**推奨する初期対象**

- 日本語で5万～100万字級の作品を書く
- 章や場面を入れ替え、設定や伏線を長期管理する
- Nola、Scrivener、Word、Google Docs、Obsidian、VS Codeのうち二つ以上を併用している
- AIに本文を書かせることには慎重だが、読者・編集・整合性確認には関心がある
- ローカル保存、退避、履歴を重視する

**初期対象にしない**

- スマートフォンだけで短編を投稿する人
- AIによる大量自動生成を第一目的にする人
- 共同脚本・多人同時編集が必須のチーム
- 最終DTP・商業組版だけを求める人

この絞り込みは市場の否定ではなく、データモデルと信頼性を固める順序である。

ただし、この条件の共通部分は狭い。日本語長編、desktop中心、複数ツールの摩擦、AIへ慎重だが講評には関心、ローカル・OSS重視を同時に満たす人数と支払・寄付意思は未調査である。公共財として小さく続けるのか、持続可能な製品を目指すのかも、機能開発前に分けて判断する。

## 未確実性と次に検証すべきこと

1. 日本語作家が「根拠付きAI講評」に継続して費用を払うか。OSSのため、有料化よりも利用継続と自前API利用をまず測る。
2. 直接編集可能な縦書きが必須なのか、横書き編集＋高品質縦書き校正画面で十分な層がどれだけいるか。ユーザーの希望を尊重しつつ、技術試作で入力品質を先に確かめる。
3. 人が読める本文形式で、空白、字下げ、ルビ、傍点、改ページ、コメントをどこまで損失なく表せるか。
4. 一般作家が別案機能を本当に使うか。「ブランチ」という説明をせず、行動観察する。
5. AIの誤検出を「役に立つ仮説」と感じる閾値。設定矛盾は正解率だけでなく、根拠の妥当性、見逃し、作者が却下する時間を測る。
6. WindowsとmacOSの日本語IME、縦書き、アクセシビリティを同じWebView基盤で十分に安定させられるか。
7. Linettaへの貢献、Obsidian + TsumugiMark拡張、novelWriter連携、独立companionのどれが、同じ価値を最小の保守責任で提供できるか。
8. Markdown + sidecar、ID付きMarkdown、構造化正本 + lossless exportのどれが、退出性とstable anchorを最も安全に両立するか。
9. native snapshotとGit backendのどちらが、既存Git、cloud sync、外部編集、部分復元を作家へ露出せず扱えるか。
10. 公共財型OSSと持続可能な製品のどちらを目指し、署名・更新・復旧を二人以上で維持できるか。

次の判断は[着手前Go / No-Go再審査](./pre-build-go-no-go-review.md)にまとめた。統合エディタを着工せず、Gate Aでcompanion、upstream、plugin、新規コア、停止を比較する。当初の6～8週仮置きは、実行issueへ展開後に標準10～12暦週へ改訂した。[Gate A backlog](./gate-a-backlog.md)
