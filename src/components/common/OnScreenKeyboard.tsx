import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type KeyboardMode = 'compact' | 'expanded';

type ActiveInput = HTMLInputElement | HTMLTextAreaElement;

interface VirtualKey {
  label: string;
  value?: string;
  action?: 'backspace' | 'clear' | 'space' | 'done';
  grow?: boolean;
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

    const type = target.type?.toLowerCase();
    if (type && NUMERIC_INPUT_TYPES.has(type)) {
      return true;
    }

    const inputMode = target.getAttribute('inputmode')?.toLowerCase() ?? '';
    if (inputMode && NUMERIC_INPUT_MODES.has(inputMode)) {
      return true;
    }

    const pattern = target.getAttribute('pattern');
    if (pattern && /[0-9]/.test(pattern)) {
      return true;
    }

    if (target.name && /amount|qty|quantity|price|total|number|bill|reference|weight|limit|balance|rate/i.test(target.name)) {
      return true;
    }

    return false;
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

    const inputMode = target.getAttribute('inputmode')?.toLowerCase() ?? '';
    if (inputMode && NUMERIC_INPUT_MODES.has(inputMode)) {
      return true;
    }

    if (target.name && /notes|description|comment|details/i.test(target.name)) {
      return false;
    }

    return false;
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

export default function OnScreenKeyboard() {
  const [mode, setMode] = useState<KeyboardMode>('compact');
  const [isVisible, setIsVisible] = useState(false);
  const activeInputRef = useRef<ActiveInput | null>(null);
  const keyboardRef = useRef<HTMLDivElement | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);
  const [portalElement] = useState(() => {
    if (typeof document === 'undefined') {
      return null;
    }
    const node = document.createElement('div');
    node.id = 'on-screen-keyboard-root';
    return node;
  });

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

    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;

    input.setRangeText(text, start, end, 'end');
    dispatchInputEvent(input, 'insertText', text);
  }, [ensureInputFocus]);

  const handleBackspace = useCallback(() => {
    const input = activeInputRef.current;
    if (!input) {
      return;
    }

    ensureInputFocus();

    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;

    if (start === end && start === 0) {
      return;
    }

    const deleteFrom = start === end ? Math.max(0, start - 1) : start;
    input.setRangeText('', deleteFrom, end, 'end');
    dispatchInputEvent(input, 'deleteContentBackward');
  }, [ensureInputFocus]);

  const handleClear = useCallback(() => {
    const input = activeInputRef.current;
    if (!input) {
      return;
    }

    ensureInputFocus();
    input.setSelectionRange(0, input.value.length);
    input.setRangeText('', 0, input.value.length, 'end');
    dispatchInputEvent(input, 'deleteContentBackward');
  }, [ensureInputFocus]);

  const handleSpace = useCallback(() => {
    insertText(' ');
  }, [insertText]);

  const handleDone = useCallback(() => {
    setIsVisible(false);
    setMode('compact');
    const input = activeInputRef.current;
    if (input) {
      input.blur();
    }
    activeInputRef.current = null;
  }, []);

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

    const value = key.value ?? key.label;
    insertText(value);
  }, [handleBackspace, handleClear, handleDone, handleSpace, insertText]);

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
      { label: '⌫', action: 'backspace' }
    ],
    [
      { label: 'Clear', action: 'clear', grow: true },
      { label: 'Done', action: 'done', grow: true }
    ]
  ]), []);

  const alphaRows = useMemo<VirtualKey[][]>(() => ([
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
        setMode('compact');
      } else if (!keyboardRef.current || !keyboardRef.current.contains(target as Node)) {
        if (hideTimeoutRef.current) {
          window.clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }
        hideTimeoutRef.current = window.setTimeout(() => {
          setIsVisible(false);
          setMode('compact');
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
        setMode('compact');
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

  const renderKey = (key: VirtualKey) => (
    <button
      key={key.label}
      type="button"
      className={`flex items-center justify-center rounded-lg border border-gray-300 bg-white text-lg font-semibold text-gray-800 shadow-sm active:bg-gray-100 transition-colors select-none ${
        key.grow ? 'flex-1 py-3 px-4' : 'w-14 h-12'
      }`}
      onMouseDown={(event) => event.preventDefault()}
      onTouchStart={(event) => event.preventDefault()}
      onClick={() => handleKeyClick(key)}
    >
      {key.label}
    </button>
  );

  if (!isVisible || !portalElement) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-[10000] flex justify-center px-4 pb-4 pointer-events-none">
      <div
        ref={keyboardRef}
        className="pointer-events-auto w-full max-w-xl rounded-2xl border border-gray-200 bg-white shadow-xl shadow-gray-500/20"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 bg-gray-50 rounded-t-2xl">
          <div className="text-sm font-medium text-gray-700">On-screen Keyboard</div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setMode((prev) => (prev === 'compact' ? 'expanded' : 'compact'))}
            >
              {mode === 'compact' ? 'Full Keyboard' : 'Compact Mode'}
            </button>
            <button
              type="button"
              className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleDone}
            >
              Close
            </button>
          </div>
        </div>

        <div className="px-4 pb-4 pt-3">
          <div className="grid gap-2">
            {numericRows.map((row, rowIndex) => (
              <div key={`num-row-${rowIndex}`} className="flex gap-2">
                {row.map(renderKey)}
              </div>
            ))}
          </div>

          {mode === 'expanded' && (
            <div className="mt-4 grid gap-2">
              {alphaRows.map((row, rowIndex) => (
                <div key={`alpha-row-${rowIndex}`} className="flex gap-2">
                  {row.map(renderKey)}
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

