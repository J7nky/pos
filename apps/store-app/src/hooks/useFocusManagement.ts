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
      // First, check for a focusable element inside a container with data-initial-focus attribute
      const initialFocusContainer = container.querySelector('[data-initial-focus="true"]');
      if (initialFocusContainer) {
        const focusableInContainer = getFocusableElements(initialFocusContainer as HTMLElement)[0];
        if (focusableInContainer) {
          setTimeout(() => focusableInContainer.focus(), 0);
        }
      } else {
        const firstFocusable = getFocusableElements(container)[0];
        if (firstFocusable) {
          setTimeout(() => firstFocusable.focus(), 0);
        }
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

  const allElements = Array.from(container.querySelectorAll(focusableSelectors)) as HTMLElement[];
  
  // Prioritize inputs and textareas over buttons for better UX
  // Also exclude buttons with tabIndex={-1} from initial focus
  const prioritized = allElements.sort((a, b) => {
    const aIsInput = a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT';
    const bIsInput = b.tagName === 'INPUT' || b.tagName === 'TEXTAREA' || b.tagName === 'SELECT';
    const aTabIndex = a.getAttribute('tabindex');
    const bTabIndex = b.getAttribute('tabindex');
    
    // Exclude elements with tabIndex={-1} from being first
    if (aTabIndex === '-1' && bTabIndex !== '-1') return 1;
    if (bTabIndex === '-1' && aTabIndex !== '-1') return -1;
    
    // Prioritize inputs
    if (aIsInput && !bIsInput) return -1;
    if (!aIsInput && bIsInput) return 1;
    
    return 0;
  });
  
  return prioritized;
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