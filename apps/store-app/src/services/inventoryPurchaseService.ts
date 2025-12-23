import { createId, getDB } from '../lib/db';
import { cashDrawerUpdateService } from './cashDrawerUpdateService';
import { TransactionService } from './transactionService';

const transactionService = TransactionService.getInstance();

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
  branch_id: string; // NEW: Branch context required
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
      
      // Verify session is open
      const session = await cashDrawerUpdateService.verifySessionOpen(
        data.store_id,
        data.branch_id,
        true, // allowAutoOpen
        data.created_by,
        'expense'
      );

      if (!session) {
        throw new Error('No active cash drawer session');
      }

      // Create cash drawer expense transaction atomically
      const result = await transactionService.createCashDrawerExpense(
        totalAmount,
        'USD',
        `Cash purchase - ${items.length} items from Trade`,
        {
          userId: data.created_by,
          storeId: data.store_id,
          branchId: data.branch_id,
          module: 'inventory_purchase',
          source: 'web'
        },
        {
          reference: `INV-PURCH-${transactionId.substring(0, 8)}`,
          category: 'Inventory Purchase'
        }
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to update cash drawer');
      }

      // Notify UI of cash drawer update
      if (result.cashDrawerImpact) {
        cashDrawerUpdateService.notifyCashDrawerUpdate(
          data.store_id,
          result.cashDrawerImpact.newBalance,
          result.transactionId || ''
        );
      }

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
      // Get supplier entity (transactionService will handle balance update)
      const supplierEntity = await getDB().entities.get(data.supplier_id);
      const supplierName = supplierEntity?.name || 'Supplier';

      // Create transaction record for credit purchase using transactionService
      // Note: transactionService.createSupplierPayment() now handles entity balance updates
      const creditPurchaseResult = await transactionService.createSupplierPayment(
        data.supplier_id,
        totalAmount,
        'LBP',
        `Credit purchase - ${items.length} items from ${supplierName}`,
        {
          userId: data.created_by,
          module: 'inventory_purchase',
          storeId: data.store_id,
          source: 'web',
          branchId: data.branch_id
        },
        {
          updateCashDrawer: false // Only fees affect cash drawer, handled separately below
        }
      );

      // Deduct only fees from cash drawer (supplier not responsible for fees)
      let cashDrawerImpact = 0;
      if (fees.total > 0) {
        // Verify session is open
        const session = await cashDrawerUpdateService.verifySessionOpen(
          data.store_id,
          data.branch_id,
          true, // allowAutoOpen
          data.created_by,
          'expense'
        );

        if (session) {
          const feeResult = await transactionService.createCashDrawerExpense(
            fees.total,
            'USD',
            `Fees for credit purchase from supplier`,
            {
              userId: data.created_by,
              storeId: data.store_id,
              branchId: data.branch_id,
              module: 'inventory_purchase',
              source: 'web'
            },
            {
              category: 'Inventory Purchase Fees'
            }
          );

          if (feeResult.success && feeResult.cashDrawerImpact) {
            cashDrawerImpact = -fees.total;
            cashDrawerUpdateService.notifyCashDrawerUpdate(
              data.store_id,
              feeResult.cashDrawerImpact.newBalance,
              feeResult.transactionId || ''
            );
          }
        }
      }

      return {
        success: true,
        transactionId: creditPurchaseResult.transactionId || transactionId,
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
        // Verify session is open
        const session = await cashDrawerUpdateService.verifySessionOpen(
          data.store_id,
          data.branch_id,
          true, // allowAutoOpen
          data.created_by,
          'expense'
        );

        if (session) {
          const feeResult = await transactionService.createCashDrawerExpense(
            fees.total,
            'USD',
            `Fees for commission purchase`,
            {
              userId: data.created_by,
              storeId: data.store_id,
              branchId: data.branch_id,
              module: 'inventory_purchase',
              source: 'web'
            },
            {
              category: 'Inventory Purchase Fees'
            }
          );

          if (feeResult.success && feeResult.cashDrawerImpact) {
            cashDrawerImpact = -fees.total;
            cashDrawerUpdateService.notifyCashDrawerUpdate(
              data.store_id,
              feeResult.cashDrawerImpact.newBalance,
              feeResult.transactionId || ''
            );
          }
        }
      }

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
   * Get or create the "Trade" supplier entity for cash purchases
   */
  public async getOrCreateTradeSupplier(storeId: string): Promise<string> {
    try {
      // Look for existing "Trade" supplier entity
      const existingSupplier = await getDB().entities
        .where('[store_id+entity_type]')
        .equals([storeId, 'supplier'])
        .filter(e => e.name === 'Trade' && !e._deleted)
        .first();

      if (existingSupplier) {
        return existingSupplier.id;
      }

      // Create new "Trade" supplier entity
      const tradeSupplierId = createId();
      const now = new Date().toISOString();
      const tradeSupplier = {
        id: tradeSupplierId,
        store_id: storeId,
        branch_id: null,
        entity_type: 'supplier' as const,
        entity_code: `SUPP-TRADE-${tradeSupplierId.slice(0, 8).toUpperCase()}`,
        name: 'Trade',
        phone: null,
        lb_balance: 0,
        usd_balance: 0,
        is_system_entity: false,
        is_active: true,
        customer_data: null,
        supplier_data: {
          type: 'cash',
          advance_lb_balance: 0,
          advance_usd_balance: 0
        },
        created_at: now,
        updated_at: now,
        _synced: false,
        _deleted: false
      };

      await getDB().entities.add(tradeSupplier);
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
