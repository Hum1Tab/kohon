import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "./LocaleContext.js";
import { ProjectHome, type ProjectHomeProps } from "./ProjectHome.js";

const base: ProjectHomeProps = {
  appInfo: null, recent: [], busy: false, error: null, colorTheme: "light",
  onToggleTheme() {}, onCreate() {}, onOpen() {}, onOpenRecent() {}, onSettings() {}
};
const render = (patch: Partial<ProjectHomeProps> = {}, locale: "ja" | "en" = "ja") => renderToStaticMarkup(createElement(LocaleProvider, { locale, children: createElement(ProjectHome, { ...base, ...patch }) }));

describe("project home", () => {
  it("gives first-time writers a clear create/open path, not a fake recent project", () => {
    const markup = render();
    expect(markup).toContain("最初の一行から。");
    expect(markup).toContain("新しい作品");
    expect(markup).toContain("別の作品を開く");
    expect(markup).not.toContain("続きから書く");
  });
  it("promotes the latest project and escapes project titles", () => {
    const markup = render({ recent: [{ root: "C:/novel", title: "<First>", lastOpenedAt: "2026-09-07T00:00:00Z" }, { root: "C:/other", title: "Second", lastOpenedAt: "2026-09-06T00:00:00Z" }] });
    expect(markup).toContain("続きから書く");
    expect(markup).toContain("&lt;First&gt;");
    expect(markup).toContain("最近の作品");
    expect(markup).toContain("Second");
  });
  it("shows busy and error feedback and localizes the empty state", () => {
    const markup = render({ busy: true, error: "Cannot open this project" }, "en");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Opening your project");
    expect(markup).toContain("Start with the first line.");
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain("最初の一行から。");
  });
});
