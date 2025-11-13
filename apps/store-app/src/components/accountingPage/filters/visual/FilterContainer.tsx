import React, { ReactNode } from 'react';
import { Filter, X, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * FilterContainer - Consistent visual wrapper for all accounting filters
 * 
 * This component provides a unified look and feel without changing filter logic.
 * Wrap your existing filters with this component to get consistent styling.
 * 
 * @example
 * <FilterContainer title="Received Bills Filters" collapsible>
 *   {/* Your existing filter inputs here *\/}
 *   <input value={searchTerm} onChange={...} />
 *   <select value={supplier} onChange={...} />
 * </FilterContainer>
 */

interface FilterContainerProps {
  /** Title displayed in the filter header */
  title?: string;
  
  /** Show item count (e.g., "Showing 10 of 100 items") */
  itemCount?: {
    showing: number;
    total: number;
  };
  
  /** Enable collapse/expand functionality */
  collapsible?: boolean;
  
  /** Default collapsed state */
  defaultCollapsed?: boolean;
  
  /** Show clear filters button */
  showClearButton?: boolean;
  
  /** Clear filters callback */
  onClear?: () => void;
  
  /** Additional actions (export, print, etc.) */
  actions?: ReactNode;
  
  /** Filter content */
  children: ReactNode;
  
  /** Additional CSS classes */
  className?: string;
  
  /** Show filter icon in header */
  showIcon?: boolean;
}

export const FilterContainer: React.FC<FilterContainerProps> = ({
  title,
  itemCount,
  collapsible = false,
  defaultCollapsed = false,
  showClearButton = true,
  onClear,
  actions,
  children,
  className = '',
  showIcon = true,
}) => {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
        <div className="px-4 py-3 flex items-center justify-between rtl:flex-row-reverse">
          {/* Left side: Title and count */}
          <div className="flex items-center gap-3 rtl:flex-row-reverse">
            {showIcon && (
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <Filter className="w-4 h-4 text-blue-600" />
              </div>
            )}
            <div>
              {title && (
                <h3 className="text-sm font-semibold text-gray-900 rtl:text-right">
                  {title}
                </h3>
              )}
              {itemCount && (
                <p className="text-xs text-gray-600 mt-0.5 rtl:text-right">
                  Showing {itemCount.showing} of {itemCount.total} items
                </p>
              )}
            </div>
          </div>

          {/* Right side: Actions and collapse button */}
          <div className="flex items-center gap-2 rtl:flex-row-reverse">
            {/* Custom actions */}
            {actions && (
              <div className="flex items-center gap-2 rtl:flex-row-reverse">
                {actions}
              </div>
            )}

            {/* Clear button */}
            {showClearButton && onClear && (
              <button
                onClick={onClear}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition-colors flex items-center gap-1.5"
                title="Clear all filters"
              >
                <X className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}

            {/* Collapse toggle */}
            {collapsible && (
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition-colors"
                title={isCollapsed ? 'Expand filters' : 'Collapse filters'}
              >
                {isCollapsed ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronUp className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter Content */}
      {(!collapsible || !isCollapsed) && (
        <div className="p-4">
          {children}
        </div>
      )}
    </div>
  );
};

export default FilterContainer;
