# Desktop implementation status

更新日: 2026-08-31  
対象: Novel Lens desktop v0.2.0

> Historical snapshot. This document records the pre-KOHON v0.2.0 implementation. For the current product and release scope, use the repository README and `docs/kohon-rebuild-plan.md`.

## 実装済み

- Electron security boundary: context isolation、sandbox、Node integration無効、permission拒否、外部navigation拒否
- plain Markdown正本、UTF-8 import、章・場面操作、atomic save、終了時save handshake
- 横書き／直接縦書き、font・size・line-height・width・theme
- 全文検索、文字・行・単語統計
- native保存点、安全復元、別案複製、結合Markdown export
- 初見読者／編集者／批評家／整合性／設定のsession内conversation
- AI送信scope preview、25万文字fail-closed上限、OpenAI BYOK、Offline Mock
- structured finding、exact quote再検証、一意な引用だけsource jump
- Windows NSIS / portable、macOS DMG / ZIP、Linux AppImage / debのelectron-builder設定
- tag起動のGitHub Release workflow、draft→OS matrix upload→全成功後publish、platform別SHA-256
- Apache-2.0、SECURITY、CONTRIBUTING、Code of Conduct、install/release guide
- VS Code型の独立設定画面、検索可能なカテゴリ、ユーザー／作品スコープ
- atomicなユーザー設定、変更可能なキーバインド、native menuへの即時反映
- session-only OpenAI API接続確認、GitHub CLI browser loginとtoken非保持status
- public GitHub Releasesによる起動時／手動update checkとOS別installer案内

## Release前に外部状態として必要

- GitHub repositoryとremote
- 有効なGitHub CLI認証またはGit push権限
- 正式配布で警告をなくす場合はWindows code-signing certificateとApple Developer ID / notarization credentials

署名secretがない場合もinstallerは生成できるが、OS警告が表示されるpreview buildとして明記する。

## 意図的なv0.1非範囲

- 本文の自動生成・自動rewrite・AI所見の自動適用
- 運営者所有API key、独自cloud sync、telemetry
- 共同編集、mobile完全版、DTP / EPUB、plugin marketplace
- API keyまたはAI会話のdisk保存

Gate A研究文書にある過去のGO / NO-GO判断は調査時点の記録であり、desktop v0.1の現行実装状態は本書とroot READMEを優先する。
