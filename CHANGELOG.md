# Changelog

All notable changes to KOHON are documented here.

## 0.2.3 - 2026-09-05

### Fixed

- Fixed ChatGPT/Codex lens runs failing at thread creation because the current App Server protocol expects the legacy `sandbox` mode value `read-only` rather than `readOnly`.

## 0.2.2 - 2026-09-04

### Changed

- Removed the connection, model, and reading-boundary selectors from the everyday Editorial Lens panel; connection and model choices remain available in Settings where they belong.
- Editorial Lens now automatically reads through the current chapter, keeps its exact chapter list collapsed until requested, and only shows connection setup when action is required.

## 0.2.1 - 2026-09-04

### Changed

- Simplified panel dragging to show only one subtle preview for the current drop destination instead of displaying five boxes on every panel.
- Removed the floating drag label and redundant panel outlines for a quieter, VS Code-like docking interaction.

## 0.2.0 - 2026-09-04

### Added

- Replaced the fixed three-slot workbench with a recursive dock tree that supports arbitrarily nested horizontal and vertical panel groups.
- Added five-zone drag targets on tool panels: drop on an edge to split, or in the center to join the target tab group.
- Added per-split pointer and keyboard resizing, persisted split ratios, tab order, active tabs, and visibility.
- Added keyboard-operable layout settings for moving each view around the manuscript or joining any other tab group.

### Changed

- Focus mode now renders only the manuscript editor regardless of the saved dock tree.
- Existing Novel Lens and KOHON fixed-slot settings migrate to the new layout without changing manuscript files.

## 0.1.2 - 2026-09-04

### Fixed

- Fixed a React hook-order crash that left the workbench completely blank after opening or creating a project.
- Restored opening existing `kohon.json` and legacy `novel-lens.json` projects without changing manuscript data.
- Removed the repetitive project-opened success banner; actionable errors and save warnings remain visible.

## 0.1.1 - 2026-09-03

### Added

- Added Japanese, English, and operating-system language choices in Settings, covering the workbench, native menus, dialogs, connection states, update states, and default chapter/scene names.
- Added a Japanese/English language selector to the Windows installer.

### Improved

- Added one-click Writing, Review, and Compare workbench layouts without discarding the author's chosen panel side or size.
- Made Command Palette access visible in the title area and made Activity Bar destinations understandable without memorizing icons.
- Moved document save state beside manuscript statistics and made it an immediate Save action.
- Moved the AI Lens question and reading-position controls before prior results, keeping the next action reachable in long sessions.
- Reduced decorative chrome and vertical toolbar space so the manuscript remains the visual center.
- Made white the default workbench theme while retaining paper and dark as explicit choices.
- Improved Settings search for multi-word Japanese queries and strengthened tab/panel accessibility relationships.

## 0.1.0 - 2026-09-03

### Added

- Added multiple manuscript tabs, two editor groups, horizontal/vertical split, tab restore, Quick Open, Command Palette, and configurable workbench docking.
- Added IME-aware bounded undo/redo, visible crash-recovery drafts, current-document Find/Replace, and previewed project-wide replacement with an automatic checkpoint.
- Added chapter/scene drag and drop, split/merge, optional metadata, and author-owned pinned Markdown notes.
- Added checkpoint diff, checkpoint-to-checkpoint comparison, whole-project and chapter-only safe restore, and a persistent evidence-linked Review Ledger.
- Added explicit Japanese indentation, quote, punctuation, ruby, emphasis, and tate-chu-yoko helpers while retaining Markdown as the canonical text.
- Added ChatGPT Codex sign-in alongside OpenAI BYOK and Offline Mock, without automatic prose application.
- Added KOHON product metadata, release artifacts, updater allowlist, `kohon.json` for new projects, and non-destructive settings/project compatibility with Novel Lens.

### Verified

- Production renderer/main/preload bundle, focused 100k-character editor-state benchmark, IPC sender validation, production dependency audit, and code-level accessibility audit.

## Legacy Novel Lens history

## 0.2.0 - 2026-09-01

### Added

- Added a dedicated VS Code-inspired settings view with searchable categories and separate user/workspace scopes.
- Added a native top-level Settings menu beside File and Edit, with direct links to every settings category.
- Added editable, conflict-checked keyboard shortcuts that immediately rebuild the native application menu.
- Added OpenAI API connection verification and OS-protected encrypted credential storage outside the manuscript panel.
- Added GitHub CLI browser login and connection status without reading or storing the user's token.
- Added an in-app update center that checks public GitHub Releases, downloads the correct installer, verifies its SHA-256, and launches it in one action.

### Changed

- User defaults such as autosave, editor appearance, AI provider, model, update checks, and keybindings now persist atomically in the OS application-settings directory.
- The lens panel no longer receives or retains an API key after OpenAI has been connected.

## 0.1.1 - 2026-09-01

### Fixed

- Restored the visible, clickable primary action on the welcome screen.
- Replaced unsupported Electron `window.prompt()` calls with an in-app text dialog.
- Made existing projects open through their visible `novel-lens.json` file instead of an empty-looking directory-only picker.
- Kept welcome actions reachable at small window sizes and high display scaling.

## 0.1.0 - 2026-08-31

### Added

- Local-first Electron novel editor backed by plain Markdown files.
- Chapter/scene creation, import, rename, reorder, autosave, search, and export.
- Horizontal and direct vertical writing with workspace customization.
- Native checkpoints, safe restore, and independent variation folders.
- Five role-specific conversational lenses with explicit scope preview.
- Offline Mock and OpenAI BYOK with locally verified quote anchors.
- Windows, macOS, and Linux installer configuration and gated GitHub Release workflow.
- Apache-2.0 license, security policy, contribution guide, checksums, and dependency-license artifacts.
