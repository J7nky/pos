/**
 * Profit & Loss (P&L) Type Definitions
 * 
 * Important Terminology:
 * - Purchase Type (billType): commission/cash/credit - how inventory was acquired from supplier
 * - Sale Payment Method (paymentMethod): cash/card/credit - how customers paid for sales
 * - These are separate concepts and should not be confused in the implementation
 */

export interface PLReportFilters {
  storeId: string;
  branchId?: string;
  startDate: string;
  endDate: string;
  billTypes?: ('commission' | 'cash' | 'credit')[]; // Purchase type: how inventory was acquired
  productCategories?: string[];
  paymentMethods?: ('cash' | 'card' | 'credit')[]; // Sale payment method: how customers paid for sales
  groupBy?: 'bill' | 'product' | 'category' | 'date';
}

export interface PLReportLine {
  billId: string;
  billNumber?: string;
  billType: 'commission' | 'cash' | 'credit'; // Purchase type
  currency: 'USD' | 'LBP'; // Original currency of the bill
  closedAt: string; // When bill was closed (used for date filtering)
  receivedAt: string; // When bill was received
  revenue: number; // From stored total_revenue (in bill's original currency)
  revenueCash?: number; // From stored revenue_cash (sale payment method: cash)
  revenueCard?: number; // From stored revenue_card (sale payment method: card)
  revenueCredit?: number; // From stored revenue_credit (sale payment method: credit)
  cogs: number; // From stored total_cogs (0 for commission bills)
  grossProfit: number; // From stored gross_profit
  grossProfitMargin: number; // From stored gross_profit_margin
  productCategory?: string; // From products table
  supplierName?: string;
}

export interface PLReportSummary {
  totalRevenue: number;
  totalCOGS: number;
  totalGrossProfit: number;
  averageGrossProfitMargin: number;
  billCount: number;
  lines: PLReportLine[];
  breakdowns: {
    byBillType: Record<string, PLReportSummary>; // Grouped by purchase type
    byProductCategory: Record<string, PLReportSummary>;
    byPaymentMethod: Record<string, PLReportSummary>; // Grouped by sale payment method (cash/card/credit)
    byDateRange: Record<string, PLReportSummary>;
  };
}

export interface BillPLData {
  currency: 'USD' | 'LBP'; // Original currency of the bill
  revenue: number;
  revenueCash: number;
  revenueCard: number;
  revenueCredit: number;
  cogs: number;
  grossProfit: number;
  grossProfitMargin: number;
}

