import React, { useState } from "react";
import { DollarSign, CreditCard, Clock, User, CheckCircle } from "lucide-react";
import SearchableSelect from "../../common/SearchableSelect";

type EditSaleFormProps = {
  originalSale: any;
  sale: any;
  customers: { id: string; name: string }[];
  formatCurrency: (value: number) => string;
  onSave: (updatedSale: any) => void;
  onCancel: () => void;
};

export default function EditSaleForm({
  originalSale,
  sale,
  customers,
  formatCurrency,
  onSave,
  onCancel,
}: EditSaleFormProps) {
  console.log('EditSaleForm props:', { originalSale, sale, customers: customers?.length });
  
  // Safety check for undefined originalSale
  if (!originalSale || !sale) {
    console.log('EditSaleForm: originalSale or sale is undefined', { originalSale, sale });
    return (
      <div className="p-4 text-center text-gray-500">
        <p>Loading sale data...</p>
      </div>
    );
  }

  const [formData, setFormData] = useState({
    quantity: sale.quantity || 1,
    weight: sale.weight || "",
    unitPrice: sale.unit_price || 0,
    receivedValue: sale.received_value || 0,
    paymentMethod: sale.payment_method || "cash",
    customerId: sale.customer_id || "",
    status: sale.notes || "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Store original values for comparison
  const originalValues = {
    quantity: sale.quantity || 1,
    weight: sale.weight || "",
    unitPrice: sale.unit_price || 0,
    receivedValue: sale.received_value || 0,
    paymentMethod: sale.payment_method || "cash",
    customerId: sale.customer_id || "",
    status: sale.notes || "",
  };

  // Check if there are any changes
  const hasChanges = () => {
    return (
      formData.quantity !== originalValues.quantity ||
      formData.weight !== originalValues.weight ||
      formData.unitPrice !== originalValues.unitPrice ||
      formData.receivedValue !== originalValues.receivedValue ||
      formData.paymentMethod !== originalValues.paymentMethod ||
      formData.customerId !== originalValues.customerId ||
      formData.status !== originalValues.status
    );
  };

  // Derived values
  const totalValue = formData.quantity * formData.unitPrice;
  const isPartialPayment = formData.receivedValue < totalValue;
  const isCredit = formData.paymentMethod === "credit";
  const requiresCustomer = originalSale?.customer_id !== null && originalSale?.customer_id !== undefined;

  const selectedCustomer = customers.find((c) => c.id === formData.customerId);
  const customerName = selectedCustomer?.name || "";

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (formData.quantity <= 0) {
      newErrors.quantity = "Quantity must be greater than 0";
    }
    if (formData.unitPrice <= 0) {
      newErrors.unitPrice = "Unit price must be greater than 0";
    }
    if (formData.receivedValue < 0) {
      newErrors.receivedValue = "Received value cannot be negative";
    }
    if (requiresCustomer && !formData.customerId) {
      newErrors.customerId =
        "Customer is required for credit sales or partial payments";
    }
    // Also require customer for credit payments
    if (formData.paymentMethod === "credit" && !formData.customerId) {
      newErrors.customerId = "Customer is required for credit payments";
    }
    if (
      formData.paymentMethod !== "credit" &&
      formData.receivedValue > totalValue
    ) {
      newErrors.receivedValue =
        "Received value cannot exceed total value for non-credit transactions";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSave({
        ...formData,
        weight: formData.weight
          ? parseFloat(formData.weight.toString())
          : null,
        receivedValue: formData.receivedValue,
        notes: formData.status, // Map status to notes field
      });
    }
  };

  const handlePaymentMethodChange = (method: string) => {
    setFormData((prev) => ({
      ...prev,
      paymentMethod: method,
      receivedValue:
        method === "credit" ? 0 : prev.receivedValue || totalValue,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Form Header with Changes Indicator */}
      {hasChanges() && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-center">
            <div className="w-2 h-2 bg-amber-500 rounded-full mr-2"></div>
            <span className="text-sm text-amber-800 font-medium">
              You have unsaved changes
            </span>
          </div>
        </div>
      )}

      {/* Product Details */}
      <section className="space-y-4">
        <h4 className="text-md font-medium text-gray-800 border-b border-gray-200 pb-2">
          Product Details
        </h4>

        <div className="grid grid-cols-2 gap-4">
          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantity <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={formData.quantity}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  quantity: parseFloat(e.target.value) || 0,
                })
              }
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                errors.quantity ? "border-red-500 bg-red-50" : "border-gray-300"
              }`}
              required
            />
            {errors.quantity && (
              <p className="text-red-500 text-xs mt-1">{errors.quantity}</p>
            )}
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
              value={formData.weight}
              onChange={(e) =>
                setFormData({ ...formData, weight: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="Optional"
            />
          </div>
        </div>

        {/* Unit Price */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Unit Price <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.unitPrice}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  unitPrice: parseFloat(e.target.value) || 0,
                })
              }
              className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                errors.unitPrice ? "border-red-500 bg-red-50" : "border-gray-300"
              }`}
              required
            />
          </div>
          {errors.unitPrice && (
            <p className="text-red-500 text-xs mt-1">{errors.unitPrice}</p>
          )}
        </div>
      </section>

      {/* Payment Details */}
      <section className="space-y-4">
        <h4 className="text-md font-medium text-gray-800 border-b border-gray-200 pb-2">
          Payment Details
        </h4>

        {/* Payment Method */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Payment Method <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: "cash", label: "Cash", icon: DollarSign },
              { value: "card", label: "Card", icon: CreditCard },
              { value: "credit", label: "Credit", icon: Clock },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => handlePaymentMethodChange(value)}
                className={`p-3 rounded-lg border-2 transition-all ${
                  formData.paymentMethod === value
                    ? value === "cash"
                      ? "border-green-500 bg-green-50 text-green-700"
                      : value === "card"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-amber-500 bg-amber-50 text-amber-700"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <Icon className="w-5 h-5 mx-auto mb-1" />
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Received Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Received Amount <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.receivedValue}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  receivedValue: parseFloat(e.target.value) || 0,
                })
              }
              className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                errors.receivedValue
                  ? "border-red-500 bg-red-50"
                  : "border-gray-300"
              }`}
              placeholder="Amount received"
            />
          </div>
          {errors.receivedValue && (
            <p className="text-red-500 text-xs mt-1">{errors.receivedValue}</p>
          )}
        </div>

        {/* Customer Section */}
        <div
          className={`p-4 rounded-lg border-2 ${
            formData.customerId
              ? "border-green-200 bg-green-50"
              : requiresCustomer
              ? "border-amber-200 bg-amber-50"
              : "border-gray-200 bg-gray-50"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <User className="w-4 h-4 mr-2 text-gray-600" />
              <label className="text-sm font-medium text-gray-700">
                Customer {requiresCustomer && <span className="text-red-500">*</span>}
              </label>
            </div>
            {formData.customerId && !requiresCustomer && (
              <button
                type="button"
                onClick={() => setFormData({ ...formData, customerId: "" })}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Clear
              </button>
            )}
          </div>
          <SearchableSelect
            options={customers.map((c) => ({
              value: c.id,
              label: c.name,
              id: c.id,
            }))}
            value={formData.customerId}
            onChange={(value: any) =>
              setFormData({ ...formData, customerId: value })
            }
            placeholder="Select customer..."
            className={errors.customerId ? "border-red-500" : ""}
          />
          {errors.customerId && (
            <p className="text-red-500 text-xs mt-1">{errors.customerId}</p>
          )}

          {formData.customerId && (
            <>
              {isPartialPayment && customerName && (
                <p className="text-sm text-amber-700 mt-2">
                  {formatCurrency(totalValue - formData.receivedValue)} will be
                  added to {customerName}'s balance.
                </p>
              )}
              {isCredit && customerName && (
                <p className="text-sm text-amber-700 mt-2">
                  Full amount ({formatCurrency(totalValue)}) will be added to{" "}
                  {customerName}'s credit balance.
                </p>
              )}
              {!isPartialPayment && !isCredit && customerName && (
                <p className="text-sm text-green-700 mt-2">
                  Sale will be recorded for {customerName}.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* Additional Details */}
      <section className="space-y-4">
        <h4 className="text-md font-medium text-gray-800 border-b border-gray-200 pb-2">
          Additional Details
        </h4>
        <textarea
          value={formData.status}
          onChange={(e) =>
            setFormData({ ...formData, status: e.target.value })
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          rows={3}
          placeholder="Optional status about this sale..."
        />
      </section>

      {/* Actions */}
      <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!hasChanges()}
          className={`px-6 py-2 rounded-lg transition-colors font-medium flex items-center ${
            hasChanges()
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
          }`}
        >
          <CheckCircle className="w-4 h-4 mr-2" />
          Save Changes
        </button>
      </div>
    </form>
  );
}
