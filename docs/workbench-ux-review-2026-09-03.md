# KOHON 作業UI UXレビュー（2026-09-03）

## 結論

KOHONの作業UIは、機能不足よりも「入口が見えない」「装飾と操作の優先順位が競合する」「次の操作が長い結果の下へ逃げる」ことが毎日の使いにくさにつながっていた。

今回の改善軸は次の4つに限定する。

1. 原稿を常に最大の視覚要素にする。
2. 主要操作は覚えなくても見つかり、慣れたらキーボードで完結できるようにする。
3. 自由配置は維持しつつ、執筆・推敲・比較の3つの安全な出発点を用意する。
4. 作業UIは白またはダークへ統一し、紙色は原稿キャンバスだけの選択肢として扱う。

## 実装判断

- 上部中央に「操作を検索」を置き、Command Paletteを隠し機能にしない。
- レイアウトメニューに「執筆」「推敲」「比較」を追加する。プリセット適用時も、左右の選択とユーザーが調整した幅・高さは保持する。
- Activity Barはアイコンを維持し、ホバーまたはキーボードフォーカス時だけ日本語名を表示する。
- 保存状態はアプリ全体の右上から、原稿の字数・行数と同じステータス領域へ移す。押せば即時保存できる。
- 編集レンズは質問、接続、読了位置、送信確認を最初に置き、過去の会話・結果・指摘台帳をその下へ移す。
- Welcomeのグリッド、光彩、過大なカード形状を削り、ロゴ由来の森と金だけをアクセントにする。
- 新規ユーザーの既定テーマはホワイト。既存ユーザーが明示的に選んだ紙色・ダーク・OS連動は変更しない。

## 今回しないこと

- Terminal、Debugger、コード向けLanguage Serverなど、執筆に関係しないVS Code機能は持ち込まない。
- 常時表示のボタンやツールバーを増やさない。低頻度操作はCommand Palette、メニュー、コンテキスト操作へ置く。
- ガラス表現、虹色タイル、大きなグラデーション、長いアニメーションを追加しない。
- 本文エディターを見た目のためだけに全面置換しない。IME、縦書き、自動保存の信頼性を優先する。
- 章メタデータを巨大な必須フォームにしない。必要な作者だけが使える補助情報のままにする。
- レイアウトプリセット適用時に、作者が選んだ左右と調整済みの寸法を初期化しない。

## 次段階の候補

実利用後に必要性が確認できた場合だけ、直近のコマンド履歴、作品ごとの作業レイアウト名、アウトラインの進捗表示を検討する。機能数ではなく、執筆開始までの時間と原稿へ戻るまでの操作数で判断する。

## 参考

- [Visual Studio Code: User Interface](https://code.visualstudio.com/docs/editing/userinterface)
- [Visual Studio Code: Custom Layout](https://code.visualstudio.com/docs/configure/custom-layout)
- [Obsidian: Workspaces](https://obsidian.md/help/Plugins/Workspaces)
- [Obsidian: Sidebars](https://obsidian.md/help/User%2Binterface/Sidebar)
- [novelWriter: Main Window](https://novelwriter.io/docs/user_interface/main_window.html)
- [novelWriter: Editor and Viewer](https://novelwriter.io/docs/user_interface/editor_viewer.html)
