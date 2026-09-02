import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrateLegacyUserData } from "./user-data-migration.js";

describe("KOHON user data migration", () => {
  it("copies legacy settings and encrypted credentials without overwriting KOHON data", async () => {
    const root = await mkdtemp(join(tmpdir(), "kohon-user-data-"));
    const legacy = join(root, "Novel Lens");
    const current = join(root, "KOHON");
    await mkdir(legacy);
    await mkdir(current);
    await writeFile(join(legacy, "settings.json"), "legacy-settings");
    await writeFile(join(legacy, "openai-credential.bin"), "encrypted-credential");
    await writeFile(join(current, "settings.json"), "current-settings");

    expect(await migrateLegacyUserData(current, [legacy])).toEqual(["openai-credential.bin"]);
    expect(await readFile(join(current, "settings.json"), "utf8")).toBe("current-settings");
    expect(await readFile(join(current, "openai-credential.bin"), "utf8")).toBe("encrypted-credential");
    expect(await readFile(join(legacy, "openai-credential.bin"), "utf8")).toBe("encrypted-credential");
  });
});
