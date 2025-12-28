---
name: Profit Loss Implementation
overview: Implement a comprehensive Profit & Loss (P&L) reporting system that calculates gross profit for each bill based on bill type (commission, cash, credit), with filtering by branch, date range (daily/monthly/yearly), product category, and payment method (cash vs credit).
todos:
  - id: create-pl-types
    content: Create profit loss type definitions in apps/store-app/src/types/profitLoss.ts
    status: pending
  - id: update-db-schema
    content: Add P&L fields (total_revenue, revenue_cash, revenue_card, revenue_credit, total_cogs, gross_profit, gross_profit_margin) to inventory_bills table schema in types/index.ts and db.ts
    status: pending
    dependencies:
      - create-pl-types
  - id: create-pl-service
    content: Create profitLossService.ts with calculateBillPL (called at closure), storeBillPL, and generatePLReport (uses stored values) methods
    status: pending
    dependencies:
      - update-db-schema
  - id: integrate-bill-closure
    content: Integrate P&L calculation into handleCloseReceivedBill in Accounting.tsx to calculate and store P&L when bill is closed
    status: pending
    dependencies:
      - create-pl-service
  - id: create-pl-hook
    content: Create useProfitLoss.ts React hook for fetching and filtering P&L data (only from closed bills with stored values)
    status: pending
    dependencies:
      - integrate-bill-closure
  - id: create-pl-component
    content: Create ProfitLossReport.tsx component with filters, summary cards, and data table
    status: pending
    dependencies:
      - create-pl-hook
  - id: integrate-reports-page
    content: Implement profit report case in Reports.tsx page (reportType === 'profit')
    status: pending
    dependencies:
      - create-pl-component
  - id: add-currency-handling
    content: Integrate currency service for USD/LBP conversions in P&L calculations
    status: pending
    dependencies:
      - create-pl-service
  - id: test-bill-types
    content: Test P&L calculations for all three bill types (commission, cash, credit) at bill closure and verify values are stored correctly
    status: pending
    dependencies:
      - integrate-bill-closure
  - id: add-export-functionality
    content: Add CSV/Excel export functionality to ProfitLossReport component
    status: pending
    dependencies:
      - create-pl-component
---

# P

rofit & Loss (P&L) Implementation Plan

## Overview

Implement a comprehensive P&L reporting system that calculates gross profit for each bill **when the bill is closed** (not on every sale). P&L values are stored in the `inventory_bills` table and remain immutable once calculated. Reports use stored values, not recalculated values.

## Architecture

### Data Flow

```javascript
inventory_bills (type: commission/cash/credit)
  └─> inventory_items (batch_id, price, type)
       └─> bill_line_items (inventory_item_id, line_total)
            └─> bills (payment_method, bill_date, branch_id)
```



### Key Calculations (Performed at Bill Closure)

1. **Revenue**: Sum of `line_total` from `bill_line_items` for all sold items in the bill
2. **COGS (Cost of Goods Sold)**: 

- **Commission bills**: Fees only (porterage + transfer + plastic fees)
- **Cash/Credit bills**: Item cost (price × sold_quantity) + fees

3. **Gross Profit**: Revenue - COGS
4. **Gross Profit Margin**: (Gross Profit / Revenue) × 100

### Storage Strategy

- P&L values are calculated **once** when `handleCloseReceivedBill` is called
- Values are stored in `inventory_bills` table as new fields:
- `total_revenue` (number): Total revenue from all sales
- `total_cogs` (number): Total cost of goods sold
- `gross_profit` (number): Revenue - COGS
- `gross_profit_margin` (number): Profit margin percentage
- Once stored, these values are **immutable** and used for all reports
- Only closed bills (`status = 'CLOSED'` and `closed_at IS NOT NULL`) have P&L values

## Implementation Steps

### Phase 1: Database Schema Update

**Update `inventory_bills` table** to store P&L values:Add new fields to `apps/store-app/src/types/index.ts`:

- `total_revenue?: number | null` - Total revenue from all sales
- `revenue_cash?: number | null` - Revenue from cash sales
- `revenue_card?: number | null` - Revenue from card sales
- `revenue_credit?: number | null` - Revenue from credit sales
- `total_cogs?: number | null` - Total cost of goods sold  
- `gross_profit?: number | null` - Gross profit (revenue - COGS)
- `gross_profit_margin?: number | null` - Profit margin percentage

**Migration**: Add these fields to IndexedDB schema in `apps/store-app/src/lib/db.ts`

### Phase 2: Core P&L Service (`profitLossService.ts`)

Create `apps/store-app/src/services/profitLossService.ts` with:

1. **Bill P&L Calculator** (Called at bill closure)

- `calculateBillPL(billId)`: Calculate and return P&L for a bill
- Get all inventory items for the bill (via `batch_id`)
- Get all sales (bill_line_items) linked to those inventory items
- Calculate revenue: Sum of `line_total` from all sales
- Calculate revenue breakdown by payment method:
    - Get `bills` linked to `bill_line_items` to determine payment_method
    - Group revenue by payment_method (cash, card, credit)
- Calculate COGS based on bill type:
    - Commission: fees only (porterage + transfer + plastic)
    - Cash/Credit: sum of (inventory_item.price × sold_quantity) + fees
- Calculate gross profit and margin
- Returns: `{ revenue, revenueCash, revenueCard, revenueCredit, cogs, grossProfit, grossProfitMargin }`

2. **P&L Storage** (Called from bill closure handler)

- `storeBillPL(billId, plData)`: Store calculated P&L values in `inventory_bills`
- Updates: `total_revenue`, `revenue_cash`, `revenue_card`, `revenue_credit`, `total_cogs`, `gross_profit`, `gross_profit_margin`
- Only stores if bill is being closed (status = 'CLOSED')
- Prevents overwriting if values already exist (immutability)

3. **P&L Report Generator** (Uses stored values)

- `generatePLReport(filters)`: Main report generation method
- **Only queries closed bills** (`status = 'CLOSED'` and `closed_at IS NOT NULL`)
- **Uses stored P&L values** from `inventory_bills` table (no recalculation)
- Filters: `branchId`, `startDate`, `endDate`, `billType[]`, `productCategory[]`, `paymentMethod[]`
- Payment method filter: Filter bills where revenue from that payment method > 0 (e.g., show bills with credit sales)
- Date filtering uses `closed_at` timestamp (when bill was closed)
- Returns: Aggregated P&L data with breakdowns

4. **Aggregation Methods**

- `aggregateByBillType()`: Group by commission/cash/credit (purchase type)
- `aggregateByProductCategory()`: Group by product category (from products table)
- `aggregateByPaymentMethod()`: Group by sales payment method (cash/card/credit) using stored revenue breakdown
- `aggregateByDateRange()`: Daily/monthly/yearly breakdowns based on `closed_at`

### Phase 3: Integration with Bill Closure

**Modify `apps/store-app/src/pages/Accounting.tsx`** - `handleCloseReceivedBill` function:

1. After calculating fees (lines 804-903), call P&L calculation:
   ```typescript
      const plData = await profitLossService.calculateBillPL(targetBatchId);
      await profitLossService.storeBillPL(targetBatchId, plData);
   ```




2. Store P&L values along with commission_amount and closed_at:
   ```typescript
      await handleUpdateBatch(targetBatchId, { 
        status: closedStatus,
        commission_amount: fees.commission,
        closed_at: new Date().toISOString(),
        total_revenue: plData.revenue,
        revenue_cash: plData.revenueCash,
        revenue_card: plData.revenueCard,
        revenue_credit: plData.revenueCredit,
        total_cogs: plData.cogs,
        gross_profit: plData.grossProfit,
        gross_profit_margin: plData.grossProfitMargin
      });
   ```


**Important**: Ensure P&L is only calculated once when bill is closed, never recalculated.

### Phase 4: Data Models & Types

Create `apps/store-app/src/types/profitLoss.ts`:

```typescript
export interface PLReportFilters {
  storeId: string;
  branchId?: string;
  startDate: string;
  endDate: string;
  billTypes?: ('commission' | 'cash' | 'credit')[];
  productCategories?: string[];
  paymentMethods?: ('cash' | 'card' | 'credit')[];
  groupBy?: 'bill' | 'product' | 'category' | 'date';
}

export interface PLReportLine {
  billId: string;
  billNumber?: string;
  billType: 'commission' | 'cash' | 'credit';
  closedAt: string; // When bill was closed (used for date filtering)
  receivedAt: string; // When bill was received
  revenue: number; // From stored total_revenue
  revenueCash?: number; // From stored revenue_cash
  revenueCard?: number; // From stored revenue_card
  revenueCredit?: number; // From stored revenue_credit
  cogs: number; // From stored total_cogs
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
    byBillType: Record<string, PLReportSummary>;
    byProductCategory: Record<string, PLReportSummary>;
    byPaymentMethod: Record<string, PLReportSummary>; // Grouped by sales payment method (cash/card/credit)
    byDateRange: Record<string, PLReportSummary>;
  };
}
```



### Phase 5: UI Components

1. **ProfitLossReport Component** (`apps/store-app/src/components/reports/ProfitLossReport.tsx`)

- Filter controls (branch, date range, bill type, product category, sales payment method)
- Show revenue breakdown by payment method (cash/card/credit) for each bill
- Date range presets (Today, This Week, This Month, This Year, Custom)
- Summary cards (Total Revenue, Total COGS, Gross Profit, Margin %)
- Data table with sortable columns
- Export functionality (CSV/Excel)

2. **Update Reports Page** (`apps/store-app/src/pages/Reports.tsx`)

- Implement the missing `reportType === 'profit'` case
- Integrate `ProfitLossReport` component

3. **P&L Dashboard Widget** (Optional)

- Add to Accounting dashboard
- Show key metrics (Gross Profit, Margin %)
- Quick date range selector

### Phase 6: Integration Points

1. **Link Inventory Items to Bills**

- Ensure `bill_line_items.inventory_item_id` properly links to `inventory_items`
- Verify `inventory_items.batch_id` links to `inventory_bills`
- Handle edge cases (deleted items, missing links)

2. **Cost Calculation Logic** (At bill closure)

- Commission bills: Use fees from `inventory_bills` (porterage + transfer + plastic)
- Cash/Credit bills: Use `inventory_items.price` × sold_quantity + fees
- Handle currency conversions (USD/LBP) using existing `currencyService`
- Calculate based on actual sold quantities (not received quantities)

3. **Date Range Handling**

- Daily: Group by `closed_at` date (when bill was closed)
- Monthly: Group by year-month of `closed_at`
- Yearly: Group by year of `closed_at`
- Filter bills where `closed_at` is within date range

### Phase 7: Performance Optimization

1. **IndexedDB Queries**

- Use compound indexes for common queries
- Cache frequently accessed data
- Batch queries where possible

2. **Lazy Loading**

- Load summary first, details on demand
- Paginate large result sets
- Virtual scrolling for tables

## Existing Code to Leverage

1. **Bill Type Logic**: `apps/store-app/src/services/inventoryPurchaseService.ts`

- Already handles commission/cash/credit types
- Fee calculation logic exists

2. **Profit Calculation**: `apps/store-app/src/components/accountingPage/tabs/receivedBills/ReceivedBillSalesLogsModal.tsx` (lines 200-214)

- Has basic profit calculation per bill
- Can be extracted and enhanced

3. **Currency Service**: `apps/store-app/src/services/currencyService.ts`

- Use for currency conversions

4. **Reporting Service**: `apps/store-app/src/services/reportingService.ts`

- Can extend with P&L methods
- Or create separate service for clarity

## Files to Create/Modify

### New Files

- `apps/store-app/src/services/profitLossService.ts` - Core P&L calculation service
- `apps/store-app/src/types/profitLoss.ts` - Type definitions
- `apps/store-app/src/components/reports/ProfitLossReport.tsx` - Main UI component
- `apps/store-app/src/hooks/useProfitLoss.ts` - React hook for P&L data

### Files to Modify

- `apps/store-app/src/pages/Reports.tsx` - Add profit report implementation
- `apps/store-app/src/services/reportingService.ts` - Optionally add P&L methods

## Testing Considerations

1. **Unit Tests**: Test P&L calculation for each bill type at closure
2. **Integration Tests**: Test bill closure flow with P&L calculation and storage
3. **Report Tests**: Test report generation using stored values with various filters
4. **Edge Cases**: 

- Missing inventory items
- Deleted bills
- Zero-cost items
- Negative profit scenarios