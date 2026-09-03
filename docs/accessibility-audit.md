# Accessibility audit

This is the code-level accessibility baseline for the KOHON rebuild. It records what is implemented and keeps manual release checks distinct from automated evidence.

## Implemented

- Text prompt, Quick Open / Command Palette, and Settings expose modal dialog semantics.
- Modal dialogs keep Tab focus inside, close with Escape, and restore focus to the invoking control.
- Editor tabs use the ARIA tab pattern: only the selected tab is in the normal tab order; Left/Right and Home/End select another tab. `Alt+Shift+Left/Right` remains the explicit reorder shortcut.
- Side and bottom panel resizers expose separator semantics, their current/minimum/maximum size, and accept arrow keys plus Home/End. Resizing changes are announced by the existing polite live region.
- Icon-only controls in the welcome screen, outline import action, activity bar settings action, and dismissible errors have accessible names.
- Search counts, layout changes, save/recovery notices, and errors use live status or alert semantics where interruption is appropriate.

## Release checks still required

These are deliberately not claimed from static inspection:

- Keyboard-only pass through project creation/opening, editing, search/replace, checkpoint restore, settings, and update flow.
- Windows Narrator pass for editor tabs, panel tabs, resizers, dialogs, alerts, and the vertical-writing editor.
- macOS VoiceOver and Linux screen-reader smoke passes on packaged builds.
- Contrast review for every shipped light/dark theme combination at 100% and 200% zoom.
- Reduced-motion and high-contrast OS-mode review.

The release gate is a short representative pass on each packaged platform, not an exhaustive replay of every command.
