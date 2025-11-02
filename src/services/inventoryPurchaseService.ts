import { createId, db } from '../lib/db';
import { cashDrawerUpdateService } from './cashDrawerUpdateService';
import { generateCreditReference } from '../utils/referenceGenerator';

export interface InventoryPurchaseItem {
  product_id: string;
  quantity: number;
  unit: string;
  weight?: number;
  price?: number;
  selling_price?: number;
}

export interface InventoryPurchaseData {
  supplier_id: string;
  type: 'cash' | 'credit' | 'commission';
  items: InventoryPurchaseItem[];
  porterage_fee?: number;
  transfer_fee?: number;
  plastic_fee?: number;
  commission_rate?: number;
  created_by: string;
  store_id: string;
  status?: string;
}

export interface PurchaseTransactionResult {
  success: boolean;
  transactionId?: string;
  totalAmount: number;
  cashDrawerImpact?: number;
  supplierBalanceImpact?: number;
  fees: {
    porterage: number;
    transfer: number;
    plastic: number;
    total: number;
  };
  items: Array<{
    product_id: string;
    quantity: number;
    unit: string;
    weight?: number;
    price?: number;
    selling_price?: number;
    totalValue: number;
  }>;
}

export class InventoryPurchaseService {
  private static instance: InventoryPurchaseService;

  public static getInstance(): InventoryPurchaseService {
    if (!InventoryPurchaseService.instance) {
      InventoryPurchaseService.instance = new InventoryPurchaseService();
    }
    return InventoryPurchaseService.instance;
  }

  /**
   * Process inventory purchase based on type (cash, credit, commission)
   */
  public async processInventoryPurchase(data: InventoryPurchaseData): Promise<PurchaseTransactionResult> {
    try {
      // Calculate item values and total amount
      const { items, totalAmount, fees } = this.calculatePurchaseAmounts(data);

      // Handle different purchase types
      switch (data.type) {
        case 'cash':
          return await this.processCashPurchase(data, items, totalAmount, fees);
        case 'credit':
          return await this.processCreditPurchase(data, items, totalAmount, fees);
        case 'commission':
          return await this.processCommissionPurchase(data, items, fees);
        default:
          throw new Error(`Unsupported purchase type: ${data.type}`);
      }
    } catch (error) {
      console.error('Error processing inventory purchase:', error);
      throw error;
    }
  }

  /**
   * Calculate item values and fees for the purchase
   */
  private calculatePurchaseAmounts(data: InventoryPurchaseData) {
    const items = data.items.map(item => {
      // Calculate item value: weight * price or quantity * price (if no weight)
      const itemValue = item.weight && item.price 
        ? item.weight * item.price 
        : item.quantity * (item.price || 0);
      
      return {
        ...item,
        totalValue: itemValue
      };
    });

    const itemsTotal = items.reduce((sum, item) => sum + item.totalValue, 0);
    
    const fees = {
      porterage: data.porterage_fee || 0,
      transfer: data.transfer_fee || 0,
      plastic: data.plastic_fee || 0,
      total: (data.porterage_fee || 0) + (data.transfer_fee || 0) + (data.plastic_fee || 0)
    };

    const totalAmount = itemsTotal + fees.total;

    return { items, totalAmount, fees };
  }

  /**
   * Process cash purchase - deduct from cash drawer
   */
  private async processCashPurchase(
    data: InventoryPurchaseData, 
    items: any[], 
    totalAmount: number, 
    fees: any
  ): Promise<PurchaseTransactionResult> {
    const transactionId = createId();
    
    try {
      // For cash purchases, always use "Trade" as supplier
      await this.getOrCreateTradeSupplier(data.store_id);
      
      // Update cash drawer with the total amount (deduct)
      await cashDrawerUpdateService.updateCashDrawerForExpense({
        amount: totalAmount,
        currency: 'USD',
        storeId: data.store_id,
        createdBy: data.created_by,
        description: `Cash purchase - ${items.length} items from Trade`,
        category: 'Inventory Purchase',
        allowAutoSessionOpen: true
      });

      // Transaction will be created by cashDrawerUpdateService

      return {
        success: true,
        transactionId,
        totalAmount,
        cashDrawerImpact: -totalAmount, // Negative because we're deducting
        fees,
        items
      };
    } catch (error) {
      console.error('Error processing cash purchase:', error);
      throw new Error(`Failed to process cash purchase: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process credit purchase - add to supplier balance, deduct fees from cash drawer, record transaction
   */
  private async processCreditPurchase(
    data: InventoryPurchaseData, 
    items: any[], 
    totalAmount: number, 
    fees: any
  ): Promise<PurchaseTransactionResult> {
    const transactionId = createId();
    
    try {
      // Add total amount to supplier balance (we owe them)
      const supplier = await db.suppliers.get(data.supplier_id);
      if (supplier) {
        const currentBalance = supplier.lb_balance || 0;
        await db.suppliers.update(data.supplier_id, {
          lb_balance: currentBalance + totalAmount,
          updated_at: new Date().toISOString(),
          _synced: false
        });
      }

      // Create transaction record for credit purchase (appears in account statement)
      const creditPurchaseTransaction = {
        id: transactionId,
        type: 'expense' as const,
        category: 'Credit Purchase',
        amount: totalAmount,
        currency: 'LBP' as const,
        description: `Credit purchase - ${items.length} items from ${supplier?.name || 'Supplier'}`,
        reference: generateCreditReference(),
        store_id: data.store_id,
        created_by: data.created_by,
        created_at: new Date().toISOString(),
        supplier_id: data.supplier_id,
        customer_id: null,
        _synced: false
      };

      // Store the transaction in the database
      await db.transactions.add(creditPurchaseTransaction);

      // Deduct only fees from cash drawer (supplier not responsible for fees)
      let cashDrawerImpact = 0;
      if (fees.total > 0) {
        await cashDrawerUpdateService.updateCashDrawerForExpense({
          amount: fees.total,
          currency: 'USD',
          storeId: data.store_id,
          createdBy: data.created_by,
          description: `Fees for credit purchase from supplier`,
          category: 'Inventory Purchase Fees',
          allowAutoSessionOpen: true
        });
        cashDrawerImpact = -fees.total;
      }

      return {
        success: true,
        transactionId,
        totalAmount,
        cashDrawerImpact,
        supplierBalanceImpact: totalAmount, // Positive because we owe them more
        fees,
        items
      };
    } catch (error) {
      console.error('Error processing credit purchase:', error);
      throw new Error(`Failed to process credit purchase: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process commission purchase - no immediate financial impact
   */
  private async processCommissionPurchase(
    data: InventoryPurchaseData, 
    items: any[], 
    fees: any
  ): Promise<PurchaseTransactionResult> {
    const transactionId = createId();
    
    try {
      // For commission purchases, only deduct fees from cash drawer
      let cashDrawerImpact = 0;
      if (fees.total > 0) {
        await cashDrawerUpdateService.updateCashDrawerForExpense({
          amount: fees.total,
          currency: 'USD',
          storeId: data.store_id,
          createdBy: data.created_by,
          description: `Fees for commission purchase`,
          category: 'Inventory Purchase Fees',
          allowAutoSessionOpen: true
        });
        cashDrawerImpact = -fees.total;
      }

      // Fees transaction will be created by cashDrawerUpdateService

      return {
        success: true,
        transactionId: fees.total > 0 ? transactionId : undefined,
        totalAmount: 0, // No immediate cost for commission items
        cashDrawerImpact,
        fees,
        items
      };
    } catch (error) {
      console.error('Error processing commission purchase:', error);
      throw new Error(`Failed to process commission purchase: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get or create the "Trade" supplier for cash purchases
   */
  private async getOrCreateTradeSupplier(storeId: string): Promise<string> {
    try {
      // Look for existing "Trade" supplier
      const existingSupplier = await db.suppliers
        .where('name')
        .equals('Trade')
        .and(s => s.store_id === storeId)
        .first();

      if (existingSupplier) {
        return existingSupplier.id;
      }

      // Create new "Trade" supplier
      const tradeSupplierId = createId();
      const tradeSupplier = {
        id: tradeSupplierId,
        name: 'Trade',
        email: '',
        phone: '',
        address: '',
        store_id: storeId,
        usd_balance: 0,
        lb_balance: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _synced: false
      };

      await db.suppliers.add(tradeSupplier);
      return tradeSupplierId;
    } catch (error) {
      console.error('Error getting/creating Trade supplier:', error);
      throw new Error('Failed to get or create Trade supplier');
    }
  }

  /**
   * Validate purchase data before processing
   */
  public validatePurchaseData(data: InventoryPurchaseData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.supplier_id) {
      errors.push('Supplier ID is required');
    }

    if (!data.items || data.items.length === 0) {
      errors.push('At least one item is required');
    }

    if (data.type === 'cash') {
      // For cash purchases, all items must have prices
      const itemsWithoutPrices = data.items.filter(item => !item.price || item.price <= 0);
      if (itemsWithoutPrices.length > 0) {
        errors.push('All items must have valid prices for cash purchases');
      }
    }

    if (data.type === 'credit') {
      // For credit purchases, we need a valid supplier
      if (!data.supplier_id || data.supplier_id === '') {
        errors.push('Valid supplier is required for credit purchases');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export const inventoryPurchaseService = InventoryPurchaseService.getInstance();
