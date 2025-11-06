/**
 * Utilities for paginating print content
 */

interface PaginatedPage {
  pageNumber: number;
  transactions: any[];
  isFirstPage: boolean;
  isLastPage: boolean;
  showHeader: boolean;
  showFooter: boolean;
}

/**
 * Calculate how many transaction rows fit on a single page
 * A4 page: 297mm = ~1122px
 * With margins and header/footer: ~900px usable height
 * Each row: ~30-35px (depending on detailed vs summary view)
 */
export function calculateRowsPerPage(viewMode: 'summary' | 'detailed' = 'summary'): number {
  const headerHeight = 200; // Header + account info + opening balance
  const footerHeight = 100; // Footer with totals
  const tableHeaderHeight = 40;
  const usableHeight = 900; // Available height per page
  
  // Row height varies by view mode
  const rowHeight = viewMode === 'detailed' ? 35 : 30;
  
  // Calculate available space for rows
  const availableHeight = usableHeight - headerHeight - footerHeight - tableHeaderHeight;
  const rowsPerPage = Math.floor(availableHeight / rowHeight);
  
  // Return a conservative estimate (subtract a few for spacing)
  return Math.max(10, rowsPerPage - 3);
}

/**
 * Paginate transactions across multiple pages
 */
export function paginateTransactions(
  transactions: any[],
  viewMode: 'summary' | 'detailed' = 'summary'
): PaginatedPage[] {
  if (transactions.length === 0) {
    return [{
      pageNumber: 1,
      transactions: [],
      isFirstPage: true,
      isLastPage: true,
      showHeader: true,
      showFooter: true,
    }];
  }

  const rowsPerPage = calculateRowsPerPage(viewMode);
  const totalPages = Math.max(1, Math.ceil(transactions.length / rowsPerPage));
  
  const pages: PaginatedPage[] = [];
  
  for (let i = 0; i < totalPages; i++) {
    const startIndex = i * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, transactions.length);
    const pageTransactions = transactions.slice(startIndex, endIndex);
    
    pages.push({
      pageNumber: i + 1,
      transactions: pageTransactions,
      isFirstPage: i === 0,
      isLastPage: i === totalPages - 1,
      showHeader: i === 0, // Only first page shows header
      showFooter: i === totalPages - 1, // Only last page shows footer
    });
  }
  
  return pages;
}

/**
 * Get total number of pages for transactions
 */
export function getTotalPages(transactionCount: number, viewMode: 'summary' | 'detailed' = 'summary'): number {
  if (transactionCount === 0) return 1;
  const rowsPerPage = calculateRowsPerPage(viewMode);
  return Math.ceil(transactionCount / rowsPerPage);
}

