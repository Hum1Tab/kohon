import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createDesktopApi } from "../desktop/api.js";
import { App } from "./App.js";
import "./styles.css";
import "./workbench-design.css";
import "./story-map.css";

const rootElement = document.getElementById("root");
if (rootElement === null) throw new Error("Application root is missing");
const root: HTMLElement = rootElement;

function showStartupError(error: unknown): void {
  const japanese = !navigator.language || navigator.language.toLowerCase().startsWith("ja");
  const message = error instanceof Error ? error.message : String(error);
  const panel = document.createElement("div");
  panel.className = "startup-error";
  const title = document.createElement("h1");
  title.textContent = japanese ? "KOHONを起動できませんでした。" : "KOHON could not start.";
  const detail = document.createElement("p");
  detail.textContent = message;
  const hint = document.createElement("p");
  hint.textContent = japanese
    ? "OSの再起動後にもう一度試してください。問題が続く場合は、KOHONの再インストールが必要です。"
    : "Try again after restarting your computer. If the problem continues, reinstall KOHON.";
  panel.append(title, detail, hint);
  root.replaceChildren(panel);
}

// React unmounts the whole tree when a render or effect throws without an error boundary, which used
// to leave a blank window with no clue. Surface such failures in the same panel as a failed bootstrap.
let rendered = false;

function reportBlankWindow(error: unknown): void {
  if (rendered && root.childElementCount === 0) showStartupError(error);
}

window.addEventListener("error", (event) => {
  if (!(event instanceof ErrorEvent) || event.message === "") return;
  reportBlankWindow(event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  reportBlankWindow(event.reason);
});

async function bootstrap(): Promise<void> {
  window.kohon = Object.freeze(await createDesktopApi());
  rendered = true;
  createRoot(root).render(<StrictMode><App /></StrictMode>);
}

void bootstrap().catch(showStartupError);
