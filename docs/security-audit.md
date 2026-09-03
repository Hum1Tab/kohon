# Desktop security audit

Audit date: 2026-09-03. Scope: the packaged Electron desktop app, preload bridge, privileged IPC, credential storage, updater, and production dependencies.

Primary checklist: [Electron security recommendations](https://www.electronjs.org/docs/latest/tutorial/security).

## Verified controls

| Control | Current evidence |
| --- | --- |
| Trusted content only | The main window loads the packaged `dist/index.html`. Network calls run in the main process; the renderer CSP has `connect-src 'none'`. |
| Renderer isolation | `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, and `allowRunningInsecureContent: false`. |
| CSP | `default-src 'self'`; scripts only from self; images only self/data; frames, objects, forms, and base URLs disabled. Inline style remains allowed for React's user-selected manuscript palette and layout sizes. |
| Permissions | Both permission request and permission check handlers deny every browser permission. |
| Navigation and windows | Every navigation is prevented and every renderer-created window is denied. No `webview` or remote iframe exists. |
| IPC boundary | The preload exposes named methods rather than raw `ipcRenderer`. Every `ipcMain.handle` and close signal now verifies the exact main `webContents` and main frame before privileged work. Arguments are then bounded and validated again in the main/store layer. |
| Filesystem boundary | Project IPC accepts only canonical roots chosen during the current app session. Project-store paths are resolved and checked against the managed root. Manuscript writes are atomic. |
| External URLs | Fixed pages use a closed allowlist. Login URLs require HTTPS and OpenAI/ChatGPT hosts. Update pages and assets require exact GitHub repository/asset hosts and path patterns. |
| Credentials | OpenAI keys use Electron `safeStorage`; Linux `basic_text` is rejected. The encrypted file is atomically written with mode `0600`. Keys are not stored in projects or settings. |
| Updates | Installer size is capped at 512 MiB, host/path are allowlisted, and SHA-256 must match GitHub's asset digest or the matching release checksum file before launch. |
| KOHON migration | The updater accepts only `Hum1Tab/kohon`. New projects use `kohon.json`; legacy manifests remain readable. Existing settings and encrypted credentials are copied only when the KOHON destination is absent, without deleting the source. |
| Slow close | A four-second save timeout no longer closes silently. The author must choose either to keep waiting or explicitly force exit; recovery drafts remain available. |
| Packaged runtime | Electron fuses disable `RunAsNode`, `NODE_OPTIONS`, and CLI inspect arguments. Cookie encryption, embedded ASAR integrity validation, and loading the app only from ASAR are enabled. The Windows x64 packaged executable was read back with `@electron/fuses` after packaging. |
| Dependency scan | `pnpm audit --prod` reported no known vulnerabilities. `pnpm outdated electron --format json` reported no newer configured package on the audit date. |

## Residual launch gates

- The app still uses `file://`. Moving to a privileged custom protocol is deferred because it changes navigation and asset loading semantics and needs interactive packaged-app regression coverage.
- Windows and macOS signing/notarization are not yet proven. SHA-256 verifies downloaded release bytes, but signing is still required for a stable trust chain.
- `style-src 'unsafe-inline'` is retained for dynamic local styles; script execution remains restricted to self.
- Run the audit again against the exact lockfile and packaged artifacts immediately before KOHON 0.1.0 publication.
