# KOHON rebuild plan

Status: implementation and compatibility work is in final release audit. Source/product metadata now use **KOHON**, but no KOHON repository or public release is created until the remaining packaged-app, name-conflict, license, and release gates pass.

## Product contract

KOHON is a local-first Japanese novel editor. Markdown files remain the canonical manuscript. The author writes and decides; AI reads a user-approved scope and returns evidence-linked hypotheses. AI never rewrites or applies prose automatically.

Non-negotiable guarantees:

- Existing `novel-lens.json` projects continue to open without a destructive migration.
- Manuscript text remains readable UTF-8 Markdown outside the app.
- AI, accounts, and network access remain optional.
- Every destructive operation creates a recoverable state first.
- Workbench features do not crowd the normal writing surface.
- Windows, macOS, and Linux remain supported.

## Current evidence

As of 2026-09-03, the rebuild branch has implemented the original high-risk workbench gaps:

- persisted tabs, two editor groups, split direction, caret, selection, scroll, and visible recovery drafts;
- current-document Find/Replace and project-wide replacement preview with a checkpoint before bulk changes;
- Quick Open, Command Palette, configurable keybindings, and movable/resizable workbench panels;
- checkpoint diff, checkpoint-to-checkpoint comparison, safe whole-project and chapter-only restore;
- a persistent Review Ledger with exact-quote anchors and resolved/ignored/stale/needs-recheck states;
- chapter/scene reordering, split/merge, optional metadata, and pinned Markdown notes;
- explicit Japanese punctuation, indentation, quote, ruby, emphasis, and tate-chu-yoko helpers without changing the Markdown canonical source;
- bounded per-chapter undo/redo, IME-aware edit grouping, and a documented 100k-character state/history benchmark;
- an extracted editor pane and workbench panels instead of keeping all renderer markup in `App.tsx`;
- code-level keyboard and dialog focus accessibility, IPC sender validation, dependency audit, and protected slow-close handling.

Focused typechecking, 76 unit/regression tests, and a production desktop bundle pass on the current branch. This is not a substitute for packaged application checks. The remaining product risk is real Windows/macOS/Linux interaction behavior—especially IME, vertical selection/caret, screen readers, clean install, update, and old-project opening—followed by the final KOHON name/config/repository migration.

## Decisions

### Keep the textarea temporarily

Do not replace the editor merely to obtain a more fashionable architecture. Native textarea currently provides the most reliable direct vertical writing and IME behavior in this codebase. First isolate it behind an editor model and measure it with long Japanese fixtures. Move to CodeMirror/ProseMirror only if repeatable failures show that the current foundation cannot satisfy tabs, selection restoration, search, or performance.

### Build trust before rich formatting

Session restore, recovery drafts, save invariants, search, and checkpoint diff come before ruby, EPUB, or elaborate story metadata. Ruby/emphasis/tate-chu-yoko will use explicit, documented Markdown-compatible notation and must round-trip exactly before an editing UI is added.

### Optional structure stays optional

Characters, places, notes, plot, and scene metadata belong in open Markdown/JSON sidecars and remain hidden unless enabled. KOHON will not copy Scrivener's large form system.

### No DTP scope

Markdown and TXT are required exits. DOCX is valuable for editor handoff after a fixture-backed exporter exists. PDF/EPUB/posting profiles are later adapters, not reasons to turn the editor into page-layout software.

### No AI auto-application

The Review Ledger records findings and their evidence, version, read boundary, and status. It never writes manuscript text. A stale finding is rechecked explicitly by the author.

## Implementation sequence

### Phase A — editor state and recovery

- Extract a pure editor-session model from `App.tsx`.
- Persist open tabs, active tab, split direction, caret, and scroll per project under `.novel-editor/`.
- Add short-interval recovery drafts separate from canonical saves and checkpoints.
- Recover a newer draft visibly without silently discarding either version.
- Add Quick Open and Command Palette using the existing command registry.
- Add current-document Find/Replace with literal and case-sensitive modes.

Gate: restart restores tabs/caret; simulated termination loses no journaled text; IME composition never triggers a partial canonical save; old projects open unchanged.

### Phase B — multiple editors

- Multiple chapter tabs with dirty indicators, close/reopen, reorder, and keyboard navigation.
- At most two editor groups initially, split left/right or top/bottom.
- Move/open a tab in either group and restore the layout.
- Keep the active editor as the source for Lens scope and evidence navigation.
- Add workspace replace preview; create a checkpoint before applying multiple-file changes.

Gate: switching and splitting preserve native undo while mounted, selection/caret, vertical mode, and unsaved drafts. A 100k-character chapter remains responsive under a documented benchmark.

### Phase C — history and review

- Current vs checkpoint and checkpoint vs checkpoint prose-aware diff.
- Chapter-level safe restore and variation comparison.
- Review Ledger stored as open JSON under `.novel-editor/reviews/`.
- Finding states: open, resolved, ignored, stale, needs-recheck.
- Store role, provider/model, manuscript/checkpoint hash, exact quote, chapter, offsets/context, cutoff/read boundary, and timestamps.
- Re-evaluate anchors after saves; ambiguity becomes stale instead of silently reattaching.

Gate: fixture-backed Japanese diff, reversible restore, exact-quote/stale tests, and no automatic manuscript mutation.

### Phase D — Japanese writing quality

- Measure IME composition, undo/redo, caret, selection, clipboard, punctuation, and long text in horizontal and vertical modes.
- Add explicit input helpers for full-width indent, paired Japanese brackets, ellipsis, and dash; every helper is optional and undoable.
- Define and fixture-test Markdown-compatible ruby, emphasis, and tate-chu-yoko notation before rendering it.
- Add a read-only proof/preview surface if direct rich editing would endanger the canonical text.

Gate: Windows/macOS/Linux interaction tests where automation is reliable, plus documented manual IME/vertical checks. No claim of full Japanese typesetting without JLReq-relevant evidence.

### Phase E — open notes and exits

- Pinable Markdown notes for characters, locations, worldbuilding, plot, and references.
- Minimal optional scene metadata in a documented JSON sidecar.
- TXT export, followed by fixture-backed DOCX if the dependency/license audit passes.
- Keep PDF, EPUB, Aozora, Narou, and Kakuyomu profiles adapter-based and defer those without demonstrated daily value.

## First-release scope decisions

- Regex search/replace is deferred. Literal search plus case sensitivity covers the frequent correction flow while avoiding an expert-only mode that can make destructive replacement easier to misunderstand. Project-wide replacement keeps an explicit preview and automatic checkpoint.
- DOCX is deferred until a round-trip fixture set and dependency/license review exist. Markdown and TXT are the trustworthy exits for 0.1.0; pretending a weak DOCX converter is production-ready would reduce author trust.
- PDF, EPUB, and posting-site profiles remain adapters for later releases. KOHON 0.1.0 is a writing and evidence-linked review environment, not DTP software.
- Native textarea remains the editing surface for 0.1.0. The measured state/history path is fast; migration to another editor is justified only by repeatable packaged-app failures, not architecture fashion.

### Phase F — KOHON launch

- Repeat security, accessibility, dependency, license, compatibility, and all-platform release audits.
- Recheck `KOHON`, `Hum1Tab/kohon`, package names, products, trademarks, and obvious domain conflicts immediately before publication.
- Only after every gate passes, migrate product metadata, UI, docs, artifact names, update URLs, config directory, and internal namespaces.
- Preserve `novel-lens.json` reading and old settings/config migration.
- Create a new repository with a clean, attributable initial history; do not rename the old repository.
- Publish KOHON `0.1.0` only after CI produces verified Windows, macOS, Linux, SHA-256, notices, and install documentation.

## Explicit non-goals for the first KOHON release

- AI prose generation, automatic rewrite, or automatic finding application
- realtime collaboration or proprietary cloud sync
- terminal/debugger/language-server features copied from VS Code
- plugin marketplace or arbitrary extension code
- mandatory accounts, telemetry, or operator-owned model keys
- database-only canonical manuscripts
- full desktop publishing, pagination, or print-layout editing
- large mandatory character/worldbuilding forms

## Completion evidence

Each phase requires source review, focused unit/interaction tests, a production build, and a short user-visible behavior check. A green build alone is not evidence for IME, vertical editing, recovery, accessibility, or cross-platform packaging. Final publication requires the release artifacts themselves and a successful clean install/update/old-project compatibility audit.
