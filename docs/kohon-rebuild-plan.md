# KOHON rebuild plan

Status: implementation in progress. Product and repository names remain **Novel Lens** until every implementation, compatibility, license, and release gate below passes.

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

The released desktop app already has atomic Markdown saves, chapters, direct vertical writing, workspace search, named checkpoints, safe restore, variation copies, evidence-checked AI lenses, user-owned AI connections, configurable workbench layout, keyboard bindings, and cross-platform releases.

The highest-risk gaps are not additional AI roles. They are:

1. one open document and one editor group;
2. no current-document Find/Replace or bulk workspace replacement preview;
3. no Quick Open or Command Palette;
4. no persisted editor session or crash draft journal;
5. checkpoints cannot be compared before restore;
6. AI findings are session-only and have no resolved/ignored/stale lifecycle;
7. the textarea architecture has not been stress-tested for long manuscripts, IME, multiple editor instances, or vertical selection;
8. `App.tsx` owns too many unrelated responsibilities.

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
- Add current-document Find/Replace with literal, case-sensitive, and regex modes.

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
