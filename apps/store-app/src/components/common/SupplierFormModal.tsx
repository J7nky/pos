import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { Supplier } from '../../types';
import { useI18n } from '../../i18n';
import { normalizeNameForComparison } from '../../utils/nameNormalization';


interface SupplierFormModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (supplier: Partial<Supplier>) => Promise<void>;
  editingSupplier?: Supplier | null;
  existingSuppliers?: Supplier[];
}

export default function SupplierFormModal({ 
  open, 
  onClose, 
  onSuccess, 
  editingSupplier = null,
  existingSuppliers = []
}: SupplierFormModalProps) {
  const { t } = useI18n();
  const [supplierForm, setSupplierForm] = useState<Partial<Supplier>>({
    name: '',
    phone: '',
    email: '',
    address: '',
    lb_balance: 0,
    usd_balance: 0,
    advance_lb_balance: 0,
    advance_usd_balance: 0,
  });
  const [supplierFormError, setSupplierFormError] = useState<string | null>(null);
  const [nameValidationError, setNameValidationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus first field when modal opens
  useEffect(() => {
    if (open && firstInputRef.current) firstInputRef.current.focus();
  }, [open]);

  // Keyboard support - Escape to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  // Reset form when modal opens/closes or editing supplier changes
  useEffect(() => {
    if (open) {
      if (editingSupplier) {
        setSupplierForm({
          name: editingSupplier.name,
          phone: editingSupplier.phone,
          email: editingSupplier.email || '',
          address: editingSupplier.address || '',
          lb_balance: 0,
          usd_balance: 0,
          advance_lb_balance: editingSupplier.advance_lb_balance || 0,
          advance_usd_balance: editingSupplier.advance_usd_balance || 0,
        });
      } else {
        setSupplierForm({
          name: '',
          phone: '',
          email: '',
          address: '',
          lb_balance: 0,
          usd_balance: 0,
          advance_lb_balance: 0,
          advance_usd_balance: 0,
        });
      }
      setSupplierFormError(null);
      setNameValidationError(null);
    }
  }, [open, editingSupplier]);

  const handleSupplierFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setSupplierForm(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) : value,
    }));
  };

  const handleSupplierFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!supplierForm.name || !supplierForm.phone) {
      setSupplierFormError('Name and Phone are required.');
      return;
    }

    // Check for duplicate supplier name (with Arabic normalization)
    const normalizedInput = normalizeNameForComparison(supplierForm.name!);
    const exists = existingSuppliers.some(s => {
      const normalizedExisting = normalizeNameForComparison(s.name);
      return normalizedInput === normalizedExisting && (!editingSupplier || s.id !== editingSupplier.id);
    });
    
    if (exists) {
      const errorMsg = t('customers.duplicateSupplierNameError') || 'A supplier with this name already exists.';
      setSupplierFormError(errorMsg);
      setNameValidationError(errorMsg);
      return;
    }

    setSupplierFormError(null);
    setLoading(true);

    try {
      await onSuccess({
        name: supplierForm.name!,
        phone: supplierForm.phone!,
        email: supplierForm.email || '',
        address: supplierForm.address || '',
        lb_balance: editingSupplier ? 0 : (supplierForm.lb_balance || 0),
        usd_balance: editingSupplier ? 0 : (supplierForm.usd_balance || 0),
        advance_lb_balance: supplierForm.advance_lb_balance || 0,
        advance_usd_balance: supplierForm.advance_usd_balance || 0,
      });
      onClose();
    } catch (error) {
      setSupplierFormError('Failed to save supplier. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              {editingSupplier ? t('customers.editSupplier') : t('customers.addSupplier')}
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSupplierFormSubmit} className="p-6 space-y-4">
          {/* Hidden input for auto-focus */}
          <input
            ref={firstInputRef}
            style={{ position: 'absolute', left: '-9999px', width: 0, height: 0, opacity: 0 }}
            tabIndex={-1}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="supplier-name" className="block text-sm font-medium text-gray-700">{t('customers.nameLabel')}</label>
              <input
                type="text"
                id="supplier-name"
                name="name"
                value={supplierForm.name}
                onChange={handleSupplierFormChange}
                className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 ${
                  nameValidationError 
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                    : 'border-gray-300 focus:border-blue-500'
                }`}
                required
              />
              {nameValidationError && (
                <p className="mt-1 text-sm text-red-600">{nameValidationError}</p>
              )}
            </div>
            
            <div>
              <label htmlFor="supplier-phone" className="block text-sm font-medium text-gray-700">{t('customers.phoneLabel')}</label>
              <input
                type="text"
                id="supplier-phone"
                name="phone"
                value={supplierForm.phone}
                onChange={handleSupplierFormChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            
            <div>
              <label htmlFor="supplier-email" className="block text-sm font-medium text-gray-700">{t('customers.emailLabel')}</label>
              <input
                type="email"
                id="supplier-email"
                name="email"
                value={supplierForm.email || ''}
                onChange={handleSupplierFormChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label htmlFor="supplier-address" className="block text-sm font-medium text-gray-700">{t('customers.addressLabel')}</label>
              <input
                type="text"
                id="supplier-address"
                name="address"
                value={supplierForm.address}
                onChange={handleSupplierFormChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Balance Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
            <h3 className="md:col-span-2 text-lg font-semibold text-gray-900">{t('customers.balanceSettings')}</h3>
            
            {/* Initial Balance Fields - Only show when adding new supplier */}
            {!editingSupplier && (
              <>
                <div>
                  <label htmlFor="lb_balance" className="block text-sm font-medium text-gray-700">{t('customers.initialLBPBalance')}</label>
                  <input
                    type="number"
                    id="lb_balance"
                    name="lb_balance"
                    value={supplierForm.lb_balance || 0}
                    onChange={handleSupplierFormChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    step="0.01"
                    min="0"
                  />
                </div>
                
                <div>
                  <label htmlFor="usd_balance" className="block text-sm font-medium text-gray-700">{t('customers.initialUSDBalance')}</label>
                  <input
                    type="number"
                    id="usd_balance"
                    name="usd_balance"
                    value={supplierForm.usd_balance || 0}
                    onChange={handleSupplierFormChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    step="0.01"
                    min="0"
                  />
                </div>
              </>
            )}

            {/* Advance Payment Section - Optional for new suppliers */}
            <div className="md:col-span-2 pt-4 mt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">{t('customers.initialAdvancePaymentOptional')}</h3>
              <p className="text-xs text-gray-500 mb-3">{t('customers.youCanAlsoManageAdvancesLaterFromTheSupplierAdvancesTabInAccounting')}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="advance-usd" className="block text-sm font-medium text-gray-700">{t('customers.advanceUSD')}</label>
                  <input
                    type="number"
                    id="advance-usd"
                    name="advance_usd_balance"
                    min="0"
                    step="0.01"
                    value={supplierForm.advance_usd_balance || 0}
                    onChange={handleSupplierFormChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.00"
                  />
                </div>
                
                <div>
                  <label htmlFor="advance-lbp" className="block text-sm font-medium text-gray-700">{t('customers.advanceLBP')}</label>
                  <input
                    type="number"
                    id="advance-lbp"
                    name="advance_lb_balance"
                    min="0"
                    step="1"
                    value={supplierForm.advance_lb_balance || 0}
                    onChange={handleSupplierFormChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          </div>
          
          {supplierFormError && (
            <div className="text-red-600 text-sm font-medium pt-2">{supplierFormError}</div>
          )}
          
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {t('customers.cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? t('customers.saving') : (editingSupplier ? t('customers.saveChanges') : t('customers.addSupplier'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
