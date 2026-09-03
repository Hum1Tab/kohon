# 設定・アカウント・更新の設計

更新日: 2026-09-01  
対象: Novel Lens desktop v0.2.0

> Historical snapshot. ChatGPT Codex sign-in, KOHON settings migration, and background Windows updates were implemented after this document. Use the README and `docs/INSTALL.md` for current behavior.

## 設定

設定はVS Codeに近い二層構造にする。

- **ユーザー**: OSのNovel Lens設定フォルダーに`settings.json`としてatomic保存する既定値。
- **この作品**: 作品フォルダーの`novel-lens.json`へ保存する上書き。本文表示だけが対象。

ユーザー設定は自動保存間隔、editor既定値、AIの既定接続とmodel ID、更新確認、キーバインドを持つ。API key、GitHub token、AI会話、原稿は含めない。作品設定は各項目を「ユーザー設定に戻す」ことができる。

ショートカットはportableな`Mod+...`形式で保持し、macOSではCommand、Windows/LinuxではCtrlとしてnative Electron menuへ反映する。重複とcopy/paste等のeditor予約キーを拒否し、記録中はnative acceleratorを一時停止する。

## OpenAI

OpenAI公式APIはAPI keyまたはworkload identityのBearer credentialを受け付け、API keyをbrowser/appのコードへ埋め込まないよう案内している。[OpenAI API authentication](https://developers.openai.com/api/reference/overview#authentication)

Novel Lensは運営者keyやChatGPT web sessionを持たない。利用者が設定画面へ入力したkeyで`GET /v1/models`を一度確認し、成功後はrenderer stateから消去する。keyはElectron `safeStorage`を通してOSユーザーの保護領域で暗号化したmain process専用ファイルへ保存し、作品・ユーザー設定・logには含めない。Linuxで安全なsecret backendがない場合は平文保存せず、起動中メモリだけへ保持する。本文を送る直前には従来どおりscope同意を要求する。

アカウント画面の「ChatGPTを開く」は公式webを既定browserで開くだけで、Novel Lensとの接続状態とは表示しない。ChatGPT subscriptionを外部アプリのAPI entitlementとして扱える公式仕様が確認できないため、AI設定では正確に「OpenAI API接続」とする。

## GitHub

公式GitHub CLIの`gh auth login --web --clipboard`を起動する。公式manualによればbrowser flow完了後のtokenはsystem credential storeへ保存され、利用できない場合はGitHub CLI自身がplain text fileへfallbackする。[GitHub CLI login](https://cli.github.com/manual/gh_auth_login)

Novel Lensは`gh auth token`を呼ばず、token値を読み取らない。`gh auth status --active --hostname github.com`のexit statusだけで接続状態を判断する。device codeはGitHub CLIの出力から短いコードだけを抽出して画面へ表示する。loginは明示button操作時だけ開始する。

## Install / update

installerはWindows NSIS/portable、macOS DMG/ZIP、Linux AppImage/debをGitHub Release workflowで生成する。v0.2の更新センターは公開GitHub Releases APIをtokenなしで確認し、現在のOS・CPUに一致する本repositoryのassetだけをmain processでtemporary directoryへstream downloadする。GitHub asset digest（ない場合は同Releaseの`SHA256SUMS`）と照合できた場合だけOSでinstallerを起動する。

Electron公式の完全自動更新はmacOSで署名が必須で、built-in updaterはLinuxを対象外としている。[Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater/) そのためunsigned previewを含む現在は、全OS共通の「自動確認 → 明示操作でdownload・hash検証・installer起動」を採用し、無人installや権限昇格は行わない。署名済みstable channelが成立した後にWindows/macOSの再起動installを検討する。
