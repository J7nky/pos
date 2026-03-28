import React, { useState, useMemo } from 'react';
import { useOfflineData } from '../../contexts/OfflineDataContext';
import { useProfitLoss } from '../../hooks/useProfitLoss';
import { useCurrency } from '../../hooks/useCurrency';
import type { PLReportFilters } from '../../types/profitLoss';
import { DollarSign, TrendingUp, TrendingDown, Package, Download, Filter, ChevronDown, ChevronUp, Calendar, X, CreditCard, Wallet, Tag, Layers } from 'lucide-react';
import { getLocalDateString, getTodayLocalDate } from '../../utils/dateUtils';

interface ProfitLossReportProps {
  storeId: string;
  branchId?: string;
}

export default function ProfitLossReport({ storeId, branchId }: ProfitLossReportProps) {
  const raw = useOfflineData();
  const products = raw.products || [];
  const { currency, formatCurrency, convertCurrency } = useCurrency();
  
  // Format currency based on store's preferred currency
  // Converts from bill's original currency to display currency
  const formatAmount = (amount: number, billCurrency: 'USD' | 'LBP' = 'USD'): string => {
    if (amount == null || isNaN(amount)) {
      return currency === 'LBP' ? '0 ل.ل' : '$0.00';
    }
    // Convert from bill's currency to display currency and format
    return formatCurrency(amount, billCurrency);
  };
  
  // Convert amount from bill currency to display currency (for CSV export and aggregates)
  const convertToDisplayCurrency = (amount: number, billCurrency: 'USD' | 'LBP' = 'USD'): number => {
    return convertCurrency(amount, billCurrency, currency);
  };
  
  // Date range state with presets
  const [dateRange, setDateRange] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
      startDate: getLocalDateString(start.toISOString()),
      endDate: getTodayLocalDate(),
    };
  });

  // Filter states
  const [selectedBillTypes, setSelectedBillTypes] = useState<('commission' | 'cash' | 'credit')[]>([]);
  const [selectedProductCategories, setSelectedProductCategories] = useState<string[]>([]);
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<('cash' | 'card' | 'credit')[]>([]);
  const [sortColumn, setSortColumn] = useState<keyof import('../../types/profitLoss').PLReportLine>('closedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

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
      startDate: getLocalDateString(startDate.toISOString()),
      endDate: getLocalDateString(endDate.toISOString()),
    });
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedBillTypes([]);
    setSelectedProductCategories([]);
    setSelectedPaymentMethods([]);
    setDateRange(() => {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      return {
        startDate: getLocalDateString(start.toISOString()),
        endDate: getTodayLocalDate(),
      };
    });
  };

  // Check if any filters are active
  const hasActiveFilters = selectedBillTypes.length > 0 || 
                          selectedProductCategories.length > 0 || 
                          selectedPaymentMethods.length > 0;

  // Sort and paginate data
  const { sortedLines, totalPages, paginatedLines } = useMemo(() => {
    if (!data?.lines) return { sortedLines: [], totalPages: 0, paginatedLines: [] };
    
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
    
    const totalPages = Math.ceil(sorted.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginated = sorted.slice(startIndex, startIndex + itemsPerPage);
    
    return { sortedLines: sorted, totalPages, paginatedLines: paginated };
  }, [data?.lines, sortColumn, sortDirection, currentPage]);
  
  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Handle column sort
  const handleSort = (column: keyof import('../../types/profitLoss').PLReportLine) => {
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

    const currencyLabel = currency === 'LBP' ? 'LBP' : 'USD';
    const headers = [
      'Bill ID',
      'Bill Type',
      'Original Currency',
      'Closed Date',
      `Revenue (${currencyLabel})`,
      `Revenue Cash (${currencyLabel})`,
      `Revenue Card (${currencyLabel})`,
      `Revenue Credit (${currencyLabel})`,
      `COGS (${currencyLabel})`,
      `Gross Profit (${currencyLabel})`,
      'Gross Profit Margin %',
    ];

    // Convert and format numbers for CSV based on currency
    // Data is stored in bill's original currency, convert to display currency
    const formatForCSV = (amount: number, billCurrency: 'USD' | 'LBP'): string => {
      const convertedAmount = convertToDisplayCurrency(amount, billCurrency);
      if (currency === 'LBP') {
        return Math.round(convertedAmount).toString();
      }
      return convertedAmount.toFixed(2);
    };

    const rows = data.lines.map(line => [
      line.billId,
      line.billType,
      line.currency, // Include original bill currency for reference
      new Date(line.closedAt).toLocaleDateString(),
      formatForCSV(line.revenue, line.currency),
      formatForCSV(line.revenueCash || 0, line.currency),
      formatForCSV(line.revenueCard || 0, line.currency),
      formatForCSV(line.revenueCredit || 0, line.currency),
      formatForCSV(line.cogs, line.currency),
      formatForCSV(line.grossProfit, line.currency),
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
    link.setAttribute('download', `profit_loss_report_${currencyLabel}_${dateRange.startDate}_to_${dateRange.endDate}.csv`);
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
      {/* Header with Actions */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Profit & Loss Analysis</h2>
            <p className="text-sm text-gray-500 mt-1">Comprehensive financial performance insights</p>
          </div>
          <div className="flex gap-2">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex items-center"
              >
                <X className="w-4 h-4 mr-2" />
                Clear Filters
              </button>
            )}
            <button
              onClick={exportToCSV}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center shadow-sm"
            >
              <Download className="w-5 h-5 mr-2" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible Filters */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center">
            <Filter className="w-5 h-5 mr-2 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
            {hasActiveFilters && (
              <span className="ml-3 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                {selectedBillTypes.length + selectedProductCategories.length + selectedPaymentMethods.length} active
              </span>
            )}
          </div>
          {showFilters ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </button>
        
        {showFilters && (
          <div className="px-6 py-6 border-t border-gray-200 bg-gray-50/50">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Date Range Presets */}
              <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                <label className="block text-sm font-semibold text-gray-900 mb-3 flex items-center">
                  <Calendar className="w-4 h-4 mr-2 text-blue-600" />
                  Quick Date Range
                </label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { key: 'today', label: 'Today' },
                    { key: 'week', label: 'Week' },
                    { key: 'month', label: 'Month' },
                    { key: 'year', label: 'Year' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => applyDatePreset(key as any)}
                      className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 hover:text-blue-800 transition-all font-medium border border-blue-200 hover:border-blue-300 active:scale-95"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Date Range - Start Date */}
              <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                <label className="block text-sm font-semibold text-gray-900 mb-3 flex items-center">
                  <Calendar className="w-4 h-4 mr-2 text-green-600" />
                  Start Date
                </label>
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all hover:border-gray-300"
                />
              </div>

              {/* Custom Date Range - End Date */}
              <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                <label className="block text-sm font-semibold text-gray-900 mb-3 flex items-center">
                  <Calendar className="w-4 h-4 mr-2 text-green-600" />
                  End Date
                </label>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all hover:border-gray-300"
                />
              </div>

             
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
               {/* Purchase Type Filter */}
              <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                <label className="block text-sm font-semibold text-gray-900 mb-3 flex items-center">
                  <Tag className="w-4 h-4 mr-2 text-purple-600" />
                  Purchase Type
                </label>
                <div className="space-y-2">
                  {(['commission', 'cash', 'credit'] as const).map(type => {
                    const isSelected = selectedBillTypes.includes(type); {/* Purchase Type Filter */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                      <label className="block text-sm font-semibold text-gray-900 mb-3 flex items-center">
                        <Tag className="w-4 h-4 mr-2 text-purple-600" />
                        Purchase Type
                      </label>
                      <div className="space-y-2">
                        {(['commission', 'cash', 'credit'] as const).map(type => {
                          const isSelected = selectedBillTypes.includes(type);
                          return (
                            <label 
                              key={type} 
                              className={`flex items-center cursor-pointer p-2.5 rounded-lg border-2 transition-all ${
                                isSelected 
                                  ? 'bg-purple-50 border-purple-300 hover:bg-purple-100' 
                                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedBillTypes([...selectedBillTypes, type]);
                                  } else {
                                    setSelectedBillTypes(selectedBillTypes.filter(t => t !== type));
                                  }
                                }}
                                className="w-4 h-4 text-purple-600 focus:ring-2 focus:ring-purple-500 focus:ring-offset-1 border-gray-300 rounded cursor-pointer"
                              />
                              <span className={`ml-3 text-sm capitalize font-medium ${
                                isSelected ? 'text-purple-900' : 'text-gray-700'
                              }`}>
                                {type}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    return (
                      <label 
                        key={type} 
                        className={`flex items-center cursor-pointer p-2.5 rounded-lg border-2 transition-all ${
                          isSelected 
                            ? 'bg-purple-50 border-purple-300 hover:bg-purple-100' 
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBillTypes([...selectedBillTypes, type]);
                            } else {
                              setSelectedBillTypes(selectedBillTypes.filter(t => t !== type));
                            }
                          }}
                          className="w-4 h-4 text-purple-600 focus:ring-2 focus:ring-purple-500 focus:ring-offset-1 border-gray-300 rounded cursor-pointer"
                        />
                        <span className={`ml-3 text-sm capitalize font-medium ${
                          isSelected ? 'text-purple-900' : 'text-gray-700'
                        }`}>
                          {type}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {/* Product Category Filter */}
              <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                <label className="block text-sm font-semibold text-gray-900 mb-3 flex items-center">
                  <Layers className="w-4 h-4 mr-2 text-indigo-600" />
                  Product Category
                </label>
                <div className="relative">
                  <select
                    multiple
                    value={selectedProductCategories}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions, option => option.value);
                      setSelectedProductCategories(selected);
                    }}
                    className="w-full border-2 border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all hover:border-gray-300"
                    size={5}
                  >
                    {productCategories.length === 0 ? (
                      <option disabled className="text-gray-400">No categories available</option>
                    ) : (
                      productCategories.map(category => (
                        <option 
                          key={category} 
                          value={category}
                          className="py-1.5 hover:bg-indigo-50"
                        >
                          {category}
                        </option>
                      ))
                    )}
                  </select>
                  {selectedProductCategories.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                        {selectedProductCategories.length} {selectedProductCategories.length === 1 ? 'category' : 'categories'} selected
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Sale Payment Method Filter */}
              <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                <label className="block text-sm font-semibold text-gray-900 mb-3 flex items-center">
                  <CreditCard className="w-4 h-4 mr-2 text-cyan-600" />
                  Sale Payment Method
                </label>
                <div className="space-y-2">
                  {(['cash', 'card', 'credit'] as const).map(method => {
                    const isSelected = selectedPaymentMethods.includes(method);
                    const methodIcons = {
                      cash: Wallet,
                      card: CreditCard,
                      credit: DollarSign,
                    };
                    const Icon = methodIcons[method];
                    return (
                      <label 
                        key={method} 
                        className={`flex items-center cursor-pointer p-2.5 rounded-lg border-2 transition-all ${
                          isSelected 
                            ? 'bg-cyan-50 border-cyan-300 hover:bg-cyan-100' 
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPaymentMethods([...selectedPaymentMethods, method]);
                            } else {
                              setSelectedPaymentMethods(selectedPaymentMethods.filter(m => m !== method));
                            }
                          }}
                          className="w-4 h-4 text-cyan-600 focus:ring-2 focus:ring-cyan-500 focus:ring-offset-1 border-gray-300 rounded cursor-pointer"
                        />
                        <Icon className={`w-4 h-4 ml-3 ${isSelected ? 'text-cyan-700' : 'text-gray-500'}`} />
                        <span className={`ml-2 text-sm capitalize font-medium ${
                          isSelected ? 'text-cyan-900' : 'text-gray-700'
                        }`}>
                          {method}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {data && (() => {
        // Calculate totals converted to display currency
        const convertedTotals = data.lines.reduce((acc, line) => {
          const convertedRevenue = convertToDisplayCurrency(line.revenue, line.currency);
          const convertedCogs = convertToDisplayCurrency(line.cogs, line.currency);
          const convertedProfit = convertToDisplayCurrency(line.grossProfit, line.currency);
          return {
            revenue: acc.revenue + convertedRevenue,
            cogs: acc.cogs + convertedCogs,
            profit: acc.profit + convertedProfit,
          };
        }, { revenue: 0, cogs: 0, profit: 0 });
        
        return (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl shadow-sm p-6 border-l-4 border-green-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">Total Revenue</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {formatAmount(convertedTotals.revenue, currency)}
                  </p>
                </div>
                <div className="p-3 bg-green-500 rounded-full">
                  <DollarSign className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl shadow-sm p-6 border-l-4 border-red-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">Total COGS</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {formatAmount(convertedTotals.cogs, currency)}
                  </p>
                </div>
                <div className="p-3 bg-red-500 rounded-full">
                  <Package className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
            
            <div className={`bg-gradient-to-br rounded-xl shadow-sm p-6 border-l-4 ${
              convertedTotals.profit >= 0 
                ? 'from-blue-50 to-blue-100 border-blue-500' 
                : 'from-red-50 to-red-100 border-red-500'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">Gross Profit</p>
                  <p className={`text-3xl font-bold ${
                    convertedTotals.profit >= 0 ? 'text-blue-900' : 'text-red-900'
                  }`}>
                    {formatAmount(convertedTotals.profit, currency)}
                  </p>
                </div>
                <div className={`p-3 rounded-full ${
                  convertedTotals.profit >= 0 ? 'bg-blue-500' : 'bg-red-500'
                }`}>
                  {convertedTotals.profit >= 0 ? (
                    <TrendingUp className="w-6 h-6 text-white" />
                  ) : (
                    <TrendingDown className="w-6 h-6 text-white" />
                  )}
                </div>
              </div>
            </div>
            
            <div className={`bg-gradient-to-br rounded-xl shadow-sm p-6 border-l-4 ${
              data.averageGrossProfitMargin >= 0 
                ? 'from-purple-50 to-purple-100 border-purple-500' 
                : 'from-red-50 to-red-100 border-red-500'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">Avg Profit Margin</p>
                  <p className={`text-3xl font-bold ${
                    data.averageGrossProfitMargin >= 0 ? 'text-purple-900' : 'text-red-900'
                  }`}>
                    {data.averageGrossProfitMargin >= 0 ? '+' : ''}{data.averageGrossProfitMargin.toFixed(2)}%
                  </p>
                </div>
                <div className={`p-3 rounded-full ${
                  data.averageGrossProfitMargin >= 0 ? 'bg-purple-500' : 'bg-red-500'
                }`}>
                  {data.averageGrossProfitMargin >= 0 ? (
                    <TrendingUp className="w-6 h-6 text-white" />
                  ) : (
                    <TrendingDown className="w-6 h-6 text-white" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    P&L Details
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {data.billCount} {data.billCount === 1 ? 'bill' : 'bills'} found
                  </p>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-600 px-3">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th
                      className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('closedAt')}
                    >
                      <div className="flex items-center gap-2">
                        Closed Date
                        {sortColumn === 'closedAt' && (
                          sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </th>
                    <th
                      className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('billType')}
                    >
                      <div className="flex items-center gap-2">
                        Purchase Type
                        {sortColumn === 'billType' && (
                          sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </th>
                    <th
                      className="px-6 py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('revenue')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        Revenue
                        {sortColumn === 'revenue' && (
                          sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Revenue Breakdown
                    </th>
                    <th
                      className="px-6 py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('cogs')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        COGS
                        {sortColumn === 'cogs' && (
                          sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </th>
                    <th
                      className="px-6 py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('grossProfit')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        Gross Profit
                        {sortColumn === 'grossProfit' && (
                          sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </th>
                    <th
                      className="px-6 py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('grossProfitMargin')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        Margin %
                        {sortColumn === 'grossProfitMargin' && (
                          sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {paginatedLines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center">
                          <Package className="w-12 h-12 text-gray-400 mb-3" />
                          <p className="text-gray-900 font-medium text-lg mb-1">No P&L data found</p>
                          <p className="text-gray-500 text-sm">Try adjusting your filters or date range</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedLines.map((line, index) => (
                      <tr key={line.billId || index} className="hover:bg-blue-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {new Date(line.closedAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(line.closedAt).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 text-xs font-semibold rounded-full capitalize ${
                            line.billType === 'commission' 
                              ? 'bg-purple-100 text-purple-800' 
                              : line.billType === 'cash'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}>
                            {line.billType}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="text-sm font-semibold text-gray-900">
                            {formatAmount(line.revenue, line.currency)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1.5">
                            {line.revenueCash !== undefined && line.revenueCash > 0 && (
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                <span className="text-xs text-gray-600">
                                  Cash: <span className="font-medium text-gray-900">{formatAmount(line.revenueCash, line.currency)}</span>
                                </span>
                              </div>
                            )}
                            {line.revenueCard !== undefined && line.revenueCard > 0 && (
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                <span className="text-xs text-gray-600">
                                  Card: <span className="font-medium text-gray-900">{formatAmount(line.revenueCard, line.currency)}</span>
                                </span>
                              </div>
                            )}
                            {line.revenueCredit !== undefined && line.revenueCredit > 0 && (
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                                <span className="text-xs text-gray-600">
                                  Credit: <span className="font-medium text-gray-900">{formatAmount(line.revenueCredit, line.currency)}</span>
                                </span>
                              </div>
                            )}
                            {(!line.revenueCash || line.revenueCash === 0) && 
                             (!line.revenueCard || line.revenueCard === 0) && 
                             (!line.revenueCredit || line.revenueCredit === 0) && (
                              <span className="text-xs text-gray-400">No breakdown</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="text-sm text-gray-900">
                            {formatAmount(line.cogs, line.currency)}
                          </span>
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-right font-semibold ${
                          line.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          <div className="flex items-center justify-end gap-1">
                            {line.grossProfit >= 0 ? (
                              <TrendingUp className="w-4 h-4" />
                            ) : (
                              <TrendingDown className="w-4 h-4" />
                            )}
                            <span>
                              {formatAmount(line.grossProfit, line.currency)}
                            </span>
                          </div>
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-right font-semibold ${
                          line.grossProfitMargin >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          <div className="flex items-center justify-end gap-1">
                            {line.grossProfitMargin >= 0 ? (
                              <TrendingUp className="w-4 h-4" />
                            ) : (
                              <TrendingDown className="w-4 h-4" />
                            )}
                            <span>
                              {line.grossProfitMargin >= 0 ? '+' : ''}{line.grossProfitMargin.toFixed(2)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Footer */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, sortedLines.length)} of {sortedLines.length} bills
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    First
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600 px-3 min-w-[100px] text-center">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
        );
      })()}
    </div>
  );
}

