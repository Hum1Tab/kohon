# Gate A data contracts

更新日: 2026-08-30  
状態: schema version `0.1.0`。Gate A実装前にhashを固定する。

このdirectoryは研究用companionの境界を機械可読にする。schemaは製品の永続formatを決めるものではない。Gate A後に正本方式を決めるまで、migration互換性を約束しない。

## Files

|File|役割|本文を含むか|外部study export|
|---|---|---:|---:|
|[corpus-snapshot.schema.json](./corpus-snapshot.schema.json)|順序付きimmutable input|含む|禁止|
|[lens-output.schema.json](./lens-output.schema.json)|modelから受け取る最小structured output|引用のみ|原則禁止|
|[lens-finding.schema.json](./lens-finding.schema.json)|local validation後の所見とanchor|短い引用|匿名化して必要時のみ|
|[lens-run.schema.json](./lens-run.schema.json)|provider/context/coverage/resultのrun記録|generic本文または引用を含み得る|禁止。集計へ変換|
|[blind-study-result.schema.json](./blind-study-result.schema.json)|pair評価、時間、除外、sealed mapping|含まない|許可された研究領域のみ|
|[evidence-review.schema.json](./evidence-review.schema.json)|blind raterによるclaim unit別判定|含まない。unit hashのみ|許可された研究領域のみ|

## Contract boundary

```text
local source copy
  → corpus snapshot (exact text, never exported)
  → eligible document selection and context manifest
  → provider request
  → lens output (untrusted)
  → schema + exact-quote validation
  → validated finding with locally computed anchor
  → neutral renderer / study ratings
```

Modelは次を決めない。

- `snapshot_id`
- source offset
- prefix/suffix
- quote occurrence count
- `validation_status`
- blind assignment
- author/rater judgment

これらはlocal clientがexact sourceから計算する。modelが返す位置らしい数字を信用しない。

## Hash rules

すべてSHA-256 lowercase hexを使う。

### Snapshot ID v1

次をUTF-8、LF、RFC 8785準拠のJSON canonicalizationでserializeし、SHA-256を取る。

```json
{
  "schema_version": "0.1.0",
  "hash_policy": "ordered-document-content-v1",
  "documents": [
    {
      "document_id": "...",
      "order": 0,
      "title": "...",
      "media_type": "text/markdown",
      "source_byte_sha256": "...",
      "text_sha256": "..."
    }
  ]
}
```

`created_at`、mtime、絶対path、operator、participant IDはhash materialへ含めない。document配列は`order`昇順にし、同じorderを許さない。重複orderはschema外のsemantic validationで拒否する。

### Gate A document ID v1

Gate Aのcopy importだけに使う決定論的IDであり、将来の製品正本IDではない。

1. userがtitleとorderを確認する。
2. `base = SHA-256(UTF8("gate-a-document-id-v1") || 0x00 || UTF8(source_byte_sha256) || 0x00 || UTF8(title))`を計算する。`||`はbyte列の連結、`0x00`は一byteのNUL delimiterである。
3. confirmed orderを前から見て、同じbaseが先に現れた数を0始まりの`duplicate_index`とする。
4. `document_id = "d-" + base先頭24hex + "-" + duplicate_index`とする。

同じbytes/title/orderなら同じIDになる。title変更は新しいIDとsnapshotを作り、consentを無効にする。同一bytes/titleのduplicate同士は内容上区別できないためconfirmed orderでだけ区別し、元pathやmtimeをstable identityへ使わない。

### Text hash

UTF-8 decodeに成功した後のJavaScript stringを、改行・Unicode normalization・BOM以外の文字を変えずUTF-8へencodeしたbyte列のSHA-256とする。UTF-8 BOMはdecoderが取り除いたかを`bom`へ記録する。元file bytesのhashは`source_byte_sha256`として別に持つ。

`unicode_normalization`の分類は文字を変更せず、`NFC`、`NFD`、`NFKC`、`NFKD`の順に`text.normalize(form) === text`を試し、最初に一致したlabelを記録する。どれにも一致しなければ`mixed-or-unknown`とする。ASCII等が複数formと一致する場合は先頭の`nfc`になる。

### Prompt and schema hash

[evaluation protocol](../docs/gate-a-evaluation-protocol.md)の順序でprompt、dereference済みoutput schema、renderer/study versionをLF + UTF-8で連結する。schema fileの空白差ではなくcanonical JSONのhashも別に記録する。

## Offset rules

`start_utf16`と`end_utf16`はECMAScript stringのUTF-16 code unit indexで、half-open range `[start, end)`である。

```text
document.text.slice(start_utf16, end_utf16) === exact_text
```

prefix/suffixはsourceからlocal clientが取得する。初期値は最大32 UTF-16 code unitsだが、surrogate pairを途中で切らない。引用が複数回現れる場合はprefix/suffixを加えて一意性を調べ、一意でなければ`ambiguous`にする。fuzzy matchはしない。

通常のjumpはfindingが拘束された同一`snapshot_id`と`document_text_sha256`だけを対象にする。別snapshotでは、exact quoteが一意でも自動attachせず`source-version-mismatch`とする。SP-04で明示的な「別版で再接続候補を探す」操作を試す場合も、候補linkを別に作り、元finding、元snapshot ID、元offsetを変更しない。

## Runtime validation beyond JSON Schema

JSON Schema適合だけでは不十分である。次を必ず追加検証する。

1. document orderの一意性
2. document IDの再計算とduplicate index
3. snapshot hash再計算
4. cutoffより後のdocumentがsent setへない
5. `eligible = sent ∪ omitted`かつ互いに素
6. snapshot documentがeligibleまたはnon-eligibleの一方だけに属する
7. provider payloadがsent documentだけを含み、non-eligibleのID/title/hash/textを含まない
8. 初期有効study runはomitted 0件
9. evidence documentがsent setにある
10. exact quoteの実在とsource hash一致
11. locally computed offset/prefix/suffixの一致
12. finding最大8件
13. run conditionとoutput kindの整合
14. blind pairのA/B runが同じsnapshot/query/model/samplingを持つ
15. participant向けviewにsealed mappingがない
16. sealed mappingのA/Bがgeneric/lensを一つずつ含む
17. evidence reviewのunit hashがprivate rater packetのunitと一致する
18. 同じ`rater_id + run_id`のcondition guess/confidenceが全unitで一致する

## Sensitive data rule

- snapshot、lens output、run recordは原稿derived dataであり、workspace repositoryへ保存しない。
- 実行時はOS user data directory配下のstudy-specific directoryへ置く。
- sample、test、bug reportでは[公開fixture](../fixtures/README.md)だけを使う。
- `blind-study-result`もparticipant pseudonymを含むためpublic repositoryへ自動commitしない。
- private research exportに含むsnapshot/run IDを、public aggregateへそのまま出さない。
- schema例に実参加者の本文・名前・path・API keyを入れない。

## Versioning

- breaking field/meaning change: minor before 1.0 (`0.1.0` → `0.2.0`)
- typo/documentation only: patch
- study開始後にschemaを変えたrunは同一primary analysisへ混ぜない
- readerは未知のschema versionを推測して読まず、明示errorにする

## Implementation acceptance

実装開始時に以下を自動testへ変換する。

- 全schemaがJSONとしてparseできる
- Draft 2020-12 validatorでvalid/invalid fixtureが期待通り
- `additionalProperties: false`が全data objectにある
- unknown enum/versionを拒否
- emoji、結合文字、CRLF/NFC/NFDでoffset/hashが再現
- generated typeを使う場合もruntime validationを省略しない
