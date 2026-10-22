# Release procedure

## 事前条件

- `main`で`pnpm check`が成功
- `apps/novel-editor/package.json`、`apps/novel-editor/src-tauri/tauri.conf.json`、`CHANGELOG.md`のversionが一致
- `Hum1Tab/kohon`上でworkflowが実行され、homepageとRelease URLが同じrepositoryを指している
- GitHub CLIまたはGit push権限が有効
- 公開Releaseの場合、署名状態と既知の制限をRelease noteへ明記

## Tag release

```bash
git tag -a v0.3.0 -m "KOHON v0.3.0"
git push origin v0.3.0
```

`Desktop release` workflowは次を行う。

1. tagと`tauri.conf.json`のversion一致を検査
2. 型検査、必要な回帰試験、high以上のproduction advisory検査
3. draft GitHub Releaseを一度だけ作成
4. Windows x64 (NSIS)、macOS Intel (dmg)、macOS Apple Silicon (dmg)、Linux x64 (AppImage/deb) を各native runnerのTauri buildで生成
5. installer、platform別SHA-256、production dependency license一覧をdraftへ直接upload
6. 全platform成功後もdraftのまま保持
7. artifact名、SHA-256、license一覧、署名状態、旧作品を開く短い実機checkを確認
8. workflowを同じtag、`publish: true`で手動実行し、必要artifactが全てある場合だけ公開

Windowsは`KOHON_<version>_x64-setup.exe`、macOSは`KOHON_<version>_x64.dmg` / `KOHON_<version>_aarch64.dmg`、Linuxは`.AppImage`と`.deb`を生成する。旧`novel-lens.json`fixtureを各packaged buildで開く短い互換checkをrelease gateに含める。

workflowを手動再実行する場合は既存tagをinputへ指定する。未完のdraftへ同名artifactを再uploadするため、部分失敗から再開できる。

## Signing secrets

TauriのmacOS署名・notarization向けに次のGitHub Actions secretを使う。

- macOS notarization: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- macOS Developer ID: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`（任意）

certificate、private key、PAT、API key、原稿をrepositoryへcommitしない。secretがない場合もinstallerは生成できるが、unsigned previewであることをRelease titleと本文へ明示する。

## 配布物の制約

- Windows installerは現在のユーザー向けNSISのみで、portable exeは配布しない。
- アプリ内更新はReleaseページを開くだけで、installerを自動実行しない。
- LinuxはWebKitGTK 4.1を必要とする。

## Rollback

公開後のbinaryを同じtagで差し替えない。不具合Releaseは本文冒頭へ警告を付け、新しいpatch versionで修正する。重大な安全問題ではReleaseを取り下げ、Security Advisoryと修正版を案内する。
