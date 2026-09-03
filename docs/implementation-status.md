# Gate A implementation status

> Historical Novel Lens / Gate A snapshot. Package names below intentionally preserve the names used when this research build was evaluated; current packages use the `@kohon/*` namespace.

更新日: 2026-08-31  
対象build: workspace source（public release前）  
判定: **Mock-only local rehearsalは実行可能。Cloud参加者実験と製品本体は未承認。**

## 実装済みpipeline

```text
UTF-8 TXT / Markdown copy
  → immutable snapshot / deterministic IDs / SHA-256
  → inclusive reader cutoff / context manifest
  → explicit consent
  → generic + lens provider runs
  → JSON Schema + local exact-quote validation
  → mapping-masked A/B
  → read-only source jump (horizontal / vertical)
  → pseudonymous export / erase
```

local serverは`127.0.0.1`だけへrandom portでbindし、exact Host、session token、Origin、CSRF、CSPを検査する。原稿と回答はmemory-onlyで、database、localStorage、file watcher、telemetryを持たない。

## Package map

|Package|責任|
|---|---|
|`@novel-lens/contracts`|6 JSON Schemaのruntime validationとTypeScript contract|
|`@novel-lens/core`|snapshot、scope、manifest、prompt、strict anchor、finding、blind assignment|
|`@novel-lens/provider-mock`|network 0の決定論的fixture provider|
|`@novel-lens/provider-openai`|BYOK Responses API。endpoint固定、`store:false`、toolなし、自動retryなし|
|`@novel-lens/history-git`|利用者local Gitと既存GitHub認証だけを使うcheckpoint/diff/variation/sync境界|
|`@novel-lens/gate-a-pilot`|S1〜S8のReact UIとlocalhost Node server|

OpenAI BYOKはGate A画面まで接続済み。`history-git`はcompile・temporary repository test済みだが、現在のGate Aは元原稿を変更しないread-only companionなので、Git/GitHubの操作UIはまだ接続していない。製品phaseで「チェックポイント」「別案」「自分のGitHubへ同期」として配線する。

## 自動検査

`pnpm test`で7 test files / 20 testsを実行する。P0受入条件AT-001〜AT-017を名前付きtestで追跡し、利用者課金OpenAIだけに適用する25万文字のfail-closed既定上限も検査している。

|範囲|証拠|
|---|---|
|AT-001 / 002 / 011|Japanese goldenとleakage fixtureのimmutable import、future cutoff、1M文字|
|AT-005 / 006|捏造quoteのcard化0、duplicateのjump禁止、cross-version candidate|
|AT-009 / 010 / 015|cloud request capture、no retry、safe error、secret非露出、`store:false`/toolなし/truncation disabled|
|AT-003 / 004 / 007 / 008 / 012 / 013 / 014 / 016|consent、same-condition pair、mask、erase、Mock E2E、network 0、安全export|
|AT-017|malicious HTML/MarkdownをReact text nodeとしてescape|
|Git adapter|temporary repositoryでcheckpoint、diff、history、variation。operator token surface 0|

基準command:

```powershell
pnpm typecheck
pnpm test
pnpm build
```

同じ検査を[`.github/workflows/ci.yml`](../.github/workflows/ci.yml)でも実行する。workflowはread-only permission、固定SHAの公式action、固定Node/pnpm、lockfile厳守で、repository secretを要求しない。public repositoryのGitHub-hosted standard runnerであれば運営側のActions従量課金を持たない。

## 2026-08-31 manual runtime evidence

- production build起動: `127.0.0.1` + OS random port
- fixture 3文書、cutoffまで2文書送信、future 1文書を`after-cutoff`
- A/B panel 2、rating前`mappingRevealed=false`
- exact anchor 1件をhighlight、縦書きcomputed style=`vertical-rl`
- participant DOMの`sealed_mapping`/condition field 0、active external link 0
- exportの本文、filename、claim、API key 0
- erase receiptは5 data classes
- static CSPあり、CORS headerなし、wrong Host=421、missing CSRF=403

## 未検証・未承認

- 実OpenAI API call。利用者費用を勝手に発生させないためrequest captureまで。実験前にmodel ID、pricing、retention、cost capを凍結する。
- `store:false`はprovider側のabuse-monitoring retentionまで0にする意味ではない。OpenAIのdefault retentionと利用者organizationのZDR/MAM状態を同意画面で説明する。
- GitHub remoteへの実push。利用者のrepositoryを変更しないため、local temporary repositoryまで。adapterは利用者既存credential以外へfallbackしない。
- participant募集、masked evidence review、4週間reuse、Gate Aの価値判定。
- signed installer、auto-update、uninstall clean-VM audit。
- public license、SECURITY.md、CONTRIBUTING.md、governance。

したがって、この実装は「新規editorを作るべき」という証拠ではない。Mock rehearsalと次の調査を安全に始めるための検証物である。
