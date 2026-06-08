import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronDown, Check, Loader2, Plus } from 'lucide-react';
import { normalizeNameForComparison } from '../../utils/nameNormalization';
import {  useI18n } from '../../i18n';

// One-time injected keyframes for the dropdown entrance (no tailwind config change needed).
const STYLE_ID = 'searchable-select-anim';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent =
    '@keyframes ssel-pop{0%{opacity:0;transform:translateY(-6px) scale(.985)}100%{opacity:1;transform:translateY(0) scale(1)}}';
  document.head.appendChild(styleEl);
}

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
  customFilterButtons?: React.ReactNode;
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
  tabIndex,
  customFilterButtons
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
    } else {
      // Reset transient search state on close so the next open starts clean.
      setSearchTerm('');
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

  // Fuzzy search function with Arabic normalization
  const fuzzySearch = (text: string, searchTerm: string): boolean => {
    if (!searchTerm) return true;

    // Normalize both text and search term for Arabic text (handles أ = ا normalization)
    const normalizedText = normalizeNameForComparison(text);
    const normalizedSearchTerm = normalizeNameForComparison(searchTerm);

    // Exact match
    if (normalizedText.includes(normalizedSearchTerm)) return true;

    // Fuzzy match - allow for typos (using normalized strings)
    let searchIndex = 0;
    for (let i = 0; i < normalizedText.length && searchIndex < normalizedSearchTerm.length; i++) {
      if (normalizedText[i] === normalizedSearchTerm[searchIndex]) {
        searchIndex++;
      }
    }
    return searchIndex === normalizedSearchTerm.length;
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

  // Fast POS behaviour: once a search narrows the list, pre-highlight the top
  // match so the cashier can type → Enter without ever touching the list.
  useEffect(() => {
    if (!isOpen) return;
    if (debouncedSearchTerm) {
      setFocusedIndex(filteredOptions.length > 0 ? 0 : -1);
    }
  }, [debouncedSearchTerm, isOpen, filteredOptions.length]);

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
        event.preventDefault();
        setIsOpen(false);
        break;
      case 'Tab':
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

  // UI helpers — sizes tuned for comfortable touch targets on POS screens.
  const sizeClasses = useMemo(() => {
    switch (size) {
      case 'sm':
        return { trigger: 'px-3 py-2 text-sm rounded-lg', input: 'text-sm', option: 'px-3 py-2.5 text-sm', optionMin: 'min-h-[42px]', chip: 'px-2 py-0.5 text-xs', icon: 'w-4 h-4' };
      case 'lg':
        return { trigger: 'px-4 py-3.5 text-base rounded-xl', input: 'text-base', option: 'px-4 py-3.5 text-base', optionMin: 'min-h-[52px]', chip: 'px-3 py-1 text-sm', icon: 'w-5 h-5' };
      default:
        return { trigger: 'px-3.5 py-2.5 text-[15px] rounded-lg', input: 'text-[15px]', option: 'px-3.5 py-3 text-[15px]', optionMin: 'min-h-[48px]', chip: 'px-2.5 py-1 text-sm', icon: 'w-5 h-5' };
    }
  }, [size]);

  const renderHighlightedLabel = (label: string) => {
    if (!debouncedSearchTerm) return <div className="font-medium truncate">{label}</div>;
    const lowerLabel = label.toLowerCase();
    const lowerSearch = debouncedSearchTerm.toLowerCase();
    const idx = lowerLabel.indexOf(lowerSearch);
    if (idx === -1) return <div className="font-medium truncate">{label}</div>;
    const before = label.slice(0, idx);
    const match = label.slice(idx, idx + debouncedSearchTerm.length);
    const after = label.slice(idx + debouncedSearchTerm.length);
    return (
      <div className="font-medium truncate">
        {before}
        <span className="bg-yellow-100 text-yellow-900 dark:bg-yellow-400/25 dark:text-yellow-100 rounded px-0.5">{match}</span>
        {after}
      </div>
    );
  };

  const sectionDivider = 'border-b border-gray-100 dark:border-slate-800';
  const chipBase =
    'flex-shrink-0 whitespace-nowrap px-3.5 py-2 text-sm font-medium rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-[40px] active:scale-95';
  const chipActive = 'bg-blue-600 text-white shadow-sm dark:bg-blue-500';
  const chipIdle = 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700';
   const { t   } = useI18n();

  // Single shared dropdown body — used by BOTH the inline and portal renders so
  // the two paths can never drift out of sync.
  const dropdownBody = (
    <>
      {/* Search Input (sticky so it stays visible while the list scrolls) */}
      <div className={`sticky top-0 z-10 p-2.5 bg-white dark:bg-slate-900 ${sectionDivider}`}>
        <div className="relative">
          <Search className="w-[18px] h-[18px] absolute top-1/2 -translate-y-1/2 ltr:left-3 rtl:right-3 text-gray-400 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={searchPlaceholder}
            className={`w-full px-10 ${sizeClasses.input} bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white min-h-[46px] transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:focus:bg-slate-800`}
            aria-label="Search options"
            tabIndex={0}
          />
          {searchTerm ? (
            <button
              type="button"
              onClick={() => { setSearchTerm(''); searchInputRef.current?.focus(); }}
              className="absolute top-1/2 -translate-y-1/2 ltr:right-2 rtl:left-2 p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          ) : debouncedSearchTerm === '' && (
            <span className="absolute top-1/2 -translate-y-1/2 ltr:right-3 rtl:left-3 text-xs font-medium text-gray-400 dark:text-slate-500 tabular-nums pointer-events-none">
              {filteredOptions.length}
            </span>
          )}
        </div>
      </div>

      {/* Custom Filter Buttons */}
      {customFilterButtons && (
        <div className={`p-2.5 ${sectionDivider}`}>
          {customFilterButtons}
        </div>
      )}

      {/* Category Filter — single horizontally-scrollable row so it never
          steals vertical space from the options list (swipe sideways). */}
      {categories.length > 0 && (
        <div className={`relative ${sectionDivider}`}>
          <div className="flex gap-2 overflow-x-auto overscroll-x-contain px-2.5 py-2.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`${chipBase} ${selectedCategory === 'all' ? chipActive : chipIdle}`}
              tabIndex={0}
            >
              All
            </button>
            {categories.map(category => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={`${chipBase} ${selectedCategory === category ? chipActive : chipIdle}`}
                tabIndex={0}
              >
                {category}
              </button>
            ))}
          </div>
          {/* Fade hint that the row scrolls horizontally */}
          <div className="pointer-events-none absolute inset-y-0 ltr:right-0 rtl:left-0 w-6 bg-gradient-to-l rtl:bg-gradient-to-r from-white dark:from-slate-900 to-transparent" />
        </div>
      )}

      {/* Action Buttons */}
      {multiple && showSelectAll && (
        <div className={`px-2.5 py-2 ${sectionDivider} flex justify-between`}>
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg px-3 py-2 min-h-[40px] hover:bg-blue-50 dark:hover:bg-blue-900/20"
            tabIndex={0}
          >
            Select All
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            className="text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-slate-300 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 rounded-lg px-3 py-2 min-h-[40px] hover:bg-gray-100 dark:hover:bg-slate-800"
            tabIndex={0}
          >
            Clear All
          </button>
        </div>
      )}

      {/* Add New Option */}
      {showAddOption && onAddNew && (
        <div className={`p-2 ${sectionDivider}`}>
          <button
            type="button"
            onClick={() => {
              onAddNew();
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left rtl:text-right font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-[46px] active:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/20 dark:active:bg-blue-900/40"
            tabIndex={0}
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
              <Plus className="w-4 h-4" />
            </span>
            {addOptionText}
          </button>
        </div>
      )}

      {/* Recent Selections */}
      {recentOptions.length > 0 && !searchTerm && (
        <div className={`p-2 ${sectionDivider}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 px-2 mb-1 dark:text-slate-500">{t('common.recent')}</p>
          <div className="space-y-0.5">
            {recentOptions.slice(0, 3).map(option => (
              <button
                key={`recent-${option.value}`}
                type="button"
                onClick={() => handleOptionSelect(option)}
                className="w-full text-left rtl:text-right px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-[44px] active:bg-gray-200 dark:text-slate-200 dark:hover:bg-slate-800 dark:active:bg-slate-700 truncate"
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
        className="overflow-y-auto overscroll-contain p-1"
        style={{ maxHeight, WebkitOverflowScrolling: 'touch' }}
        role="listbox"
        aria-multiselectable={multiple}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-sm text-gray-500 dark:text-slate-400">Loading...</span>
          </div>
        ) : filteredOptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-2">
            <span className="flex items-center justify-center w-11 h-11 rounded-full bg-gray-100 dark:bg-slate-800">
              <Search className="w-5 h-5 text-gray-400" />
            </span>
            <span className="text-sm font-medium text-gray-500 dark:text-slate-400">{noResultsText}</span>
          </div>
        ) : (
          <div className="space-y-0.5">
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
                  onMouseEnter={() => setFocusedIndex(index)}
                  className={`w-full text-left rtl:text-right ${sizeClasses.option} ${sizeClasses.optionMin} rounded-lg flex items-center justify-between gap-3 transition-colors focus:outline-none active:scale-[0.99] ${
                    isSelected
                      ? 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-100'
                      : isFocused
                        ? 'bg-gray-100 text-gray-900 dark:bg-slate-800 dark:text-slate-100'
                        : 'text-gray-900 hover:bg-gray-50 dark:text-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                >
                  <div className="flex-1 min-w-0">
                    {renderHighlightedLabel(option.label)}
                    {option.category && (
                      <div className={`text-xs truncate ${isSelected ? 'text-blue-600/80 dark:text-blue-300/80' : 'text-gray-400 dark:text-slate-500'}`}>
                        {option.category}
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white dark:bg-blue-500">
                      <Check className="w-4 h-4" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  const panelClassName =
    'bg-white border border-gray-200 rounded-xl shadow-xl shadow-gray-900/10 ring-1 ring-black/5 overflow-hidden dark:bg-slate-900 dark:border-slate-700 dark:ring-white/10';
  const panelAnimation = { animation: 'ssel-pop .13s cubic-bezier(0.16, 1, 0.3, 1)' } as React.CSSProperties;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Main Select Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 ${sizeClasses.trigger} border bg-white text-left rtl:text-right focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all min-h-[46px] active:scale-[0.99] ${
          disabled
            ? 'bg-gray-100 border-gray-200 cursor-not-allowed opacity-70'
            : isOpen
              ? 'border-blue-500 ring-2 ring-blue-500/30'
              : 'border-gray-300 hover:border-gray-400'
        } dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 ${disabled ? 'dark:bg-slate-800/60' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={placeholder}
        tabIndex={typeof tabIndex === 'number' ? tabIndex : 0}
      >
        <span className={`truncate ${selectedOptions.length === 0 ? 'text-gray-400 dark:text-slate-400' : 'text-gray-900 dark:text-slate-100 font-medium'}`}>
          {getDisplayText()}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {clearable && !multiple && value && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              className="p-1 -m-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Clear selection"
            >
              <X className={`${sizeClasses.icon}`} />
            </span>
          )}
          <ChevronDown className={`${sizeClasses.icon} text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* Selected Items Display (for multiple) */}
      {multiple && selectedOptions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedOptions.map(option => (
            <span
              key={option.value}
              className={`inline-flex items-center ${sizeClasses.chip} bg-blue-100 text-blue-800 rounded-lg font-medium dark:bg-blue-900/40 dark:text-blue-200`}
            >
              {option.label}
              <button
                type="button"
                onClick={() => handleOptionSelect(option)}
                className="ml-1.5 rtl:ml-0 rtl:mr-1.5 p-0.5 -mr-1 rtl:-mr-0 rtl:-ml-1 rounded hover:bg-blue-200 hover:text-blue-900 dark:hover:bg-blue-800 dark:hover:text-blue-100"
                aria-label={`Remove ${option.label}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown — inline */}
      {isOpen && !portal && (
        <div
          ref={dropdownRef}
          className={`absolute z-50 w-full mt-1.5 ${panelClassName}`}
          style={panelAnimation}
        >
          {dropdownBody}
        </div>
      )}

      {/* Dropdown — portal */}
      {isOpen && portal && createPortal(
        <div
          ref={dropdownRef}
          className={`fixed z-[1000] mt-1.5 ${panelClassName}`}
          style={{ top: portalStyle.top, left: portalStyle.left, width: portalStyle.width, ...panelAnimation }}
        >
          {dropdownBody}
        </div>,
        document.body
      )}
    </div>
  );
}
