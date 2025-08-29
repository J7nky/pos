import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  portal?: boolean;
  clearable?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onOpenChange?: (open: boolean) => void;
  tabIndex?: number;
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
  debounceMs = 300,
  portal = false,
  clearable = false,
  size = 'md',
  onOpenChange,
  tabIndex
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [portalStyle, setPortalStyle] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

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
    if (isOpen) {
      setFocusedIndex(-1);
    }
  }, [isOpen]);

  // Recompute dropdown position for portal rendering
  useEffect(() => {
    if (!portal) return;

    function updatePosition() {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPortalStyle({ top: rect.bottom, left: rect.left, width: rect.width });
    }

    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, portal]);

  // Notify parent about open state changes
  useEffect(() => {
    if (onOpenChange) onOpenChange(isOpen);
  }, [isOpen, onOpenChange]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideTrigger = !!(containerRef.current && containerRef.current.contains(target));
      const clickedInsideDropdown = !!(dropdownRef.current && dropdownRef.current.contains(target));
      if (!clickedInsideTrigger && !clickedInsideDropdown) {
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
        if (filteredOptions.length === 0) return;
        setFocusedIndex(prev => {
          const next = prev + 1;
          return next >= filteredOptions.length ? 0 : next;
        });
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (filteredOptions.length === 0) return;
        setFocusedIndex(prev => {
          if (prev <= 0) return filteredOptions.length - 1;
          return prev - 1;
        });
        break;
      case 'Enter':
        event.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
          handleOptionSelect(filteredOptions[focusedIndex]);
        }
        break;
    }
  };

  // Ensure focused option is visible
  useEffect(() => {
    if (!isOpen || focusedIndex < 0) return;
    const listEl = optionsRef.current;
    if (!listEl) return;
    const optionEls = listEl.querySelectorAll<HTMLButtonElement>('button[role="option"]');
    const target = optionEls[focusedIndex];
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex, isOpen]);

  // Get display text
  const getDisplayText = () => {
    if (selectedOptions.length === 0) return placeholder;
    if (selectedOptions.length === 1) return selectedOptions[0].label;
    return `${selectedOptions.length} selected`;
  };

  const recentOptions = recentSelections
    .map(value => options.find(opt => opt.value === value))
    .filter(Boolean) as Option[];

  // UI helpers
  const sizeClasses = useMemo(() => {
    switch (size) {
      case 'sm':
        return { trigger: 'px-2 py-1 text-sm rounded-md', input: 'py-1', option: 'px-3 py-1.5 text-sm', chip: 'px-2 py-0.5 text-xs', icon: 'w-4 h-4' };
      case 'lg':
        return { trigger: 'px-4 py-3 text-base rounded-lg', input: 'py-3', option: 'px-4 py-3', chip: 'px-3 py-1 text-sm', icon: 'w-5 h-5' };
      default:
        return { trigger: 'px-3 py-2 text-sm rounded-lg', input: 'py-2', option: 'px-3 py-2', chip: 'px-2.5 py-1 text-sm', icon: 'w-5 h-5' };
    }
  }, [size]);

  const renderHighlightedLabel = (label: string) => {
    if (!debouncedSearchTerm) return <div className="font-medium">{label}</div>;
    const lowerLabel = label.toLowerCase();
    const lowerSearch = debouncedSearchTerm.toLowerCase();
    const idx = lowerLabel.indexOf(lowerSearch);
    if (idx === -1) return <div className="font-medium">{label}</div>;
    const before = label.slice(0, idx);
    const match = label.slice(idx, idx + debouncedSearchTerm.length);
    const after = label.slice(idx + debouncedSearchTerm.length);
    return (
      <div className="font-medium">
        {before}
        <span className="bg-yellow-100 text-yellow-800 dark:bg-yellow-800/40 dark:text-yellow-100 rounded-sm px-0.5">{match}</span>
        {after}
      </div>
    );
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Main Select Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`w-full flex items-center justify-between ${sizeClasses.trigger} border border-gray-300 bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors min-h-[44px] ${
          disabled ? 'bg-gray-100 cursor-not-allowed' : 'hover:border-gray-400'
        } dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={placeholder}
        tabIndex={typeof tabIndex === 'number' ? tabIndex : 0}
      >
        <span className={selectedOptions.length === 0 ? 'text-gray-500 dark:text-slate-400' : 'text-gray-900 dark:text-slate-100'}>
          {getDisplayText()}
        </span>
        <span className="flex items-center gap-1">
          {clearable && !multiple && value && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              className="text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200"
              aria-label="Clear selection"
            >
              <X className={`${sizeClasses.icon}`} />
            </button>
          )}
          <ChevronDown className={`${sizeClasses.icon} text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* Selected Items Display (for multiple) */}
      {multiple && selectedOptions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {selectedOptions.map(option => (
            <span
              key={option.value}
              className={`inline-flex items-center ${sizeClasses.chip} bg-blue-100 text-blue-800 rounded-md dark:bg-blue-900/40 dark:text-blue-200`}
            >
              {option.label}
              <button
                type="button"
                onClick={() => handleOptionSelect(option)}
                className="ml-1 hover:text-blue-600 dark:hover:text-blue-300"
                aria-label={`Remove ${option.label}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown */}
      {isOpen && !portal && (
        <div ref={dropdownRef} className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg dark:bg-slate-900 dark:border-slate-700">
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
                className={`w-full pl-9 pr-4 ${sizeClasses.input} border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100`}
                aria-label="Search options"
                tabIndex={0}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200"
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
                  className={`px-3 py-1 text-sm rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] ${
                    selectedCategory === 'all'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                  }`}
                  tabIndex={0}
                >
                  All
                </button>
                {categories.map(category => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    className={`px-3 py-1 text-sm rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] ${
                      selectedCategory === category
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                    }`}
                    tabIndex={0}
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
                className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 min-h-[44px]"
                tabIndex={0}
              >
                Select All
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="text-sm text-gray-600 hover:text-gray-800 dark:text-slate-300 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-gray-500 rounded px-2 py-1 min-h-[44px]"
                tabIndex={0}
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
                className="w-full flex items-center px-3 py-2 text-left text-blue-600 hover:bg-blue-50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] dark:text-blue-400 dark:hover:bg-blue-900/20"
                tabIndex={0}
              >
                <Plus className="w-4 h-4 mr-2" />
                {addOptionText}
              </button>
            </div>
          )}
          {/* Recent Selections */}
          {recentOptions.length > 0 && !searchTerm && (
            <div className="p-3 border-b border-gray-200">
              <p className="text-xs text-gray-500 mb-2 dark:text-slate-400">Recent</p>
              <div className="space-y-1">
                {recentOptions.slice(0, 3).map(option => (
                  <button
                    key={`recent-${option.value}`}
                    type="button"
                    onClick={() => handleOptionSelect(option)}
                    className="w-full text-left px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] dark:text-slate-200 dark:hover:bg-slate-800"
                    tabIndex={0}
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
                <span className="ml-2 text-gray-500 dark:text-slate-400">Loading...</span>
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
                      className={`w-full text-left ${sizeClasses.option} flex items-center justify-between hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] ${
                        isFocused ? 'bg-gray-100 dark:bg-slate-800' : ''
                      } ${isSelected ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200' : 'text-gray-900 dark:text-slate-100'}`}
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={0}
                    >
                      <div className="flex-1">
                        {renderHighlightedLabel(option.label)}
                        {option.category && (
                          <div className="text-xs text-gray-500 dark:text-slate-400">{option.category}</div>
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

      {isOpen && portal && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[1000] bg-white border border-gray-300 rounded-lg shadow-lg dark:bg-slate-900 dark:border-slate-700"
          style={{ top: portalStyle.top, left: portalStyle.left, width: portalStyle.width }}
        >
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
                className={`w-full pl-9 pr-4 ${sizeClasses.input} border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100`}
                aria-label="Search options"
                tabIndex={0}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200"
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
                  className={`px-3 py-1 text-sm rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] ${
                    selectedCategory === 'all'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                  }`}
                  tabIndex={0}
                >
                  All
                </button>
                {categories.map(category => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    className={`px-3 py-1 text-sm rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] ${
                      selectedCategory === category
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                    }`}
                    tabIndex={0}
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
                className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 min-h-[44px]"
                tabIndex={0}
              >
                Select All
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="text-sm text-gray-600 hover:text-gray-800 dark:text-slate-300 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-gray-500 rounded px-2 py-1 min-h-[44px]"
                tabIndex={0}
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
                className="w-full flex items-center px-3 py-2 text-left text-blue-600 hover:bg-blue-50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] dark:text-blue-400 dark:hover:bg-blue-900/20"
                tabIndex={0}
              >
                <Plus className="w-4 h-4 mr-2" />
                {addOptionText}
              </button>
            </div>
          )}

          {/* Recent Selections */}
          {recentOptions.length > 0 && !searchTerm && (
            <div className="p-3 border-b border-gray-200">
              <p className="text-xs text-gray-500 mb-2 dark:text-slate-400">Recent</p>
              <div className="space-y-1">
                {recentOptions.slice(0, 3).map(option => (
                  <button
                    key={`recent-${option.value}`}
                    type="button"
                    onClick={() => handleOptionSelect(option)}
                    className="w-full text-left px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] dark:text-slate-200 dark:hover:bg-slate-800"
                    tabIndex={0}
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
                <span className="ml-2 text-gray-500 dark:text-slate-400">Loading...</span>
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
                      className={`w-full text-left ${sizeClasses.option} flex items-center justify-between hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] ${
                        isFocused ? 'bg-gray-100 dark:bg-slate-800' : ''
                      } ${isSelected ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200' : 'text-gray-900 dark:text-slate-100'}`}
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={0}
                    >
                      <div className="flex-1">
                        {renderHighlightedLabel(option.label)}
                        {option.category && (
                          <div className="text-xs text-gray-500 dark:text-slate-400">{option.category}</div>
                        )}
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}