import { useNavigate } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useMultilingual } from '../../hooks/useMultilingual';
import { getTranslatedString, parseMultilingualString } from '../../utils/multilingual';
import { Transaction } from '../../types';
import { TRANSACTION_CATEGORIES } from '../../constants/transactionCategories';
import { isPaymentTransaction } from '../../constants/paymentCategories';

interface TransactionListItemProps {
  transaction: Transaction | any;
  formatCurrency: (amount: number) => string;
  showDate?: boolean;
  showCurrency?: boolean;
  showReference?: boolean;
  onNavigate?: (transaction: Transaction | any) => void;
}

export default function TransactionListItem({
  transaction,
  formatCurrency,
  showDate = true,
  showCurrency = true,
  showReference = false,
  onNavigate,
}: TransactionListItemProps) {
  const navigate = useNavigate();
  const { getText } = useMultilingual();
  const isIncome = transaction.type === 'income';
  const dateStr = transaction.createdAt || transaction.created_at || '';

  const handleClick = () => {
    if (onNavigate) {
      onNavigate(transaction);
      return;
    }

    // Determine navigation based on transaction type
    const category = transaction.category || '';
    
    // Check if it's an inventory bill transaction
    // Inventory bills are typically transactions with:
    // 1. INVENTORY_CASH_PURCHASE category
    // 2. Reference containing INV- (inventory purchase)
    // 3. Supplier_id present (received from supplier)
    // 4. Metadata linking to inventory_bill
    const isInventoryBill = 
      category === TRANSACTION_CATEGORIES.INVENTORY_CASH_PURCHASE ||
      (transaction.reference && (
        transaction.reference.includes('INV-') || 
        transaction.reference.includes('INVENTORY')
      )) ||
      (transaction.metadata && transaction.metadata.inventory_bill_id) ||
      (transaction.supplier_id && category.includes('Supplier'));

    // Check if it's a payment transaction
    const isPayment = isPaymentTransaction(transaction);

    // Check if it's a cash drawer sale transaction
    const isCashDrawerSale = category === TRANSACTION_CATEGORIES.CASH_DRAWER_SALE;

    if (isInventoryBill) {
      // Navigate to Received Bills tab
      // useLocalStorage expects JSON-serialized values
      localStorage.setItem('accounting_active_tab', JSON.stringify('received-bills'));
      // Store transaction ID for finding related inventory item
      if (transaction.id) {
        sessionStorage.setItem('highlightTransactionId', transaction.id);
      }
      // If there's a reference to a specific bill, store it for highlighting
      if (transaction.reference) {
        sessionStorage.setItem('highlightReceivedBillReference', transaction.reference);
      }
      // If there's a supplier_id, store it for filtering
      if (transaction.supplier_id) {
        sessionStorage.setItem('highlightReceivedBillSupplier', transaction.supplier_id);
      }
      navigate('/accounting');
    } else if (isCashDrawerSale) {
      // Navigate to Bills Management tab
      localStorage.setItem('accounting_active_tab', JSON.stringify('bills-management'));
      // Store bill_number from reference for highlighting
      if (transaction.reference) {
        sessionStorage.setItem('highlightBillNumber', transaction.reference);
      }
      navigate('/accounting');
    } else if (isPayment) {
      // Navigate to Recent Payments tab
      localStorage.setItem('accounting_active_tab', JSON.stringify('payments'));
      // Store transaction ID for highlighting
      if (transaction.id) {
        sessionStorage.setItem('highlightPaymentTransactionId', transaction.id);
      }
      navigate('/accounting');
    } else {
      // Navigate to Accounting dashboard (default)
      localStorage.setItem('accounting_active_tab', JSON.stringify('dashboard'));
      // Store transaction ID for highlighting in dashboard
      if (transaction.id) {
        sessionStorage.setItem('highlightDashboardTransactionId', transaction.id);
      }
      navigate('/accounting');
    }
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const getCategory = (): string => {
    if (transaction.category) {
      return getTranslatedString(parseMultilingualString(transaction.category as any), 'en' as any);
    }
    return '';
  };

  const getDescription = (): string => {
    if (transaction.description) {
      const desc = getText(parseMultilingualString(transaction.description) as any);
      if (desc) return desc;
    }
    // Fallback to category if description is empty
    return getCategory() || 'No description';
  };

  const displayAmount = formatCurrency(transaction.amount);

  return (
    <div 
      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200 border border-transparent hover:border-gray-200 cursor-pointer"
      onClick={handleClick}
    >
      <div className="flex items-center flex-1 min-w-0">
        <div
          className={`p-2 rounded-full mr-3 flex-shrink-0 ${
            isIncome ? 'bg-green-100' : 'bg-red-100'
          }`}
        >
          {isIncome ? (
            <ArrowDownRight className="w-4 h-4 text-green-600" />
          ) : (
            <ArrowUpRight className="w-4 h-4 text-red-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">
            {getCategory() || getDescription()}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {getDescription()}
          </div>
          {(showDate || showCurrency || (showReference && transaction.reference)) && (
            <div className="flex items-center space-x-2 mt-1">
              {showDate && (
                <>
                  <span className="text-xs text-gray-400">
                    {formatDate(dateStr)}
                  </span>
                  {(showCurrency || (showReference && transaction.reference)) && (
                    <span className="text-xs text-gray-400">•</span>
                  )}
                </>
              )}
              {showCurrency && transaction.currency && (
                <>
                  <span className="text-xs text-gray-400">
                    {transaction.currency}
                  </span>
                  {showReference && transaction.reference && (
                    <span className="text-xs text-gray-400">•</span>
                  )}
                </>
              )}
              {showReference && transaction.reference && (
                <span className="text-xs text-gray-400">
                  Ref: {transaction.reference}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="text-right flex-shrink-0 ml-4">
        <div
          className={`text-sm font-semibold ${
            isIncome ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {isIncome ? '+' : '-'}
          {displayAmount}
        </div>
      </div>
    </div>
  );
}

