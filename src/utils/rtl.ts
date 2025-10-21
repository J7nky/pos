/**
 * RTL (Right-to-Left) utility functions and classes
 * Provides consistent RTL support across the application
 */

/**
 * RTL-aware table header classes
 * Use these for table headers to ensure proper text alignment
 */
export const rtlTableHeaderClasses = "px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider";

/**
 * RTL-aware table cell classes
 * Use these for table cells to ensure proper text alignment
 */
export const rtlTableCellClasses = "px-6 py-4 rtl:text-right ltr:text-left";

/**
 * RTL-aware flex container classes
 * Use these for flex containers that need RTL support
 */
export const rtlFlexClasses = "flex items-center rtl:flex-row-reverse";

/**
 * RTL-aware spacing classes
 * Use these for margins and padding that need RTL support
 */
export const rtlSpacingClasses = {
  marginRight: "rtl:ml-3 ltr:mr-3",
  marginLeft: "rtl:mr-3 ltr:ml-3",
  spaceX: "space-x-2 rtl:space-x-reverse",
  spaceY: "space-y-2 rtl:space-y-reverse"
};

/**
 * RTL-aware text alignment classes
 * Use these for text that needs proper RTL alignment
 */
export const rtlTextClasses = {
  left: "rtl:text-right ltr:text-left",
  right: "rtl:text-left ltr:text-right",
  center: "text-center"
};

/**
 * Check if current language is RTL
 * @param language - The current language code
 * @returns boolean indicating if language is RTL
 */
export const isRTL = (language: string): boolean => {
  const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
  return rtlLanguages.includes(language);
};

/**
 * Get RTL-aware direction class
 * @param language - The current language code
 * @returns string with appropriate direction class
 */
export const getDirectionClass = (language: string): string => {
  return isRTL(language) ? 'rtl' : 'ltr';
};

/**
 * RTL-aware table classes
 * Complete set of classes for RTL-aware tables
 */
export const rtlTableClasses = {
  header: rtlTableHeaderClasses,
  cell: rtlTableCellClasses,
  flex: rtlFlexClasses,
  spacing: rtlSpacingClasses,
  text: rtlTextClasses
};
