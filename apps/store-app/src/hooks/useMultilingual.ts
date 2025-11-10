import { useMemo } from 'react';
import { useI18n } from '../i18n';
import { 
  getTranslatedString,
  parseMultilingualString,
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
    
    // Parse stringified JSON if needed, then get translated text
    const parsedName = parseMultilingualString(product.name);
    return getText(parsedName);
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

/**
 * Test function to verify multilingual product name handling
 * Call this from browser console: window.testMultilingual()
 */
export function testMultilingualProductName() {
  console.log('🧪 Testing Multilingual Product Name Handling');
  console.log('='.repeat(50));
  
  // Test cases
  const testCases = [
    {
      name: 'String product name',
      input: 'Eggplant',
      expected: 'Eggplant'
    },
    {
      name: 'Multilingual object',
      input: { en: 'Eggplant', ar: 'باذنجان', fr: 'Aubergine' },
      expected: 'Should return translation based on current language'
    },
    {
      name: 'Stringified JSON (the bug)',
      input: '{"en":"Eggplant","ar":"باذنجان"}',
      expected: 'Should parse and return translation'
    },
    {
      name: 'Partial multilingual object',
      input: { en: 'Tomato', ar: 'طماطم' },
      expected: 'Should return available translation'
    },
    {
      name: 'Null value',
      input: null,
      expected: 'Empty string'
    }
  ];

  testCases.forEach((testCase, index) => {
    console.log(`\n📝 Test ${index + 1}: ${testCase.name}`);
    console.log('Input:', testCase.input);
    console.log('Input type:', typeof testCase.input);
    
    // Test with getTranslatedString for each language
    ['en', 'ar', 'fr'].forEach(lang => {
      try {
        let processedInput = testCase.input;
        
        // Simulate the parsing that should happen
        if (typeof processedInput === 'string' && processedInput.startsWith('{')) {
          try {
            processedInput = JSON.parse(processedInput);
            console.log(`  ✅ Parsed stringified JSON for ${lang}`);
          } catch (e) {
            console.log(`  ❌ Failed to parse for ${lang}:`, e);
          }
        }
        
        const result = getTranslatedString(
          processedInput as MultilingualString,
          lang as SupportedLanguage,
          'en'
        );
        console.log(`  ${lang.toUpperCase()}: "${result}"`);
      } catch (error) {
        console.error(`  ❌ Error for ${lang}:`, error);
      }
    });
    
    console.log('Expected:', testCase.expected);
  });
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Multilingual test completed!');
  console.log('Check the results above to verify translations are working correctly.');
}

// Make test function available globally for browser console testing
if (typeof window !== 'undefined') {
  (window as any).testMultilingual = testMultilingualProductName;
}

