import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const cacheRoot = resolve(workspaceRoot, ".cache");
const electronCache = resolve(cacheRoot, "electron");
const builderCache = resolve(cacheRoot, "electron-builder");

mkdirSync(electronCache, { recursive: true });
mkdirSync(builderCache, { recursive: true });
writeFileSync(
  resolve(cacheRoot, "package.json"),
  `${JSON.stringify({ private: true, type: "commonjs" }, null, 2)}\n`,
);

const environment = {
  ...process.env,
  ELECTRON_CACHE: electronCache,
  ELECTRON_BUILDER_CACHE: builderCache,
  electron_config_cache: electronCache,
};

if (process.platform === "win32") {
  environment.LOCALAPPDATA = cacheRoot;
} else if (process.platform === "linux") {
  environment.XDG_CACHE_HOME = cacheRoot;
}

const forwardedArguments = process.argv.slice(2);
while (forwardedArguments[0] === "--") {
  forwardedArguments.shift();
}
const builderArguments = forwardedArguments.some(
  (argument) => argument === "--publish" || argument.startsWith("--publish="),
)
  ? forwardedArguments
  : [...forwardedArguments, "--publish", "never"];

const pnpmCli = process.env.npm_execpath;
const executable = pnpmCli
  ? process.execPath
  : process.platform === "win32"
    ? "pnpm.cmd"
    : "pnpm";
const executablePrefix = pnpmCli ? [pnpmCli] : [];

function runPnpm(arguments_) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, [...executablePrefix, ...arguments_], {
      cwd: workspaceRoot,
      env: environment,
      stdio: "inherit",
    });

    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          signal
            ? `pnpm was terminated by ${signal}`
            : `pnpm exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}

await runPnpm(["--filter", "@kohon/editor-core", "build"]);
await runPnpm(["--filter", "@kohon/project-store", "build"]);
await runPnpm(["--filter", "@kohon/desktop", "build"]);
await runPnpm([
  "--filter",
  "@kohon/desktop",
  "exec",
  "electron-builder",
  ...builderArguments,
]);
