import { useEffect, useRef, useCallback } from 'react';

export interface FocusManagementOptions {
  trapFocus?: boolean;
  restoreFocus?: boolean;
  autoFocus?: boolean;
  escapeToClose?: boolean;
  onEscape?: () => void;
}

export function useFocusManagement(
  isOpen: boolean,
  options: FocusManagementOptions = {}
) {
  const {
    trapFocus = true,
    restoreFocus = true,
    autoFocus = true,
    escapeToClose = true,
    onEscape
  } = options;

  const containerRef = useRef<HTMLElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Store the previously focused element when opening
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
    }
  }, [isOpen]);

  // Focus management when modal opens/closes
  useEffect(() => {
    if (!isOpen) return;

    const container = containerRef.current;
    if (!container) return;

    // Auto-focus first focusable element
    if (autoFocus) {
      const firstFocusable = getFocusableElements(container)[0];
      if (firstFocusable) {
        setTimeout(() => firstFocusable.focus(), 0);
      }
    }

    // Trap focus within container
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && escapeToClose) {
        e.preventDefault();
        onEscape?.();
        return;
      }

      if (e.key === 'Tab' && trapFocus) {
        const focusableElements = getFocusableElements(container);
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Shift + Tab
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          // Tab
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, trapFocus, escapeToClose, autoFocus, onEscape]);

  // Restore focus when closing
  useEffect(() => {
    if (!isOpen && restoreFocus && previousActiveElement.current) {
      previousActiveElement.current.focus();
      previousActiveElement.current = null;
    }
  }, [isOpen, restoreFocus]);

  return containerRef;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const focusableSelectors = [
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ].join(', ');

  return Array.from(container.querySelectorAll(focusableSelectors));
}

export function useKeyboardShortcuts(shortcuts: Record<string, () => void>) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger shortcuts when not in input fields
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      const modifiers = {
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey
      };

      // Create shortcut key string
      const shortcutKey = [
        modifiers.ctrl && 'ctrl',
        modifiers.alt && 'alt',
        modifiers.shift && 'shift',
        modifiers.meta && 'meta',
        key
      ].filter(Boolean).join('+');

      if (shortcuts[shortcutKey]) {
        e.preventDefault();
        e.preventDefault();
        shortcuts[shortcutKey]();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}