import React from "react";
import { CheckCircle } from "lucide-react";
import SearchableSelect from "../../common/SearchableSelect";

interface ReceiveFormProps {
  receiveForm: any;
  setReceiveForm: React.Dispatch<React.SetStateAction<any>>;
  customers: any[];
  suppliers: any[];
  recentCustomers: any[];
  recentSuppliers: any[];
  setRecentCustomers: any;
  setRecentSuppliers: any;
  setShowAddCustomerForm: any;
  setShowAddSupplierForm: any;
  handleReceiveSubmit: (e: React.FormEvent) => void;
  showToast: (msg: string, type: "error" | "success") => void;
  currency: string;
  formatCurrencyWithSymbol: (amount: number, currency: string) => string;
  formatCurrency: (amount: number) => string;
  getConvertedAmount: (amount: number, currency: string) => number;
  onCancel: () => void;
}

export const ReceiveForm: React.FC<ReceiveFormProps> = ({
  receiveForm,
  setReceiveForm,
  customers,
  suppliers,
  recentCustomers,
  recentSuppliers,
  setRecentCustomers,
  setRecentSuppliers,
  setShowAddCustomerForm,
  setShowAddSupplierForm,
  handleReceiveSubmit,
  showToast,
  currency,
  formatCurrencyWithSymbol,
  formatCurrency,
  getConvertedAmount,
  onCancel
}) => {
  return (
    <form onSubmit={handleReceiveSubmit} className="space-y-6">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
        <div className="flex items-center">
          <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
          <span className="text-green-800 font-medium">
            Record a payment received from a customer or supplier
          </span>
        </div>
      </div>

      <div className="grid-cols-1 md:grid-cols-2 gap-6">
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Entity Type *</label>
            <div className="space-y-2 p-2">
            <label className="flex items-center space-x-1 cursor-pointer">
                <input
                type="radio"
                name="receiveEntityType"
                value="customer"
                checked={receiveForm.entityType === 'customer'}
                onChange={(e) => {
                    setReceiveForm((prev: any) => ({ 
                    ...prev, 
                    entityType: e.target.value as 'customer' | 'supplier',
                    entityId: '' // Reset entity selection when type changes
                    }));
                }}
                className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500"
                />
                <span className="text-sm text-gray-700">Customer</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
                <input
                type="radio"
                name="receiveEntityType"
                value="supplier"
                checked={receiveForm.entityType === 'supplier'}
                onChange={(e) => {
                    setReceiveForm((prev: any) => ({ 
                    ...prev, 
                    entityType: e.target.value as 'customer' | 'supplier',
                    entityId: '' // Reset entity selection when type changes
                    }));
                }}
                className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500"
                />
                <span className="text-sm text-gray-700">Supplier</span>
            </label>
            </div>
        </div>

        <div>
            <SearchableSelect
            options={
                receiveForm.entityType === 'customer' 
                ? customers.filter(c => c.is_active).map(customer => ({
                    id: customer.id,
                    label: customer.name,
                    value: customer.id,
                    category: 'Customer'
                    }))
                : suppliers.map(supplier => ({
                    id: supplier.id,
                    label: supplier.name,
                    value: supplier.id,
                    category: 'Supplier'
                    }))
            }
            value={receiveForm.entityId}
            onChange={(value) => setReceiveForm((prev: any) => ({ ...prev, entityId: value as string }))}
            placeholder={`Select ${receiveForm.entityType === 'customer' ? 'Customer' : 'Supplier'} *`}
            searchPlaceholder={`Search ${receiveForm.entityType === 'customer' ? 'customers' : 'suppliers'}...`}
            recentSelections={receiveForm.entityType === 'customer' ? recentCustomers : recentSuppliers}
            onRecentUpdate={receiveForm.entityType === 'customer' ? setRecentCustomers : setRecentSuppliers}
            showAddOption={true}
            addOptionText={`Add New ${receiveForm.entityType === 'customer' ? 'Customer' : 'Supplier'}`}
            onAddNew={() => receiveForm.entityType === 'customer' ? setShowAddCustomerForm(true) : setShowAddSupplierForm(true)}
            className="w-full"
            />
        </div>

        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Amount *</label>
            <input
            type="number"
            step="0.01"
            value={receiveForm.amount}
            onChange={(e) => {
                const value = e.target.value;
            
                setReceiveForm((prev: any) => ({ ...prev, amount: value }));
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
            required
            placeholder="0.00"
            />
        </div>

        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Currency *</label>
            <select
            value={receiveForm.currency}
            onChange={(e) => setReceiveForm((prev: any) => ({ ...prev, currency: e.target.value as 'USD' | 'LBP' }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
            >
            <option value="USD">USD ($)</option>
            <option value="LBP">LBP (ل.ل)</option>
            </select>
        </div>
        </div>

        <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Description (optional)</label>
        <input
            type="text"
            value={receiveForm.description}
            onChange={(e) => setReceiveForm((prev: any) => ({ ...prev, description: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
            placeholder="e.g., Payment for invoice #123, Cash payment, etc."
        />
        </div>

        {receiveForm.currency !== currency && receiveForm.amount && (
        <div className="text-sm text-gray-600 bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
            <span className="font-medium">Conversion:</span>
            <span className="font-semibold">
                {formatCurrencyWithSymbol(parseFloat(receiveForm.amount), receiveForm.currency)} 
                = {formatCurrency(getConvertedAmount(parseFloat(receiveForm.amount), receiveForm.currency))}
            </span>
            </div>
            <div className="text-xs text-gray-500 mt-1">Rate: 1 USD = 89,500 LBP</div>
        </div>
        )}

      {/* Cancel / Submit */}
      <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
        >
          Record Payment
        </button>
      </div>
    </form>
  );
};
