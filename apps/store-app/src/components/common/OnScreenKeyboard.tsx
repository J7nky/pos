import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { usePOSTouchScreen } from '../../hooks/usePOSTouchScreen';
import { Copy, Clipboard, X } from 'lucide-react';

type KeyboardMode = 'compact' | 'expanded';
type KeyboardLanguage = 'en' | 'ar';

type ActiveInput = HTMLInputElement | HTMLTextAreaElement;

interface VirtualKey {
  label: string;
  value?: string;
  action?: 'backspace' | 'clear' | 'space' | 'done' | 'copy' | 'paste';
  grow?: boolean;
  className?: string;
}

const NUMERIC_INPUT_TYPES = new Set(['number', 'tel']);
const NUMERIC_INPUT_MODES = new Set(['numeric', 'decimal', 'tel']);

function isEligibleTarget(target: EventTarget | null): target is ActiveInput {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  if (target.hasAttribute('data-disable-onscreen-keyboard')) {
    return false;
  }

  if (target instanceof HTMLInputElement) {
    if (target.type === 'hidden' || target.type === 'password') {
      return false;
    }
    if (target.readOnly || target.disabled) {
      return false;
    }

    const override = target.dataset.onscreenKeyboard;
    if (override === 'force') {
      return true;
    }
    if (override === 'off') {
      return false;
    }

    // Allow all input types except hidden and password
    return true;
  }

  if (target instanceof HTMLTextAreaElement) {
    if (target.readOnly || target.disabled) {
      return false;
    }

    const override = target.dataset.onscreenKeyboard;
    if (override === 'force') {
      return true;
    }
    if (override === 'off') {
      return false;
    }

    // Allow all textareas
    return true;
  }

  return false;
}

function dispatchInputEvent(target: ActiveInput, inputType: string, data?: string | null) {
  let event: Event;
  try {
    event = new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      data: data ?? undefined,
      inputType
    });
  } catch (error) {
    event = new Event('input', { bubbles: true, cancelable: true });
    (event as any).data = data ?? undefined;
    (event as any).inputType = inputType;
  }

  target.dispatchEvent(event);
}

// Haptic feedback (if available)
function triggerHapticFeedback() {
  if ('vibrate' in navigator) {
    navigator.vibrate(10); // Short vibration
  }
}

export default function OnScreenKeyboard() {
  const { isPOSTouchScreen } = usePOSTouchScreen();
  const [savedMode, setSavedMode] = useLocalStorage<KeyboardMode>('onscreen-keyboard-mode', 'compact');
  const [language, setLanguage] = useLocalStorage<KeyboardLanguage>('onscreen-keyboard-language', 'en');
  const [mode, setMode] = useState<KeyboardMode>(savedMode);
  const [isVisible, setIsVisible] = useState(false);
  const [inputType, setInputType] = useState<'numeric' | 'text'>('numeric');
  const [isAnimating, setIsAnimating] = useState(false);
  const [keyboardPosition, setKeyboardPosition] = useState<{ top: number; left: number } | null>(null);
  const activeInputRef = useRef<ActiveInput | null>(null);
  const keyboardRef = useRef<HTMLDivElement | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);
  const clipboardRef = useRef<string>('');
  
  const [portalElement] = useState(() => {
    if (typeof document === 'undefined') {
      return null;
    }
    const node = document.createElement('div');
    node.id = 'on-screen-keyboard-root';
    return node;
  });

  // Detect input type when keyboard appears
  useEffect(() => {
    if (isVisible && activeInputRef.current) {
      const input = activeInputRef.current;
      const inputMode = input.getAttribute('inputmode')?.toLowerCase() ?? '';
      const type = input.type?.toLowerCase() ?? '';
      
      if (NUMERIC_INPUT_MODES.has(inputMode) || NUMERIC_INPUT_TYPES.has(type)) {
        setInputType('numeric');
      } else {
        setInputType('text');
        // Auto-expand for text inputs
        if (mode === 'compact') {
          setMode('expanded');
        }
      }
    }
  }, [isVisible, mode]);

  // Calculate keyboard position relative to input field (only for numeric mode)
  const updateKeyboardPosition = useCallback(() => {
    if (inputType !== 'numeric') {
      setKeyboardPosition(null);
      return;
    }

    const input = activeInputRef.current;
    const keyboard = keyboardRef.current;
    
    if (!input || !keyboard) {
      return;
    }

    const inputRect = input.getBoundingClientRect();
    const keyboardRect = keyboard.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    // Calculate preferred position (below the input, aligned to the right)
    let top = inputRect.bottom + window.scrollY + 8; // 8px gap below
    let left = inputRect.right - keyboardRect.width + window.scrollX; // Align right edge
    
    // If keyboard would go off-screen to the right, align to left edge instead
    if (left + keyboardRect.width > viewportWidth + window.scrollX) {
      left = inputRect.left + window.scrollX;
    }
    
    // If keyboard would go off-screen to the left, align to viewport left
    if (left < window.scrollX) {
      left = window.scrollX + 8;
    }
    
    // If keyboard would go off-screen to the bottom, position it above the input instead
    if (top + keyboardRect.height > viewportHeight + window.scrollY) {
      top = inputRect.top + window.scrollY - keyboardRect.height - 8;
      // Ensure it doesn't go off-screen to the top
      if (top < window.scrollY) {
        top = window.scrollY + 8;
      }
    }
    
    setKeyboardPosition({ top, left });
  }, [inputType]);

  // Update position when input changes or window resizes (only for numeric mode)
  useEffect(() => {
    if (!isVisible || inputType !== 'numeric' || !activeInputRef.current) {
      setKeyboardPosition(null);
      return;
    }

    // Small delay to ensure keyboard is rendered
    const timeoutId = setTimeout(() => {
      updateKeyboardPosition();
    }, 50);
    
    const handleScroll = () => {
      if (inputType === 'numeric') {
        updateKeyboardPosition();
      }
    };
    
    const handleResize = () => {
      if (inputType === 'numeric') {
        updateKeyboardPosition();
      }
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isVisible, inputType, updateKeyboardPosition]);

  const ensureInputFocus = useCallback(() => {
    const input = activeInputRef.current;
    if (!input) {
      return;
    }

    if (document.activeElement !== input) {
      input.focus({ preventScroll: true });
    }
  }, []);

  const insertText = useCallback((text: string) => {
    const input = activeInputRef.current;
    if (!input) {
      return;
    }

    ensureInputFocus();

    // Check if input is a number type (which doesn't support selection)
    const isNumberType = input.type === 'number';
    
    if (isNumberType) {
      // For number inputs, work with value directly
      const currentValue = input.value || '';
      
      // Validate input
      if (!/^[0-9.]$/.test(text)) {
        return;
      }
      // Prevent multiple decimal points
      if (text === '.' && currentValue.includes('.')) {
        return;
      }
      
      // Append the text to the current value
      const newValue = currentValue + text;
      input.value = newValue;
      dispatchInputEvent(input, 'insertText', text);
    } else {
      // For text inputs, use selection-based approach
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;

      // Validate input based on input type
      const inputMode = input.getAttribute('inputmode')?.toLowerCase() ?? '';
      
      if (inputMode === 'numeric' || inputMode === 'decimal') {
        // Only allow digits and decimal point
        if (!/^[0-9.]$/.test(text)) {
          return;
        }
        // Prevent multiple decimal points
        if (text === '.' && input.value.includes('.')) {
          return;
        }
      }

      input.setRangeText(text, start, end, 'end');
      dispatchInputEvent(input, 'insertText', text);
    }

    // Feedback
    triggerHapticFeedback();
  }, [ensureInputFocus]);

  const handleBackspace = useCallback(() => {
    const input = activeInputRef.current;
    if (!input) {
      return;
    }

    ensureInputFocus();

    // Check if input is a number type (which doesn't support selection)
    const isNumberType = input.type === 'number';
    
    if (isNumberType) {
      // For number inputs, remove last character
      const currentValue = input.value || '';
      if (currentValue.length === 0) {
        return;
      }
      input.value = currentValue.slice(0, -1);
      dispatchInputEvent(input, 'deleteContentBackward');
    } else {
      // For text inputs, use selection-based approach
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;

      if (start === end && start === 0) {
        return;
      }

      const deleteFrom = start === end ? Math.max(0, start - 1) : start;
      input.setRangeText('', deleteFrom, end, 'end');
      dispatchInputEvent(input, 'deleteContentBackward');
    }

    triggerHapticFeedback();
  }, [ensureInputFocus]);

  const handleClear = useCallback(() => {
    const input = activeInputRef.current;
    if (!input) {
      return;
    }

    ensureInputFocus();
    
    // For number inputs, directly set value to empty
    if (input.type === 'number') {
      input.value = '';
    } else {
      input.setSelectionRange(0, input.value.length);
      input.setRangeText('', 0, input.value.length, 'end');
    }
    dispatchInputEvent(input, 'deleteContentBackward');

    triggerHapticFeedback();
  }, [ensureInputFocus]);

  const handleSpace = useCallback(() => {
    insertText(' ');
  }, [insertText]);

  const handleCopy = useCallback(async () => {
    const input = activeInputRef.current;
    if (!input) {
      return;
    }

    const text = input.value.slice(
      input.selectionStart ?? 0,
      input.selectionEnd ?? input.value.length
    ) || input.value;

    try {
      await navigator.clipboard.writeText(text);
      clipboardRef.current = text;
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, []);

  const handlePaste = useCallback(async () => {
    const input = activeInputRef.current;
    if (!input) {
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      insertText(text);
    } catch (error) {
      // Fallback to stored clipboard
      if (clipboardRef.current) {
        insertText(clipboardRef.current);
      }
    }
  }, [insertText]);

  const handleDone = useCallback(() => {
    setIsAnimating(true);
    setTimeout(() => {
      setIsVisible(false);
      setIsAnimating(false);
      setMode(savedMode);
      const input = activeInputRef.current;
      if (input) {
        input.blur();
      }
      activeInputRef.current = null;
    }, 200);
  }, [savedMode]);

  const handleModeToggle = useCallback(() => {
    const newMode = mode === 'compact' ? 'expanded' : 'compact';
    setMode(newMode);
    setSavedMode(newMode);
  }, [mode, setSavedMode]);

  const handleLanguageToggle = useCallback(() => {
    const newLang = language === 'en' ? 'ar' : 'en';
    setLanguage(newLang);
  }, [language, setLanguage]);

  const handleKeyClick = useCallback((key: VirtualKey) => {
    if (key.action === 'backspace') {
      handleBackspace();
      return;
    }

    if (key.action === 'clear') {
      handleClear();
      return;
    }

    if (key.action === 'space') {
      handleSpace();
      return;
    }

    if (key.action === 'done') {
      handleDone();
      return;
    }

    if (key.action === 'copy') {
      handleCopy();
      return;
    }

    if (key.action === 'paste') {
      handlePaste();
      return;
    }

    const value = key.value ?? key.label;
    insertText(value);
  }, [handleBackspace, handleClear, handleDone, handleSpace, handleCopy, handlePaste, insertText]);

  const numericRows = useMemo<VirtualKey[][]>(() => ([
    [
      { label: '7' },
      { label: '8' },
      { label: '9' }
    ],
    [
      { label: '4' },
      { label: '5' },
      { label: '6' }
    ],
    [
      { label: '1' },
      { label: '2' },
      { label: '3' }
    ],
    [
      { label: '0', grow: true },
      { label: '.', value: '.' },
      { label: '⌫', action: 'backspace', className: 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100' }
    ],
    [
      { label: 'Clear', action: 'clear', grow: true, className: 'bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100' },
      { label: 'Done', action: 'done', grow: true, className: 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100' }
    ]
  ]), []);

  const alphaRowsEN = useMemo<VirtualKey[][]>(() => ([
    [
      { label: '1' }, { label: '2' }, { label: '3' }, { label: '4' }, { label: '5' }, { label: '6' }, { label: '7' }, { label: '8' }, { label: '9' }, { label: '0' }
    ],
    [
      { label: 'Q' }, { label: 'W' }, { label: 'E' }, { label: 'R' }, { label: 'T' }, { label: 'Y' }, { label: 'U' }, { label: 'I' }, { label: 'O' }, { label: 'P' }
    ],
    [
      { label: 'A' }, { label: 'S' }, { label: 'D' }, { label: 'F' }, { label: 'G' }, { label: 'H' }, { label: 'J' }, { label: 'K' }, { label: 'L' }
    ],
    [
      { label: 'Z' }, { label: 'X' }, { label: 'C' }, { label: 'V' }, { label: 'B' }, { label: 'N' }, { label: 'M' }, { label: '-' }, { label: '/' }
    ],
    [
      { label: 'Space', action: 'space', grow: true }
    ]
  ]), []);

  const alphaRowsAR = useMemo<VirtualKey[][]>(() => ([
    [
      { label: '1' }, { label: '2' }, { label: '3' }, { label: '4' }, { label: '5' }, { label: '6' }, { label: '7' }, { label: '8' }, { label: '9' }, { label: '0' }
    ],
    [
      { label: 'ض' }, { label: 'ص' }, { label: 'ث' }, { label: 'ق' }, { label: 'ف' }, { label: 'غ' }, { label: 'ع' }, { label: 'ه' }, { label: 'خ' }, { label: 'ح' }
    ],
    [
      { label: 'ش' }, { label: 'س' }, { label: 'ي' }, { label: 'ب' }, { label: 'ل' }, { label: 'ا' }, { label: 'ت' }, { label: 'ن' }, { label: 'م' }
    ],
    [
      { label: 'ك' }, { label: 'ط' }, { label: 'ئ' }, { label: 'ء' }, { label: 'ؤ' }, { label: 'ر' }, { label: 'لا' }, { label: 'ى' }, { label: 'ة' }
    ],
    [
      { label: 'ظ' }, { label: 'ز' }, { label: 'و' }, { label: 'د' }, { label: 'ج' }, { label: 'ذ' }
    ],
    [
      { label: 'Space', action: 'space', grow: true }
    ]
  ]), []);

  const alphaRows = language === 'ar' ? alphaRowsAR : alphaRowsEN;

  useEffect(() => {
    if (!portalElement || typeof document === 'undefined') {
      return;
    }

    document.body.appendChild(portalElement);
    return () => {
      if (portalElement.parentElement === document.body) {
        document.body.removeChild(portalElement);
      }
    };
  }, [portalElement]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;

      if (keyboardRef.current && keyboardRef.current.contains(target as Node)) {
        return;
      }

      if (isEligibleTarget(target)) {
        if (hideTimeoutRef.current) {
          window.clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }

        activeInputRef.current = target;
        setIsVisible(true);
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 300);
      } else if (!keyboardRef.current || !keyboardRef.current.contains(target as Node)) {
        if (hideTimeoutRef.current) {
          window.clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }
        hideTimeoutRef.current = window.setTimeout(() => {
          setIsVisible(false);
          setIsAnimating(false);
          activeInputRef.current = null;
        }, 120);
      }
    };

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (keyboardRef.current?.contains(target)) {
        event.preventDefault();
        ensureInputFocus();
        return;
      }

      const active = activeInputRef.current;
      if (active && target !== active && !active.contains?.(target as Node)) {
        setIsVisible(false);
        setIsAnimating(false);
        activeInputRef.current = null;
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('touchstart', handlePointerDown, true);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('touchstart', handlePointerDown, true);
      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    };
  }, [ensureInputFocus]);

  const renderKey = (key: VirtualKey, index?: number, isNumeric?: boolean) => {
    // For numeric mode, make buttons fill width exactly with no gaps
    if (isNumeric) {
      const numericSize = key.grow 
        ? 'flex-1 h-8 text-base' 
        : 'flex-1 h-8 text-lg';
      
      return (
        <button
          key={`${key.label}-${index ?? ''}`}
          type="button"
          className={`flex items-center justify-center rounded-lg border font-semibold transition-all duration-150 select-none active:scale-95 ${numericSize} ${
            key.className || 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50 active:bg-gray-100'
          }`}
          onMouseDown={(event) => event.preventDefault()}
          onTouchStart={(event) => event.preventDefault()}
          onClick={() => handleKeyClick(key)}
          aria-label={key.label}
        >
          {key.action === 'copy' && <Copy className="w-4 h-4" />}
          {key.action === 'paste' && <Clipboard className="w-4 h-4" />}
          {!key.action?.includes('copy') && !key.action?.includes('paste') && key.label}
        </button>
      );
    }
    
    // Text mode - keep original styling
    const baseSize = 'w-14 h-12 text-lg';
    const sizeClass = key.grow ? 'flex-1 py-3 px-4 text-sm' : baseSize;
    
    return (
      <button
        key={`${key.label}-${index ?? ''}`}
        type="button"
        className={`flex items-center justify-center rounded-lg border font-semibold shadow-sm transition-all duration-150 select-none active:scale-95 ${sizeClass} ${
          key.className || 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50 active:bg-gray-100'
        }`}
        onMouseDown={(event) => event.preventDefault()}
        onTouchStart={(event) => event.preventDefault()}
        onClick={() => handleKeyClick(key)}
        aria-label={key.label}
        dir={language === 'ar' ? 'rtl' : 'ltr'}
      >
        {key.action === 'copy' && <Copy className="w-4 h-4" />}
        {key.action === 'paste' && <Clipboard className="w-4 h-4" />}
        {!key.action?.includes('copy') && !key.action?.includes('paste') && key.label}
      </button>
    );
  };

  if (!isVisible || !portalElement || !isPOSTouchScreen) {
    return null;
  }

  return createPortal(
    <div 
      className={`z-[10000] flex pointer-events-none transition-all duration-300 ${
        inputType === 'numeric' && keyboardPosition
          ? '' 
          : 'fixed inset-x-0 bottom-0 justify-center'
      } ${
        inputType === 'numeric' ? '' : 'px-4 pb-4'
      } ${
        isAnimating ? 'transform translate-y-full opacity-0' : 'transform translate-y-0 opacity-100'
      }`}
      style={
        inputType === 'numeric' && keyboardPosition
          ? { 
              top: `${keyboardPosition.top}px`, 
              left: `${keyboardPosition.left}px`,
              position: 'fixed'
            }
          : undefined
      }
    >
      <div
        ref={keyboardRef}
        className={`pointer-events-auto w-full border border-gray-200 bg-white shadow-2xl shadow-gray-500/30 ${
          inputType === 'numeric' ? 'rounded-none max-w-xs' : 'max-w-2xl rounded-2xl'
        }`}
        role="dialog"
        aria-label="On-screen keyboard"
      >
        {/* Header */}
        <div className={`flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 ${
          inputType === 'numeric' ? 'px-1.5 py-1' : 'px-4 py-3'
        } ${
          inputType === 'numeric' ? '' : 'rounded-t-2xl'
        }`}>
          <div className={`font-semibold text-gray-700 ${
            inputType === 'numeric' ? 'text-xs px-1' : 'text-sm'
          }`}>
            On-screen Keyboard
          </div>
          <div className={`flex items-center ${
            inputType === 'numeric' ? 'space-x-1' : 'space-x-2'
          }`}>
            {/* Copy/Paste buttons */}
            {inputType === 'text' && (
              <>
                <button
                  type="button"
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 flex items-center gap-1 transition-colors"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={handleCopy}
                  title="Copy"
                  aria-label="Copy text"
                >
                  <Copy className="w-3 h-3" />
                  <span className="hidden sm:inline">Copy</span>
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 flex items-center gap-1 transition-colors"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={handlePaste}
                  title="Paste"
                  aria-label="Paste text"
                >
                  <Clipboard className="w-3 h-3" />
                  <span className="hidden sm:inline">Paste</span>
                </button>
              </>
            )}

            {/* Language toggle (only for text mode) */}
            {inputType === 'text' && (
              <button
                type="button"
                className={`rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
                  language === 'ar'
                    ? 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleLanguageToggle}
                aria-label={language === 'en' ? 'Switch to Arabic' : 'Switch to English'}
                title={language === 'en' ? 'Switch to Arabic' : 'Switch to English'}
              >
                {language === 'en' ? 'AR' : 'EN'}
              </button>
            )}

            {/* Mode toggle */}
            {inputType === 'text' && (
              <button
                type="button"
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleModeToggle}
                aria-label={mode === 'compact' ? 'Switch to full keyboard' : 'Switch to compact mode'}
              >
                {mode === 'compact' ? 'ABC' : '123'}
              </button>
            )}

            {/* Close button */}
            <button
              type="button"
              className={`rounded-lg border border-gray-300 bg-white font-medium text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-0.5 ${
                inputType === 'numeric' ? 'px-1 py-0.5 text-xs' : 'px-2 py-1 text-xs'
              }`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleDone}
              aria-label="Close keyboard"
            >
              <X className={inputType === 'numeric' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
              <span className="hidden sm:inline">Close</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className={inputType === 'numeric' ? 'px-2 pb-0 pt-0' : 'px-4 pb-4 pt-3'}>
          {/* Numeric keyboard */}
          {inputType === 'numeric' && (
            <div className="grid px-1 pt-1 pb-1 gap-0.5">
              {numericRows.map((row, rowIndex) => (
                <div key={`num-row-${rowIndex}`} className="flex gap-0.5">
                  {row.map((key, idx) => renderKey(key, idx, true))}
                </div>
              ))}
            </div>
          )}

          {/* Expanded keyboard for text */}
          {mode === 'expanded' && inputType === 'text' && (
            <div className="mt-4 grid gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300" dir={language === 'ar' ? 'rtl' : 'ltr'}>
              {alphaRows.map((row, rowIndex) => (
                <div key={`alpha-row-${rowIndex}`} className="flex gap-2">
                  {row.map((key, idx) => renderKey(key, idx, false))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    portalElement
  );
}
