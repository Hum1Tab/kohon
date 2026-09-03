import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export interface GitCapabilities {
  gitInstalled: boolean;
  gitVersion: string | null;
  isRepository: boolean;
  repositoryRoot: string | null;
  branch: string | null;
  remoteNames: string[];
  credentialOwnership: "user-os-keychain-or-ssh";
  operatorCredentialRequired: false;
}

export interface GitHubCapabilities {
  cliInstalled: boolean;
  userAuthenticated: boolean;
  authenticationOwnership: "user-github-cli";
  operatorTokenRequired: false;
}

export interface GitStatusEntry {
  index: string;
  workingTree: string;
  path: string;
}

export interface HistoryEntry {
  commit: string;
  authoredAt: string;
  subject: string;
}

export interface CheckpointResult {
  created: boolean;
  commit: string | null;
}

export class GitIntegrationError extends Error {
  readonly code: "GIT_NOT_INSTALLED" | "NOT_REPOSITORY" | "GIT_COMMAND_FAILED" | "INVALID_PATH" | "AUTH_REQUIRED";
  readonly safeMessage: string;

  constructor(code: GitIntegrationError["code"], safeMessage: string, options?: ErrorOptions) {
    super(safeMessage, options);
    this.name = "GitIntegrationError";
    this.code = code;
    this.safeMessage = safeMessage;
  }
}

interface CommandResult {
  stdout: string;
  exitCode: number;
}

async function command(
  executable: "git" | "gh",
  args: readonly string[],
  cwd: string,
  acceptedExitCodes: readonly number[] = [0],
  timeoutMs = 30_000
): Promise<CommandResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, [...args], {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" }
    });
    const stdout: Buffer[] = [];
    let stdoutSize = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutSize += chunk.byteLength;
      if (stdoutSize <= 10_000_000) stdout.push(chunk);
    });
    child.stderr.resume();
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.once("error", (cause: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (cause.code === "ENOENT") rejectPromise(new GitIntegrationError("GIT_NOT_INSTALLED", `${executable}が見つかりません。`, { cause }));
      else rejectPromise(new GitIntegrationError("GIT_COMMAND_FAILED", `${executable}を起動できませんでした。`, { cause }));
    });
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      const code = exitCode ?? -1;
      if (!acceptedExitCodes.includes(code)) {
        rejectPromise(new GitIntegrationError("GIT_COMMAND_FAILED", "Git操作を完了できませんでした。利用者の認証・権限・作業状態を確認してください。"));
        return;
      }
      resolvePromise({ stdout: Buffer.concat(stdout).toString("utf8"), exitCode: code });
    });
  });
}

async function resolvedDirectory(directory: string): Promise<string> {
  if (!isAbsolute(directory)) throw new GitIntegrationError("INVALID_PATH", "project directoryは絶対pathで指定してください。");
  try {
    return await realpath(directory);
  } catch (cause) {
    throw new GitIntegrationError("INVALID_PATH", "project directoryを確認できません。", { cause });
  }
}

function assertRelativeProjectPath(path: string): string {
  const normalized = normalize(path);
  if (path.length === 0 || isAbsolute(path) || normalized === ".." || normalized.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new GitIntegrationError("INVALID_PATH", "project外のpathは履歴へ追加できません。");
  }
  return normalized;
}

function sanitizeSubject(subject: string): string {
  const oneLine = subject.replace(/[\r\n\u0000]/gu, " ").trim();
  if (oneLine.length === 0 || oneLine.length > 200) throw new GitIntegrationError("GIT_COMMAND_FAILED", "checkpoint名は1〜200文字で指定してください。");
  return oneLine;
}

export class UserOwnedGitAdapter {
  async probe(directory: string): Promise<GitCapabilities> {
    const cwd = await resolvedDirectory(directory);
    let version: string;
    try {
      version = (await command("git", ["--version"], cwd)).stdout.trim();
    } catch (error) {
      if (error instanceof GitIntegrationError && error.code === "GIT_NOT_INSTALLED") {
        return { gitInstalled: false, gitVersion: null, isRepository: false, repositoryRoot: null, branch: null, remoteNames: [], credentialOwnership: "user-os-keychain-or-ssh", operatorCredentialRequired: false };
      }
      throw error;
    }
    const repository = await command("git", ["rev-parse", "--show-toplevel"], cwd, [0, 128]);
    if (repository.exitCode !== 0) {
      return { gitInstalled: true, gitVersion: version, isRepository: false, repositoryRoot: null, branch: null, remoteNames: [], credentialOwnership: "user-os-keychain-or-ssh", operatorCredentialRequired: false };
    }
    const root = repository.stdout.trim();
    const branch = (await command("git", ["branch", "--show-current"], root)).stdout.trim() || null;
    const remoteNames = (await command("git", ["remote"], root)).stdout.split(/\r?\n/u).map((name) => name.trim()).filter(Boolean);
    return { gitInstalled: true, gitVersion: version, isRepository: true, repositoryRoot: root, branch, remoteNames, credentialOwnership: "user-os-keychain-or-ssh", operatorCredentialRequired: false };
  }

  async probeGitHub(directory: string): Promise<GitHubCapabilities> {
    const cwd = await resolvedDirectory(directory);
    try {
      const result = await command("gh", ["auth", "status"], cwd, [0, 1]);
      return { cliInstalled: true, userAuthenticated: result.exitCode === 0, authenticationOwnership: "user-github-cli", operatorTokenRequired: false };
    } catch (error) {
      if (error instanceof GitIntegrationError && error.code === "GIT_NOT_INSTALLED") {
        return { cliInstalled: false, userAuthenticated: false, authenticationOwnership: "user-github-cli", operatorTokenRequired: false };
      }
      throw error;
    }
  }

  async status(directory: string): Promise<GitStatusEntry[]> {
    const root = await this.requireRepository(directory);
    const output = (await command("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], root)).stdout;
    return output.split("\u0000").filter(Boolean).map((entry) => ({ index: entry[0] ?? " ", workingTree: entry[1] ?? " ", path: entry.slice(3) }));
  }

  async history(directory: string, limit = 50): Promise<HistoryEntry[]> {
    const root = await this.requireRepository(directory);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new GitIntegrationError("GIT_COMMAND_FAILED", "履歴件数は1〜500で指定してください。");
    const output = (await command("git", ["log", `-${limit}`, "-z", "--pretty=format:%H%x1f%aI%x1f%s%x00"], root, [0, 128])).stdout;
    return output.split("\u0000").filter(Boolean).map((entry) => {
      const [commit = "", authoredAt = "", subject = ""] = entry.split("\u001f");
      return { commit, authoredAt, subject };
    });
  }

  async diff(directory: string, paths: readonly string[] = []): Promise<string> {
    const root = await this.requireRepository(directory);
    const safePaths = paths.map(assertRelativeProjectPath);
    return (await command("git", ["diff", "--no-ext-diff", "--no-color", "--", ...safePaths], root)).stdout;
  }

  async createCheckpoint(directory: string, subject: string, managedPaths: readonly string[]): Promise<CheckpointResult> {
    const root = await this.requireRepository(directory);
    if (managedPaths.length === 0) throw new GitIntegrationError("INVALID_PATH", "checkpoint対象がありません。");
    const safePaths = managedPaths.map(assertRelativeProjectPath);
    await command("git", ["add", "--", ...safePaths], root);
    const changed = await command("git", ["diff", "--cached", "--quiet", "--", ...safePaths], root, [0, 1]);
    if (changed.exitCode === 0) return { created: false, commit: null };
    await command("git", ["commit", "--no-verify", "-m", sanitizeSubject(subject), "--", ...safePaths], root);
    const commit = (await command("git", ["rev-parse", "HEAD"], root)).stdout.trim();
    return { created: true, commit };
  }

  async createVariation(directory: string, branchName: string): Promise<void> {
    const root = await this.requireRepository(directory);
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/u.test(branchName) || branchName.includes("..") || branchName.endsWith("/") || branchName.includes("//")) {
      throw new GitIntegrationError("GIT_COMMAND_FAILED", "分岐名に使用できない文字があります。");
    }
    await command("git", ["switch", "-c", branchName], root);
  }

  async syncToUserRemote(directory: string, remoteName = "origin"): Promise<void> {
    const root = await this.requireRepository(directory);
    if (!/^[A-Za-z0-9._-]{1,64}$/u.test(remoteName)) throw new GitIntegrationError("GIT_COMMAND_FAILED", "remote名を確認してください。");
    const branch = (await command("git", ["branch", "--show-current"], root)).stdout.trim();
    if (branch.length === 0) throw new GitIntegrationError("GIT_COMMAND_FAILED", "現在の分岐を確認できません。");
    try {
      await command("git", ["push", "--set-upstream", remoteName, branch], root, [0], 120_000);
    } catch (cause) {
      throw new GitIntegrationError("AUTH_REQUIRED", "利用者自身のGitHub認証またはremote権限を確認してください。運営者tokenへのfallbackは行いません。", { cause });
    }
  }

  private async requireRepository(directory: string): Promise<string> {
    const capabilities = await this.probe(directory);
    if (!capabilities.gitInstalled) throw new GitIntegrationError("GIT_NOT_INSTALLED", "Gitが見つかりません。");
    if (!capabilities.isRepository || capabilities.repositoryRoot === null) throw new GitIntegrationError("NOT_REPOSITORY", "このprojectにはまだ履歴がありません。");
    const requested = await resolvedDirectory(directory);
    const rel = relative(capabilities.repositoryRoot, requested);
    if (rel.startsWith("..") || isAbsolute(rel)) throw new GitIntegrationError("INVALID_PATH", "repository境界を確認できません。");
    return resolve(capabilities.repositoryRoot);
  }
}

