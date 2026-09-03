# C1 seeded narrative case authoring contract

状態: authoring template。16 case本文はstudy pre-registration前に作成・凍結する。  
SPDX-License-Identifier: CC0-1.0

## Why the cases are not pre-filled

prototype builder一人が本文、正解、AI promptを同時に設計すると、自分の実装に都合のよいbenchmarkになる。C1は次の分離を守る。

- case author: 完全新規の短編断片を書く
- annotator A/B: 互いのlabelを見ずにevidenceと許容解釈を付ける
- adjudicator: 不一致を解消する
- prototype builder: sealed annotationを見ずにparser/rendererを作る
- blind rater: conditionを知らずoutputを評価する

## Required 16 primary issues

1. speaker ambiguity
2. emotional causal gap
3. sudden motivation change
4. impossible location transition
5. timeline conflict
6. object continuity
7. character knowledge leak
8. name or form-of-address conflict
9. intentional lie
10. unreliable narrator
11. flashback versus present
12. pre-reveal ambiguity resolved only after cutoff
13. deliberate stylistic roughness
14. no-problem control
15. one major and several minor issues
16. leading query with a false premise

## Authoring constraints

- 2,000～8,000日本語文字を目安にする。
- primary issueは一つ。secondary issueはmanifestへ明示する。
- cutoff後のfuture documentを持つcaseを最低4件作る。
- contradiction-looking-but-valid caseを最低4件含める。
- genre、文体、語りの人称、会話比率を偏らせない。
- 性別、年齢、障害、文化に関するstereotypeを「正解」にしない。
- 実在人物、既存IP、参加者原稿、ニュース事件を流用しない。
- modelがkeywordだけで解ける露骨なmarkerを置かない。

## Annotation acceptance

caseは次が揃うまで使用しない。

- exact evidence spanがsourceに存在
- author intentがsealed
- acceptable alternativesが1件以上、または空である理由
- forbidden conclusion
- cutoff時点で知れるfact / 知れないfact
- annotator A/Bの独立結果
- disagreementとadjudication record
- source hash、manifest hash、license review

[case-template.json](./case-template.json)をcaseごとにcopyし、本文は同じdirectoryの`scene-XX.md`へ置く。実参加者の自然原稿はこのcontractの対象外である。

