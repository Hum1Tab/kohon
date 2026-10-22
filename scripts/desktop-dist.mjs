import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { desktopPnpmCommand } from "./desktop-dist-command.mjs";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));

const forwardedArguments = process.argv.slice(2);
while (forwardedArguments[0] === "--") {
  forwardedArguments.shift();
}

const { executable, prefix: executablePrefix } = desktopPnpmCommand({
  cli: process.env.npm_execpath,
  node: process.execPath,
  platform: process.platform,
});

function runPnpm(arguments_) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, [...executablePrefix, ...arguments_], {
      cwd: workspaceRoot,
      env: process.env,
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
await runPnpm(["--filter", "@kohon/desktop", "exec", "tauri", "build", ...forwardedArguments]);
