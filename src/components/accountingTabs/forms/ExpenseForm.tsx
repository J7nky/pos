import React from "react";
import SearchableSelect from "../../common/SearchableSelect";

interface ExpenseFormProps {
  expenseForm: any;
  setExpenseForm: React.Dispatch<React.SetStateAction<any>>;
  expenseCategories: any[];
  recentCategories: any[];
  setRecentCategories: any;
  setShowAddCategoryForm: any;
  handleExpenseSubmit: (e: React.FormEvent) => void;
  showToast: (msg: string, type: "error" | "success") => void;
  currency: string;
  formatCurrencyWithSymbol: (amount: number, currency: string) => string;
  formatCurrency: (amount: number) => string;
  getConvertedAmount: (amount: number, currency: string) => number;
  onCancel: () => void;
}

export const ExpenseForm: React.FC<ExpenseFormProps> = ({
  expenseForm,
  setExpenseForm,
  expenseCategories,
  recentCategories,
  setRecentCategories,
  setShowAddCategoryForm,
  handleExpenseSubmit,
  showToast,
  currency,
  formatCurrencyWithSymbol,
  formatCurrency,
  getConvertedAmount,
  onCancel
}) => {
  return (
    <form onSubmit={handleExpenseSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Category *
          </label>
          <SearchableSelect
            options={expenseCategories
              .filter((c) => c.is_active)
              .map((category) => ({
                id: category.id,
                label: category.name,
                value: category.id,
                category: "Expense Category"
              }))}
            value={expenseForm.categoryId}
            onChange={(value) =>
              setExpenseForm((prev: any) => ({ ...prev, categoryId: value as string }))
            }
            placeholder="Select Category *"
            searchPlaceholder="Search categories..."
            recentSelections={recentCategories}
            onRecentUpdate={setRecentCategories}
            showAddOption={true}
            addOptionText="Add New Category"
            onAddNew={() => setShowAddCategoryForm(true)}
            className="w-full"
          />
        </div>

        {/* Currency */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Currency *
          </label>
          <select
            value={expenseForm.currency}
            onChange={(e) =>
              setExpenseForm((prev: any) => ({
                ...prev,
                currency: e.target.value as "USD" | "LBP"
              }))
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="USD">USD ($)</option>
            <option value="LBP">LBP (ل.ل)</option>
          </select>
        </div>
      </div>

      {/* Amount */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Amount *
        </label>
        <input
          type="number"
          step="0.01"
          max="99999999.99"
          value={expenseForm.amount}
          onChange={(e) => {
            const value = e.target.value;
            const numValue = parseFloat(value);
            if (numValue > 99999999.99) {
              showToast(
                "Amount exceeds maximum allowed value (99,999,999.99)",
                "error"
              );
              return;
            }
            setExpenseForm((prev: any) => ({ ...prev, amount: value }));
          }}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          required
          placeholder={`Enter amount in ${expenseForm.currency}`}
        />
        <p className="text-xs text-gray-500 mt-1">Maximum: 99,999,999.99</p>
      </div>

      {/* Conversion */}
      {expenseForm.currency !== currency && expenseForm.amount && (
        <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
          <strong>Conversion:</strong>{" "}
          {formatCurrencyWithSymbol(
            parseFloat(expenseForm.amount),
            expenseForm.currency
          )}{" "}
          ={" "}
          {formatCurrency(
            getConvertedAmount(
              parseFloat(expenseForm.amount),
              expenseForm.currency
            )
          )}
          <div className="text-xs text-gray-500 mt-1">
            Rate: 1 USD = 89,500 LBP
          </div>
        </div>
      )}

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Description *
        </label>
        <input
          type="text"
          value={expenseForm.description}
          onChange={(e) =>
            setExpenseForm((prev: any) => ({ ...prev, description: e.target.value }))
          }
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          required
        />
      </div>

      {/* Footer */}
      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
        >
          Add Expense
        </button>
      </div>
    </form>
  );
};
