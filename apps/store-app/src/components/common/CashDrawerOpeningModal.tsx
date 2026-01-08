import React, { useState, useEffect } from 'react';
import AccessibleModal from './AccessibleModal';
import MoneyInput from './MoneyInput';
import AccessibleButton from './AccessibleButton';
import { useI18n } from '../../i18n';
import { useOfflineData } from '../../contexts/OfflineDataContext';

interface CashDrawerOpeningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => Promise<void>;
  suggestedAmount?: number;
  title?: string;
  description?: string;
}

export default function CashDrawerOpeningModal({
  isOpen,
  onClose,
  onConfirm,
  suggestedAmount = 0,
  title,
  description
}: CashDrawerOpeningModalProps) {
  const { t } = useI18n();
  const { currency } = useOfflineData();
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get currency display
  const currencyName = t(`common.currency.${currency}`) || currency;

  // Use provided title/description or fallback to translations
  const modalTitle = title || t('pos.openCashDrawer') || 'Open Cash Drawer';
  const modalDescription = description || t('pos.enterOpeningCashAmount') || 'Enter the opening cash amount in the cash drawer.';

  // Reset form when modal opens/closes and focus input
  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setError(null);
      // Focus the input field after modal opens
      // Use requestAnimationFrame twice to ensure DOM is fully rendered and after focus management hook runs
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const input = document.getElementById('cash-drawer-opening-amount-input');
          if (input) {
            (input as HTMLInputElement).focus();
            // Also select the text if there's any
            (input as HTMLInputElement).select();
          }
        });
      });
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!amount || parseFloat(amount) < 0) {
      setError('Please enter a valid amount greater than 0');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    
    try {
      await onConfirm(parseFloat(amount));
      onClose();
      setAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open cash drawer');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      size="sm"
      closeOnOverlayClick={!isSubmitting}
      showCloseButton={true}
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <p className="text-gray-600 text-sm">{modalDescription}</p>
        
        <div>
          <div data-initial-focus="true">
            <MoneyInput
              id="cash-drawer-opening-amount-input"
              label={`${t('pos.openingAmount') || 'Opening Amount'} (${currencyName})`}
              value={amount}
              onChange={setAmount}
              placeholder={suggestedAmount > 0 ? suggestedAmount.toFixed(currency === 'USD' ? 2 : 0) : "0.00"}
              step={currency === 'USD' ? '0.01' : '1000'}
              min="0"
              className="focus:ring-2 focus:ring-blue-500"
              tabIndex={0}
              autoFocus={true}
            />
          </div>
          {suggestedAmount > 0 && (
            <button
              type="button"
              onClick={() => setAmount(suggestedAmount.toFixed(currency === 'USD' ? 2 : 0))}
              className="mt-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
              disabled={isSubmitting}
            >
              {t('pos.useSuggestedAmount') || 'Use suggested amount:'} {currency === 'USD' ? `$${suggestedAmount.toFixed(2)}` : `${Math.round(suggestedAmount).toLocaleString()} ل.ل`}
            </button>
          )}
        </div>

        {error && (
          <div className="text-red-600 text-sm font-medium" role="alert">
            {error}
          </div>
        )}

        <div className="flex justify-end space-x-3 pt-4">
          <AccessibleButton
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
            tabIndex={3}
          >
            {t('common.actions.cancel')}
          </AccessibleButton>
          <AccessibleButton
            type="submit"
            variant="primary"
            loading={isSubmitting}
            tabIndex={2}
            touchOptimized
          >
            {isSubmitting ? (t('pos.opening') || 'Opening...') : (t('pos.openDrawer') || 'Open Drawer')}
          </AccessibleButton>
        </div>
      </form>
    </AccessibleModal>
  );
}

