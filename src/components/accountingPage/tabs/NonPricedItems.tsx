import React from "react";
import {
  FileText,
  X,
  Search,
  AlertCircle,
  Edit,
  CheckCircle,
  Trash2,
} from "lucide-react";
import MoneyInput from "../../common/MoneyInput";

interface NonPricedItem {
  id: string;
  status: "ready" | "incomplete";
  customerName: string;
  productName: string;
  supplierName: string;
  quantity: number;
  weight: number;
  unit_price: number;
  totalValue: number;
  created_at?: string;
}

interface NonPricedItemsProps {
  filteredNonPricedItems: NonPricedItem[];
  pagedNonPricedItems: NonPricedItem[];
  stagedNonPricedChanges: Record<string, Record<string, any>>;
  selectedNonPriced: string[];
  showBulkActions: boolean;
  nonPricedSearch: string;
  nonPricedSort: string;
  nonPricedSortDir: "asc" | "desc";
  nonPricedPage: number;
  nonPricedTotalPages: number;
  NON_PRICED_PAGE_SIZE: number;

  // Callbacks
  setShowBulkActions: (value: boolean) => void;
  setSelectedNonPriced: React.Dispatch<React.SetStateAction<string[]>>;
  setStagedNonPricedChanges: React.Dispatch<
    React.SetStateAction<Record<string, Record<string, any>>>
  >;
  setNonPricedSearch: (value: string) => void;
  setNonPricedSort: (field: string) => void;
  setNonPricedSortDir: (dir: "asc" | "desc") => void;
  setNonPricedPage: (page: number) => void;

  exportNonPricedItems: () => void;
  handleBulkMarkPriced: () => void;
  handleBulkDelete: () => void;
  stageChange: (id: string, field: string, value: any) => void;
  getCurrentValue: (item: NonPricedItem, field: string) => any;
  handleMarkPriced: (item: NonPricedItem) => void;
  handleDeleteNonPriced: (item: NonPricedItem) => void;
  setShowEditNonPriced: (item: NonPricedItem) => void;
  showToast: (message: string, type: "success" | "error") => void;
}

export const NonPricedItems: React.FC<NonPricedItemsProps> = ({
  filteredNonPricedItems,
  pagedNonPricedItems,
  stagedNonPricedChanges,
  selectedNonPriced,
  showBulkActions,
  nonPricedSearch,
  nonPricedSort,
  nonPricedSortDir,
  nonPricedPage,
  nonPricedTotalPages,
  NON_PRICED_PAGE_SIZE,

  setShowBulkActions,
  setSelectedNonPriced,
  setStagedNonPricedChanges,
  setNonPricedSearch,
  setNonPricedSort,
  setNonPricedSortDir,
  setNonPricedPage,

  exportNonPricedItems,
  handleBulkMarkPriced,
  handleBulkDelete,
  stageChange,
  getCurrentValue,
  handleMarkPriced,
  handleDeleteNonPriced,
  setShowEditNonPriced,
  showToast,
}) => {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <h2 className="text-xl font-semibold text-gray-900">
            Non Priced 
          </h2>
          {filteredNonPricedItems.length > 0 && (
            <span className="ml-3 bg-red-500 text-white text-sm rounded-full px-3 py-1">
              {filteredNonPricedItems.length}
            </span>
          )}
        </div>
        <div className="flex space-x-2">
          <button
            onClick={exportNonPricedItems}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
          >
            <FileText className="w-4 h-4 mr-2" />
            Export CSV
          </button>
          {Object.keys(stagedNonPricedChanges).length > 0 && (
            <button
              onClick={() => {
                setStagedNonPricedChanges({});
                showToast("All staged changes cleared", "success");
              }}
              className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors flex items-center"
            >
              <X className="w-4 h-4 mr-2" />
              Clear All Changes
            </button>
          )}
          {selectedNonPriced.length > 0 && (
            <button
              onClick={() => setShowBulkActions(!showBulkActions)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
            >
              Bulk Actions ({selectedNonPriced.length})
            </button>
          )}
        </div>
      </div>

      {/* Bulk Actions */}
      {showBulkActions && selectedNonPriced.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">
              {selectedNonPriced.length} items selected
            </span>
            <div className="flex space-x-2">
              <button
                onClick={handleBulkMarkPriced}
                className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
              >
                Mark as Priced
              </button>
              <button
                onClick={handleBulkDelete}
                className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
              >
                Delete
              </button>
              <button
                onClick={() => setSelectedNonPriced([])}
                className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700"
              >
                Clear Selection
              </button>
              <button
                onClick={() => {
                  setStagedNonPricedChanges((prev) => {
                    const newChanges = { ...prev };
                    selectedNonPriced.forEach((id) => {
                      delete newChanges[id];
                    });
                    return newChanges;
                  });
                  showToast("Staged changes cleared", "success");
                }}
                className="bg-orange-600 text-white px-3 py-1 rounded text-sm hover:bg-orange-700"
              >
                Clear Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={nonPricedSearch}
            onChange={(e) => setNonPricedSearch(e.target.value)}
            placeholder="Search by customer, product, supplier, or status..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Sort Controls */}
      <div className="flex flex-wrap gap-2 mb-4">
        {["date", "customer", "product", "value"].map((field) => (
          <button
            key={field}
            onClick={() => {
              setNonPricedSort(field);
              setNonPricedSortDir(
                nonPricedSort === field && nonPricedSortDir === "asc"
                  ? "desc"
                  : "asc"
              );
            }}
            className={`px-3 py-1 border rounded-lg ${
              nonPricedSort === field
                ? "bg-blue-100 border-blue-500"
                : "border-gray-300"
            }`}
          >
            {field.charAt(0).toUpperCase() + field.slice(1)}{" "}
            {nonPricedSort === field
              ? nonPricedSortDir === "asc"
                ? "↑"
                : "↓"
              : ""}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={
                      selectedNonPriced.length === pagedNonPricedItems.length &&
                      pagedNonPricedItems.length > 0
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedNonPriced(pagedNonPricedItems.map((i) => i.id));
                      } else {
                        setSelectedNonPriced([]);
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Product
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Supplier
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Qty
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Weight (kg)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Unit Price
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Total Value
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date Added
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pagedNonPricedItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center text-gray-500 py-8">
                    <div className="flex flex-col items-center">
                      <AlertCircle className="w-8 h-8 text-gray-400 mb-2" />
                      <span className="font-semibold">
                        No non-priced items found
                      </span>
                      <span className="text-sm text-gray-400">
                        Items will appear here when they need pricing.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedNonPricedItems.map((item) => {
                  const hasStagedChanges =
                    stagedNonPricedChanges[item.id] &&
                    Object.keys(stagedNonPricedChanges[item.id]).length > 0;
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-gray-50 ${
                        hasStagedChanges ? "bg-blue-50" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedNonPriced.includes(item.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedNonPriced((prev) => [...prev, item.id]);
                            } else {
                              setSelectedNonPriced((prev) =>
                                prev.filter((id) => id !== item.id)
                              );
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              item.status === "ready"
                                ? "bg-green-100 text-green-800"
                                : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {item.status === "ready" ? "Ready" : "Incomplete"}
                          </span>
                          {hasStagedChanges && (
                            <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                              Modified
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        {item.customerName}
                      </td>
                      <td className="px-4 py-3 text-gray-900 font-medium">
                        {item.productName}
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        {item.supplierName}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          className="w-16 border rounded px-2 py-1 text-sm"
                          value={getCurrentValue(item, "quantity") || ""}
                          min={1}
                          onChange={(e) =>
                            stageChange(item.id, "quantity", parseInt(e.target.value) || 0)
                          }
                          placeholder="0"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          className="w-20 border rounded px-2 py-1 text-sm"
                          value={getCurrentValue(item, "weight") || ""}
                          min={0}
                          step={0.01}
                          onChange={(e) =>
                            stageChange(item.id, "weight", parseFloat(e.target.value) || 0)
                          }
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <MoneyInput
                          value={getCurrentValue(item, "unit_price") || ""}
                          onChange={(value) =>
                            stageChange(item.id, "unit_price", parseFloat(value) || 0)
                          }
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          className="w-32 text-sm"
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        ${item.totalValue.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-sm">
                        {item.created_at
                          ? new Date(item.created_at).toLocaleDateString()
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => setShowEditNonPriced(item)}
                            className="text-blue-600 hover:text-blue-800"
                            title="Edit details"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleMarkPriced(item)}
                            disabled={item.status !== "ready"}
                            className={`${
                              item.status === "ready"
                                ? "text-green-600 hover:text-green-800"
                                : "text-gray-400 cursor-not-allowed"
                            }`}
                            title="Mark as priced"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteNonPriced(item)}
                            className="text-red-600 hover:text-red-800"
                            title="Delete item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing {(nonPricedPage - 1) * NON_PRICED_PAGE_SIZE + 1} to{" "}
            {Math.min(
              nonPricedPage * NON_PRICED_PAGE_SIZE,
              filteredNonPricedItems.length
            )}{" "}
            of {filteredNonPricedItems.length} items
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setNonPricedPage(Math.max(1, nonPricedPage - 1))}
              disabled={nonPricedPage === 1}
              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-sm text-gray-700">
              Page {nonPricedPage} of {nonPricedTotalPages || 1}
            </span>
            <button
              onClick={() =>
                setNonPricedPage(Math.min(nonPricedTotalPages, nonPricedPage + 1))
              }
              disabled={nonPricedPage === nonPricedTotalPages || nonPricedTotalPages === 0}
              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default NonPricedItems;