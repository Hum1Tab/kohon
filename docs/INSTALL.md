# インストール

[GitHub Releases](https://github.com/Hum1Tab/kohon/releases/latest)から利用OS・CPUに合うファイルと、同じplatformの`SHA256SUMS`を取得してください。

KOHONはTauri v2でbuildしています。WindowsはNSIS installer、macOSは`.dmg`、LinuxはAppImageと`.deb`を配布します。

## Windows 10 / 11 x64

- `KOHON_<version>_x64-setup.exe`: 現在のユーザー向けにinstallします（管理者権限は不要です）。

setup版は起動時に日本語またはEnglishを選べます。KOHON本体の表示言語は初回起動時にOSへ合わせ、後から「設定 → 全般 → 表示言語」でいつでも変更できます。

署名されていないbuildではSmartScreenの警告が表示されます。Release本文の署名状態とchecksumを確認し、出所を確認できないbuildは実行しないでください。

## macOS Intel / Apple Silicon

- Intel Mac: `KOHON_<version>_x64.dmg`
- Apple Silicon: `KOHON_<version>_aarch64.dmg`

`.dmg`を開き、KOHONをApplicationsへ移します。Developer ID署名・notarizationがないbuildは「プライバシーとセキュリティ」から個別許可が必要です。

## Linux x64

- AppImage: `chmod +x KOHON_*.AppImage`の後に起動
- Debian / Ubuntu: `.deb`をpackage managerでinstall

WebKitGTK 4.1（`libwebkit2gtk-4.1`）が必要です。主要distributionの標準repositoryから導入できます。

## SHA-256

PowerShell:

```powershell
Get-FileHash .\KOHON_* -Algorithm SHA256
```

macOS / Linux:

```bash
shasum -a 256 KOHON_*
```

表示値をRelease添付の`SHA256SUMS-<platform>-<arch>.txt`と比較します。

## アプリ内更新

「設定 → 更新」で公開GitHub Releasesの最新版を確認できます。「起動時に確認」を有効にすると、packaged版は起動後に一度だけ確認します。原稿、作品名、設定、GitHub認証情報は送信しません。

新しいversionがある場合はReleaseページを開きます。installerの取得と差し替えはOSの通常手順で行ってください。KOHONは取得したinstallerを自動実行しません。

## Novel Lensからの移行

KOHONの初回起動時、新しいKOHON設定がまだ存在しない場合だけ、旧Novel Lensの`settings.json`とOS保護済み`openai-credential.bin`を新しい設定folderへコピーします。旧fileは削除せず、すでにあるKOHON設定も上書きしません。

旧作品の`novel-lens.json`は改名せず、そのまま開いて保存できます。KOHONで作る新規作品は`kohon.json`を使います。どちらも本文は`manuscript/*.md`です。

## 原稿データとuninstall

作品は利用者が選んだfolderに保存され、KOHONやNovel Lensのuninstallでは削除されません。必要な作品folderをbackupしてからOSの通常手順でアプリを削除してください。
