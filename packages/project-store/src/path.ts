/** Platform-neutral path helpers used in both Node and the Tauri WebView. */

export function isAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/u.test(value) || value.startsWith("\\\\") || value.startsWith("/");
}

function looksWindows(value: string): boolean {
  return /^[A-Za-z]:/u.test(value) || value.includes("\\");
}

/**
 * Windows canonical paths arrive as `\\?\C:\…`. That prefix hides the drive letter from the checks
 * below, so translate it back to a normal path (or a UNC path) before normalizing.
 */
function stripWindowsVerbatim(value: string): string {
  if (value.startsWith("//?/UNC/")) return `//${value.slice("//?/UNC/".length)}`;
  if (value.startsWith("//?/")) return value.slice("//?/".length);
  return value;
}

export function normalizePath(value: string): string {
  const windows = looksWindows(value);
  const source = stripWindowsVerbatim(value.replaceAll("\\", "/"));
  const unc = source.startsWith("//");
  const drive = /^([A-Za-z]:)(?:\/|$)/u.exec(source);
  const absolute = drive !== null || source.startsWith("/");
  let prefix = drive === null ? (source.startsWith("/") ? (unc ? "//" : "/") : "") : `${drive[1]}/`;
  const rest = source.slice(prefix.length);
  const parts: string[] = [];
  for (const part of rest.split("/")) {
    if (part.length === 0 || part === ".") continue;
    if (part === "..") {
      if (parts.length > 0) parts.pop();
      continue;
    }
    parts.push(part);
  }
  let normalized = `${prefix}${parts.join("/")}`;
  if (normalized.length === 0) normalized = absolute ? "/" : ".";
  if (windows && drive !== null && normalized === `${drive[1]}/`) return normalized;
  return normalized;
}

export function joinPath(...parts: readonly string[]): string {
  let result = "";
  for (const part of parts) {
    if (part.length === 0) continue;
    if (result.length === 0) {
      result = part;
      continue;
    }
    if (isAbsolutePath(part)) {
      result = part;
      continue;
    }
    result = `${result.replace(/[\\/]+$/u, "")}/${part.replace(/^[\\/]+/u, "")}`;
  }
  return result;
}

export function dirnamePath(value: string): string {
  const normalized = normalizePath(value);
  const index = normalized.lastIndexOf("/");
  if (index < 0) return ".";
  if (index === 0) return "/";
  if (/^[A-Za-z]:$/u.test(normalized.slice(0, index))) return `${normalized.slice(0, index)}/`;
  return normalized.slice(0, index);
}

export function basenamePath(value: string): string {
  const normalized = normalizePath(value).replace(/[\\/]+$/u, "");
  const index = normalized.lastIndexOf("/");
  return index < 0 ? normalized : normalized.slice(index + 1);
}

export function extnamePath(value: string): string {
  const base = basenamePath(value);
  const index = base.lastIndexOf(".");
  return index <= 0 ? "" : base.slice(index);
}

/** Canonical comparison key; Windows path matching is case-insensitive. */
export function pathKey(value: string): string {
  const normalized = normalizePath(value);
  return looksWindows(value) ? normalized.toLocaleLowerCase("en-US") : normalized;
}

export function isPathInside(root: string, candidate: string): boolean {
  const rootKey = pathKey(root).replace(/\/+$/u, "");
  const candidateKey = pathKey(candidate).replace(/\/+$/u, "");
  return candidateKey === rootKey || candidateKey.startsWith(`${rootKey}/`);
}

/** Resolve a relative managed path and reject traversal outside the project root. */
export function resolveManagedPath(root: string, path: string): string {
  const resolved = isAbsolutePath(path) ? normalizePath(path) : normalizePath(joinPath(root, path));
  if (!isPathInside(root, resolved)) throw new Error("managed path boundary violation");
  return resolved;
}
