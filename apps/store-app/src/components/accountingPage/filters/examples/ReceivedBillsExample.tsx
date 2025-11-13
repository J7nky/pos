/**
 * Example: Integrating AccountingFilter into ReceivedBills tab
 * 
 * This shows how to replace the existing filter implementation
 * with the new unified filter system.
 */

import React from 'react';
import { AccountingFilter, useAccountingFilter } from '../index';
import { Pagination } from '../../../common/Pagination';

// Example of how to integrate into ReceivedBills.tsx
export function ReceivedBillsWithFilter({
  inventory,
  inventoryBills,
  products,
  suppliers,
  sales,
  formatCurrency,
  showToast,
  onEditSale,
  onDeleteSale,
  // ... other props
}: any) {
  // Initialize filter with RECEIVED_BILLS preset
  const {
    config,
    filterValues,
    handleFilterChange,
    processData,
    setPage,
  } = useAccountingFilter('RECEIVED_BILLS');

  // Your existing data processing logic (getReceivedBills)
  const receivedBills = React.useMemo(() => {
    // ... your existing logic to create bills from inventory
    // This is the same as your current getReceivedBills useMemo
    const bills: any[] = [];
    // ... populate bills
    return bills;
  }, [inventory, inventoryBills, products, suppliers, sales]);

  // Apply filters, sorting, and pagination using the new system
  const { items, totalPages, currentPage, totalItems } = processData(
    receivedBills,
    // Filter function
    (bill, filters) => {
      // Search filter
      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        if (
          !bill.productName.toLowerCase().includes(searchLower) &&
          !bill.supplierName.toLowerCase().includes(searchLower) &&
          !bill.type.toLowerCase().includes(searchLower)
        ) {
          return false;
        }
      }

      // Supplier filter
      if (filters.supplierId && bill.supplierId !== filters.supplierId) {
        return false;
      }

      // Product filter
      if (filters.productId && bill.productId !== filters.productId) {
        return false;
      }

      // Status filter
      if (filters.status && filters.status !== 'all' && bill.status !== filters.status) {
        return false;
      }

      // Type filter
      if (filters.type && filters.type !== 'all' && bill.type !== filters.type) {
        return false;
      }

      return true;
    },
    // Custom sort function
    (a, b, sortField, sortDirection) => {
      let aValue: any, bValue: any;

      switch (sortField) {
        case 'date':
          aValue = new Date(a.receivedAt).getTime();
          bValue = new Date(b.receivedAt).getTime();
          break;
        case 'supplier':
          aValue = a.supplierName.toLowerCase();
          bValue = b.supplierName.toLowerCase();
          break;
        case 'product':
          aValue = a.productName.toLowerCase();
          bValue = b.productName.toLowerCase();
          break;
        case 'amount':
          aValue = a.estimatedTotalValue;
          bValue = b.estimatedTotalValue;
          break;
        case 'progress':
          aValue = a.progress;
          bValue = b.progress;
          break;
        case 'revenue':
          aValue = a.totalRevenue;
          bValue = b.totalRevenue;
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        default:
          aValue = new Date(a.receivedAt).getTime();
          bValue = new Date(b.receivedAt).getTime();
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    }
  );

  // Export function
  const handleExport = () => {
    try {
      const headers = [
        'Date',
        'Product',
        'Supplier',
        'Type',
        'Original Qty',
        'Remaining Qty',
        'Sold Qty',
        'Progress %',
        'Revenue',
        'Cost',
        'Profit',
        'Status',
        'Unit Price',
      ];
      const csvContent = [
        headers.join(','),
        ...items.map((bill) =>
          [
            new Date(bill.receivedAt).toLocaleDateString(),
            `"${bill.productName}"`,
            `"${bill.supplierName}"`,
            bill.type,
            bill.originalQuantity,
            bill.remainingQuantity,
            bill.totalSoldQuantity,
            `${bill.progress.toFixed(1)}%`,
            bill.totalRevenue.toFixed(2),
            bill.totalCost.toFixed(2),
            bill.totalProfit.toFixed(2),
            bill.status,
            bill.avgUnitPrice.toFixed(2),
          ].join(',')
        ),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `received-bills-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast('Received bills exported successfully', 'success');
    } catch (error) {
      console.error('Error exporting received bills:', error);
      showToast('Error exporting received bills', 'error');
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Received Bills</h2>
        <p className="mt-1 text-sm text-gray-600">
          Showing {items.length} of {totalItems} bills
        </p>
      </div>

      {/* Summary Cards - your existing summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {/* ... your existing summary cards */}
      </div>

      {/* NEW: Unified Filter Component */}
      <AccountingFilter
        config={config}
        values={filterValues}
        onChange={handleFilterChange}
        products={products}
        suppliers={suppliers}
        statusOptions={config.statusOptions}
        typeOptions={config.typeOptions}
        onExport={handleExport}
        className="mb-6"
      />

      {/* Your existing bills display */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {items.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">No bills found matching your filters</p>
          </div>
        ) : (
          <div>
            {items.map((bill) => (
              <div key={bill.id} className="p-4 border-b border-gray-100">
                {/* Your existing bill display component */}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}

/**
 * MIGRATION STEPS:
 * 
 * 1. Remove old filter state:
 *    - Remove all useState/useLocalStorage for individual filters
 *    - Remove receivedBillsSearchTerm, receivedBillsSupplierFilter, etc.
 * 
 * 2. Replace with useAccountingFilter:
 *    const { config, filterValues, handleFilterChange, processData, setPage } = 
 *      useAccountingFilter('RECEIVED_BILLS');
 * 
 * 3. Replace filteredReceivedBills useMemo:
 *    const { items, totalPages, currentPage } = processData(
 *      receivedBills,
 *      (bill, filters) => { ... filter logic ... }
 *    );
 * 
 * 4. Replace filter UI:
 *    <AccountingFilter
 *      config={config}
 *      values={filterValues}
 *      onChange={handleFilterChange}
 *      products={products}
 *      suppliers={suppliers}
 *      statusOptions={config.statusOptions}
 *      typeOptions={config.typeOptions}
 *    />
 * 
 * 5. Update pagination:
 *    <Pagination
 *      currentPage={currentPage}
 *      totalPages={totalPages}
 *      onPageChange={setPage}
 *    />
 * 
 * 6. Remove old filter handlers:
 *    - Remove handleReceivedBillsSort
 *    - Remove setReceivedBillsPage
 *    - Remove all individual filter setters
 */
