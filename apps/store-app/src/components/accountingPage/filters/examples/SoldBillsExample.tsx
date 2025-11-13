/**
 * Example: Integrating AccountingFilter into SoldBills (Inventory Logs) tab
 * 
 * This shows how to handle date range filters and payment-specific filters
 */

import React from 'react';
import { AccountingFilter, useAccountingFilter } from '../index';
import { Pagination } from '../../../common/Pagination';

export function SoldBillsWithFilter({
  bills,
  customers,
  products,
  suppliers,
  formatCurrency,
  showToast,
  onViewBill,
  onEditBill,
  onDeleteBill,
}: any) {
  // Initialize filter with SOLD_BILLS preset
  const {
    config,
    filterValues,
    handleFilterChange,
    processData,
    setPage,
  } = useAccountingFilter('SOLD_BILLS');

  // Apply filters with date range support
  const { items, totalPages, currentPage, totalItems } = processData(
    bills,
    // Filter function
    (bill, filters) => {
      // Search filter - supports bill number search
      if (filters.searchTerm) {
        const search = filters.searchTerm.toLowerCase();
        const billNumber = bill.bill_number?.toLowerCase() || '';
        const customerName = customers.find((c: any) => c.id === bill.customer_id)?.name?.toLowerCase() || '';
        
        if (!billNumber.includes(search) && !customerName.includes(search)) {
          return false;
        }
      }

      // Date range filter
      if (filters.dateRange?.start || filters.dateRange?.end) {
        const billDate = new Date(bill.bill_date || bill.created_at);
        
        if (filters.dateRange.start) {
          const startDate = new Date(filters.dateRange.start);
          startDate.setHours(0, 0, 0, 0);
          if (billDate < startDate) return false;
        }
        
        if (filters.dateRange.end) {
          const endDate = new Date(filters.dateRange.end);
          endDate.setHours(23, 59, 59, 999);
          if (billDate > endDate) return false;
        }
      }

      // Payment status filter
      if (filters.paymentStatus && bill.payment_status !== filters.paymentStatus) {
        return false;
      }

      // Status filter (active/cancelled/refunded)
      if (filters.status && bill.status !== filters.status) {
        return false;
      }

      return true;
    },
    // Custom sort function
    (a, b, sortField, sortDirection) => {
      let aValue: any, bValue: any;

      switch (sortField) {
        case 'date':
          aValue = new Date(a.bill_date || a.created_at).getTime();
          bValue = new Date(b.bill_date || b.created_at).getTime();
          break;
        case 'amount':
          aValue = a.total_amount;
          bValue = b.total_amount;
          break;
        case 'customer':
          const aCustomer = customers.find((c: any) => c.id === a.customer_id);
          const bCustomer = customers.find((c: any) => c.id === b.customer_id);
          aValue = aCustomer?.name?.toLowerCase() || '';
          bValue = bCustomer?.name?.toLowerCase() || '';
          break;
        default:
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    }
  );

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Sold Bills</h2>
        <p className="mt-1 text-sm text-gray-600">
          Showing {items.length} of {totalItems} bills
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-600">Total Bills</p>
          <p className="text-2xl font-bold text-gray-900">{totalItems}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-600">Total Revenue</p>
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(items.reduce((sum, b) => sum + (b.total_amount || 0), 0))}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-600">Paid Bills</p>
          <p className="text-2xl font-bold text-blue-600">
            {items.filter((b) => b.payment_status === 'paid').length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-600">Pending Payments</p>
          <p className="text-2xl font-bold text-amber-600">
            {items.filter((b) => b.payment_status === 'pending' || b.payment_status === 'partial').length}
          </p>
        </div>
      </div>

      {/* NEW: Unified Filter Component with Date Range */}
      <AccountingFilter
        config={config}
        values={filterValues}
        onChange={handleFilterChange}
        customers={customers}
        paymentStatusOptions={config.paymentStatusOptions}
        statusOptions={config.statusOptions}
        className="mb-6"
      />

      {/* Bills Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">No bills found matching your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bill Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {items.map((bill) => (
                  <tr key={bill.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {bill.bill_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customers.find((c: any) => c.id === bill.customer_id)?.name || 'Walk-in Customer'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(bill.bill_date || bill.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(bill.total_amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          bill.payment_status === 'paid'
                            ? 'bg-green-100 text-green-800'
                            : bill.payment_status === 'partial'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {bill.payment_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          bill.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : bill.status === 'cancelled'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {bill.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => onViewBill(bill)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        View
                      </button>
                      <button
                        onClick={() => onEditBill(bill)}
                        className="text-indigo-600 hover:text-indigo-900 mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDeleteBill(bill)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}

/**
 * KEY FEATURES DEMONSTRATED:
 * 
 * 1. Date Range Filtering:
 *    - Automatic date preset buttons (Today, Week, Month)
 *    - Custom date range with start/end inputs
 *    - Proper date comparison with timezone handling
 * 
 * 2. Payment-Specific Filters:
 *    - Payment status (paid, partial, pending)
 *    - Bill status (active, cancelled, refunded)
 * 
 * 3. Search Enhancement:
 *    - Searches both bill number and customer name
 *    - Case-insensitive matching
 * 
 * 4. Collapsible Filters:
 *    - Filter panel can be collapsed to save space
 *    - State persists in localStorage
 * 
 * MIGRATION NOTES:
 * 
 * - Remove: searchTerm, dateFrom, dateTo, paymentStatusFilter, statusFilter states
 * - Remove: handleFastDateFilter function (now built-in)
 * - Remove: Manual date filtering logic
 * - Keep: Your existing loadBills, loadBillDetails functions
 * - Update: Use filterValues.dateRange instead of separate dateFrom/dateTo
 */
