import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { en } from './en';
import { th, type Dictionary } from './th';

export type Locale = 'th' | 'en';
const dictionaries: Record<Locale, Dictionary> = { th, en };
const STORAGE_KEY = 'rr.locale';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'th' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  return 'th';
}

export type TFunction = (key: string, params?: Record<string, string | number | null | undefined>) => string;

export function translate(dict: Dictionary, key: string, params?: Record<string, string | number | null | undefined>): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = params?.[name];
    return v === undefined || v === null ? '' : String(v);
  });
}

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: TFunction;
  /** BCP 47 tag for Intl formatting (th-TH uses the Buddhist calendar). */
  intlLocale: string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = l;
  }, []);
  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: (k, p) => translate(dictionaries[locale], k, p), intlLocale: locale === 'th' ? 'th-TH' : 'en-GB' }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
