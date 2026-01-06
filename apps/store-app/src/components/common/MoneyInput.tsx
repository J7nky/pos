import React, { useState, useRef, useEffect, useCallback } from 'react';

interface MoneyInputProps {
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  step?: string;
  min?: string;
  disabled?: boolean;
  label?: string;
  required?: boolean;
  autoCompleteValue?: string | number; // New prop for auto-complete value
  tabIndex?: number;
  autoFocus?: boolean;
  ariaLabel?: string;
  id?: string;
}

export default function MoneyInput({
  value,
  onChange,
  placeholder = "0.00",
  className = "text-xs text-gray-500",
  step = "1000",
  min = "",
  disabled = false,
  label,
  required = false,
  autoCompleteValue,
  tabIndex,
  autoFocus = false,
  ariaLabel,
  id
}: MoneyInputProps) {
  const [showRecommendation, setShowRecommendation] = useState(false);
  const [recommendedValue, setRecommendedValue] = useState("");
  const [hasUsedRecommendation, setHasUsedRecommendation] = useState(false);
  const [hasUsedAutoComplete, setHasUsedAutoComplete] = useState(false);
  const [previousValue, setPreviousValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const hideSuggestionTimeoutRef = useRef<number | null>(null);
  const SUGGESTION_IDLE_HIDE_MS = 1500; // Hide suggestion shortly after user stops typing

  // Convert value to string for consistent handling
  const stringValue = typeof value === 'number' ? value.toString() : value;

  // Calculate recommended value (add 3 zeros) when typing; hide after brief idle period
  useEffect(() => {
    // Clear any pending hide timer
    if (hideSuggestionTimeoutRef.current) {
      window.clearTimeout(hideSuggestionTimeoutRef.current);
      hideSuggestionTimeoutRef.current = null;
    }

    if (stringValue && stringValue.trim() !== '' && !hasUsedAutoComplete) {
      const numericValue = parseFloat(stringValue);
      if (!isNaN(numericValue) && numericValue > 0 && !hasUsedRecommendation &&numericValue<=1000) {
        const recommended = (numericValue * 1000).toString();
        setRecommendedValue(recommended);
        setShowRecommendation(true);
        // Hide the suggestion shortly after the user stops typing
        hideSuggestionTimeoutRef.current = window.setTimeout(() => {
          setShowRecommendation(false);
        }, SUGGESTION_IDLE_HIDE_MS);
      } else {
        setShowRecommendation(false);
      }
    } else {
      setShowRecommendation(false);
    }

    return () => {
      if (hideSuggestionTimeoutRef.current) {
        window.clearTimeout(hideSuggestionTimeoutRef.current);
        hideSuggestionTimeoutRef.current = null;
      }
    };
  }, [stringValue, hasUsedRecommendation, hasUsedAutoComplete]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    
    // Check if user is deleting digits (value is getting shorter)
    if (newValue.length < previousValue.length && previousValue !== "") {
      // User is deleting - clear the entire value
      onChange("");
      setPreviousValue("");
      setHasUsedRecommendation(false);
      setHasUsedAutoComplete(false); // Reset auto-complete flag when clearing
      return;
    }
    
    setPreviousValue(newValue);
    onChange(newValue);
    
    // Reset recommendation state if input is cleared or significantly changed
    if (!newValue || newValue.trim() === '') {
      setHasUsedRecommendation(false);
      setHasUsedAutoComplete(false); // Reset auto-complete flag when clearing
    }
  }, [onChange, previousValue]);

  const handleRecommendationClick = useCallback(() => {
    onChange(recommendedValue);
    setShowRecommendation(false);
    setHasUsedRecommendation(true);
    setPreviousValue(recommendedValue);
    // Focus back to input after selecting recommendation
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 0);
  }, [onChange, recommendedValue]);

  const handleInputFocus = useCallback(() => {
    // Auto-complete with the suggested value if provided, field is empty, and auto-complete hasn't been used yet
    if (autoCompleteValue && (!stringValue || stringValue.trim() === '') && !hasUsedAutoComplete) {
      const autoCompleteString = typeof autoCompleteValue === 'number' 
        ? autoCompleteValue.toString() 
        : autoCompleteValue;
      onChange(autoCompleteString);
      setPreviousValue(autoCompleteString);
      setHasUsedAutoComplete(true); // Mark that auto-complete has been used
    }
    // Do not show recommendation on focus alone; only while actively typing
  }, [autoCompleteValue, stringValue, hasUsedAutoComplete, onChange]);

  const handleInputBlur = useCallback(() => {
    // Hide recommendation after a longer delay to allow clicking on it
    setTimeout(() => {
      setShowRecommendation(false);
    }, 300);
  }, []);

  return (
    <div className="relative">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        pattern="[0-9]*[.,]?[0-9]*"
        step={step}
        max="9999999999"
        min={min}
        value={stringValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        className={`w-full border border-gray-300 rounded px-3 py-1.5 mb-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px] ${
          showRecommendation && recommendedValue ? 'pr-20' : 'pr-3'
        } ${className}`}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        tabIndex={tabIndex}
        autoFocus={autoFocus}
        aria-label={ariaLabel || label}
        style={{ boxSizing: 'border-box' }}
      />

      {/* Inline recommendation pill */}
      {showRecommendation && recommendedValue && (
        <div className="absolute inset-y-0 right-1 flex items-center pointer-events-auto">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleRecommendationClick();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            title="Use recommended value"
            className="px-3 py-2 text-[10px] leading-none bg-blue-50 text-blue-600 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none cursor-pointer"
          >
            {recommendedValue}
          </button>
        </div>
      )}
    </div>
  );
}