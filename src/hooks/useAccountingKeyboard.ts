import { useKeyboardShortcuts } from './useFocusManagement';

export interface AccountingKeyboardOptions {
  onNewTransaction?: () => void;
  onCustomerPayment?: () => void;
  onSupplierPayment?: () => void;
  onExpense?: () => void;
  onRefresh?: () => void;
  onExport?: () => void;
  onSearch?: () => void;
  onSync?: () => void;
}

export function useAccountingKeyboard(options: AccountingKeyboardOptions) {
  const shortcuts = {
    // Function keys for main actions
    'f1': options.onNewTransaction || (() => {}),
    'f2': options.onCustomerPayment || (() => {}),
    'f3': options.onSupplierPayment || (() => {}),
    'f4': options.onExpense || (() => {}),
    
    // Navigation and actions
    'ctrl+r': options.onRefresh || (() => {}),
    'ctrl+e': options.onExport || (() => {}),
    'ctrl+f': options.onSearch || (() => {}),
    'ctrl+s': options.onSync || (() => {}),
    
    // Quick transaction types
    'ctrl+shift+c': options.onCustomerPayment || (() => {}),
    'ctrl+shift+s': options.onSupplierPayment || (() => {}),
    'ctrl+shift+e': options.onExpense || (() => {})
  };

  useKeyboardShortcuts(shortcuts);

  return {
    shortcuts: Object.keys(shortcuts),
    getShortcutHelp: () => ({
      'F1': 'New Transaction',
      'F2': 'Customer Payment',
      'F3': 'Supplier Payment', 
      'F4': 'Record Expense',
      'Ctrl+R': 'Refresh Data',
      'Ctrl+E': 'Export Report',
      'Ctrl+F': 'Focus Search',
      'Ctrl+S': 'Sync Data',
      'Ctrl+Shift+C': 'Customer Payment',
      'Ctrl+Shift+S': 'Supplier Payment',
      'Ctrl+Shift+E': 'Record Expense'
    })
  };
}