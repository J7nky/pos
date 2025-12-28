import { useState, useEffect, useCallback } from 'react';
import { profitLossService } from '../services/profitLossService';
import type { PLReportFilters, PLReportSummary } from '../types/profitLoss';

export interface UseProfitLossResult {
  data: PLReportSummary | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * React hook for fetching and filtering P&L data
 * Only fetches from closed bills with stored P&L values
 */
export function useProfitLoss(filters: PLReportFilters): UseProfitLossResult {
  const [data, setData] = useState<PLReportSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await profitLossService.generatePLReport(filters);

      // Build full PLReportSummary with breakdowns
      const summary: PLReportSummary = {
        totalRevenue: result.totalRevenue,
        totalCOGS: result.totalCOGS,
        totalGrossProfit: result.totalGrossProfit,
        averageGrossProfitMargin: result.averageGrossProfitMargin,
        billCount: result.billCount,
        lines: result.lines,
        breakdowns: {
          byBillType: {},
          byProductCategory: {},
          byPaymentMethod: {},
          byDateRange: {},
        },
      };

      // Aggregate by bill type (purchase type)
      for (const line of result.lines) {
        const billType = line.billType;
        if (!summary.breakdowns.byBillType[billType]) {
          summary.breakdowns.byBillType[billType] = {
            totalRevenue: 0,
            totalCOGS: 0,
            totalGrossProfit: 0,
            averageGrossProfitMargin: 0,
            billCount: 0,
            lines: [],
            breakdowns: {
              byBillType: {},
              byProductCategory: {},
              byPaymentMethod: {},
              byDateRange: {},
            },
          };
        }
        const breakdown = summary.breakdowns.byBillType[billType];
        breakdown.totalRevenue += line.revenue;
        breakdown.totalCOGS += line.cogs;
        breakdown.totalGrossProfit += line.grossProfit;
        breakdown.billCount += 1;
        breakdown.lines.push(line);
      }

      // Calculate average margins for breakdowns
      for (const billType in summary.breakdowns.byBillType) {
        const breakdown = summary.breakdowns.byBillType[billType];
        breakdown.averageGrossProfitMargin =
          breakdown.billCount > 0
            ? breakdown.lines.reduce((sum, line) => sum + line.grossProfitMargin, 0) /
              breakdown.billCount
            : 0;
      }

      // Aggregate by sale payment method
      for (const line of result.lines) {
        if (line.revenueCash && line.revenueCash > 0) {
          if (!summary.breakdowns.byPaymentMethod['cash']) {
            summary.breakdowns.byPaymentMethod['cash'] = {
              totalRevenue: 0,
              totalCOGS: 0,
              totalGrossProfit: 0,
              averageGrossProfitMargin: 0,
              billCount: 0,
              lines: [],
              breakdowns: {
                byBillType: {},
                byProductCategory: {},
                byPaymentMethod: {},
                byDateRange: {},
              },
            };
          }
          const breakdown = summary.breakdowns.byPaymentMethod['cash'];
          breakdown.totalRevenue += line.revenueCash;
          breakdown.billCount += 1;
          breakdown.lines.push(line);
        }
        if (line.revenueCard && line.revenueCard > 0) {
          if (!summary.breakdowns.byPaymentMethod['card']) {
            summary.breakdowns.byPaymentMethod['card'] = {
              totalRevenue: 0,
              totalCOGS: 0,
              totalGrossProfit: 0,
              averageGrossProfitMargin: 0,
              billCount: 0,
              lines: [],
              breakdowns: {
                byBillType: {},
                byProductCategory: {},
                byPaymentMethod: {},
                byDateRange: {},
              },
            };
          }
          const breakdown = summary.breakdowns.byPaymentMethod['card'];
          breakdown.totalRevenue += line.revenueCard;
          breakdown.billCount += 1;
          breakdown.lines.push(line);
        }
        if (line.revenueCredit && line.revenueCredit > 0) {
          if (!summary.breakdowns.byPaymentMethod['credit']) {
            summary.breakdowns.byPaymentMethod['credit'] = {
              totalRevenue: 0,
              totalCOGS: 0,
              totalGrossProfit: 0,
              averageGrossProfitMargin: 0,
              billCount: 0,
              lines: [],
              breakdowns: {
                byBillType: {},
                byProductCategory: {},
                byPaymentMethod: {},
                byDateRange: {},
              },
            };
          }
          const breakdown = summary.breakdowns.byPaymentMethod['credit'];
          breakdown.totalRevenue += line.revenueCredit;
          breakdown.billCount += 1;
          breakdown.lines.push(line);
        }
      }

      // Aggregate by date range (daily)
      for (const line of result.lines) {
        const date = new Date(line.closedAt).toISOString().split('T')[0];
        if (!summary.breakdowns.byDateRange[date]) {
          summary.breakdowns.byDateRange[date] = {
            totalRevenue: 0,
            totalCOGS: 0,
            totalGrossProfit: 0,
            averageGrossProfitMargin: 0,
            billCount: 0,
            lines: [],
            breakdowns: {
              byBillType: {},
              byProductCategory: {},
              byPaymentMethod: {},
              byDateRange: {},
            },
          };
        }
        const breakdown = summary.breakdowns.byDateRange[date];
        breakdown.totalRevenue += line.revenue;
        breakdown.totalCOGS += line.cogs;
        breakdown.totalGrossProfit += line.grossProfit;
        breakdown.billCount += 1;
        breakdown.lines.push(line);
      }

      // Calculate average margins for date breakdowns
      for (const date in summary.breakdowns.byDateRange) {
        const breakdown = summary.breakdowns.byDateRange[date];
        breakdown.averageGrossProfitMargin =
          breakdown.billCount > 0
            ? breakdown.lines.reduce((sum, line) => sum + line.grossProfitMargin, 0) /
              breakdown.billCount
            : 0;
      }

      setData(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch P&L data');
      console.error('Error fetching P&L data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [
    filters.storeId,
    filters.branchId,
    filters.startDate,
    filters.endDate,
    filters.billTypes?.join(','),
    filters.productCategories?.join(','),
    filters.paymentMethods?.join(','),
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    error,
    refresh,
  };
}

