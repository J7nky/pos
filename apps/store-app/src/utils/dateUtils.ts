/**
 * Date utility functions for consistent date handling
 */

/**
 * Extract local date (YYYY-MM-DD) from an ISO timestamp string
 * This ensures posted_date uses the local date, not UTC date
 * 
 * @param isoString - ISO timestamp string (e.g., "2025-12-28T00:28:13.000Z")
 * @returns Local date string in YYYY-MM-DD format
 * 
 * @example
 * getLocalDateString("2025-12-28T00:28:13.000Z") // Returns "2025-12-28" (or "2025-12-27" if timezone is ahead of UTC)
 */
export function getLocalDateString(isoString: string): string {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

