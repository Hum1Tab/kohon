import { createContext, useContext, useMemo, type ReactNode } from "react";

import { uiText, type AppLocale } from "../shared/locale.js";

type Translator = (japanese: string) => string;

interface LocaleContextValue {
  locale: AppLocale;
  t: Translator;
}

const LocaleContext = createContext<LocaleContextValue>({ locale: "ja", t: (text) => text });

export function LocaleProvider({ locale, children }: { locale: AppLocale; children: ReactNode }): ReactNode {
  const value = useMemo<LocaleContextValue>(() => ({ locale, t: (text) => uiText(locale, text) }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
