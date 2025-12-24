import React, { useState, useEffect, useRef } from 'react';
import { X, Printer, ChevronLeft, ChevronRight, Check, FileText } from 'lucide-react';
import { useI18n } from '../../i18n';
interface PrintPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  onPrint: (selectedPages?: number[]) => void;
  content: React.ReactNode | React.ReactNode[];
  totalPages?: number;
  title?: string;
}

export function PrintPreview({
  isOpen,
  onClose,
  onPrint, // Kept for interface compatibility, but printing is handled internally
  content,
  totalPages = 1,
  title = 'Print Preview',
}: PrintPreviewProps) {
  // Suppress unused variable warning - onPrint is part of the interface
  void onPrint;
  
  const { t } = useI18n();
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [selectAll, setSelectAll] = useState(true);
  const previewRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Initialize selected pages to all pages
  useEffect(() => {
    if (isOpen && selectAll) {
      setSelectedPages(Array.from({ length: totalPages }, (_, i) => i + 1));
    }
  }, [isOpen, totalPages, selectAll]);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentPage(1);
      setSelectAll(true);
    }
  }, [isOpen]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      // Scroll to the page
      const pageElement = pageRefs.current.get(page);
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const togglePageSelection = (page: number) => {
    setSelectAll(false);
    setSelectedPages((prev) => {
      if (prev.includes(page)) {
        return prev.filter((p) => p !== page);
      } else {
        return [...prev, page].sort((a, b) => a - b);
      }
    });
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedPages(Array.from({ length: totalPages }, (_, i) => i + 1));
    } else {
      setSelectedPages([]);
    }
  };

  const generatePrintContent = () => {
    if (selectedPages.length === 0) return '';

    // Get the content for selected pages
    const pagesToPrint = selectedPages.sort((a, b) => a - b);
    
    // Get all styles from the document
    const styles: string[] = [];
    Array.from(document.styleSheets).forEach((styleSheet) => {
      try {
        Array.from(styleSheet.cssRules).forEach((rule) => {
          styles.push(rule.cssText);
        });
      } catch (e) {
        // Cross-origin stylesheets may throw errors, ignore them
      }
    });

    // Create HTML content
    let htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || 'Print Preview'}</title>
  <style>
    ${styles.join('\n')}
    @media print {
      @page {
        size: A4;
        margin: 0;
      }
      body {
        margin: 0;
        padding: 0;
      }
      .page-number {
        display: none;
      }
      * {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 0;
      background: white;
      width: 210mm;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      max-height: 297mm;
      background: white;
      margin: 0;
      padding: 10mm;
      page-break-after: always;
      position: relative;
      box-sizing: border-box;
      overflow: hidden;
    }
    .page:last-child {
      page-break-after: auto;
    }
    .page-number {
      position: absolute;
      top: 2px;
      right: 2px;
      background: #1f2937;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    /* Content wrapper to ensure proper scaling */
    .page-content-wrapper {
      width: 100%;
      max-width: 100%;
      height: 100%;
      overflow: hidden;
    }
    /* Ensure content scales to fit */
    .page > * {
      width: 100%;
      max-width: 100%;
    }
    /* Remove any transforms from extracted content */
    .page * {
      transform: none !important;
      -webkit-transform: none !important;
    }
    /* Ensure tables fit within page */
    .page table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: auto;
      font-size: 9pt;
    }
    .page table th,
    .page table td {
      padding: 4px 6px;
      font-size: 9pt;
      word-wrap: break-word;
    }
    /* Ensure images and other elements fit */
    .page img {
      max-width: 100%;
      height: auto;
    }
    /* Scale down large content if needed */
    .page {
      font-size: 10pt;
    }
    .page h1 { font-size: 16pt; }
    .page h2 { font-size: 14pt; }
    .page h3 { font-size: 12pt; }
    .page h4 { font-size: 11pt; }
    .page h5, .page h6 { font-size: 10pt; }
  </style>
</head>
<body>
`;

    // Add content for each selected page
    pagesToPrint.forEach((pageNum) => {
      const pageElement = pageRefs.current.get(pageNum);
      if (pageElement) {
        const pageContent = pageElement.querySelector('.print-preview-content');
        if (pageContent) {
          // Clone the content to avoid modifying the original
          const clonedContent = pageContent.cloneNode(true) as HTMLElement;
          
          // Remove any transform styles from cloned content
          const allElements = clonedContent.querySelectorAll('*');
          allElements.forEach((el) => {
            const htmlEl = el as HTMLElement;
            if (htmlEl.style) {
              htmlEl.style.transform = 'none';
              htmlEl.style.webkitTransform = 'none';
            }
          });
          
          htmlContent += `  <div class="page">\n`;
          htmlContent += `    <div class="page-number">Page ${pageNum} of ${totalPages}</div>\n`;
          htmlContent += `    <div class="page-content-wrapper">${clonedContent.innerHTML}</div>\n`;
          htmlContent += `  </div>\n`;
        }
      }
    });

    htmlContent += `</body>\n</html>`;
    return htmlContent;
  };

  const downloadContent = () => {
    if (selectedPages.length === 0) return;
    const htmlContent = generatePrintContent();
    if (!htmlContent) return;

    // Create blob and download
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileName = `${(title || 'document').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.html`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printContentFromHTML = (htmlContent: string) => {
    if (!htmlContent) return;
    
    // Create blob URL
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    // Use hidden iframe for both Electron and web browsers
    // This prevents opening visible windows and ensures clean printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    let printTriggered = false;

    // Function to trigger print and cleanup
    const triggerPrint = () => {
      if (printTriggered) return;
      printTriggered = true;

      setTimeout(() => {
        try {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            
            // Clean up after print dialog closes
            // Listen for when the print dialog is dismissed
            const cleanup = () => {
              setTimeout(() => {
                if (iframe.parentNode) {
                  document.body.removeChild(iframe);
                }
                URL.revokeObjectURL(url);
              }, 500);
            };

            // Try to detect when print dialog closes
            // In Electron, we can listen to beforeunload or use a timeout
            iframe.contentWindow.addEventListener('beforeunload', cleanup);
            
            // Fallback: cleanup after a reasonable delay
            setTimeout(cleanup, 3000);
          }
        } catch (error) {
          console.error('Error printing:', error);
          // Clean up on error
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
          URL.revokeObjectURL(url);
        }
      }, 500);
    };

    // Load content into iframe
    iframe.onload = triggerPrint;
    iframe.src = url;

    // Fallback: trigger print if onload doesn't fire
    setTimeout(() => {
      if (!printTriggered && iframe.contentWindow) {
        const readyState = iframe.contentWindow.document?.readyState;
        if (readyState === 'complete' || readyState === 'interactive') {
          triggerPrint();
        }
      }
    }, 1000);

    // Final fallback cleanup
    setTimeout(() => {
      if (iframe.parentNode && !printTriggered) {
        try {
          triggerPrint();
        } catch (error) {
          // If all else fails, just clean up
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        }
      }
    }, 2000);
  };

  const handlePrint = () => {
    if (selectedPages.length === 0) {
      alert('Please select at least one page to print');
      return;
    }
    
    // IMPORTANT: Generate content BEFORE closing modal (content is extracted from DOM)
    const htmlContent = generatePrintContent();
    
    // Download the file first
    downloadContent();
    
    // Close modal after extracting content
    onClose();
    
    // Then proceed with printing after modal closes
    // Use a small delay to ensure modal is closed
    setTimeout(() => {
      // Print using the pre-generated content (handles both Electron and web)
      if (htmlContent) {
        printContentFromHTML(htmlContent);
      }
      
      // Note: We don't call onPrint() here because we're handling printing directly
      // This prevents duplicate windows/dialogs from opening
    }, 300);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-lg shadow-2xl w-[95vw] h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-3">
            <FileText className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">{title}</h2>
              <p className="text-sm text-gray-600">
                {t('balanceReport.previewDocumentBeforePrinting')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Page Selection Controls */}
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  {t('balanceReport.selectAllPages')}
                </span>
              </label>
              <div className="h-6 w-px bg-gray-300" />
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">{t('balanceReport.selectPages')}</span>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <label
                      key={page}
                      className={`flex items-center space-x-1 px-2 py-1 rounded cursor-pointer transition-colors ${
                        selectedPages.includes(page)
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPages.includes(page)}
                        onChange={() => togglePageSelection(page)}
                        className="sr-only"
                      />
                      <span className="text-xs font-medium">
                        {selectedPages.includes(page) && (
                          <Check className="w-3 h-3 inline mr-1" />
                        )}
                        {t('balanceReport.page')} {page}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-600">
              {selectedPages.length} {t('common.of')} {totalPages} {t('balanceReport.pagesSelected')}
            </div>
          </div>
        </div>

        {/* Preview Content - Show all pages */}
        <div className="flex-1 overflow-auto bg-gray-100 p-6">
          <div className="flex flex-col items-center gap-6 pb-8">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
              return (
                <div
                  key={pageNum}
                  ref={(el) => {
                    if (el) {
                      pageRefs.current.set(pageNum, el);
                    } else {
                      pageRefs.current.delete(pageNum);
                    }
                    if (pageNum === 1 && el) {
                      (previewRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                    }
                  }}
                  className="relative bg-white shadow-2xl"
                  style={{
                    width: '210mm',
                    minHeight: '297mm',
                    transform: 'scale(0.75)',
                    transformOrigin: 'top center',
                    marginBottom: '1.5rem',
                  }}
                >
                  <div
                    className="print-preview-content"
                    style={{
                      padding: '20px',
                    }}
                  >
                    {(() => {
                      // Handle both single content and array of page content
                      if (Array.isArray(content)) {
                        // Show the page content at index pageNum - 1
                        const pageContent = content[pageNum - 1];
                        return pageContent || <div className="text-center py-20 text-gray-400">t{".page"} {pageNum} t{"balanceReport.contentNotAvailable"}</div>;
                      } else {
                        // Single content - show for all pages (useful for single page documents)
                        return content;
                      }
                    })()}
                  </div>
                  {/* Page number indicator */}
                  <div className="absolute top-2 right-2 bg-gray-800 text-white px-2 py-1 rounded text-xs font-semibold">
                    Page {pageNum} of {totalPages}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer with Navigation and Actions */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
          {/* Page Navigation */}
          <div className="flex items-center space-x-4">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`p-2 rounded-lg transition-colors ${
                currentPage === 1
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-700">{t('balanceReport.page')}</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => {
                  const page = parseInt(e.target.value);
                  if (!isNaN(page)) {
                    handlePageChange(page);
                  }
                }}
                className="w-16 px-2 py-1 text-sm border border-gray-300 rounded text-center"
              />
              <span className="text-sm text-gray-700"> {t('common.of')} {totalPages}</span>
            </div>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`p-2 rounded-lg transition-colors ${
                currentPage === totalPages
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t('balanceReport.cancel')}
            </button>
            <button
              onClick={handlePrint}
              disabled={selectedPages.length === 0}
              className={`px-6 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
                selectedPages.length === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <Printer className="w-5 h-5" />
              <span> {t('balanceReport.print')} {selectedPages.length > 0 ? `(${selectedPages.length} ${selectedPages.length === 1 ? 'page' : 'pages'})` : ''}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

