# Manuscript markup and Japanese input helpers

The manuscript remains ordinary UTF-8 Markdown. KOHON's helpers are explicit text edits: they do not intercept IME composition, hide source characters, or require the app to recover the prose.

## Supported notation

| Purpose | Stored text | Boundary |
| --- | --- | --- |
| Ruby | `｜親文字《よみ》` | Matches the published Kakuyomu ruby form. The UI rejects line breaks and `《 》` in the reading. |
| Emphasis / bouten | `《《本文》》` | Matches the published Kakuyomu emphasis form. It cannot cross a line. |
| Tate-chu-yoko | `29［＃「29」は縦中横］` | Uses the published Aozora Bunko annotation. The helper accepts only 2–3 selected ASCII letters/digits, the common short case described by JLReq. |
| Paragraph indent | a newline followed by U+3000 | Inserted only when the author invokes the command. |
| Corner brackets | `「選択範囲」` | A collapsed selection becomes `「」` with the caret inside. No automatic pairing runs during IME input. |

Sources:

- [Kakuyomu official notation help](https://kakuyomu.jp/help/entry/notation)
- [Aozora Bunko annotation list: tate-chu-yoko](https://www.aozora.gr.jp/annotation/etc.html)
- [W3C Requirements for Japanese Text Layout, tate-chu-yoko](https://www.w3.org/TR/2009/NOTE-jlreq-20090604/#subsection_3.2.5)

## Deliberate limits

- KOHON does not invent a shorter private tate-chu-yoko syntax.
- The direct editor does not claim WYSIWYG ruby, bouten, or tate-chu-yoko rendering.
- Punctuation normalization touches only the current selection and only converts ASCII `...` and `--`.
- Automatic indentation, quote substitution, and bracket pairing remain off because they can interfere with Japanese IME and intentional prose.
- Posting-service and Aozora export adapters must transform from these documented source forms without changing the canonical manuscript in place.
