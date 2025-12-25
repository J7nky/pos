import { createContext, useContext, useMemo, useState, ReactNode, useEffect } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';

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
  if (!path || typeof path !== 'string' || path.trim() === '') {
    return undefined;
  }
  const parts = path.split('.').filter(p => p.trim() !== '');
  if (parts.length === 0) {
    return undefined;
  }
  return parts.reduce((acc: any, part: string) => {
    if (acc === null || acc === undefined) {
      return undefined;
    }
    if (typeof acc !== 'object') {
      return undefined;
    }
    return acc[part] !== undefined ? acc[part] : undefined;
  }, obj);
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!template || !vars) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ''));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const offlineData = useOfflineData();
  
  // Get language from OfflineDataContext (which loads from IndexedDB stores table)
  const [language, setLanguage] = useState<string>(() => {
    // Default to Arabic if no store data is available yet
    return 'ar';
  });

  // Update language when store data is loaded
  useEffect(() => {
    if (offlineData?.language) {
      setLanguage(offlineData.language);
    }
  }, [offlineData?.language]);

  // Handle language changes by updating the store
  const handleLanguageChange = async (newLanguage: string) => {
    setLanguage(newLanguage);
    
    // Update the store's preferred language in IndexedDB
    if (offlineData?.updateLanguage) {
      try {
        await offlineData.updateLanguage(newLanguage as 'en' | 'ar' | 'fr');
      } catch (error) {
        console.error('Failed to update language preference:', error);
        // Language change still works locally even if database update fails
      }
    }
  };

  useEffect(() => {
    const dir = language === 'ar' ? 'rtl' : 'ltr';
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('dir', dir);
      document.documentElement.setAttribute('lang', language);
    }
  }, [language]);

  const value = useMemo<I18nContextType>(() => ({
    language,
    setLanguage: handleLanguageChange,
    t: (key: string, vars?: Record<string, string | number>) => {
      try {
        // Validate key
        if (!key || typeof key !== 'string') {
          console.warn('Invalid translation key:', key);
          return String(key || '');
        }

        // Ensure language is valid
        const validLanguage = (language && DICTIONARY[language]) ? language : 'ar';
        const dict = DICTIONARY[validLanguage] || {};
        
        let raw = getByPath(dict, key);
        if (raw === undefined) {
          // Fallback to English, then Arabic
          raw = getByPath(DICTIONARY.en || {}, key);
        }
        if (raw === undefined) {
          raw = getByPath(DICTIONARY.ar || {}, key);
        }
        
        // Ensure we always return a string
        // If raw is an object (shouldn't happen, but handle it defensively), convert to string
        let str: string;
        if (typeof raw === 'string') {
          str = raw;
        } else if (raw === null || raw === undefined) {
          // If translation not found, return the key as fallback
          str = key;
        } else if (typeof raw === 'object') {
          // If it's an object, this is an error - log it and use the key
          // Check if it's the DICTIONARY object itself (should never happen)
          const objKeys = Object.keys(raw);
          if (raw === DICTIONARY || raw === dict || raw === DICTIONARY.en || raw === DICTIONARY.ar || raw === DICTIONARY.fr || 
              (objKeys.length === 2 && objKeys.includes('en') && objKeys.includes('ar'))) {
            console.error(`CRITICAL: Translation key "${key}" returned a dictionary object! Keys: ${objKeys.join(', ')}. Using key as fallback.`);
            str = key;
          } else {
            console.warn(`Translation key "${key}" resolved to an object instead of a string. Object keys: ${objKeys.join(', ')}. Using key as fallback.`);
            str = key;
          }
        } else {
          // For numbers, booleans, etc., convert to string
          str = String(raw);
        }
        
        // Ensure interpolate receives a string
        const result = interpolate(str, vars);
        
        // Final safety check - ensure we NEVER return an object
        if (typeof result !== 'string') {
          console.error(`CRITICAL: Translation function returned non-string for key "${key}". Type: ${typeof result}. Returning key as fallback.`);
          return String(key);
        }
        
        // Double-check it's not an object (defensive programming)
        if (result && typeof result === 'object') {
          console.error(`CRITICAL: Translation result is an object for key "${key}". Returning key as fallback.`);
          return String(key);
        }
        
        return result;
      } catch (error) {
        console.error(`Error in translation function for key "${key}":`, error);
        return String(key || '');
      }
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


