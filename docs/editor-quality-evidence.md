# Editor quality evidence

This file records narrow, reproducible evidence for KOHON's editor gate. It does not treat a reducer benchmark as proof of native IME, caret, selection, or clipboard behavior.

## 100k-character input path

Command:

```powershell
pnpm benchmark:editor
```

The benchmark keeps a 100,000-character Japanese chapter in the same immutable buffer and history models used by the desktop renderer, then appends 100 characters. It separately measures the word/line statistics pass.

Observed on 2026-09-03, Windows x64, Node 24.17.0, Intel Core i7-14700K:

- 100 edits: 0.38 ms total, 0.004 ms average in the reducer/history path.
- one statistics pass at 100,100 characters: 24.95 ms.

The statistics pass was therefore removed from the synchronous React render path. Status-bar counts now refresh 250 ms after input settles and are computed once per open chapter, even when the same chapter is visible in two groups.

## Evidence still required before release

- Windows Microsoft IME: composition, conversion, confirm, undo, redo, paste, selection deletion in horizontal and vertical modes.
- macOS Japanese IME: the same matrix on actual hardware or CI with an explicitly documented limitation.
- Linux IME: supported desktop environment and input method recorded with the result.
- 100k-character desktop interaction timing, not only the pure state path.
- Screen-reader names, focus order, keyboard-only panel movement, and high-contrast review.

An unavailable platform is reported as inconclusive, never as passed.
