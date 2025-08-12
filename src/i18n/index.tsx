import React, { createContext, useContext, useMemo, useState, ReactNode, useEffect } from 'react';

type Translations = Record<string, any>;

type I18nContextType = {
  language: string;
  setLanguage: (lang: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

// Arabic is default language
import ar from './locales/ar';
import en from './locales/en';
import fr from './locales/fr';

const DICTIONARY: Record<string, Translations> = { ar, en, fr };

function getByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc: any, part: string) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!template || !vars) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ''));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<string>(() => {
    const stored = localStorage.getItem('app_language');
    return stored || 'ar';
  });

  useEffect(() => {
    localStorage.setItem('app_language', language);
    const dir = language === 'ar' ? 'rtl' : 'ltr';
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('dir', dir);
      document.documentElement.setAttribute('lang', language);
    }
  }, [language]);

  const value = useMemo<I18nContextType>(() => ({
    language,
    setLanguage,
    t: (key: string, vars?: Record<string, string | number>) => {
      const dict = DICTIONARY[language] || {};
      let raw = getByPath(dict, key);
      if (raw === undefined) {
        // Fallback to English, then Arabic
        raw = getByPath(DICTIONARY.en || {}, key);
      }
      if (raw === undefined) {
        raw = getByPath(DICTIONARY.ar || {}, key);
      }
      const str = typeof raw === 'string' ? raw : key;
      return interpolate(str, vars);
    },
  }), [language]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
}


