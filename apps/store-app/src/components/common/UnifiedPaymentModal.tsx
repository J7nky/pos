import React from 'react';
import { CheckCircle, TrendingDown, UserCheck } from 'lucide-react';
import { Customer, Supplier } from '../../types';
import { useI18n } from '../../i18n';
import { useOfflineData } from '../../contexts/OfflineDataContext';
import { currencyService } from '../../services/currencyService';
import { getLegacyBalance } from '../../utils/currencyFieldMap';
import type { CurrencyCode } from '@pos-platform/shared';

interface UnifiedPaymentModalProps {
    entity: Customer | Supplier;
    entityType: 'customer' | 'supplier';
    paymentDirection: 'receive' | 'pay';
    setPaymentDirection: (direction: 'receive' | 'pay') => void;
    paymentForm: {
        amount: string;
        currency: CurrencyCode;
        description: string;
    };
    setPaymentForm: React.Dispatch<React.SetStateAction<{
        amount: string;
        currency: CurrencyCode;
        description: string;
        reference: string;
    }>>;
    overpaymentWarning: { show: boolean; amount: number; currency: string } | null;
    setOverpaymentWarning: React.Dispatch<React.SetStateAction<{ show: boolean; amount: number; currency: string } | null>>;
    getSuggestedPayments: (entity: Customer | Supplier | undefined, currency: CurrencyCode) => Array<{ percentage: number; amount: number; label: string }>;
    onSubmit: (e: React.FormEvent) => void;
    onClose: () => void;
}

export const UnifiedPaymentModal: React.FC<UnifiedPaymentModalProps> = ({
    entity,
    entityType,
    paymentDirection,
    setPaymentDirection,
    paymentForm,
    setPaymentForm,
    overpaymentWarning,
    setOverpaymentWarning,
    getSuggestedPayments,
    onSubmit,
    onClose,
}) => {
    const { t } = useI18n();
    const { acceptedCurrencies, isMultiCurrency } = useOfflineData();

    return (
        <div className="animate-modal-fade fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="animate-modal-pop bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b">
                    <h2 className="text-xl font-semibold text-gray-900">
                        {t('customers.recordPaymentFor') || 'Record Payment for'} {entity.name}
                    </h2>
                </div>
                <form onSubmit={onSubmit} className="p-6 space-y-6">
                    {/* Payment Direction Toggle */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            {t('customers.paymentDirection') || 'Payment Direction'}
                        </label>
                        <div className="flex gap-4">
                            <button
                                type="button"
                                onClick={() => setPaymentDirection('receive')}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${paymentDirection === 'receive'
                                        ? 'border-green-500 bg-green-50 text-green-700'
                                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                    }`}
                            >
                                <CheckCircle className="w-5 h-5" />
                                <span className="font-medium">{t('customers.theyPayUs') || 'They pay us'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setPaymentDirection('pay')}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${paymentDirection === 'pay'
                                        ? 'border-red-500 bg-red-50 text-red-700'
                                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                    }`}
                            >
                                <TrendingDown className="w-5 h-5" />
                                <span className="font-medium">{t('customers.wePayThem') || 'We pay them'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Direction Banner */}
                    <div className={`border rounded-lg p-4 ${paymentDirection === 'receive'
                            ? 'bg-green-50 border-green-200'
                            : 'bg-red-50 border-red-200'
                        }`}>
                        <div className="flex items-center">
                            {paymentDirection === 'receive' ? (
                                <>
                                    <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                                    <span className="text-green-800 font-medium">
                                        {t('customers.recordPaymentReceived') || `Recording payment received from ${entity.name}`}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <TrendingDown className="w-5 h-5 text-red-600 mr-2" />
                                    <span className="text-red-800 font-medium">
                                        {t('customers.recordPaymentSent') || `Recording payment sent to ${entity.name}`}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Entity Display - Read Only */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {entityType === 'customer' ? t('customers.customer') : t('customers.supplier')}
                            </label>
                            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
                                <UserCheck className="w-5 h-5 text-gray-500" />
                                <span className="font-medium text-gray-900">{entity.name}</span>
                                <span className="text-sm text-gray-500">
                                    ({entityType === 'customer' ? t('customers.customer') : t('customers.supplier')})
                                </span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('customers.paymentAmount')} *</label>
                            <input
                                type="number"
                                step="0.01"
                                value={paymentForm.amount}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    const numValue = parseFloat(value);
                                    const currentBalance = getLegacyBalance(
                                        entity as unknown as Record<string, unknown>,
                                        paymentForm.currency,
                                        'initial'
                                    );

                                    // Show overpayment warning if payment exceeds debt (only relevant when receiving)
                                    if (paymentDirection === 'receive' && !isNaN(numValue) && numValue > currentBalance && currentBalance > 0) {
                                        setOverpaymentWarning({
                                            show: true,
                                            amount: numValue - currentBalance,
                                            currency: paymentForm.currency
                                        });
                                    } else {
                                        setOverpaymentWarning(null);
                                    }

                                    setPaymentForm(prev => ({ ...prev, amount: value }));
                                }}
                                className={`w-full border border-gray-300 rounded-lg px-3 py-2 ${paymentDirection === 'receive'
                                        ? 'focus:ring-green-500 focus:border-green-500'
                                        : 'focus:ring-red-500 focus:border-red-500'
                                    }`}
                                required
                                placeholder="0.00"
                            />

                            {/* Quick pay suggestions */}
                            {(() => {
                                const suggestions = getSuggestedPayments(entity, paymentForm.currency);

                                if (suggestions.length === 0 || paymentDirection !== 'receive') return null;

                                const colorClass = 'border-green-500 text-green-700 bg-green-50 hover:bg-green-100';

                                return (
                                    <div className="mt-3">
                                        <p className="text-xs text-gray-600 mb-2">💡 {t('customers.quickPay') || 'Quick Pay Suggestions'}:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {suggestions.map((suggestion) => (
                                                <button
                                                    key={suggestion.percentage}
                                                    type="button"
                                                    onClick={() => {
                                                        const decimals = currencyService.getMeta(paymentForm.currency).decimals;
                                                        const formattedAmount = decimals > 0
                                                            ? suggestion.amount.toFixed(decimals)
                                                            : Math.round(suggestion.amount).toString();
                                                        setPaymentForm(prev => ({ ...prev, amount: formattedAmount }));
                                                        setOverpaymentWarning(null);
                                                    }}
                                                    className={`px-3 py-1.5 text-xs font-medium border-2 rounded-lg transition-colors ${colorClass}`}
                                                >
                                                    {suggestion.label} ({currencyService.format(suggestion.amount, paymentForm.currency)})
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Overpayment warning */}
                            {overpaymentWarning?.show && (
                                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <div className="flex items-start gap-2">
                                        <span className="text-lg">⚠️</span>
                                        <div className="flex-1">
                                            <p className="text-sm font-semibold text-yellow-800">
                                                {t('customers.overpaymentWarning') || 'Overpayment Alert'}
                                            </p>
                                            <p className="text-xs text-yellow-700 mt-1">
                                                {t('customers.overpaymentMessage') || 'This payment exceeds the current debt. They will have a credit of'} {' '}
                                                <span className="font-bold">
                                                    {currencyService.format(overpaymentWarning.amount, overpaymentWarning.currency as CurrencyCode)}
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {isMultiCurrency && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('customers.paymentCurrency')} *</label>
                                <select
                                    value={paymentForm.currency}
                                    onChange={(e) => setPaymentForm(prev => ({ ...prev, currency: e.target.value as CurrencyCode }))}
                                    className={`w-full border border-gray-300 rounded-lg px-3 py-2 ${paymentDirection === 'receive'
                                            ? 'focus:ring-green-500 focus:border-green-500'
                                            : 'focus:ring-red-500 focus:border-red-500'
                                        }`}
                                >
                                    {acceptedCurrencies.map(code => (
                                        <option key={code} value={code}>
                                            {t(`common.currency.${code}`) || code}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('customers.paymentDescription')} {t('common.labels.optional') || '(optional)'}
                        </label>
                        <input
                            type="text"
                            value={paymentForm.description}
                            onChange={(e) => setPaymentForm(prev => ({ ...prev, description: e.target.value }))}
                            className={`w-full border border-gray-300 rounded-lg px-3 py-2 ${paymentDirection === 'receive'
                                    ? 'focus:ring-green-500 focus:border-green-500'
                                    : 'focus:ring-red-500 focus:border-red-500'
                                }`}
                            placeholder={t('customers.paymentDescriptionPlaceholder') || 'Add a note...'}
                        />
                    </div>

                    <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            {t('common.labels.cancel') || 'Cancel'}
                        </button>
                        <button
                            type="submit"
                            className={`px-6 py-2 text-white rounded-lg transition-colors font-medium ${paymentDirection === 'receive'
                                    ? 'bg-green-600 hover:bg-green-700'
                                    : 'bg-red-600 hover:bg-red-700'
                                }`}
                        >
                            {t('customers.recordPayment') || 'Record Payment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UnifiedPaymentModal;
