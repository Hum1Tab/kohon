import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRequire = createRequire(join(appRoot, "package.json"));
const codexRequire = createRequire(appRequire.resolve("@openai/codex/package.json"));

const platform = process.platform;
const arch = process.arch;
const targets = {
  "win32-x64": { rust: "x86_64-pc-windows-msvc", vendor: "x86_64-pc-windows-msvc", executable: "codex.exe" },
  "win32-arm64": { rust: "aarch64-pc-windows-msvc", vendor: "aarch64-pc-windows-msvc", executable: "codex.exe" },
  "darwin-x64": { rust: "x86_64-apple-darwin", vendor: "x86_64-apple-darwin", executable: "codex" },
  "darwin-arm64": { rust: "aarch64-apple-darwin", vendor: "aarch64-apple-darwin", executable: "codex" },
  "linux-x64": { rust: "x86_64-unknown-linux-gnu", vendor: "x86_64-unknown-linux-musl", executable: "codex" },
  "linux-arm64": { rust: "aarch64-unknown-linux-gnu", vendor: "aarch64-unknown-linux-musl", executable: "codex" }
};
const target = targets[`${platform}-${arch}`];
if (target === undefined) throw new Error(`Unsupported Codex sidecar target: ${platform}-${arch}`);

// Tauri sets the exact Rust target triple when it invokes beforeBuildCommand.
const rustTriple = process.env.TAURI_ENV_TARGET_TRIPLE || target.rust;
const alias = `@openai/codex-${platform}-${arch}`;
let runtimeRoot;
try {
  runtimeRoot = dirname(codexRequire.resolve(`${alias}/package.json`));
} catch {
  throw new Error(`Install the optional dependency ${alias} before building KOHON.`);
}
const source = join(runtimeRoot, "vendor", target.vendor, "bin", target.executable);
if (!existsSync(source)) throw new Error(`Missing Codex executable for ${platform}-${arch}: ${source}`);
const destinationDirectory = join(appRoot, "src-tauri", "binaries");
const destination = join(destinationDirectory, `codex-${rustTriple}${platform === "win32" ? ".exe" : ""}`);
mkdirSync(destinationDirectory, { recursive: true });
for (const file of ["codex-.exe", "codex-"]) rmSync(join(destinationDirectory, file), { force: true });
copyFileSync(source, destination);
if (platform !== "win32") chmodSync(destination, 0o755);
console.log(`Staged Codex sidecar: ${destination}`);
