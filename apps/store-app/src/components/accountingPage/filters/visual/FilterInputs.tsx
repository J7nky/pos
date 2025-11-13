import React from 'react';
import { Search, Calendar, X } from 'lucide-react';

/**
 * Consistent, reusable filter input components
 * Use these to replace your existing inputs for visual consistency
 */

// ============================================================================
// FilterSearchBox - Consistent search input
// ============================================================================

interface FilterSearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const FilterSearchBox: React.FC<FilterSearchBoxProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
}) => {
  return (
    <div className={`relative ${className}`}>
      <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 rtl:left-auto rtl:right-3" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all rtl:pl-4 rtl:pr-10 hover:border-gray-400"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 rtl:right-auto rtl:left-3"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

// ============================================================================
// FilterSelect - Consistent dropdown select
// ============================================================================

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  label?: string;
  placeholder?: string;
  className?: string;
}

export const FilterSelect: React.FC<FilterSelectProps> = ({
  value,
  onChange,
  options,
  label,
  placeholder = 'Select...',
  className = '',
}) => {
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium text-gray-700 mb-1.5 rtl:text-right">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-gray-400 bg-white"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

// ============================================================================
// FilterDateInput - Consistent date input
// ============================================================================

interface FilterDateInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  min?: string;
  max?: string;
  className?: string;
}

export const FilterDateInput: React.FC<FilterDateInputProps> = ({
  value,
  onChange,
  label,
  min,
  max,
  className = '',
}) => {
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium text-gray-700 mb-1.5 rtl:text-right">
          {label}
        </label>
      )}
      <div className="relative">
        <Calendar className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none rtl:left-auto rtl:right-3" />
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          className="w-full pl-10 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all rtl:pl-3 rtl:pr-10 hover:border-gray-400"
        />
      </div>
    </div>
  );
};

// ============================================================================
// FilterDateRange - Consistent date range inputs
// ============================================================================

interface FilterDateRangeProps {
  startValue: string;
  endValue: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  startLabel?: string;
  endLabel?: string;
  className?: string;
}

export const FilterDateRange: React.FC<FilterDateRangeProps> = ({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  startLabel = 'From',
  endLabel = 'To',
  className = '',
}) => {
  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`}>
      <FilterDateInput
        value={startValue}
        onChange={onStartChange}
        label={startLabel}
        max={endValue || undefined}
      />
      <FilterDateInput
        value={endValue}
        onChange={onEndChange}
        label={endLabel}
        min={startValue || undefined}
      />
    </div>
  );
};

// ============================================================================
// FilterButtonGroup - Consistent button group for quick filters
// ============================================================================

interface FilterButtonGroupProps {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

export const FilterButtonGroup: React.FC<FilterButtonGroupProps> = ({
  options,
  value,
  onChange,
  label,
  className = '',
}) => {
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium text-gray-700 mb-2 rtl:text-right">
          {label}
        </label>
      )}
      <div className="flex flex-wrap gap-2 rtl:flex-row-reverse">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              value === option.value
                ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:border-gray-400'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// FilterGrid - Consistent grid layout for filter inputs
// ============================================================================

interface FilterGridProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}

export const FilterGrid: React.FC<FilterGridProps> = ({
  children,
  columns = 4,
  className = '',
}) => {
  const gridClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={`grid ${gridClasses[columns]} gap-4 ${className}`}>
      {children}
    </div>
  );
};

// ============================================================================
// FilterSection - Consistent section divider
// ============================================================================

interface FilterSectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const FilterSection: React.FC<FilterSectionProps> = ({
  title,
  children,
  className = '',
}) => {
  return (
    <div className={className}>
      {title && (
        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3 rtl:text-right">
          {title}
        </h4>
      )}
      {children}
    </div>
  );
};

// ============================================================================
// FilterBadge - Show active filter count
// ============================================================================

interface FilterBadgeProps {
  count: number;
  className?: string;
}

export const FilterBadge: React.FC<FilterBadgeProps> = ({
  count,
  className = '',
}) => {
  if (count === 0) return null;

  return (
    <span
      className={`inline-flex items-center justify-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 ${className}`}
    >
      {count} active
    </span>
  );
};

// ============================================================================
// Export all components
// ============================================================================

export default {
  SearchBox: FilterSearchBox,
  Select: FilterSelect,
  DateInput: FilterDateInput,
  DateRange: FilterDateRange,
  ButtonGroup: FilterButtonGroup,
  Grid: FilterGrid,
  Section: FilterSection,
  Badge: FilterBadge,
};
