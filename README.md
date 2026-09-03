# KOHON

**Your manuscript belongs to you.**<br>
**Local-first. Markdown-native. Writing first.**<br>
**AI reads; it does not take over.**<br>
**Every AI finding can return to evidence in the manuscript.**

KOHONは、作者自身が書く時間を中心に置いた、日本語小説のためのオープンソース・デスクトップエディタです。本文の正本は利用者が選んだフォルダーのUTF-8 Markdown。AIが本文を勝手に書き換えることはなく、作者が確認した範囲だけを読み、引用できる根拠とともに見直しの材料を返します。

Windows、macOS、Linuxに対応し、アカウントやAI接続がなくても執筆・検索・履歴・書き出しを利用できます。テレメトリはありません。

## KOHONが守ること

- 原稿、メモ、履歴は作者のローカルファイルです。
- `manuscript/*.md`が本文の正本で、アプリがなくても読めます。
- 自動保存、復旧稿、保存点、復元前の安全な保存点で、書いた内容を戻せます。
- AIへ送る章と読了位置は毎回作者が確認します。
- AI所見は原稿へ自動適用されません。解決・無視・再確認も作者が決めます。
- 旧Novel Lens作品の`novel-lens.json`をそのまま開けます。強制改名や破壊的移行はしません。

## 毎日の執筆に必要な機能

- 複数の本文タブ、左右／上下の2分割、タブ移動、前回のタブ・caret・scroll復元
- 横書き／直接縦書き、本文テーマ、フォント、文字サイズ、行間、本文幅
- 章・場面のdrag & drop、分割、結合、任意の概要・POV・人物・場所・時系列・状態・tag
- 現在の章の検索・置換、作品全体の検索・置換preview
- Quick Open、Command Palette、変更可能なキーボードショートカット
- VS Code型の自由なパネル配置。各ビューを任意のパネルの上下左右へ分割、中央へタブ統合、入れ子配置、境界リサイズ、再起動後の復元、集中モード
- 章へpinできる人物・場所・世界観・plot・資料などのMarkdownメモ
- 名前付き保存点、現在との差分、保存点どうしの差分、章単位／作品全体の安全な復元、別案folder
- ルビ、傍点、縦中横、鉤括弧、全角字下げ、句読点整形などの明示的な日本語入力補助
- Markdown／TXT書き出し

作品全体の置換前には自動で保存点を作ります。日本語入力補助はMarkdown互換の明示的な記法だけを挿入し、IME入力を自動で横取りしません。

## Evidence-linked AI Lens

初見読者、編集者、批評家、整合性確認、設定確認の5つの視点があります。`現在の章`、`現在の章まで`、`全章`から範囲を選び、「第8章まで読んだ読者」のように未来の章を見せない読了境界を保てます。

AI所見はReview Ledgerへ保存され、role、provider/model、対象version、章、完全一致引用、anchor、作成時刻、状態を持ちます。根拠が変更された所見は、別の文章へ勝手に付け直さず`stale`として再確認を求めます。

接続方法は次の3つです。

- Offline Mock: ネット接続なしで画面と流れを確認
- ChatGPTでCodexへログイン: 公式Codex App Serverのbrowser flowを使用し、subscription側のCodex accessを利用
- OpenAI API key: 利用者自身のOpenAI Platform組織でusage-based accessを利用

ChatGPT sign-inとAPI keyでは適用される契約・利用枠・data controlsが異なります。KOHONはこの2経路を混ぜません。詳細は[OpenAIの公式Authentication documentation](https://learn.chatgpt.com/docs/auth)を確認してください。

API keyは接続確認後にOSの保護機能で暗号化して保存し、安全な保存先がない場合は起動中memoryだけに置きます。GitHub接続は公式GitHub CLIのbrowser flowを使い、KOHONはtoken値を読みません。AI会話とraw responseは作品folderへ保存しません。

## インストール

[GitHub Releases](https://github.com/Hum1Tab/kohon/releases/latest)からOSとCPUに合う最新版のKOHONを取得します。

- Windows x64: setup `.exe` またはportable `.exe`
- macOS: Intel / Apple Silicon用 `.dmg` または `.zip`
- Linux x64: `.AppImage` または `.deb`

checksum、署名状態、OS別の注意は[インストール案内](./docs/INSTALL.md)を参照してください。

### 作品を開く

1. 「新しい作品を作る」で作品名と保存場所を指定します。新規作品には`kohon.json`を作成します。
2. 旧Novel Lens作品は「作品フォルダーを開く」から既存の`novel-lens.json`を選択します。

本文はどちらも作品folderの`manuscript/*.md`です。

## データ形式

```text
my-novel/
├─ kohon.json              # 作品名、章順、作品固有設定
├─ manuscript/
│  ├─ chapter-....md       # 本文の正本
│  └─ chapter-....md
├─ notes/
│  ├─ index.json
│  └─ note-....md          # 作者所有のメモ
└─ .novel-editor/          # schema 1互換のsession・復旧稿・保存点・Review Ledger
```

`.novel-editor`は旧作品との履歴互換性を守るため、KOHONでも同じ場所を使います。アプリ更新やuninstallで作品folderは削除されません。

## 開発

必要環境はNode.js 24.17系とpnpm 11.19系です。

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

必要な型検査・回帰試験・production build:

```powershell
pnpm check
```

Windows installerのlocal build:

```powershell
pnpm desktop:dist -- --win --x64
```

## 構成

|場所|責任|
|---|---|
|`apps/novel-editor`|Electron main/preload、React執筆UI、installer設定|
|`packages/project-store`|Markdown project、atomic save、検索、保存点、復元、notes、Review Ledger、export|
|`packages/editor-core`|role、本文統計、検索、exact quote検証|
|`packages/lens-core`|snapshot、read boundary、anchor、安全境界|
|`packages/provider-openai`|利用者所有のOpenAI API接続|
|`apps/gate-a-pilot`|generic回答とLensを比較した研究用companion|

初期調査と旧Novel Lens時点の設計記録は`docs/`、`research/`、`specs/`に履歴として残しています。現在の再構築方針は[KOHON rebuild plan](./docs/kohon-rebuild-plan.md)を参照してください。

## Release

`v<major>.<minor>.<patch>` tagでGitHub ActionsがWindows、macOS Intel/Apple Silicon、Linuxのinstallerをnative buildし、SHA-256とproduction dependency license一覧を添付します。全matrix成功後だけdraft Releaseを公開します。手順は[release guide](./docs/release.md)にあります。

## Security / contribution / license

- [Security policy](./SECURITY.md)
- [Contributing](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- Apache License 2.0 — [LICENSE](./LICENSE)
