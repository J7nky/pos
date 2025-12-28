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

      if (inventoryItems.length === 0) {
        // Return zero values if no items
        return {
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
        // Commission bills: Revenue = commission only
        const commissionRate = bill.commission_rate || 0;
        revenue = (totalSales * commissionRate) / 100;
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

      // Only store if bill is being closed (status = 'CLOSED')
      // Prevent overwriting if values already exist (immutability)
      if (bill.status === 'CLOSED' && bill.total_revenue === undefined) {
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
      } else if (bill.total_revenue !== undefined) {
        console.warn(`P&L values already exist for bill ${billId}, skipping update (immutability)`);
      }
    } catch (error) {
      console.error('Error storing bill P&L:', error);
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

      // Filter closed bills with P&L data
      let closedBills = allBills.filter(
        bill =>
          (bill.status === 'CLOSED' || bill.status?.includes('[CLOSED]')) &&
          bill.closed_at &&
          bill.total_revenue !== undefined &&
          bill.total_revenue !== null
      );

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

      // Build report lines
      const lines = closedBills.map(bill => ({
        billId: bill.id,
        billType: bill.type as 'commission' | 'cash' | 'credit',
        closedAt: bill.closed_at!,
        revenue: bill.total_revenue || 0,
        revenueCash: bill.revenue_cash || undefined,
        revenueCard: bill.revenue_card || undefined,
        revenueCredit: bill.revenue_credit || undefined,
        cogs: bill.total_cogs || 0,
        grossProfit: bill.gross_profit || 0,
        grossProfitMargin: bill.gross_profit_margin || 0,
      }));

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

