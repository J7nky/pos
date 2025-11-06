import { useMemo } from 'react';
import { useI18n } from '../i18n';
import { 
  getTranslatedString, 
  type MultilingualString, 
  type SupportedLanguage 
} from '../utils/multilingual';

/**
 * Hook for handling multilingual data in components
 * Automatically uses the current language from i18n context
 * 
 * @example
 * ```tsx
 * const { getText } = useMultilingual();
 * const productName = getText(product.name); // Returns translated name based on current language
 * ```
 */
export function useMultilingual() {
  const { language } = useI18n();
  const currentLanguage = language as SupportedLanguage;

  return useMemo(() => {
    /**
     * Get translated text from multilingual data
     * @param data - Multilingual string or object
     * @param fallbackLanguage - Optional fallback language (default: 'en')
     * @returns Translated string for current language
     */
    const getText = (
      data: MultilingualString | null | undefined,
      fallbackLanguage: SupportedLanguage = 'en'
    ): string => {
      return getTranslatedString(data, currentLanguage, fallbackLanguage);
    };

    /**
     * Get translated text for a specific language (not current language)
     * @param data - Multilingual string or object
     * @param targetLanguage - Target language to retrieve
     * @param fallbackLanguage - Optional fallback language (default: 'en')
     * @returns Translated string for target language
     */
    const getTextForLanguage = (
      data: MultilingualString | null | undefined,
      targetLanguage: SupportedLanguage,
      fallbackLanguage: SupportedLanguage = 'en'
    ): string => {
      return getTranslatedString(data, targetLanguage, fallbackLanguage);
    };

    return {
      getText,
      getTextForLanguage,
      currentLanguage,
    };
  }, [currentLanguage]);
}

/**
 * Hook for displaying product names with multilingual support
 * @example
 * ```tsx
 * const { getProductName } = useProductMultilingual();
 * <div>{getProductName(product)}</div>
 * ```
 */
export function useProductMultilingual() {
  const { getText } = useMultilingual();

  const getProductName = (product: { name: MultilingualString } | null | undefined): string => {
    if (!product) return '';
    return getText(product.name);
  };

  return {
    getProductName,
  };
}

/**
 * Hook for displaying transaction descriptions with multilingual support
 * @example
 * ```tsx
 * const { getTransactionDescription } = useTransactionMultilingual();
 * <div>{getTransactionDescription(transaction)}</div>
 * ```
 */
export function useTransactionMultilingual() {
  const { getText } = useMultilingual();

  const getTransactionDescription = (
    transaction: { description: MultilingualString } | null | undefined
  ): string => {
    if (!transaction) return '';
    return getText(transaction.description);
  };

  return {
    getTransactionDescription,
  };
}

