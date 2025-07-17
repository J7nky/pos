import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ChevronDown, Check, Loader2, Plus } from 'lucide-react';
export interface Option {
  id: string;
  label: string;
  value: string;
  category?: string;
  disabled?: boolean;
  metadata?: any;
}

export interface SearchableSelectProps {
  options: Option[];
  value?: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  multiple?: boolean;
  loading?: boolean;
  disabled?: boolean;
  searchPlaceholder?: string;
  noResultsText?: string;
  categories?: string[];
  sortBy?: 'label' | 'category' | 'recent';
  showSelectAll?: boolean;
  recentSelections?: string[];
  onRecentUpdate?: (selections: string[]) => void;
  showAddOption?: boolean;
  addOptionText?: string;
  onAddNew?: () => void;
  className?: string;
  maxHeight?: string;
  debounceMs?: number;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select an option...",
  multiple = false,
  loading = false,
  disabled = false,
  searchPlaceholder = "Search options...",
  noResultsText = "No results found",
  categories = [],
  sortBy = 'label',
  showSelectAll = false,
  recentSelections = [],
  onRecentUpdate,
  showAddOption = false,
  addOptionText = "Add New...",
  onAddNew,
  className = "",
  maxHeight = "300px",
  debounceMs = 300
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [searchTerm, debounceMs]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fuzzy search function
  const fuzzySearch = (text: string, searchTerm: string): boolean => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    const textLower = text.toLowerCase();
    
    // Exact match
    if (textLower.includes(searchLower)) return true;
    
    // Fuzzy match - allow for typos
    let searchIndex = 0;
    for (let i = 0; i < textLower.length && searchIndex < searchLower.length; i++) {
      if (textLower[i] === searchLower[searchIndex]) {
        searchIndex++;
      }
    }
    return searchIndex === searchLower.length;
  };

  // Filter and sort options
  const filteredOptions = useMemo(() => {
    let filtered = options.filter(option => {
      const matchesSearch = fuzzySearch(option.label, debouncedSearchTerm);
      const matchesCategory = selectedCategory === 'all' || option.category === selectedCategory;
      return matchesSearch && matchesCategory && !option.disabled;
    });

    // Sort options
    switch (sortBy) {
      case 'category':
        filtered.sort((a, b) => {
          if (a.category !== b.category) {
            return (a.category || '').localeCompare(b.category || '');
          }
          return a.label.localeCompare(b.label);
        });
        break;
      case 'recent':
        filtered.sort((a, b) => {
          const aIndex = recentSelections.indexOf(a.value);
          const bIndex = recentSelections.indexOf(b.value);
          if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
          if (aIndex !== -1) return -1;
          if (bIndex !== -1) return 1;
          return a.label.localeCompare(b.label);
        });
        break;
      default:
        filtered.sort((a, b) => a.label.localeCompare(b.label));
    }

    return filtered;
  }, [options, debouncedSearchTerm, selectedCategory, sortBy, recentSelections]);

  // Get selected options for display
  const selectedOptions = useMemo(() => {
    const selectedValues = Array.isArray(value) ? value : value ? [value] : [];
    return options.filter(option => selectedValues.includes(option.value));
  }, [options, value]);

  // Handle option selection
  const handleOptionSelect = (option: Option) => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : [];
      const newValues = currentValues.includes(option.value)
        ? currentValues.filter(v => v !== option.value)
        : [...currentValues, option.value];
      onChange(newValues);
    } else {
      onChange(option.value);
      setIsOpen(false);
    }

    // Update recent selections
    if (onRecentUpdate) {
      const updatedRecent = [option.value, ...recentSelections.filter(v => v !== option.value)].slice(0, 5);
      onRecentUpdate(updatedRecent);
    }
  };

  // Handle select all
  const handleSelectAll = () => {
    if (multiple) {
      const allValues = filteredOptions.map(option => option.value);
      onChange(allValues);
    }
  };

  // Handle clear all
  const handleClearAll = () => {
    onChange(multiple ? [] : '');
  };

  // Keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isOpen) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (event.key) {
      case 'Escape':
        setIsOpen(false);
        break;
      case 'ArrowDown':
        event.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, filteredOptions.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        event.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
          handleOptionSelect(filteredOptions[focusedIndex]);
        }
        break;
    }
  };

  // Get display text
  const getDisplayText = () => {
    if (selectedOptions.length === 0) return placeholder;
    if (selectedOptions.length === 1) return selectedOptions[0].label;
    return `${selectedOptions.length} selected`;
  };

  const recentOptions = recentSelections
    .map(value => options.find(opt => opt.value === value))
    .filter(Boolean) as Option[];

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Main Select Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white text-left focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          disabled ? 'bg-gray-100 cursor-not-allowed' : 'hover:border-gray-400'
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={placeholder}
      >
        <span className={selectedOptions.length === 0 ? 'text-gray-500' : 'text-gray-900'}>
          {getDisplayText()}
        </span>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Selected Items Display (for multiple) */}
      {multiple && selectedOptions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {selectedOptions.map(option => (
            <span
              key={option.value}
              className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded-md"
            >
              {option.label}
              <button
                type="button"
                onClick={() => handleOptionSelect(option)}
                className="ml-1 hover:text-blue-600"
                aria-label={`Remove ${option.label}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg">
          {/* Search Input */}
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                aria-label="Search options"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Category Filter */}
          {categories.length > 0 && (
            <div className="p-3 border-b border-gray-200">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1 text-sm rounded-full transition-colors ${
                    selectedCategory === 'all'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All
                </button>
                {categories.map(category => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    className={`px-3 py-1 text-sm rounded-full transition-colors ${
                      selectedCategory === category
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {multiple && showSelectAll && (
            <div className="p-3 border-b border-gray-200 flex justify-between">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                Clear All
              </button>
            </div>
          )}

          {/* Add New Option */}
          {showAddOption && onAddNew && (
            <div className="p-3 border-b border-gray-200">
              <button
                type="button"
                onClick={() => {
                  onAddNew();
                  setIsOpen(false);
                }}
                className="w-full flex items-center px-3 py-2 text-left text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                {addOptionText}
              </button>
            </div>
          )}
          {/* Recent Selections */}
          {recentOptions.length > 0 && !searchTerm && (
            <div className="p-3 border-b border-gray-200">
              <p className="text-xs text-gray-500 mb-2">Recent</p>
              <div className="space-y-1">
                {recentOptions.slice(0, 3).map(option => (
                  <button
                    key={`recent-${option.value}`}
                    type="button"
                    onClick={() => handleOptionSelect(option)}
                    className="w-full text-left px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Options List */}
          <div
            ref={optionsRef}
            className="max-h-60 overflow-y-auto"
            style={{ maxHeight }}
            role="listbox"
            aria-multiselectable={multiple}
          >
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-500">Loading...</span>
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                {noResultsText}
              </div>
            ) : (
              <div className="py-1">
                {filteredOptions.map((option, index) => {
                  const isSelected = multiple
                    ? Array.isArray(value) && value.includes(option.value)
                    : value === option.value;
                  const isFocused = index === focusedIndex;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleOptionSelect(option)}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-gray-100 ${
                        isFocused ? 'bg-gray-100' : ''
                      } ${isSelected ? 'bg-blue-50 text-blue-700' : 'text-gray-900'}`}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <div className="flex-1">
                        <div className="font-medium">{option.label}</div>
                        {option.category && (
                          <div className="text-xs text-gray-500">{option.category}</div>
                        )}
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}