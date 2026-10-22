# Tauri v2 migration

更新日: 2026-10-23

## 何を変えたか

KOHONのdesktop shellをElectronからTauri v2へ移しました。原稿の保存形式、`.novel-editor`の互換性、作品folderの扱いは変えていません。

- Electron main / preload / `contextBridge`を削除し、Rust backend（`apps/novel-editor/src-tauri`）へ置き換え。
- rendererは引き続き`window.kohon`だけを見ます。実装は`apps/novel-editor/src/desktop/api.ts`が組み立て、`src/desktop/ipc.ts`の`invoke` / `listen`がTauri commandとeventへ橋渡しします。
- Codex・更新確認・認証情報・user data移行のElectron版実装を削除しました。Tauri版は`src/desktop/`に一本化しています。
- `electron-builder`を`tauri build`へ置き換え、WindowsはNSIS、macOSはdmg、LinuxはAppImage / debを生成します。
- Codex CLIは`externalBin`として同梱します。`apps/novel-editor/scripts/stage-codex-sidecar.mjs`が`beforeBuildCommand`で対象triple向けのbinaryを`src-tauri/binaries/`へ配置します（このdirectoryはcommitしません）。

## 構成

```text
React renderer (src/renderer)
  └─ window.kohon  (src/desktop/api.ts)
       ├─ ProjectService / ProjectStore  … Markdown正本、保存、履歴
       ├─ Lens / Codex                   … AIレビュー
       ├─ Menu / Window                  … Tauri menu・window API
       └─ ipc.ts → invoke/listen
            └─ Rust commands (src-tauri/src/lib.rs)
                 ├─ file system（allowlistしたroot配下だけ）
                 ├─ 外部URL open / HTTP
                 ├─ OS keyring（credential）
                 └─ Codex sidecar process
```

## セキュリティ境界

- Rust側は`AppState.allowed_roots`と`allowed_files`で読み書き可能なpathを制限し、canonicalize後に許可root配下か検証します。
- Tauri capabilitiesは`main` windowだけに適用し、window操作、menu、file dialogに限定しています（`src-tauri/capabilities/default.json`）。
- CSPは`default-src 'self'`を基本に、Tauri IPCと開発時Viteだけを許可します。
- API keyはOSのkeyringへ保存し、rendererへは状態だけを返します。

## 配布

`pnpm desktop:dist`がTauri CLIへ引数を転送します。GitHub Actions（`.github/workflows/release.yml`）はWindows x64、macOS Intel / Apple Silicon、Linux x64をnative runnerでbuildし、platform別SHA-256とdependency license一覧をdraft Releaseへ添付します。

Windowsのportable exeは廃止しました。アプリ内更新はReleaseページを開くだけで、installerを自動実行しません。

## 根拠監査とレビューブリーフ

[universal-article-writer](https://github.com/Hum1Tab/universal-article-writer)の「プロンプトを足すな。検証を置け」という方針を、小説の推敲向けに翻案しました。

- Lensへ`根拠監査` roleを追加。指摘ごとに逐語引用、Warrant（引用が指摘を支える理由）、反証条件（どんな記述があれば取り下げるか）を要求します。引用は既存の`validateFinding`で本文と照合され、一致しない指摘は`stale` / `needs-recheck`として再確認になります。
- 「査読ブリーフを書き出す」で、本文・メモ・未対応の指摘を1枚のMarkdownへまとめます。ブリーフにはG1–G7の判定基準と出力形式を含め、外部AIへそのまま渡せます。
- 実装は`apps/novel-editor/src/shared/review-brief.ts`。文字数上限を超えた場合は省略した章を明示し、黙って落としません。

## 既知の制約

- 署名がない場合、Windows SmartScreenとmacOS Gatekeeperの警告が出ます。
- LinuxはWebKitGTK 4.1が必要です。
- Tauriの自動更新は使いません。更新はReleaseページ経由です。
