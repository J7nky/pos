import AccessibleModal from './AccessibleModal';
import { Transaction } from '../../types';
import { useI18n } from '../../i18n';
import TransactionListItem from './TransactionListItem';

interface TransactionListModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: (Transaction | any)[]; // Allow any to handle transactions with createdAt alias
  title: string;
  formatCurrency: (amount: number) => string;
  convertAmount: (transaction: Transaction | any) => number;
}

export default function TransactionListModal({
  isOpen,
  onClose,
  transactions,
  title,
  formatCurrency,
  convertAmount,
}: TransactionListModalProps) {
  const { t } = useI18n();

  const sortedTransactions = [...transactions].sort((a, b) => {
    const dateA = a.createdAt || a.created_at || '';
    const dateB = b.createdAt || b.created_at || '';
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  const totalAmount = transactions.reduce((sum, transaction) => sum + convertAmount(transaction), 0);

  // Create a formatCurrency function that works with TransactionListItem
  // TransactionListItem expects (amount: number, currency?: string) => string
  const formatCurrencyForItem = (amount: number): string => {
    return formatCurrency(amount);
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
    >
      <div className="p-6">
        {/* Summary */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{t('common.total') || 'Total'}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatCurrency(totalAmount)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">{t('common.transactions')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {transactions.length}
              </p>
            </div>
          </div>
        </div>

        {/* Transactions List */}
        {sortedTransactions.length > 0 ? (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {sortedTransactions.map((transaction) => {
              // Convert the amount for display
              const convertedAmount = convertAmount(transaction);
              // Create a transaction object with converted amount for display
              const displayTransaction = {
                ...transaction,
                amount: Math.abs(convertedAmount),
              };
              
              return (
                <TransactionListItem
                  key={transaction.id}
                  transaction={displayTransaction}
                  formatCurrency={formatCurrencyForItem}
                  showDate={true}
                  showCurrency={true}
                  showReference={true}
                />
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">{t('common.noTransactionsFound') || 'No transactions found'}</p>
          </div>
        )}
      </div>
    </AccessibleModal>
  );
}

