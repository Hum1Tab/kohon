import { describe, expect, it } from "vitest";

import { commandCategory, commandLabel, resolveAppLocale, uiText } from "./locale.js";
import { COMMAND_DEFINITIONS } from "./settings.js";

describe("application locale", () => {
  it("uses an explicit language or falls back to the operating system", () => {
    expect(resolveAppLocale("ja", "en-US")).toBe("ja");
    expect(resolveAppLocale("en", "ja-JP")).toBe("en");
    expect(resolveAppLocale("system", "ja-JP")).toBe("ja");
    expect(resolveAppLocale("system", "en-GB")).toBe("en");
  });

  it("localizes command labels and categories", () => {
    const command = COMMAND_DEFINITIONS.find((item) => item.id === "file.new")!;
    expect(commandLabel(command, "ja")).toBe("新しい作品");
    expect(commandLabel(command, "en")).toBe("New Project");
    expect(commandCategory(command, "en")).toBe("File");
  });

  it("localizes delayed status messages without changing manuscript text", () => {
    expect(uiText("en", "最新版を使用しています。")).toBe("You are using the latest version.");
    expect(uiText("en", "KOHON.exe をダウンロードしています… 42%")).toBe("Downloading KOHON.exe… 42%");
    expect(uiText("en", "作者が書いた本文")).toBe("作者が書いた本文");
  });
});
