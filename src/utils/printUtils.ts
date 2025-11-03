/**
 * Utility functions for print functionality
 */

/**
 * Estimate total pages based on content height
 * A4 page is approximately 297mm tall with margins
 */
export function estimatePageCount(contentHeight: number, pageHeight: number = 1122): number {
  // 297mm = ~1122px at 96dpi (standard screen resolution)
  // Account for margins (approximately 100px total)
  const usableHeight = pageHeight - 100;
  return Math.max(1, Math.ceil(contentHeight / usableHeight));
}

/**
 * Get page ranges for specific pages
 */
export function getPageRanges(selectedPages: number[]): string {
  if (selectedPages.length === 0) return '';
  
  // Sort pages
  const sorted = [...selectedPages].sort((a, b) => a - b);
  
  // Group consecutive pages
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      if (start === end) {
        ranges.push(start.toString());
      } else {
        ranges.push(`${start}-${end}`);
      }
      start = end = sorted[i];
    }
  }
  
  // Add last range
  if (start === end) {
    ranges.push(start.toString());
  } else {
    ranges.push(`${start}-${end}`);
  }
  
  return ranges.join(',');
}

/**
 * Apply print styles for specific pages
 * This uses CSS to hide/show pages based on selection
 */
export function applyPageSelection(selectedPages: number[] | undefined, totalPages: number) {
  if (!selectedPages || selectedPages.length === totalPages) {
    // Print all pages
    document.body.style.setProperty('--print-pages', '');
    return;
  }
  
  // Create CSS to hide unselected pages
  const pageNumbers = selectedPages.map(p => `nth-of-type(${p})`).join(',');
  // Note: This is a simplified approach. For actual implementation,
  // we might need to use CSS @page rules or JavaScript-based page hiding
  document.body.style.setProperty('--print-pages', pageNumbers);
}

/**
 * Setup print with page selection
 */
export function setupPrintWithPageSelection(
  selectedPages: number[] | undefined,
  totalPages: number
) {
  // Add print class to body
  document.body.classList.add('printing');
  
  // If specific pages are selected, we'll need to handle this via CSS
  // For now, we'll rely on the browser's built-in page selection
  // which requires passing page ranges to window.print()
  
  // Store selected pages in a data attribute for CSS access
  if (selectedPages && selectedPages.length < totalPages) {
    document.body.setAttribute('data-print-pages', selectedPages.join(','));
  } else {
    document.body.removeAttribute('data-print-pages');
  }
  
  // Trigger print
  window.print();
  
  // Cleanup after print dialog closes
  setTimeout(() => {
    document.body.classList.remove('printing');
    document.body.removeAttribute('data-print-pages');
  }, 1000);
}

