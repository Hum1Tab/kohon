# インストール

[GitHub Releases](https://github.com/Hum1Tab/kohon/releases/latest)から利用OS・CPUに合うファイルと、同じplatformの`SHA256SUMS`を取得してください。

## Windows 10 / 11 x64

- `KOHON-<version>-windows-x64-setup.exe`: 通常installとアプリ内更新に対応
- `KOHON-<version>-windows-x64-portable.exe`: installせず単体起動

署名されていないbuildではSmartScreenの警告が表示されます。Release本文の署名状態とchecksumを確認し、出所を確認できないbuildは実行しないでください。

## macOS Intel / Apple Silicon

- Intel Mac: `KOHON-<version>-mac-x64.dmg` / `.zip`
- Apple Silicon: `KOHON-<version>-mac-arm64.dmg` / `.zip`

`.dmg`を開き、KOHONをApplicationsへ移します。Developer ID署名・notarizationがないbuildは「プライバシーとセキュリティ」から個別許可が必要です。

## Linux x64

- AppImage: `chmod +x KOHON-*.AppImage`の後に起動
- Debian / Ubuntu: `.deb`をpackage managerでinstall

## SHA-256

PowerShell:

```powershell
Get-FileHash .\KOHON-*.exe -Algorithm SHA256
```

macOS / Linux:

```bash
shasum -a 256 KOHON-*
```

表示値をRelease添付の`SHA256SUMS-<platform>-<arch>.txt`と比較します。KOHONのアプリ内更新も同じSHA-256を照合し、一致しないdownloadは削除します。

## アプリ内更新

「設定 → 更新」で公開GitHub Releasesの最新版を確認できます。「起動時に確認」を有効にすると、packaged版は起動後に一度だけ確認します。原稿、作品名、設定、GitHub認証情報は送信しません。

- Windows setup版: 「ダウンロードして更新」でinstallerをbackground取得し、SHA-256検証後に無人更新を開始します。KOHONは保存完了後に終了し、更新後に自動で再起動します。installer画面は開きません。
- Windows portable版: 実行中のportable fileを安全に自己置換しません。Releaseページから新しいportable版を取得してください。
- macOS: 検証済みの`.dmg`を開きます。OSの案内に従ってApplicationsのKOHONを置き換えてください。
- Linux: 検証済みのAppImageまたはpackageを開きます。導入方法に合わせて置き換えてください。

## Novel Lensからの移行

KOHONの初回起動時、新しいKOHON設定がまだ存在しない場合だけ、旧Novel Lensの`settings.json`とOS保護済み`openai-credential.bin`を新しい設定folderへコピーします。旧fileは削除せず、すでにあるKOHON設定も上書きしません。

旧作品の`novel-lens.json`は改名せず、そのまま開いて保存できます。KOHONで作る新規作品は`kohon.json`を使います。どちらも本文は`manuscript/*.md`です。

## 原稿データとuninstall

作品は利用者が選んだfolderに保存され、KOHONやNovel Lensのuninstallでは削除されません。必要な作品folderをbackupしてからOSの通常手順でアプリを削除してください。
