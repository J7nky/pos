/**
 * Multilingual data handling utilities
 * 
 * Supports storing and retrieving multilingual data in the database.
 * Data can be stored as:
 * - Simple string (backwards compatible): "apple"
 * - Multilingual object: { en: "apple", ar: "تفاح", fr: "pomme" }
 */

export type SupportedLanguage = 'en' | 'ar' | 'fr';

export type MultilingualString = string | Record<SupportedLanguage, string> | Partial<Record<SupportedLanguage, string>>;

/**
 * Parse stringified JSON multilingual data back to object
 * Handles the case where multilingual objects are stored as JSON strings in the database
 * @param data - Multilingual data that might be stringified
 * @returns Parsed multilingual data
 */
export function parseMultilingualString(data: MultilingualString | null | undefined): MultilingualString | null | undefined {
  if (!data) return data;
  
  // If it's a string that looks like JSON, try to parse it
  if (typeof data === 'string' && data.startsWith('{')) {
    try {
      return JSON.parse(data) as Record<SupportedLanguage, string>;
    } catch (e) {
      // If parsing fails, return the original string
      console.warn('Failed to parse multilingual string:', data, e);
      return data;
    }
  }
  
  // Return as-is if it's already an object or a regular string
  return data;
}

/**
 * Get the translated string for the current language
 * @param multilingualData - Can be a string or multilingual object
 * @param language - The language code to retrieve
 * @param fallbackLanguage - Fallback language if translation not found (default: 'en')
 * @returns The translated string
 */
export function getTranslatedString(
  multilingualData: MultilingualString | null | undefined,
  language: SupportedLanguage,
  fallbackLanguage: SupportedLanguage = 'en'
): string {
  // Handle null/undefined
  if (!multilingualData) {
    return '';
  }

  // If it's already a string, return it (backwards compatible)
  if (typeof multilingualData === 'string') {
    return multilingualData;
  }

  // If it's an object, try to get the translation for the requested language
  if (typeof multilingualData === 'object') {
    // Try requested language first
    if (multilingualData[language]) {
      return multilingualData[language]!;
    }

    // Try fallback language
    if (multilingualData[fallbackLanguage]) {
      return multilingualData[fallbackLanguage]!;
    }

    // Try Arabic (common in this app)
    if (multilingualData.ar) {
      return multilingualData.ar;
    }

    // Try any available language
    const availableLanguages = Object.keys(multilingualData) as SupportedLanguage[];
    if (availableLanguages.length > 0) {
      return multilingualData[availableLanguages[0]]!;
    }
  }

  // Fallback to empty string
  return '';
}

/**
 * Create a multilingual object from a string (sets all languages to the same value)
 * Useful when migrating existing string data to multilingual format
 * @param value - The string value to use for all languages
 * @returns A multilingual object with the value for all supported languages
 */
export function createMultilingualFromString(value: string): Record<SupportedLanguage, string> {
  return {
    en: value,
    ar: value,
    fr: value,
  };
}

/**
 * Update a multilingual object with a new translation
 * @param existing - Existing multilingual data (can be string or object)
 * @param language - Language code to update
 * @param value - New translation value
 * @returns Updated multilingual object
 */
export function updateMultilingual(
  existing: MultilingualString | null | undefined,
  language: SupportedLanguage,
  value: string
): Record<SupportedLanguage, string> {
  // If existing is a string, convert to object
  if (typeof existing === 'string') {
    const result = createMultilingualFromString(existing);
    result[language] = value;
    return result;
  }

  // If existing is an object, update it
  if (existing && typeof existing === 'object') {
    return {
      en: existing.en || '',
      ar: existing.ar || '',
      fr: existing.fr || '',
      [language]: value,
    };
  }

  // Create new multilingual object
  const result: Record<SupportedLanguage, string> = {
    en: '',
    ar: '',
    fr: '',
  };
  result[language] = value;
  return result;
}

/**
 * Check if a value is multilingual (object) or simple string
 * @param value - The value to check
 * @returns True if it's a multilingual object, false if it's a string
 */
export function isMultilingual(value: MultilingualString | null | undefined): boolean {
  if (!value) return false;
  return typeof value === 'object';
}

/**
 * Get all available translations for a multilingual value
 * @param multilingualData - The multilingual data
 * @returns Object with all available translations
 */
export function getAllTranslations(
  multilingualData: MultilingualString | null | undefined
): Partial<Record<SupportedLanguage, string>> {
  if (!multilingualData) {
    return {};
  }

  if (typeof multilingualData === 'string') {
    return { en: multilingualData, ar: multilingualData, fr: multilingualData };
  }

  return multilingualData;
}

/**
 * Merge multilingual objects, preferring values from the first object
 * @param primary - Primary multilingual object
 * @param secondary - Secondary multilingual object to merge
 * @returns Merged multilingual object
 */
export function mergeMultilingual(
  primary: MultilingualString | null | undefined,
  secondary: MultilingualString | null | undefined
): Record<SupportedLanguage, string> {
  const result: Record<SupportedLanguage, string> = {
    en: '',
    ar: '',
    fr: '',
  };

  // Start with secondary values
  if (secondary) {
    const secondaryTranslations = getAllTranslations(secondary);
    Object.assign(result, secondaryTranslations);
  }

  // Override with primary values
  if (primary) {
    const primaryTranslations = getAllTranslations(primary);
    Object.assign(result, primaryTranslations);
  }

  return result;
}
