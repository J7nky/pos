import React, { useState, useRef, useEffect } from 'react';

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
}

export default function MoneyInput({
  value,
  onChange,
  placeholder = "0.00",
  className = "text-xs text-gray-500",
  step = "0.01",
  min = "",
  disabled = false,
  label,
  required = false,
  autoCompleteValue
}: MoneyInputProps) {
  const [showRecommendation, setShowRecommendation] = useState(false);
  const [recommendedValue, setRecommendedValue] = useState("");
  const [hasUsedRecommendation, setHasUsedRecommendation] = useState(false);
  const [hasUsedAutoComplete, setHasUsedAutoComplete] = useState(false);
  const [previousValue, setPreviousValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Convert value to string for consistent handling
  const stringValue = typeof value === 'number' ? value.toString() : value;

  // Calculate recommended value (add 3 zeros) - only if auto-complete hasn't been used
  useEffect(() => {
    if (stringValue && stringValue.trim() !== '' && !hasUsedAutoComplete) {
      const numericValue = parseFloat(stringValue);
      if (!isNaN(numericValue) && numericValue > 0 && !hasUsedRecommendation) {
        // Add 3 zeros (multiply by 1000)
        const recommended = (numericValue * 1000).toString();
        setRecommendedValue(recommended);
        setShowRecommendation(true);
      } else {
        setShowRecommendation(false);
      }
    } else {
      setShowRecommendation(false);
    }
  }, [stringValue, hasUsedRecommendation, hasUsedAutoComplete]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
  };

  const handleRecommendationClick = () => {
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
  };

  const handleInputFocus = () => {
    // Auto-complete with the suggested value if provided, field is empty, and auto-complete hasn't been used yet
    if (autoCompleteValue && (!stringValue || stringValue.trim() === '') && !hasUsedAutoComplete) {
      const autoCompleteString = typeof autoCompleteValue === 'number' 
        ? autoCompleteValue.toString() 
        : autoCompleteValue;
      onChange(autoCompleteString);
      setPreviousValue(autoCompleteString);
      setHasUsedAutoComplete(true); // Mark that auto-complete has been used
    }
    
    // Show recommendation when input is focused and has a value (only if auto-complete hasn't been used)
    if (stringValue && stringValue.trim() !== '' && !hasUsedRecommendation && !hasUsedAutoComplete) {
      const numericValue = parseFloat(stringValue);
      if (!isNaN(numericValue) && numericValue > 0) {
        setShowRecommendation(true);
      }
    }
  };

  const handleInputBlur = () => {
    // Hide recommendation after a short delay to allow clicking on it
    setTimeout(() => {
      setShowRecommendation(false);
    }, 150);
  };

  return (
    <div className="relative">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      
      <input
        ref={inputRef}
        type="number"
        step={step}
        min={min}
        value={stringValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        className={`w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 ${className}`}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
      />

      {/* Recommendation popup */}
      {showRecommendation && (
        <div 
          className="absolute z-10 mt-1 w-auto min-w-full bg-white border border-blue-200 rounded-lg shadow-lg"
          onMouseDown={(e) => e.preventDefault()} // Prevent blur when clicking
        >
          <button
            type="button"
            onClick={handleRecommendationClick}
            className="w-full px-3 py-2 text-left hover:bg-blue-50 rounded-lg focus:outline-none focus:bg-blue-50 text-sm transition-colors duration-150 ease-in-out"
          >
            <div className="flex justify-between items-center gap-3">
              <span className="font-bold text-blue-600">{recommendedValue}</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}