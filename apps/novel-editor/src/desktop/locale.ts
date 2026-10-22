import { resolveAppLocale, uiText, type AppLocale } from "../shared/locale.js";
import type { UserSettings } from "../shared/settings.js";

export function currentLocale(settings: UserSettings, systemLocale: string): AppLocale {
  return resolveAppLocale(settings.general.language, systemLocale);
}

export function mainText(settings: UserSettings, systemLocale: string, japanese: string): string {
  return uiText(currentLocale(settings, systemLocale), japanese);
}

/** Translate errors that originate in Rust or the project store. */
export function safeMessage(settings: UserSettings, systemLocale: string, error: unknown): string {
  if (!(error instanceof Error)) return mainText(settings, systemLocale, "処理を完了できませんでした。");
  const message = error.message.replace(/[\r\n\u0000]+/gu, " ").slice(0, 500);
  const key = Object.entries({
    "chapter not found": "章が見つかりません。",
    "invalid project manifest": "KOHON projectとして読み込めません。",
    "managed path boundary violation": "project外のファイル操作を拒否しました。",
    "invalid snapshot id": "保存点を確認できません。",
    "EACCES: managed path boundary violation": "project外のファイル操作を拒否しました。"
  }).find(([source]) => message === source || message.endsWith(`: ${source}`));
  return mainText(settings, systemLocale, key?.[1] ?? message);
}
