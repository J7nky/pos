import React from "react";
import { X } from "lucide-react";

interface ReceivedBillDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedBill: any; // Replace with proper type if you have one
  formatCurrency: (value: number) => string;
  getStatusBadge: (status: string) => JSX.Element;
}

const ReceivedBillDetailsModal: React.FC<ReceivedBillDetailsModalProps> = ({
  isOpen,
  onClose,
  selectedBill,
  formatCurrency,
  getStatusBadge,
}) => {
  if (!isOpen || !selectedBill) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Received Bill Details</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* --- Basic Information --- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Product</label>
                  <p className="text-sm text-gray-900">{selectedBill.productName}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Supplier</label>
                  <p className="text-sm text-gray-900">{selectedBill.supplierName}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Type</label>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      selectedBill.type === "commission"
                        ? "bg-purple-100 text-purple-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {selectedBill.type}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Received Date</label>
                  <p className="text-sm text-gray-900">
                    {new Date(selectedBill.receivedAt).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Received By</label>
                  <p className="text-sm text-gray-900">{selectedBill.receivedBy}</p>
                </div>
              </div>
            </div>

            {/* --- Quantity & Progress --- */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quantity & Progress</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Original Quantity</label>
                  <p className="text-sm text-gray-900">
                    {selectedBill.originalQuantity} {selectedBill.unit}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Remaining Quantity</label>
                  <p className="text-sm text-gray-900">
                    {selectedBill.remainingQuantity} {selectedBill.unit}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Sold Quantity</label>
                  <p className="text-sm text-gray-900">
                    {selectedBill.totalSoldQuantity} {selectedBill.unit}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Progress</label>
                  <div className="flex items-center mt-1">
                    <div className="w-full bg-gray-200 rounded-full h-2 mr-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${selectedBill.progress}%` }}
                      ></div>
                    </div>
                    <span className="text-sm text-gray-900">
                      {selectedBill.progress.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <div className="mt-1">{getStatusBadge(selectedBill.status)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* --- Financial Information --- */}
          <div className="mt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Financial Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-green-50 p-4 rounded-lg">
                <label className="block text-sm font-medium text-green-700">Total Revenue</label>
                <p className="text-2xl font-bold text-green-900">
                  {formatCurrency(selectedBill.totalRevenue)}
                </p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <label className="block text-sm font-medium text-red-700">Total Cost</label>
                <p className="text-2xl font-bold text-red-900">
                  {formatCurrency(selectedBill.totalCost)}
                </p>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <label className="block text-sm font-medium text-blue-700">Total Profit</label>
                <p className="text-2xl font-bold text-blue-900">
                  {formatCurrency(selectedBill.totalProfit)}
                </p>
              </div>
            </div>
          </div>

          {/* --- Commission Details --- */}
          {selectedBill.type === "commission" && (
            <div className="mt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Commission Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Porterage</label>
                  <p className="text-sm text-gray-900">{formatCurrency(selectedBill.porterage || 0)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Transfer Fee</label>
                  <p className="text-sm text-gray-900">{formatCurrency(selectedBill.transferFee || 0)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Commission Rate</label>
                  <p className="text-sm text-gray-900">
                    {selectedBill.commissionRate ? `${selectedBill.commissionRate}%` : "N/A"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Average Unit Price</label>
                  <p className="text-sm text-gray-900">{formatCurrency(selectedBill.avgUnitPrice)}</p>
                </div>
              </div>
            </div>
          )}

          {/* --- Notes --- */}
          {selectedBill.status && (
            <div className="mt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Notes</h3>
              <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-lg">
                {selectedBill.status}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReceivedBillDetailsModal;
