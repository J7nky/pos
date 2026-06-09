import React from 'react';
import { CheckCircle, TrendingDown, UserCheck } from 'lucide-react';
import { Customer, Supplier } from '../../types';
import { useI18n } from '../../i18n';
import { useOfflineData } from '../../contexts/OfflineDataContext';
import { currencyService } from '../../services/currencyService';
import { getLegacyBalance } from '../../utils/currencyFieldMap';
import SearchableSelect from './SearchableSelect';
import type { CurrencyCode } from '@pos-platform/shared';

// The form shape the modal reads from. `reference` is only surfaced in edit mode
// but is kept optional so the create flow (which doesn't render it) is unaffected.
interface PaymentFormShape {
    amount: string;
    currency: CurrencyCode;
    description: string;
    reference?: string;
}

interface UnifiedPaymentModalProps {
    // `entity` is only consumed by the create flow (title, balance suggestions,
    // overpayment check). In edit mode the entity is chosen via a selector, so it
    // is optional.
    entity?: Customer | Supplier;
    entityType: 'customer' | 'supplier' | 'employee';
    paymentForm: PaymentFormShape;
    setPaymentForm: React.Dispatch<React.SetStateAction<{
        amount: string;
        currency: CurrencyCode;
        description: string;
        reference: string;
    }>>;
    onSubmit: (e: React.FormEvent) => void;
    onClose: () => void;

    // --- Create-flow props (unused/omitted in edit mode) ---
    paymentDirection?: 'receive' | 'pay';
    setPaymentDirection?: (direction: 'receive' | 'pay') => void;
    overpaymentWarning?: { show: boolean; amount: number; currency: string } | null;
    setOverpaymentWarning?: React.Dispatch<React.SetStateAction<{ show: boolean; amount: number; currency: string } | null>>;
    getSuggestedPayments?: (entity: Customer | Supplier | undefined, currency: CurrencyCode) => Array<{ percentage: number; amount: number; label: string }>;

    // --- Edit-mode props ---
    // When `isEditing` is true the modal becomes a payment-correction form: the
    // direction toggle / quick-pay / overpayment affordances are hidden, the
    // entity becomes a selector, and a reference field is shown.
    isEditing?: boolean;
    editEntityOptions?: Array<{ id: string; label: string; value: string }>;
    selectedEntityId?: string;
    onEntityChange?: (id: string) => void;
    originalEntityId?: string;
    // When true, the direction toggle stays visible in edit mode so a correction
    // can flip a payment ⇆ refund. `originalDirection` drives the "direction
    // changed" note.
    allowDirectionEdit?: boolean;
    originalDirection?: 'receive' | 'pay';
}

export const UnifiedPaymentModal: React.FC<UnifiedPaymentModalProps> = ({
    entity,
    entityType,
    paymentDirection = 'receive',
    setPaymentDirection,
    paymentForm,
    setPaymentForm,
    overpaymentWarning,
    setOverpaymentWarning,
    getSuggestedPayments,
    onSubmit,
    onClose,
    isEditing = false,
    editEntityOptions = [],
    selectedEntityId = '',
    onEntityChange,
    originalEntityId = '',
    allowDirectionEdit = false,
    originalDirection,
}) => {
    const { t } = useI18n();
    const { acceptedCurrencies, isMultiCurrency } = useOfflineData();

    // Focus-ring colour: create flow tints by direction (green=receive, red=pay);
    // edit/correction is neutral blue to match the rest of the editing surfaces.
    const inputRing = isEditing
        ? 'focus:ring-blue-500 focus:border-blue-500'
        : paymentDirection === 'receive'
            ? 'focus:ring-green-500 focus:border-green-500'
            : 'focus:ring-red-500 focus:border-red-500';

    const entityTypeLabel = entityType === 'customer'
        ? t('customers.customer')
        : entityType === 'supplier'
            ? t('customers.supplier')
            : (t('customers.employee') || 'Employee');

    return (
        <div className="animate-modal-fade fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="animate-modal-pop bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b">
                    <h2 className="text-xl font-semibold text-gray-900">
                        {isEditing
                            ? (t('payments.editPayment') || 'Edit Payment')
                            : `${t('customers.recordPaymentFor') || 'Record Payment for'} ${entity?.name ?? ''}`}
                    </h2>
                </div>
                <form onSubmit={onSubmit} className="p-6 space-y-6">
                    {/* Payment Direction Toggle. Shown in the create flow, and in edit
                        mode when the caller allows flipping a payment ⇆ refund. */}
                    {(!isEditing || allowDirectionEdit) && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <label className="block text-sm font-medium text-gray-700 mb-3">
                                {t('customers.paymentDirection') || 'Payment Direction'}
                            </label>
                            <div className="flex gap-4">
                                <button
                                    type="button"
                                    onClick={() => setPaymentDirection?.('receive')}
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
                                    onClick={() => setPaymentDirection?.('pay')}
                                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${paymentDirection === 'pay'
                                            ? 'border-red-500 bg-red-50 text-red-700'
                                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                        }`}
                                >
                                    <TrendingDown className="w-5 h-5" />
                                    <span className="font-medium">{t('customers.wePayThem') || 'We pay them'}</span>
                                </button>
                            </div>
                            {isEditing && originalDirection && paymentDirection !== originalDirection && (
                                <p className="text-xs text-amber-600 mt-3">
                                    {t('payments.changingDirectionNote') || 'Changing the direction reverses the original payment and re-posts the correction as the opposite type (payment ⇆ refund).'}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Direction Banner (create flow only) */}
                    {!isEditing && (
                        <div className={`border rounded-lg p-4 ${paymentDirection === 'receive'
                                ? 'bg-green-50 border-green-200'
                                : 'bg-red-50 border-red-200'
                            }`}>
                            <div className="flex items-center">
                                {paymentDirection === 'receive' ? (
                                    <>
                                        <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                                        <span className="text-green-800 font-medium">
                                            {t('customers.recordPaymentReceived') || `Recording payment received from ${entity?.name ?? ''}`}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <TrendingDown className="w-5 h-5 text-red-600 mr-2" />
                                        <span className="text-red-800 font-medium">
                                            {t('customers.recordPaymentSent') || `Recording payment sent to ${entity?.name ?? ''}`}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Entity — selector in edit mode, read-only chip in create mode */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {isEditing
                                    ? <>{t('payments.entity') || 'Entity'} <span className="text-xs font-normal text-gray-400 capitalize">({entityType})</span> *</>
                                    : entityTypeLabel}
                            </label>
                            {isEditing ? (
                                <>
                                    <SearchableSelect
                                        options={editEntityOptions}
                                        value={selectedEntityId}
                                        onChange={(val) => onEntityChange?.(val as string)}
                                        placeholder={t('payments.selectEntity') || 'Select entity...'}
                                        searchPlaceholder={t('dashboard.search') || 'Search...'}
                                        portal
                                    />
                                    {selectedEntityId !== originalEntityId && (
                                        <p className="text-xs text-amber-600 mt-1">
                                            {t('payments.changingEntityNote') || 'Changing the entity reverses the original on the previous entity and posts the correction to the selected one.'}
                                        </p>
                                    )}
                                </>
                            ) : (
                                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
                                    <UserCheck className="w-5 h-5 text-gray-500" />
                                    <span className="font-medium text-gray-900">{entity?.name}</span>
                                    <span className="text-sm text-gray-500">
                                        ({entityTypeLabel})
                                    </span>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('customers.paymentAmount')} *</label>
                            <input
                                type="number"
                                step="0.01"
                                value={paymentForm.amount}
                                onChange={(e) => {
                                    const value = e.target.value;

                                    // Overpayment hint only applies to the create flow (receiving
                                    // against an outstanding debt). Corrections skip it.
                                    if (!isEditing && setOverpaymentWarning) {
                                        const numValue = parseFloat(value);
                                        const currentBalance = entity
                                            ? getLegacyBalance(
                                                entity as unknown as Record<string, unknown>,
                                                paymentForm.currency,
                                                'initial'
                                            )
                                            : 0;

                                        if (paymentDirection === 'receive' && !isNaN(numValue) && numValue > currentBalance && currentBalance > 0) {
                                            setOverpaymentWarning({
                                                show: true,
                                                amount: numValue - currentBalance,
                                                currency: paymentForm.currency
                                            });
                                        } else {
                                            setOverpaymentWarning(null);
                                        }
                                    }

                                    setPaymentForm(prev => ({ ...prev, amount: value }));
                                }}
                                className={`w-full border border-gray-300 rounded-lg px-3 py-2 ${inputRing}`}
                                required
                                placeholder="0.00"
                            />

                            {/* Quick pay suggestions (create flow only) */}
                            {!isEditing && (() => {
                                const suggestions = getSuggestedPayments?.(entity, paymentForm.currency) ?? [];

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
                                                        setOverpaymentWarning?.(null);
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

                            {/* Overpayment warning (create flow only) */}
                            {!isEditing && overpaymentWarning?.show && (
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

                        {/* Currency — always shown in edit mode (unioned with the payment's
                            own currency so a no-longer-accepted value still renders);
                            create flow shows it only for multi-currency stores. */}
                        {(isEditing || isMultiCurrency) && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {isEditing ? (t('dashboard.currency') || 'Currency') : t('customers.paymentCurrency')} *
                                </label>
                                <select
                                    value={paymentForm.currency}
                                    onChange={(e) => setPaymentForm(prev => ({ ...prev, currency: e.target.value as CurrencyCode }))}
                                    className={`w-full border border-gray-300 rounded-lg px-3 py-2 ${inputRing}`}
                                >
                                    {(isEditing
                                        ? Array.from(new Set([paymentForm.currency, ...acceptedCurrencies]))
                                        : acceptedCurrencies
                                    ).map(code => (
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
                            className={`w-full border border-gray-300 rounded-lg px-3 py-2 ${inputRing}`}
                            placeholder={t('customers.paymentDescriptionPlaceholder') || 'Add a note...'}
                        />
                    </div>

                    {/* Reference (edit/correction only) — shown for context but
                        read-only: the reference is system-assigned and must not be
                        rewritten during a correction. */}
                    {isEditing && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {t('payments.reference') || 'Reference'}
                            </label>
                            <input
                                type="text"
                                value={paymentForm.reference || ''}
                                readOnly
                                tabIndex={-1}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-50 text-gray-500 cursor-not-allowed"
                            />
                        </div>
                    )}

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
                            className={`px-6 py-2 text-white rounded-lg transition-colors font-medium ${isEditing
                                    ? 'bg-blue-600 hover:bg-blue-700'
                                    : paymentDirection === 'receive'
                                        ? 'bg-green-600 hover:bg-green-700'
                                        : 'bg-red-600 hover:bg-red-700'
                                }`}
                        >
                            {isEditing
                                ? (t('dashboard.save') || 'Save')
                                : (t('customers.recordPayment') || 'Record Payment')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UnifiedPaymentModal;
