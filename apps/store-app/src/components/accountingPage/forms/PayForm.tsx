import React from "react";
import { TrendingDown } from "lucide-react";
import SearchableSelect from "../../common/SearchableSelect";

interface PayFormProps {
  payForm: any;
  setPayForm: React.Dispatch<React.SetStateAction<any>>;
  entities: any[]; // Unified entities array (customers, suppliers, employees)
  recentEntities: any[];
  setRecentEntities: any;
  setShowAddCustomerForm: any;
  setShowAddSupplierForm: any;
  handlePaySubmit: (e: React.FormEvent) => void;
  showToast: (msg: string, type: "error" | "success") => void;
  currency: string;
  formatCurrencyWithSymbol: (amount: number, currency: string) => string;
  formatCurrency: (amount: number) => string;
  getConvertedAmount: (amount: number, currency: string) => number;
  onCancel: () => void;
}

export const PayForm: React.FC<PayFormProps> = ({
  payForm,
  setPayForm,
  entities,
  recentEntities,
  setRecentEntities,
  setShowAddCustomerForm,
  setShowAddSupplierForm,
  handlePaySubmit,
  showToast,
  currency,
  formatCurrencyWithSymbol,
  formatCurrency,
  getConvertedAmount,
  onCancel
}) => {
  // Filter entities by type for the current selection
  const filteredEntities = entities.filter((entity) => {
    if (payForm.entityType === "customer") {
      return entity.entity_type === "customer" && (entity.is_active !== false);
    } else if (payForm.entityType === "supplier") {
      return entity.entity_type === "supplier" && !entity._deleted;
    }
    return false;
  });

  // Filter recent entities by type
  const filteredRecentEntities = recentEntities.filter((id: string) => {
    const entity = entities.find((e) => e.id === id);
    if (!entity) return false;
    if (payForm.entityType === "customer") {
      return entity.entity_type === "customer";
    } else if (payForm.entityType === "supplier") {
      return entity.entity_type === "supplier";
    }
    return false;
  });
  return (
    <form onSubmit={handlePaySubmit} className="space-y-6">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <div className="flex items-center">
          <TrendingDown className="w-5 h-5 text-red-600 mr-2" />
          <span className="text-red-800 font-medium">
            Record a payment sent to a customer or supplier
          </span>
        </div>
      </div>

      <div className="grid-cols-1 md:grid-cols-2 gap-6">
        {/* Entity Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Entity Type *
          </label>
          <div className="space-y-2 p-2">
            <label className="flex items-center space-x-1 cursor-pointer">
              <input
                type="radio"
                name="payEntityType"
                value="customer"
                checked={payForm.entityType === "customer"}
                onChange={(e) =>
                  setPayForm((prev: any) => ({
                    ...prev,
                    entityType: e.target.value as "customer" | "supplier",
                    entityId: ""
                  }))
                }
                className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500"
              />
              <span className="text-sm text-gray-700">Customer</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="payEntityType"
                value="supplier"
                checked={payForm.entityType === "supplier"}
                onChange={(e) =>
                  setPayForm((prev: any) => ({
                    ...prev,
                    entityType: e.target.value as "customer" | "supplier",
                    entityId: ""
                  }))
                }
                className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500"
              />
              <span className="text-sm text-gray-700">Supplier</span>
            </label>
          </div>
        </div>

        {/* Entity Selector */}
        <div>
          <SearchableSelect
            options={filteredEntities.map((entity) => ({
              id: entity.id,
              label: entity.name,
              value: entity.id,
              category: payForm.entityType === "customer" ? "Customer" : "Supplier"
            }))}
            value={payForm.entityId}
            onChange={(value) => {
              setPayForm((prev: any) => ({ ...prev, entityId: value as string }));
              // Update recent entities
              if (value && !filteredRecentEntities.includes(value)) {
                const updated = [value, ...filteredRecentEntities].slice(0, 10);
                // Merge with existing recent entities, keeping only the ones for current type
                const otherRecentEntities = recentEntities.filter((id: string) => {
                  const entity = entities.find((e) => e.id === id);
                  if (!entity) return false;
                  return entity.entity_type !== payForm.entityType;
                });
                setRecentEntities([...updated, ...otherRecentEntities]);
              }
            }}
            placeholder={`Select ${
              payForm.entityType === "customer" ? "Customer" : "Supplier"
            } *`}
            searchPlaceholder={`Search ${
              payForm.entityType === "customer" ? "customers" : "suppliers"
            }...`}
            recentSelections={filteredRecentEntities}
            onRecentUpdate={(updated) => {
              // Merge with entities of other types
              const otherRecentEntities = recentEntities.filter((id: string) => {
                const entity = entities.find((e) => e.id === id);
                if (!entity) return false;
                return entity.entity_type !== payForm.entityType;
              });
              setRecentEntities([...updated, ...otherRecentEntities]);
            }}
            showAddOption={true}
            addOptionText={`Add New ${
              payForm.entityType === "customer" ? "Customer" : "Supplier"
            }`}
            onAddNew={() =>
              payForm.entityType === "customer"
                ? setShowAddCustomerForm(true)
                : setShowAddSupplierForm(true)
            }
            className="w-full"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount *
          </label>
          <input
            type="number"
            step="0.01"
            value={payForm.amount}
            onChange={(e) => {
              const value = e.target.value;
              const numValue = parseFloat(value);
          
              setPayForm((prev: any) => ({ ...prev, amount: value }));
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500"
            required
            placeholder="0.00"
          />
       
        </div>

        {/* Currency */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Currency *
          </label>
          <select
            value={payForm.currency}
            onChange={(e) =>
              setPayForm((prev: any) => ({
                ...prev,
                currency: e.target.value as "USD" | "LBP"
              }))
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500"
          >
            <option value="USD">USD ($)</option>
            <option value="LBP">LBP (ل.ل)</option>
          </select>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Description (optional)
        </label>
        <input
          type="text"
          value={payForm.description}
          onChange={(e) =>
            setPayForm((prev: any) => ({ ...prev, description: e.target.value }))
          }
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500"
          placeholder="e.g., Payment for goods, Commission payment, etc."
        />
      </div>

      {/* Conversion */}
      {payForm.currency !== currency && payForm.amount && (
        <div className="text-sm text-gray-600 bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between">
            <span className="font-medium">Conversion:</span>
            <span className="font-semibold">
              {formatCurrencyWithSymbol(
                parseFloat(payForm.amount),
                payForm.currency
              )}{" "}
              = {formatCurrency(
                getConvertedAmount(parseFloat(payForm.amount), payForm.currency)
              )}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Rate: 1 USD = 89,500 LBP
          </div>
        </div>
      )}

      {/* Footer */}
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
          className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
        >
          Record Payment
        </button>
      </div>
    </form>
  );
};
