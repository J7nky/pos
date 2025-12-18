/**
 * Utility functions for normalizing entity names for duplicate detection
 * Handles Arabic text normalization (removes diacritics, normalizes character variations)
 */

/**
 * Check if a string contains Arabic characters
 */
export function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
}

/**
 * Normalize Arabic text for comparison
 * - Removes diacritics (tashkeel)
 * - Normalizes alef variations (أ, إ, آ, ا) to ا
 * - Normalizes yeh variations (ي, ى) to ي
 * - Normalizes teh marbuta (ة) to ه
 * - Removes tatweel (ـ)
 * - Trims whitespace
 */
export function normalizeArabic(text: string): string {
  if (!text) return '';
  
  let normalized = text.trim();
  
  // Remove diacritics (tashkeel) - Arabic vowel marks
  normalized = normalized.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  
  // Normalize alef variations (أ, إ, آ, ا) to ا
  normalized = normalized.replace(/[أإآ]/g, 'ا');
  
  // Normalize yeh variations (ي, ى) to ي
  normalized = normalized.replace(/ى/g, 'ي');
  
  // Normalize teh marbuta (ة) to ه
  normalized = normalized.replace(/ة/g, 'ه');
  
  // Remove tatweel (extended character)
  normalized = normalized.replace(/ـ/g, '');
  
  return normalized.trim();
}

/**
 * Normalize a name for duplicate comparison
 * - Trims whitespace
 * - Converts to lowercase
 * - If contains Arabic, applies Arabic normalization
 */
export function normalizeNameForComparison(name: string): string {
  if (!name) return '';
  
  const trimmed = name.trim();
  
  // If contains Arabic, normalize Arabic characters
  if (containsArabic(trimmed)) {
    return normalizeArabic(trimmed).toLowerCase();
  }
  
  // For non-Arabic text, just lowercase
  return trimmed.toLowerCase();
}

/**
 * Compare two names for equality (handles Arabic normalization)
 */
export function namesAreEqual(name1: string, name2: string): boolean {
  return normalizeNameForComparison(name1) === normalizeNameForComparison(name2);
}

