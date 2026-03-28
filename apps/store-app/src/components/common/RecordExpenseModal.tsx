import React, { useState, useEffect } from 'react';
import { X, Receipt, AlertCircle } from 'lucide-react';
import { useOfflineData } from '../../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { useI18n } from '../../i18n';
import { useCurrency } from '../../hooks/useCurrency';
import SearchableSelect from './SearchableSelect';

interface RecordExpenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function RecordExpenseModal({ isOpen, onClose, onSuccess }: RecordExpenseModalProps) {
    const { t } = useI18n();
    const raw = useOfflineData();
    const { userProfile } = useSupabaseAuth();
    const { formatCurrencyWithSymbol } = useCurrency();

    const expenseCategories = raw.expenseCategories || [];
    const currency = raw.currency || 'LBP';
    const exchangeRate = raw.exchangeRate || 89500;

    const [expenseForm, setExpenseForm] = useState({
        categoryId: '',
        amount: '',
        currency: currency as 'USD' | 'LBP',
        description: ''
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [recentCategories, setRecentCategories] = useState<any[]>([]);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setExpenseForm({
                categoryId: '',
                amount: '',
                currency: currency as 'USD' | 'LBP',
                description: ''
            });
            setError(null);
        }
    }, [isOpen, currency]);

    const generateExpenseReference = () => {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `EXP-${timestamp}-${random}`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validate
        if (!expenseForm.categoryId) {
            setError(t('accounting.pleaseSelectCategory') || 'Please select a category');
            return;
        }

        if (!expenseForm.amount || parseFloat(expenseForm.amount) <= 0) {
            setError(t('accounting.pleaseEnterValidAmount') || 'Please enter a valid amount');
            return;
        }

        if (!expenseForm.description.trim()) {
            setError(t('accounting.pleaseEnterDescription') || 'Please enter a description');
            return;
        }

        const category = expenseCategories.find(c => c.id === expenseForm.categoryId);
        if (!category) {
            setError('Category not found');
            return;
        }

        setIsSubmitting(true);

        try {
            const result = await raw.processCashDrawerTransaction({
                type: 'expense',
                amount: parseFloat(expenseForm.amount),
                currency: expenseForm.currency,
                description: `Expense: ${category.name} - ${expenseForm.description}`,
                reference: generateExpenseReference(),
                storeId: userProfile?.store_id || '',
                createdBy: userProfile?.id || ''
            });

            if (!result.success) {
                setError(result.error || 'Failed to record expense');
                return;
            }

            // Refresh data
            await raw.refreshData();

            // Call success callback
            onSuccess?.();
            onClose();
        } catch (err) {
            console.error('Error recording expense:', err);
            setError(t('accounting.failedToRecordExpense') || 'Failed to record expense');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Helper to convert amount for display
    const getConvertedAmount = (amount: number, fromCurrency: string): number => {
        if (fromCurrency === currency) return amount;
        if (fromCurrency === 'USD' && currency === 'LBP') return amount * exchangeRate;
        if (fromCurrency === 'LBP' && currency === 'USD') return amount / exchangeRate;
        return amount;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-amber-600" />
                        <h2 className="text-lg font-semibold text-gray-900">
                            {t('home.recordExpense') || 'Record Expense'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Error Message */}
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    {/* Category */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('accounting.category') || 'Category'} *
                        </label>
                        <SearchableSelect
                            options={expenseCategories
                                .filter(c => c.is_active)
                                .map(category => ({
                                    id: category.id,
                                    label: category.name,
                                    value: category.id,
                                    category: 'Expense Category'
                                }))}
                            value={expenseForm.categoryId}
                            onChange={(value) =>
                                setExpenseForm(prev => ({ ...prev, categoryId: value as string }))
                            }
                            placeholder={t('accounting.selectCategory') || 'Select Category *'}
                            searchPlaceholder={t('common.search') || 'Search...'}
                            recentSelections={recentCategories}
                            onRecentUpdate={setRecentCategories}
                            className="w-full"
                        />
                    </div>

                    {/* Currency */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('common.currency') || 'Currency'} *
                        </label>
                        <select
                            value={expenseForm.currency}
                            onChange={(e) =>
                                setExpenseForm(prev => ({
                                    ...prev,
                                    currency: e.target.value as 'USD' | 'LBP'
                                }))
                            }
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-amber-500 focus:border-amber-500"
                        >
                            <option value="USD">USD ($)</option>
                            <option value="LBP">LBP (ل.ل)</option>
                        </select>
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('common.amount') || 'Amount'} *
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={expenseForm.amount}
                            onChange={(e) =>
                                setExpenseForm(prev => ({ ...prev, amount: e.target.value }))
                            }
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-amber-500 focus:border-amber-500"
                            placeholder={`Enter amount in ${expenseForm.currency}`}
                            required
                        />
                    </div>

                    {/* Conversion */}
                    {expenseForm.currency !== currency && expenseForm.amount && (
                        <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
                            <strong>{t('common.conversion') || 'Conversion'}:</strong>{' '}
                            {formatCurrencyWithSymbol(
                                parseFloat(expenseForm.amount),
                                expenseForm.currency
                            )}{' '}
                            ={' '}
                            {formatCurrencyWithSymbol(
                                getConvertedAmount(
                                    parseFloat(expenseForm.amount),
                                    expenseForm.currency
                                ),
                                currency
                            )}
                            <div className="text-xs text-gray-500 mt-1">
                                {t('common.rate') || 'Rate'}: 1 USD = {exchangeRate.toLocaleString()} LBP
                            </div>
                        </div>
                    )}

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('common.description') || 'Description'} *
                        </label>
                        <input
                            type="text"
                            value={expenseForm.description}
                            onChange={(e) =>
                                setExpenseForm(prev => ({ ...prev, description: e.target.value }))
                            }
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-amber-500 focus:border-amber-500"
                            placeholder={t('accounting.expenseDescriptionPlaceholder') || 'e.g., Office supplies, Utilities...'}
                            required
                        />
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end space-x-3 pt-4 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            disabled={isSubmitting}
                        >
                            {t('common.cancel') || 'Cancel'}
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                                    {t('common.saving') || 'Saving...'}
                                </>
                            ) : (
                                <>
                                    <Receipt className="w-4 h-4" />
                                    {t('accounting.addExpense') || 'Add Expense'}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
