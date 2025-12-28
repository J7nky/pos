import React, { useState, useMemo } from 'react';
import { useOfflineData } from '../../contexts/OfflineDataContext';
import { useProfitLoss } from '../../hooks/useProfitLoss';
import type { PLReportFilters } from '../../types/profitLoss';
import { DollarSign, TrendingUp, Package, Download, Filter } from 'lucide-react';
import SalesOverviewCard from '../cards/SalesOverviewCard';

interface ProfitLossReportProps {
  storeId: string;
  branchId?: string;
}

export default function ProfitLossReport({ storeId, branchId }: ProfitLossReportProps) {
  const raw = useOfflineData();
  const products = raw.products || [];
  
  // Date range state with presets
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0], // Last 30 days
    endDate: new Date().toISOString().split('T')[0], // Today
  });

  // Filter states
  const [selectedBillTypes, setSelectedBillTypes] = useState<('commission' | 'cash' | 'credit')[]>([]);
  const [selectedProductCategories, setSelectedProductCategories] = useState<string[]>([]);
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<('cash' | 'card' | 'credit')[]>([]);
  const [sortColumn, setSortColumn] = useState<keyof any>('closedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Get unique product categories
  const productCategories = useMemo(() => {
    const categories = new Set<string>();
    products.forEach(p => {
      if (p.category) categories.add(p.category);
    });
    return Array.from(categories).sort();
  }, [products]);

  // Build filters
  const filters: PLReportFilters = useMemo(() => ({
    storeId,
    branchId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    billTypes: selectedBillTypes.length > 0 ? selectedBillTypes : undefined,
    productCategories: selectedProductCategories.length > 0 ? selectedProductCategories : undefined,
    paymentMethods: selectedPaymentMethods.length > 0 ? selectedPaymentMethods : undefined,
  }), [storeId, branchId, dateRange, selectedBillTypes, selectedProductCategories, selectedPaymentMethods]);

  // Fetch P&L data
  const { data, isLoading, error, refresh } = useProfitLoss(filters);

  // Date range presets
  const applyDatePreset = (preset: 'today' | 'week' | 'month' | 'year') => {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);

    let startDate = new Date(today);
    switch (preset) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(today.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate.setDate(today.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'year':
        startDate.setFullYear(today.getFullYear() - 1);
        startDate.setHours(0, 0, 0, 0);
        break;
    }

    setDateRange({
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    });
  };

  // Sort data
  const sortedLines = useMemo(() => {
    if (!data?.lines) return [];
    
    const sorted = [...data.lines];
    sorted.sort((a, b) => {
      let aVal: any = a[sortColumn];
      let bVal: any = b[sortColumn];
      
      if (sortColumn === 'closedAt') {
        aVal = new Date(a.closedAt).getTime();
        bVal = new Date(b.closedAt).getTime();
      }
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });
    
    return sorted;
  }, [data?.lines, sortColumn, sortDirection]);

  // Handle column sort
  const handleSort = (column: keyof any) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    if (!data?.lines) return;

    const headers = [
      'Bill ID',
      'Bill Type',
      'Closed Date',
      'Revenue',
      'Revenue (Cash)',
      'Revenue (Card)',
      'Revenue (Credit)',
      'COGS',
      'Gross Profit',
      'Gross Profit Margin %',
    ];

    const rows = data.lines.map(line => [
      line.billId,
      line.billType,
      new Date(line.closedAt).toLocaleDateString(),
      line.revenue.toFixed(2),
      (line.revenueCash || 0).toFixed(2),
      (line.revenueCard || 0).toFixed(2),
      (line.revenueCredit || 0).toFixed(2),
      line.cogs.toFixed(2),
      line.grossProfit.toFixed(2),
      line.grossProfitMargin.toFixed(2),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `profit_loss_report_${dateRange.startDate}_to_${dateRange.endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading P&L data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading P&L Data</h3>
        <p className="text-red-600">{error}</p>
        <button
          onClick={refresh}
          className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Filter className="w-5 h-5 mr-2" />
            Filters
          </h2>
          <button
            onClick={exportToCSV}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
          >
            <Download className="w-5 h-5 mr-2" />
            Export CSV
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Date Range Presets */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quick Date Range
            </label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => applyDatePreset('today')}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Today
              </button>
              <button
                onClick={() => applyDatePreset('week')}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                This Week
              </button>
              <button
                onClick={() => applyDatePreset('month')}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                This Month
              </button>
              <button
                onClick={() => applyDatePreset('year')}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                This Year
              </button>
            </div>
          </div>

          {/* Custom Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              End Date
            </label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Purchase Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Purchase Type
            </label>
            <div className="space-y-1">
              {(['commission', 'cash', 'credit'] as const).map(type => (
                <label key={type} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedBillTypes.includes(type)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedBillTypes([...selectedBillTypes, type]);
                      } else {
                        setSelectedBillTypes(selectedBillTypes.filter(t => t !== type));
                      }
                    }}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700 capitalize">{type}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Product Category Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Product Category
            </label>
            <select
              multiple
              value={selectedProductCategories}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, option => option.value);
                setSelectedProductCategories(selected);
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              size={5}
            >
              {productCategories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>

          {/* Sale Payment Method Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sale Payment Method
            </label>
            <div className="space-y-1">
              {(['cash', 'card', 'credit'] as const).map(method => (
                <label key={method} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedPaymentMethods.includes(method)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPaymentMethods([...selectedPaymentMethods, method]);
                      } else {
                        setSelectedPaymentMethods(selectedPaymentMethods.filter(m => m !== method));
                      }
                    }}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700 capitalize">{method}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <SalesOverviewCard
              title="Total Revenue"
              value={`$${data.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon={<DollarSign className="w-8 h-8" />}
              iconColor="text-green-500"
            />
            <SalesOverviewCard
              title="Total COGS"
              value={`$${data.totalCOGS.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon={<Package className="w-8 h-8" />}
              iconColor="text-red-500"
            />
            <SalesOverviewCard
              title="Gross Profit"
              value={`$${data.totalGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon={<TrendingUp className="w-8 h-8" />}
              iconColor="text-blue-500"
            />
            <SalesOverviewCard
              title="Avg Profit Margin"
              value={`${data.averageGrossProfitMargin.toFixed(2)}%`}
              icon={<TrendingUp className="w-8 h-8" />}
              iconColor="text-purple-500"
            />
          </div>

          {/* Data Table */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                P&L Details ({data.billCount} bills)
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('closedAt')}
                    >
                      Closed Date {sortColumn === 'closedAt' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('billType')}
                    >
                      Purchase Type {sortColumn === 'billType' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('revenue')}
                    >
                      Revenue {sortColumn === 'revenue' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Revenue Breakdown
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('cogs')}
                    >
                      COGS {sortColumn === 'cogs' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('grossProfit')}
                    >
                      Gross Profit {sortColumn === 'grossProfit' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('grossProfitMargin')}
                    >
                      Margin % {sortColumn === 'grossProfitMargin' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sortedLines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        No P&L data found for the selected filters
                      </td>
                    </tr>
                  ) : (
                    sortedLines.map((line, index) => (
                      <tr key={line.billId || index} className="hover:bg-gray-50">
                        <td className="px-4 py-4 text-gray-900">
                          {new Date(line.closedAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-4">
                          <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 capitalize">
                            {line.billType}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-gray-900 font-medium">
                          ${line.revenue.toFixed(2)}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">
                          <div className="space-y-1">
                            {line.revenueCash !== undefined && line.revenueCash > 0 && (
                              <div>Cash: ${line.revenueCash.toFixed(2)}</div>
                            )}
                            {line.revenueCard !== undefined && line.revenueCard > 0 && (
                              <div>Card: ${line.revenueCard.toFixed(2)}</div>
                            )}
                            {line.revenueCredit !== undefined && line.revenueCredit > 0 && (
                              <div>Credit: ${line.revenueCredit.toFixed(2)}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-gray-900">
                          ${line.cogs.toFixed(2)}
                        </td>
                        <td className={`px-4 py-4 font-medium ${
                          line.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          ${line.grossProfit.toFixed(2)}
                        </td>
                        <td className={`px-4 py-4 font-medium ${
                          line.grossProfitMargin >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {line.grossProfitMargin.toFixed(2)}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

