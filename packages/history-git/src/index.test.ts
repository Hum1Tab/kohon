import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { UserOwnedGitAdapter } from "./index.js";

const roots: string[] = [];
afterAll(async () => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))));

describe("user-owned Git/GitHub integration", () => {
  it("uses local Git identity and exposes no operator token surface", async () => {
    const root = await mkdtemp(join(tmpdir(), "novel-lens-git-"));
    roots.push(root);
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Fixture Author"], { cwd: root });
    await writeFile(join(root, "chapter.md"), "第一稿\n", "utf8");
    const adapter = new UserOwnedGitAdapter();
    const capabilities = await adapter.probe(root);
    expect(capabilities).toMatchObject({ gitInstalled: true, isRepository: true, operatorCredentialRequired: false, credentialOwnership: "user-os-keychain-or-ssh" });
    expect(JSON.stringify(capabilities)).not.toMatch(/token|password|remoteUrl/iu);
    const checkpoint = await adapter.createCheckpoint(root, "最初のチェックポイント", ["chapter.md"]);
    expect(checkpoint.created).toBe(true);
    expect(checkpoint.commit).toMatch(/^[a-f0-9]{40,64}$/u);
    await writeFile(join(root, "chapter.md"), "第二稿\n", "utf8");
    expect(await adapter.diff(root, ["chapter.md"])).toContain("第二稿");
    expect((await adapter.history(root, 5))[0]?.subject).toBe("最初のチェックポイント");
    await adapter.createVariation(root, "alternate-ending");
    expect((await adapter.probe(root)).branch).toBe("alternate-ending");
  });
});

