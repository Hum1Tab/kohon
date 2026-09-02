# 利用者所有サービスと運営側従量課金ゼロの境界

更新日: 2026-08-31  
状態: 実装制約

## 結論

KOHON（旧Novel Lens）のcoreは、運営者がAPI key、GitHub token、原稿proxy、同期serverを持たなくても動く。運営側のAI・GitHubの従量課金を0円に固定する。ただし、署名付きinstaller、domain、store登録、サポート等の配布・運営費まで必ず0円になるという意味ではない。

## AI

- Offline Mockはnetwork 0、費用0。
- OpenAI接続は利用者がそのsessionだけAPI keyを渡し、local processから`api.openai.com`へ直接接続する。
- 運営者所有key、共用proxy、key fallbackを禁止する。
- keyはlocalStorage、project、log、exportへ保存せず、A/B完了・cancel・eraseで参照を破棄する。
- 利用者負担の予想外な送信量を抑えるため、OpenAI runは明示指定がない場合25万UTF-16文字でfail-closedにする。Offline Mockは100万文字まで検証できる。
- ChatGPT subscriptionとAPI Platformは別課金であるため、ChatGPT Plus/Proへのloginを非公式に流用しない。[OpenAI: ChatGPTとAPIのbilling](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform)
- 完全にAPI費用を避けたい利用者向けには、Gate Aのcloud cohortへ混ぜず、Ollama等のlocal adapterを別cohort・別modelとして検証する。

## Git / GitHub

- 本文履歴はlocal Gitだけでも成立し、GitHubは任意のremoteである。
- Git操作はshell文字列ではなくargvでlocal `git`へ渡す。
- HTTPSは利用者OSのGit Credential Manager／GitHub CLI、SSHは利用者のSSH keyを使う。運営者tokenを要求しない。[GitHub: credentialsの保持](https://docs.github.com/en/get-started/git-basics/caching-your-github-credentials-in-git)
- remote URLはUI・log・exportへ返さない。埋込みcredentialの漏洩を避ける。
- `syncToUserRemote`が認証に失敗しても共用tokenへfallbackしない。
- GitHub個人アカウントはFreeでも公開・非公開repositoryを無制限に所有できるが、Actions、Packages、LFS等の従量機能には無料枠と超過課金がある。本製品の同期にActions/Codespaces/Packagesは要求しない。[GitHub account types](https://docs.github.com/en/get-started/learning-about-github/types-of-github-accounts) / [GitHub無料枠](https://docs.github.com/en/billing/reference/product-usage-included)

## 禁止するarchitecture

- 運営者のOpenAI keyをdesktop appへ埋め込む
- 全原稿を運営者backendへproxyする
- 共用GitHub App installation tokenで利用者repositoryを操作する
- analytics、remote font、automatic crash upload、無断update check
- ChatGPT web sessionのcookieや非公開APIを利用する
- 認証失敗時に別account・別providerへsilent fallbackする

## 0円に含まれない可能性があるもの

source公開、GitHub Releases、public repositoryのstandard GitHub Actionsまでは0円で運用できる。GitHub公式はpublic repositoryのstandard hosted runnerを無料・無制限としている。[GitHub Actions runner](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job)

一方、「警告の少ない署名済みdesktop binaryを全OSへ配る」費用まで必ず0円にはできない。

- macOSの通常の署名・notarization配布はApple Developer Programを使い、年99 USD。[Apple enrollment](https://developer.apple.com/help/account/membership/program-enrollment/)
- Windowsの未署名binaryはSmartScreen警告が出やすい。Microsoft Store配布はMicrosoftが署名する経路を持つが、direct配布で良好なpublisher identityを得るにはtrusted signing/certificateの検討が必要。[Microsoft SmartScreen](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)

したがって費用方針は二段階にする。

1. core開発・AI・GitHub同期・public CIの運営側従量課金は0円。
2. signed installerとstore配布は利用者検証後の明示予算gate。0円を守る間はsource buildとunsigned previewの制約を正直に表示する。

## code上の境界

- `provider-openai`: endpointを`https://api.openai.com`へ固定し、`store:false`、toolなし、自動retryなし。
- `history-git`: `UserOwnedGitAdapter`だけがlocal `git`/`gh`を呼び、token値を受け取るAPIを持たない。
- `gate-a-pilot`: localhost memory session。production backendなし。
- `operator_variable_cost_policy`: exportへ`user-owned-services-only`として記録する。

## 将来の製品UX

利用者にはGit用語を必須にしない。

|内部概念|利用者向け表現|
|---|---|
|commit|チェックポイント|
|branch|別案・分岐|
|diff|前回から変わった箇所|
|push|自分のGitHubへ同期|
|merge conflict|両方で変わった箇所を選ぶ|

初回同期は「GitHubへログイン」ではなく、既存のGitHub CLI/GCM/SSH状態を検査する。未認証なら公式login flowを利用者自身が完了する。アプリはpassword、PAT、OAuth refresh tokenを独自保存しない。
