import { getDB } from '../lib/db';
import { CurrencyService } from './currencyService';
import type { BillPLData } from '../types/profitLoss';
import type { inventory_bills, InventoryItem, BillLineItem, Bill } from '../types';

/**
 * Profit & Loss Service
 * 
 * Calculates and stores P&L data for inventory bills when they are closed.
 * 
 * Important Terminology:
 * - Purchase Type (billType): commission/cash/credit - how inventory was acquired from supplier
 * - Sale Payment Method (paymentMethod): cash/card/credit - how customers paid for sales
 */
export class ProfitLossService {
  private static instance: ProfitLossService;

  public static getInstance(): ProfitLossService {
    if (!ProfitLossService.instance) {
      ProfitLossService.instance = new ProfitLossService();
    }
    return ProfitLossService.instance;
  }

  /**
   * Validate commission revenue calculation
   * Ensures revenue for commission bills equals commission amount, not total sales
   */
  private validateCommissionRevenue(
    billType: string,
    revenue: number,
    totalSales: number,
    commissionRate: number
  ): boolean {
    if (billType !== 'commission') {
      return true; // Validation only applies to commission bills
    }

    // For commission bills, revenue should be approximately (totalSales * commissionRate) / 100
    // Allow 1% tolerance for rounding errors
    const expectedRevenue = (totalSales * commissionRate) / 100;
    const tolerance = Math.max(expectedRevenue * 0.01, 0.01);
    const isWithinTolerance = Math.abs(revenue - expectedRevenue) <= tolerance;

    // Also check that revenue is not suspiciously close to total sales
    // Revenue should be significantly less than total sales for commission bills
    const isNotTotalSales = revenue < totalSales * 0.5; // Revenue should be less than 50% of total sales

    return isWithinTolerance && isNotTotalSales;
  }

  /**
   * Calculate P&L for a bill
   * Called when bill is closed
   */
  public async calculateBillPL(billId: string): Promise<BillPLData> {
    try {
      // Get the inventory bill
      const bill = await getDB().inventory_bills.get(billId);
      if (!bill) {
        throw new Error(`Inventory bill not found: ${billId}`);
      }

      // Get all inventory items for this bill (via batch_id)
      const inventoryItems = await getDB().inventory_items
        .where('batch_id')
        .equals(billId)
        .toArray();

      // Get bill currency (default to USD if not set)
      const billCurrency = bill.currency || 'USD';

      if (inventoryItems.length === 0) {
        // Return zero values if no items
        return {
          currency: billCurrency,
          revenue: 0,
          revenueCash: 0,
          revenueCard: 0,
          revenueCredit: 0,
          cogs: 0,
          grossProfit: 0,
          grossProfitMargin: 0,
        };
      }

      // Get all bill_line_items linked to these inventory items
      const inventoryItemIds = inventoryItems.map(item => item.id);
      const billLineItems = await getDB().bill_line_items
        .where('inventory_item_id')
        .anyOf(inventoryItemIds)
        .toArray();

      // Get all bills linked to these bill_line_items to determine payment_method
      const billIds = [...new Set(billLineItems.map(item => item.bill_id))];
      const bills = await getDB().bills
        .where('id')
        .anyOf(billIds)
        .toArray();

      // Create a map for quick lookup
      const billMap = new Map<string, Bill>(bills.map(b => [b.id, b]));

      // Calculate total sales value (sum of line_total)
      const totalSales = billLineItems.reduce((sum, item) => sum + (item.line_total || 0), 0);

      // Calculate revenue based on purchase type
      let revenue = 0;
      if (bill.type === 'commission') {
        // Commission bills: Revenue = commission only (NOT total sales)
        const commissionRate = bill.commission_rate;
        
        // Commission rate is REQUIRED for commission bills
        if (commissionRate === null || commissionRate === undefined || commissionRate <= 0 || commissionRate > 100) {
          const errorMsg = `Commission bill ${billId} has invalid or missing commission_rate (${commissionRate}). Commission rate must be between 1-100%.`;
          console.error(`❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        revenue = (totalSales * commissionRate) / 100;
        
        // Additional safety check: revenue should NEVER equal totalSales for commission bills
        // (unless commission rate is exactly 100%, which is invalid per check above)
        if (Math.abs(revenue - totalSales) < 0.01) {
          const errorMsg = `Commission bill ${billId}: Calculated revenue (${revenue.toFixed(2)}) equals total sales (${totalSales.toFixed(2)}). This indicates commission_rate may be incorrectly set to 100% or revenue calculation is wrong.`;
          console.error(`❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        // Validate that revenue is commission amount, not total sales
        if (!this.validateCommissionRevenue(bill.type, revenue, totalSales, commissionRate)) {
          const errorMsg = `Commission revenue validation failed for bill ${billId}: revenue=${revenue.toFixed(2)}, totalSales=${totalSales.toFixed(2)}, commissionRate=${commissionRate}%. Revenue appears to equal total sales instead of commission amount.`;
          console.error(`❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        console.log(`✅ Commission bill ${billId}: Total sales=${totalSales.toFixed(2)}, Commission rate=${commissionRate}%, Revenue=${revenue.toFixed(2)}`);
      } else {
        // Cash/Credit bills: Revenue = total sales value
        revenue = totalSales;
      }

      // Calculate revenue breakdown by sale payment method
      let revenueCash = 0;
      let revenueCard = 0;
      let revenueCredit = 0;

      for (const lineItem of billLineItems) {
        const parentBill = billMap.get(lineItem.bill_id);
        if (!parentBill) continue;

        const paymentMethod = parentBill.payment_method || 'cash';
        const lineTotal = lineItem.line_total || 0;

        if (bill.type === 'commission') {
          // For commission bills, breakdown is based on commission portion of each sale
          const commissionRate = bill.commission_rate || 0;
          const commissionFromSale = (lineTotal * commissionRate) / 100;
          
          if (paymentMethod === 'cash') {
            revenueCash += commissionFromSale;
          } else if (paymentMethod === 'card') {
            revenueCard += commissionFromSale;
          } else if (paymentMethod === 'credit') {
            revenueCredit += commissionFromSale;
          }
        } else {
          // For cash/credit bills, breakdown is the full line_total
          if (paymentMethod === 'cash') {
            revenueCash += lineTotal;
          } else if (paymentMethod === 'card') {
            revenueCard += lineTotal;
          } else if (paymentMethod === 'credit') {
            revenueCredit += lineTotal;
          }
        }
      }

      // Calculate COGS based on purchase type
      let cogs = 0;
      if (bill.type === 'commission') {
        // Commission bills: COGS = 0 (goods not owned, fees recoverable)
        cogs = 0;
      } else {
        // Cash/Credit bills: COGS = sum(inventory_item.price × sold_quantity) + fees
        let inventoryCost = 0;
        for (const inventoryItem of inventoryItems) {
          // Get sold quantity for this inventory item
          const soldQuantity = billLineItems
            .filter(item => item.inventory_item_id === inventoryItem.id)
            .reduce((sum, item) => sum + (item.quantity || 0), 0);

          // Calculate cost: price × sold_quantity
          const itemPrice = inventoryItem.price || 0;
          inventoryCost += itemPrice * soldQuantity;
        }

        // Add fees
        const porterageFee = bill.porterage_fee || 0;
        const transferFee = bill.transfer_fee || 0;
        const plasticFee = bill.plastic_fee ? parseFloat(String(bill.plastic_fee)) : 0;
        const fees = porterageFee + transferFee + plasticFee;

        cogs = inventoryCost + fees;
      }

      // Calculate gross profit
      const grossProfit = revenue - cogs;

      // Calculate gross profit margin (handle division by zero)
      const grossProfitMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

      return {
        currency: billCurrency,
        revenue,
        revenueCash,
        revenueCard,
        revenueCredit,
        cogs,
        grossProfit,
        grossProfitMargin,
      };
    } catch (error) {
      console.error('Error calculating bill P&L:', error);
      throw error;
    }
  }

  /**
   * Store calculated P&L values in inventory_bills
   * Called from bill closure handler
   */
  public async storeBillPL(billId: string, plData: BillPLData): Promise<void> {
    try {
      const bill = await getDB().inventory_bills.get(billId);
      if (!bill) {
        throw new Error(`Inventory bill not found: ${billId}`);
      }

      // Only store if bill is being closed (status = 'CLOSED' or contains '[CLOSED]')
      // Prevent overwriting if values already exist (immutability)
      const isClosed = bill.status === 'CLOSED' || bill.status?.toUpperCase() === 'CLOSED' || bill.status?.includes('[CLOSED]');
      const hasPLValues = bill.total_revenue !== undefined && bill.total_revenue !== null;
      
      if (isClosed && !hasPLValues) {
        await getDB().inventory_bills.update(billId, {
          total_revenue: plData.revenue,
          revenue_cash: plData.revenueCash,
          revenue_card: plData.revenueCard,
          revenue_credit: plData.revenueCredit,
          total_cogs: plData.cogs,
          gross_profit: plData.grossProfit,
          gross_profit_margin: plData.grossProfitMargin,
          _synced: false,
        });
        console.log(`✅ P&L values stored for bill ${billId}: Revenue=${plData.revenue}, COGS=${plData.cogs}, Profit=${plData.grossProfit}`);
      } else if (hasPLValues) {
        console.warn(`P&L values already exist for bill ${billId}, skipping update (immutability)`);
      } else if (!isClosed) {
        console.warn(`Bill ${billId} is not closed (status: ${bill.status}), skipping P&L storage`);
      }
    } catch (error) {
      console.error('Error storing bill P&L:', error);
      throw error;
    }
  }

  /**
   * Recalculate and store P&L for a closed bill that's missing P&L data
   * Useful for fixing bills that were closed before P&L calculation was implemented
   */
  public async recalculateBillPL(billId: string): Promise<void> {
    try {
      const bill = await getDB().inventory_bills.get(billId);
      if (!bill) {
        throw new Error(`Inventory bill not found: ${billId}`);
      }

      const statusUpper = bill.status?.toUpperCase() || '';
      const isClosed = statusUpper === 'CLOSED' || statusUpper.includes('[CLOSED]');
      
      if (!isClosed) {
        throw new Error(`Bill ${billId} is not closed. Cannot recalculate P&L for open bills.`);
      }

      if (!bill.closed_at) {
        throw new Error(`Bill ${billId} is closed but missing closed_at timestamp.`);
      }

      // Calculate P&L
      const plData = await this.calculateBillPL(billId);
      
      // Store P&L values (force update even if values exist)
      await getDB().inventory_bills.update(billId, {
        total_revenue: plData.revenue,
        revenue_cash: plData.revenueCash,
        revenue_card: plData.revenueCard,
        revenue_credit: plData.revenueCredit,
        total_cogs: plData.cogs,
        gross_profit: plData.grossProfit,
        gross_profit_margin: plData.grossProfitMargin,
        _synced: false,
      });
      
      console.log(`✅ Recalculated and stored P&L for bill ${billId}: Revenue=${plData.revenue}, COGS=${plData.cogs}, Profit=${plData.grossProfit}`);
    } catch (error) {
      console.error(`Error recalculating P&L for bill ${billId}:`, error);
      throw error;
    }
  }

  /**
   * Generate P&L report using stored values
   * Only queries closed bills with stored P&L values
   */
  public async generatePLReport(filters: {
    storeId: string;
    branchId?: string;
    startDate: string;
    endDate: string;
    billTypes?: ('commission' | 'cash' | 'credit')[];
    productCategories?: string[];
    paymentMethods?: ('cash' | 'card' | 'credit')[];
  }): Promise<{
    totalRevenue: number;
    totalCOGS: number;
    totalGrossProfit: number;
    averageGrossProfitMargin: number;
    billCount: number;
    lines: Array<{
      billId: string;
      billType: 'commission' | 'cash' | 'credit';
      closedAt: string;
      revenue: number;
      revenueCash?: number;
      revenueCard?: number;
      revenueCredit?: number;
      cogs: number;
      grossProfit: number;
      grossProfitMargin: number;
    }>;
  }> {
    try {
      // Only query closed bills with stored P&L values
      let allBills: inventory_bills[];
      
      if (filters.branchId) {
        // Filter by both store_id and branch_id
        allBills = await getDB().inventory_bills
          .where('[store_id+branch_id]')
          .equals([filters.storeId, filters.branchId])
          .toArray();
      } else {
        // Filter by store_id only
        allBills = await getDB().inventory_bills
          .where('store_id')
          .equals(filters.storeId)
          .toArray();
      }

      // Filter closed bills
      let closedBills = allBills.filter(bill => {
        const statusUpper = bill.status?.toUpperCase() || '';
        const isClosed = statusUpper === 'CLOSED' || statusUpper.includes('[CLOSED]');
        return isClosed && !!bill.closed_at;
      });
      
      console.log(`📊 P&L Report: Found ${closedBills.length} closed bills out of ${allBills.length} total bills`);
      
      // Auto-recalculate P&L for closed bills missing P&L data
      const closedWithoutPL = closedBills.filter(bill => {
        const hasPLData = bill.total_revenue !== undefined && bill.total_revenue !== null;
        return !hasPLData;
      });
      
      if (closedWithoutPL.length > 0) {
        console.log(`🔄 Found ${closedWithoutPL.length} closed bills without P&L data. Recalculating...`);
        // Recalculate and store P&L for these bills
        for (const bill of closedWithoutPL) {
          try {
            const plData = await this.calculateBillPL(bill.id);
            // Force store (bill is already closed)
            await getDB().inventory_bills.update(bill.id, {
              total_revenue: plData.revenue,
              revenue_cash: plData.revenueCash,
              revenue_card: plData.revenueCard,
              revenue_credit: plData.revenueCredit,
              total_cogs: plData.cogs,
              gross_profit: plData.grossProfit,
              gross_profit_margin: plData.grossProfitMargin,
              _synced: false,
            });
            console.log(`✅ Recalculated P&L for bill ${bill.id}`);
            
            // Update the bill object in closedBills array
            bill.total_revenue = plData.revenue;
            bill.revenue_cash = plData.revenueCash;
            bill.revenue_card = plData.revenueCard;
            bill.revenue_credit = plData.revenueCredit;
            bill.total_cogs = plData.cogs;
            bill.gross_profit = plData.grossProfit;
            bill.gross_profit_margin = plData.grossProfitMargin;
          } catch (error) {
            console.error(`❌ Failed to recalculate P&L for bill ${bill.id}:`, error);
          }
        }
      }
      
      // Now filter to only bills with P&L data (after recalculation)
      closedBills = closedBills.filter(bill => {
        const hasPLData = bill.total_revenue !== undefined && bill.total_revenue !== null;
        return hasPLData;
      });
      
      console.log(`📊 After recalculation: ${closedBills.length} closed bills with P&L data`);

      // Filter by date range (using closed_at)
      const startDate = new Date(filters.startDate);
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999); // Include entire end date

      closedBills = closedBills.filter(bill => {
        if (!bill.closed_at) return false;
        const closedAt = new Date(bill.closed_at);
        return closedAt >= startDate && closedAt <= endDate;
      });

      // Filter by purchase type (billType)
      if (filters.billTypes && filters.billTypes.length > 0) {
        closedBills = closedBills.filter(bill => filters.billTypes!.includes(bill.type as 'commission' | 'cash' | 'credit'));
      }

      // Filter by sale payment method (paymentMethod)
      // This requires checking if revenue from that payment method > 0
      if (filters.paymentMethods && filters.paymentMethods.length > 0) {
        closedBills = closedBills.filter(bill => {
          if (filters.paymentMethods!.includes('cash') && (bill.revenue_cash || 0) > 0) return true;
          if (filters.paymentMethods!.includes('card') && (bill.revenue_card || 0) > 0) return true;
          if (filters.paymentMethods!.includes('credit') && (bill.revenue_credit || 0) > 0) return true;
          return false;
        });
      }

      // Filter by product category (requires joining with inventory_items and products)
      if (filters.productCategories && filters.productCategories.length > 0) {
        const billIds = closedBills.map(b => b.id);
        const inventoryItems = await getDB().inventory_items
          .where('batch_id')
          .anyOf(billIds)
          .toArray();

        const productIds = [...new Set(inventoryItems.map(item => item.product_id))];
        const products = await getDB().products
          .where('id')
          .anyOf(productIds)
          .toArray();

        const productMap = new Map(products.map(p => [p.id, p]));
        const categoryBillIds = new Set<string>();

        for (const item of inventoryItems) {
          const product = productMap.get(item.product_id);
          if (product && filters.productCategories!.includes(product.category || '')) {
            if (item.batch_id) {
              categoryBillIds.add(item.batch_id);
            }
          }
        }

        closedBills = closedBills.filter(bill => categoryBillIds.has(bill.id));
      }

      // For commission bills, ALWAYS recalculate revenue from total sales and commission rate
      // This ensures we never show total sales as revenue for commission bills
      const commissionBills = closedBills.filter(bill => bill.type === 'commission');
      const totalSalesMap = new Map<string, number>();
      const commissionRatesMap = new Map<string, number>();
      
      if (commissionBills.length > 0) {
        // Batch query all inventory items for commission bills
        const commissionBillIds = commissionBills.map(b => b.id);
        const allInventoryItems = await getDB().inventory_items
          .where('batch_id')
          .anyOf(commissionBillIds)
          .toArray();
        
        // Group inventory items by batch_id
        const inventoryItemsByBatch = new Map<string, typeof allInventoryItems>();
        for (const item of allInventoryItems) {
          if (item.batch_id) {
            if (!inventoryItemsByBatch.has(item.batch_id)) {
              inventoryItemsByBatch.set(item.batch_id, []);
            }
            inventoryItemsByBatch.get(item.batch_id)!.push(item);
          }
        }
        
        // Batch query all bill line items
        const allInventoryItemIds = allInventoryItems.map(item => item.id);
        const allBillLineItems = allInventoryItemIds.length > 0
          ? await getDB().bill_line_items
              .where('inventory_item_id')
              .anyOf(allInventoryItemIds)
              .toArray()
          : [];
        
        // Calculate total sales for each commission bill
        for (const billId of commissionBillIds) {
          const inventoryItems = inventoryItemsByBatch.get(billId) || [];
          const inventoryItemIds = inventoryItems.map(item => item.id);
          const billLineItems = allBillLineItems.filter(item => inventoryItemIds.includes(item.inventory_item_id));
          const totalSales = billLineItems.reduce((sum, item) => sum + (item.line_total || 0), 0);
          totalSalesMap.set(billId, totalSales);
        }
        
        // Store commission rates
        for (const bill of commissionBills) {
          // Use stored rate, or default to 10% if missing
          const rate = bill.commission_rate ?? 10;
          commissionRatesMap.set(bill.id, rate);
        }
      }

      // Build report lines - ALWAYS recalculate commission bill revenue
      const lines = closedBills.map(bill => {
        let revenue = bill.total_revenue || 0;
        let revenueCash = bill.revenue_cash;
        let revenueCard = bill.revenue_card;
        let revenueCredit = bill.revenue_credit;
        
        // For commission bills: ALWAYS calculate revenue as (total_sales * commission_rate / 100)
        // This ensures we never show total sales as revenue
        if (bill.type === 'commission') {
          const totalSales = totalSalesMap.get(bill.id) || 0;
          const commissionRate = commissionRatesMap.get(bill.id) || bill.commission_rate || 10;
          
          // ALWAYS use calculated commission revenue, regardless of stored value
          const calculatedRevenue = totalSales > 0 ? (totalSales * commissionRate) / 100 : 0;
          
          // Log if stored revenue differs significantly from calculated
          if (Math.abs(revenue - calculatedRevenue) > 0.01) {
            console.log(`🔄 Commission bill ${bill.id}: Stored revenue ($${revenue.toFixed(2)}) → Calculated revenue ($${calculatedRevenue.toFixed(2)}) [Total sales: $${totalSales.toFixed(2)}, Rate: ${commissionRate}%]`);
          }
          
          revenue = calculatedRevenue;
          
          // Also recalculate revenue breakdown
          // If stored breakdown doesn't match, scale it proportionally
          const storedBreakdownTotal = (bill.revenue_cash || 0) + (bill.revenue_card || 0) + (bill.revenue_credit || 0);
          if (storedBreakdownTotal > 0 && Math.abs(storedBreakdownTotal - calculatedRevenue) > 0.01) {
            const scaleFactor = calculatedRevenue / storedBreakdownTotal;
            revenueCash = (bill.revenue_cash || 0) * scaleFactor;
            revenueCard = (bill.revenue_card || 0) * scaleFactor;
            revenueCredit = (bill.revenue_credit || 0) * scaleFactor;
          } else if (storedBreakdownTotal === 0 && calculatedRevenue > 0) {
            // No breakdown stored, assume all cash
            revenueCash = calculatedRevenue;
            revenueCard = 0;
            revenueCredit = 0;
          }
        }
        
        // COGS for commission bills is always 0
        const cogs = bill.type === 'commission' ? 0 : (bill.total_cogs || 0);
        const grossProfit = revenue - cogs;
        const grossProfitMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
        
        // Get the bill's original currency (default to USD if not set)
        const billCurrency = bill.currency || 'USD';
        
        return {
          billId: bill.id,
          billType: bill.type as 'commission' | 'cash' | 'credit',
          currency: billCurrency as 'USD' | 'LBP',
          closedAt: bill.closed_at!,
          revenue: revenue,
          revenueCash: revenueCash || undefined,
          revenueCard: revenueCard || undefined,
          revenueCredit: revenueCredit || undefined,
          cogs: cogs,
          grossProfit: grossProfit,
          grossProfitMargin: grossProfitMargin,
        };
      });

      // Calculate aggregates
      const totalRevenue = lines.reduce((sum, line) => sum + line.revenue, 0);
      const totalCOGS = lines.reduce((sum, line) => sum + line.cogs, 0);
      const totalGrossProfit = lines.reduce((sum, line) => sum + line.grossProfit, 0);
      const averageGrossProfitMargin =
        lines.length > 0
          ? lines.reduce((sum, line) => sum + line.grossProfitMargin, 0) / lines.length
          : 0;

      return {
        totalRevenue,
        totalCOGS,
        totalGrossProfit,
        averageGrossProfitMargin,
        billCount: lines.length,
        lines,
      };
    } catch (error) {
      console.error('Error generating P&L report:', error);
      throw error;
    }
  }
}

export const profitLossService = ProfitLossService.getInstance();

