import { useCallback } from 'react';
import { useKeyboardShortcuts } from './useFocusManagement';

export interface POSKeyboardOptions {
  onNewBill?: () => void;
  onCompleteSale?: () => void;
  onClearCart?: () => void;
  onFocusSearch?: () => void;
  onFocusCustomer?: () => void;
  onFocusAmount?: () => void;
  onTogglePaymentMethod?: () => void;
  onQuickCash?: () => void;
  onQuickCredit?: () => void;
}

export function usePOSKeyboard(options: POSKeyboardOptions) {
  const shortcuts = {
    // Function keys for main actions
    'f1': options.onNewBill || (() => {}),
    'f2': options.onCompleteSale || (() => {}),
    'f3': options.onClearCart || (() => {}),
    
    // Quick navigation
    'ctrl+f': options.onFocusSearch || (() => {}),
    'ctrl+u': options.onFocusCustomer || (() => {}),
    'ctrl+a': options.onFocusAmount || (() => {}),
    
    // Payment methods
    'ctrl+1': options.onQuickCash || (() => {}),
    'ctrl+2': options.onQuickCredit || (() => {}),
    'ctrl+p': options.onTogglePaymentMethod || (() => {}),
    
    // Quick actions
    'ctrl+enter': options.onCompleteSale || (() => {}),
    'escape': options.onClearCart || (() => {})
  };

  useKeyboardShortcuts(shortcuts);

  return {
    shortcuts: Object.keys(shortcuts),
    getShortcutHelp: () => ({
      'F1': 'New Bill',
      'F2': 'Complete Sale',
      'F3': 'Clear Cart',
      'Ctrl+F': 'Focus Search',
      'Ctrl+U': 'Focus Customer',
      'Ctrl+A': 'Focus Amount',
      'Ctrl+1': 'Cash Payment',
      'Ctrl+2': 'Credit Payment',
      'Ctrl+P': 'Toggle Payment Method',
      'Ctrl+Enter': 'Complete Sale',
      'Escape': 'Clear Cart'
    })
  };
}