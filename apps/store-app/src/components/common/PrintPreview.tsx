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
  onPrint,
  content,
  totalPages = 1,
  title = 'Print Preview',
}: PrintPreviewProps) {
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

  const handlePrint = () => {
    if (selectedPages.length === 0) {
      alert('Please select at least one page to print');
      return;
    }
    if (selectedPages.length === totalPages) {
      // Print all pages
      console.log('print all pages');
      onPrint();
    } else {
      // Print selected pages only
      onPrint(selectedPages);
    }
    onClose();
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
                      previewRef.current = el;
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
                        return pageContent || <div className="text-center py-20 text-gray-400">t{"balanceReport.page"} {pageNum} t{"balanceReport.contentNotAvailable"}</div>;
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

