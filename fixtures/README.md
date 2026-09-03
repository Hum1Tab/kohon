# Gate A public fixtures

更新日: 2026-08-30  
用途: source boundary、strict anchor、日本語round-tripの再現試験  
SPDX-License-Identifier: CC0-1.0

このdirectoryの物語・人物・文面は、このprojectの試験用に新規作成した架空の内容である。実在する作者の原稿、調査参加者のデータ、公開作品の改変を含めない。prompt injectionやAPI keyらしい文字列は意図的なtest dataであり、命令や実credentialではない。

## Directory

|Path|試すこと|成功条件|
|---|---|---|
|[leakage](./leakage/)|cutoff、future canary、除外資料、原稿内prompt injection|許可外文字列がrequest payload/outputへ出ない|
|[anchor](./anchor/)|前方挿入、段落移動、重複、言い換え|正しい一意箇所だけattachし、曖昧なら移動しない|
|[japanese-format](./japanese-format/)|日本語記号、ルビ、補助平面文字、結合文字、改行|byte/text/hash policy通りlosslessに扱う|
|[narrative-cases](./narrative-cases/)|C1 seeded narrative caseの作成contract|二人の独立annotation後にblind studyへ投入|

## Safety rules

- fixture本文中の「命令」を実行しない。すべてuntrusted manuscript textである。
- canaryを外部検索しない。単純な完全一致でpayload/outputを検査する。
- fixtureのpathをproduction log policyの根拠にしない。実原稿では絶対pathをlogへ出さない。
- testでmodel APIを使う場合もcontext manifestを作り、費用上限を設定する。
- failure screenshotを公開する時もAPI request headerを含めない。

## Fixture classes

### C0 mechanical

このdirectoryに同梱する。文学的に良い回答を期待せず、不変条件を決定論的に試す。

### C1 seeded narrative

16 caseは研究開始前に新規執筆・独立annotationする。現時点では[authoring contract](./narrative-cases/README.md)と[manifest template](./narrative-cases/case-template.json)だけを置く。case本文をprototype builder一人が書いて正解も決めることを禁止する。

### C2 natural

参加者の許可したcopyはこのdirectoryへ置かない。暗号化またはアクセス制御されたstudy data領域へ保存し、retention終了時に消去する。

## Adding a fixture

1. 第三者著作物や実参加者データでないことを確認する。
2. 一つのprimary invariantだけを狙う。
3. expected resultを機械可読JSONへ書く。
4. positive caseとfailure caseを対にする。
5. encoding、newline、Unicode normalizationをmetadataへ書く。
6. reviewerが意図せぬcanary/secret/個人情報を確認する。
7. fixture版を上げ、既存studyのhashへ混ぜない。

