import React, { useState } from "react";

type Customer = {
  id: string | number;
  name: string;
};

type Supplier = {
  id: string | number;
  name: string;
};

export type NonPricedItem = {
  customerId: string | number;
  productName: string;
  supplierId?: string | number;
  quantity?: number;
  weight?: number;
  unitPrice?: number;
  status?: string;
};

interface EditNonPricedModalProps {
  isOpen: boolean;
  customers: Customer[];
  suppliers: Supplier[];
  initialData: NonPricedItem;
  onClose: () => void;
  onSave: (data: NonPricedItem) => void;
}

const EditNonPricedModal: React.FC<EditNonPricedModalProps> = ({
  isOpen,
  customers,
  suppliers,
  initialData,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState<NonPricedItem>(initialData);

  if (!isOpen) return null;

  const handleChange = (field: keyof NonPricedItem, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const totalValue =
    formData.unitPrice && (formData.quantity || formData.weight)
      ? formData.unitPrice * (formData.weight || formData.quantity || 0)
      : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Edit Non-Priced Item</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Customer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer
              </label>
              <select
                value={formData.customerId}
                onChange={(e) => handleChange("customerId", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Product Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Product Name
              </label>
              <input
                type="text"
                value={formData.productName}
                onChange={(e) => handleChange("productName", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Supplier */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Supplier
              </label>
              <select
                value={formData.supplierId || ""}
                onChange={(e) => handleChange("supplierId", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select supplier...</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                value={formData.quantity || ""}
                onChange={(e) =>
                  handleChange("quantity", parseInt(e.target.value) || 0)
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Weight */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Weight (kg)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.weight || ""}
                onChange={(e) =>
                  handleChange("weight", parseFloat(e.target.value) || 0)
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Unit Price */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unit Price ($)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.unitPrice || ""}
                onChange={(e) =>
                  handleChange("unitPrice", parseFloat(e.target.value) || 0)
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={formData.status || ""}
              onChange={(e) => handleChange("status", e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Add any status or comments..."
            />
          </div>

          {/* Total Value */}
          {totalValue > 0 && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-800">Total Value</p>
              <p className="text-2xl font-bold text-green-900">
                ${totalValue.toFixed(2)}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(formData)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditNonPricedModal;
