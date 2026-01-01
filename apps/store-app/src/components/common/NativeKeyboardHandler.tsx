import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useI18n } from '../../i18n';
import { Languages } from 'lucide-react';
import arLocale from '../../i18n/locales/ar';
import enLocale from '../../i18n/locales/en';
import { usePOSTouchScreen } from '../../hooks/usePOSTouchScreen';

// Helper function to get translation by path (same as i18n's getByPath)
function getByPath(obj: any, path: string): any {
  if (!path || typeof path !== 'string' || path.trim() === '') {
    return undefined;
  }
  const parts = path.split('.').filter(p => p.trim() !== '');
  if (parts.length === 0) {
    return undefined;
  }
  return parts.reduce((acc: any, part: string) => {
    if (acc === null || acc === undefined) {
      return undefined;
    }
    if (typeof acc !== 'object') {
      return undefined;
    }
    return acc[part] !== undefined ? acc[part] : undefined;
  }, obj);
}

type ActiveInput = HTMLInputElement | HTMLTextAreaElement;
type KeyboardLanguage = 'en' | 'ar';

/**
 * Native Keyboard Handler
 * 
 * Shows on-screen keyboard and numpad ONLY on desktop touch screen devices (POS systems).
 * 
 * Behavior:
 * - POS touch screens (desktop touch devices): Shows custom keyboard/numpad
 * - Regular desktops (with physical keyboards): No keyboard shown
 * - Phones/tablets: No keyboard shown (they have native OS keyboards)
 * 
 * The inputmode attribute on inputs ensures the correct keyboard type:
 * - inputmode="numeric" or "decimal" → Shows numeric keypad
 * - inputmode="text" → Shows full keyboard
 */
export default function NativeKeyboardHandler() {
  const { language } = useI18n();
  const { isPOSTouchScreen } = usePOSTouchScreen();
  const [isVisible, setIsVisible] = useState(false);
  const [inputType, setInputType] = useState<'numeric' | 'text'>('numeric');
  const [keyboardLang, setKeyboardLang] = useState<KeyboardLanguage>(language as KeyboardLanguage || 'en');
  const activeInputRef = useRef<ActiveInput | null>(null);
  const [inputPosition, setInputPosition] = useState<{ top: number; left: number } | null>(null);

  // Get translations from locale files based on keyboard language
  const getKeyboardTranslation = useCallback((key: string): string => {
    const locale = keyboardLang === 'ar' ? arLocale : enLocale;
    const translation = getByPath(locale, `common.keyboard.${key}`);
    
    // Fallback to English if translation not found
    if (!translation && keyboardLang === 'ar') {
      const fallback = getByPath(enLocale, `common.keyboard.${key}`);
      return fallback || key;
    }
    
    return translation || key;
  }, [keyboardLang]);

  // Use translations from locale files
  const translations = useMemo(() => ({
    hide: getKeyboardTranslation('hide'),
    clear: getKeyboardTranslation('clear'),
    space: getKeyboardTranslation('space'),
    numericKeyboard: getKeyboardTranslation('numericKeyboard'),
    textKeyboard: getKeyboardTranslation('textKeyboard'),
    desktopTesting: getKeyboardTranslation('desktopTesting'),
    switchLanguage: getKeyboardTranslation('switchLanguage'),
    english: getKeyboardTranslation('english'),
    arabic: getKeyboardTranslation('arabic')
  }), [getKeyboardTranslation]);

  // Update keyboard language when app language changes
  useEffect(() => {
    setKeyboardLang(language as KeyboardLanguage || 'en');
  }, [language]);

  // Only show keyboard on POS touch screen devices
  // - Regular desktops: Don't show (they have physical keyboards)
  // - Phones/tablets: Don't show (they have native OS keyboards)
  // - POS touch screens: Show (desktop touch devices without physical keyboards)
  const shouldShowKeyboard = isPOSTouchScreen;

  const handleKeyClick = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const input = activeInputRef.current;
    if (!input) return;

    // Keep input focused to prevent keyboard from hiding
    if (document.activeElement !== input) {
      input.focus();
    }

    // Helper function to update input value and trigger React events
    const updateInputValue = (newValue: string, cursorPos: number) => {
      // Check if input type is 'number' - these don't support setSelectionRange
      const isNumberInput = input instanceof HTMLInputElement && input.type === 'number';
      
      // Use native setter to update value
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set || Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, newValue);
      } else {
        input.value = newValue;
      }

      // Set cursor position (only for non-number inputs)
      if (!isNumberInput) {
        try {
          input.setSelectionRange(cursorPos, cursorPos);
        } catch (err) {
          // Ignore errors for inputs that don't support selection
        }
      }

      // Create and dispatch InputEvent (more compatible with React)
      let inputEvent: Event;
      try {
        inputEvent = new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: key === 'backspace' ? null : (key === 'space' ? ' ' : key)
        });
      } catch (err) {
        // Fallback for browsers that don't support InputEvent constructor
        inputEvent = new Event('input', { bubbles: true, cancelable: true });
        (inputEvent as any).inputType = 'insertText';
        (inputEvent as any).data = key === 'backspace' ? null : (key === 'space' ? ' ' : key);
      }

      // Dispatch input event (triggers React's onChange)
      input.dispatchEvent(inputEvent);

      // Also dispatch change event for compatibility
      const changeEvent = new Event('change', { bubbles: true, cancelable: true });
      input.dispatchEvent(changeEvent);
    };

    // Check if input type is 'number' - these don't support selectionStart/selectionEnd
    const isNumberInput = input instanceof HTMLInputElement && input.type === 'number';
    
    if (key === 'backspace') {
      if (isNumberInput) {
        // For number inputs, just remove last character
        const currentValue = input.value;
        const newValue = currentValue.slice(0, -1);
        updateInputValue(newValue, newValue.length);
      } else {
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        if (start > 0) {
          const newValue = input.value.slice(0, start - 1) + input.value.slice(end);
          updateInputValue(newValue, start - 1);
        }
      }
    } else if (key === 'clear') {
      updateInputValue('', 0);
    } else if (key === 'space') {
      if (isNumberInput) {
        // Number inputs don't support spaces, skip
        return;
      }
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      const newValue = input.value.slice(0, start) + ' ' + input.value.slice(end);
      updateInputValue(newValue, start + 1);
    } else {
      if (isNumberInput) {
        // For number inputs, just append to the end
        const currentValue = input.value;
        const newValue = currentValue + key;
        updateInputValue(newValue, newValue.length);
      } else {
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        const newValue = input.value.slice(0, start) + key + input.value.slice(end);
        updateInputValue(newValue, start + key.length);
      }
    }
  }, []);

  useEffect(() => {
    const handleFocus = (e: FocusEvent) => {
      const target = e.target;
      if (
        (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
        !target.disabled &&
        !target.readOnly &&
        !target.hasAttribute('data-disable-onscreen-keyboard')
      ) {
        activeInputRef.current = target;
        
        // Detect input type
        const inputMode = target.getAttribute('inputmode')?.toLowerCase() ?? '';
        const type = target.type?.toLowerCase() ?? '';
        const isNumeric = inputMode === 'numeric' || inputMode === 'decimal' || type === 'number';
        
        setInputType(isNumeric ? 'numeric' : 'text');
        
        // Calculate input position for floating numpad
        if (isNumeric && shouldShowKeyboard) {
          const updatePosition = () => {
            if (!activeInputRef.current) return;
            const rect = activeInputRef.current.getBoundingClientRect();
            
            // Position numpad below the input, aligned to the right edge
            // Add some spacing (8px gap)
            const numpadHeight = 220; // Approximate numpad height
            const numpadWidth = 160; // Approximate numpad width
            
            // Use viewport-relative coordinates (getBoundingClientRect already gives viewport coords)
            let top = rect.bottom + 8;
            let left = rect.right - numpadWidth;
            
            // Ensure numpad stays within viewport
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            
            // If numpad would go below viewport, position it above the input
            if (rect.bottom + numpadHeight + 8 > viewportHeight) {
              top = rect.top - numpadHeight - 8;
            }
            
            // Ensure numpad doesn't go off left or right edges
            left = Math.max(8, Math.min(left, viewportWidth - numpadWidth - 8));
            
            setInputPosition({ top, left });
          };
          
          updatePosition();
          
          // Update position on scroll and resize
          const handleScroll = () => updatePosition();
          window.addEventListener('scroll', handleScroll, true);
          window.addEventListener('resize', handleScroll);
          
          // Store cleanup function
          (target as any)._keyboardScrollCleanup = () => {
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', handleScroll);
          };
        }
        
        // Show keyboard only on POS touch screen devices
        if (shouldShowKeyboard) {
          setIsVisible(true);
        } else {
          // On regular desktops or phones/tablets, don't show custom keyboard
          setIsVisible(false);
        }
      }
    };

    const handleBlur = (e: FocusEvent) => {
      // Delay hiding to allow button clicks to register
      // Check if the new focus target is part of the keyboard
      const relatedTarget = e.relatedTarget as HTMLElement;
      const isKeyboardElement = relatedTarget?.closest('.keyboard-container');
      
        setTimeout(() => {
          // Only hide if focus moved away from input AND not to keyboard
          if (document.activeElement !== activeInputRef.current && !isKeyboardElement) {
            // Cleanup scroll listeners
            if (activeInputRef.current && (activeInputRef.current as any)._keyboardScrollCleanup) {
              (activeInputRef.current as any)._keyboardScrollCleanup();
              delete (activeInputRef.current as any)._keyboardScrollCleanup;
            }
            
            setIsVisible(false);
            activeInputRef.current = null;
            setInputPosition(null);
          } else if (document.activeElement !== activeInputRef.current && activeInputRef.current) {
            // If focus moved to keyboard, keep input focused
            activeInputRef.current.focus();
          }
        }, 200);
    };

    const handleKeyDown = (_event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement
      ) {
        if (activeElement.hasAttribute('data-disable-onscreen-keyboard')) {
          return;
        }

        if (activeElement.disabled || activeElement.readOnly) {
          return;
        }

        // On desktop, physical keyboard still works
        // Keyboard events are handled by the browser
        return;
      }
    };

    document.addEventListener('focusin', handleFocus);
    document.addEventListener('focusout', handleBlur);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('focusout', handleBlur);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shouldShowKeyboard]);

  // Numeric keyboard layout - expanded to use full width (for desktop testing)
  const numericKeys = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['0', '.', 'backspace']
  ];

  // English keyboard layout
  const englishKeys = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
    ['space', 'clear', 'backspace']
  ];

  // Arabic keyboard layout
  const arabicKeys = [
    ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج'],
    ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك'],
    ['ظ', 'ط', 'ذ', 'د', 'ز', 'ر', 'و', 'ة', 'ى'],
    ['space', 'clear', 'backspace']
  ];

  // Get keyboard layout based on language
  const getTextKeys = () => {
    return keyboardLang === 'ar' ? arabicKeys : englishKeys;
  };

  const textKeys = getTextKeys();

  // Language switcher handler - toggle between en and ar
  const handleLanguageSwitch = () => {
    setKeyboardLang(keyboardLang === 'en' ? 'ar' : 'en');
  };

  // Only render keyboard on POS touch screen devices
  if (!isVisible || !shouldShowKeyboard) {
    return null;
  }

  // For numeric inputs: Show small floating numpad near the input field
  if (inputType === 'numeric' && inputPosition) {
    return (
      <div 
        className="fixed z-50 keyboard-container"
        style={{
          top: `${inputPosition.top}px`,
          left: `${inputPosition.left}px`
        }}
      >
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-2">
          <div className="flex justify-between items-center mb-1 px-1">
            <span className="text-xs text-gray-500">{translations.numericKeyboard}</span>
            <button
              onClick={() => setIsVisible(false)}
              onMouseDown={(e) => e.preventDefault()}
              className="text-gray-400 hover:text-gray-600 text-xs px-1"
            >
              ×
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {numericKeys.flat().map((key) => (
              <button
                key={key}
                onClick={(e) => handleKeyClick(key, e)}
                onMouseDown={(e) => e.preventDefault()}
                className={`w-12 h-12 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 active:bg-gray-200 text-base font-medium transition-all ${
                  key === 'backspace' ? 'bg-red-50 hover:bg-red-100 border-red-200' : 
                  'hover:border-blue-300 hover:shadow-sm'
                }`}
              >
                {key === 'backspace' ? '⌫' : key === 'clear' ? translations.clear : key}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // For text inputs: Show full keyboard at bottom
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-100 border-t border-gray-300 shadow-lg z-50 p-4 keyboard-container">
      <div className="w-full max-w-full mx-auto">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 font-medium">
              {translations.textKeyboard}
            </span>
            <button
              onClick={handleLanguageSwitch}
              onMouseDown={(e) => e.preventDefault()}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 active:from-blue-700 active:to-blue-800 text-sm font-semibold transition-all shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95"
              title={translations.switchLanguage}
            >
              <Languages className="w-4 h-4" />
              <span className="font-bold">{keyboardLang === 'ar' ? translations.arabic : translations.english}</span>
              <span className="text-xs opacity-90">({keyboardLang.toUpperCase()})</span>
            </button>
          </div>
          <button
            onClick={() => setIsVisible(false)}
            onMouseDown={(e) => e.preventDefault()}
            className="text-gray-600 hover:text-gray-800 text-sm px-3 py-1.5 hover:bg-gray-200 rounded transition-colors"
          >
            {translations.hide}
          </button>
        </div>
        
        {/* Text keyboard with language support - buttons expand to full width */}
        <div className="space-y-2">
          {textKeys.map((row, i) => (
            <div key={i} className="flex gap-1.5 w-full">
              {row.map((key) => (
                <button
                  key={key}
                  onClick={(e) => handleKeyClick(key, e)}
                  onMouseDown={(e) => e.preventDefault()} // Prevent blur
                  className={`flex-1 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 active:bg-gray-100 text-base font-medium transition-all ${
                    key === 'backspace' ? 'bg-red-50 hover:bg-red-100 border-red-300 flex-[1.5]' : 
                    key === 'clear' ? 'bg-orange-50 hover:bg-orange-100 border-orange-300 flex-[1.5]' :
                    key === 'space' ? 'flex-[3]' : 
                    'hover:border-blue-400 hover:shadow-sm'
                  }`}
                >
                  {key === 'backspace' ? '⌫' : 
                   key === 'clear' ? translations.clear : 
                   key === 'space' ? translations.space : 
                   keyboardLang === 'ar' ? key : key.toUpperCase()}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

