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
    
    console.log(`[CASH_PURCHASE] Starting cash purchase processing:`, {
      transactionId,
      storeId: data.store_id,
      branchId: data.branch_id,
      totalAmount,
      fees,
      itemsCount: items.length,
      createdBy: data.created_by
    });
    
    try {
      // For cash purchases, always use "Trade" as supplier
      console.log(`[CASH_PURCHASE] Getting/creating Trade supplier for store: ${data.store_id}`);
      const tradeSupplierId = await this.getOrCreateTradeSupplier(data.store_id);
      console.log(`[CASH_PURCHASE] ✅ Trade supplier ID: ${tradeSupplierId}`);
      
      // Verify session is open
      console.log(`[CASH_PURCHASE] Verifying cash drawer session:`, {
        storeId: data.store_id,
        branchId: data.branch_id,
        allowAutoOpen: true
      });
      
      const session = await cashDrawerUpdateService.verifySessionOpen(
        data.store_id,
        data.branch_id,
        true, // allowAutoOpen
        data.created_by,
        'expense'
      );

      if (!session) {
        console.error(`[CASH_PURCHASE] ❌ No active cash drawer session found`);
        throw new Error('No active cash drawer session');
      }
      
      console.log(`[CASH_PURCHASE] ✅ Cash drawer session verified:`, {
        sessionId: session.id,
        status: session.status
      });

      // Create cash drawer expense transaction atomically
      console.log(`[CASH_PURCHASE] Creating cash drawer expense transaction:`, {
        amount: totalAmount,
        currency: 'USD',
        reference: `INV-PURCH-${transactionId.substring(0, 8)}`
      });
      
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

      console.log(`[CASH_PURCHASE] Transaction service result:`, {
        success: result.success,
        transactionId: result.transactionId,
        cashDrawerImpact: result.cashDrawerImpact,
        error: result.error
      });

      if (!result.success) {
        console.error(`[CASH_PURCHASE] ❌ Transaction creation failed:`, result.error);
        throw new Error(result.error || 'Failed to update cash drawer');
      }

      // Verify journal entries were created
      if (result.transactionId) {
        const { getDB } = await import('../lib/db');
        const journalEntries = await getDB().journal_entries
          .where('transaction_id')
          .equals(result.transactionId)
          .toArray();
        
        console.log(`[CASH_PURCHASE] Journal entries created:`, {
          transactionId: result.transactionId,
          entryCount: journalEntries.length,
          entries: journalEntries.map(e => ({
            account_code: e.account_code,
            debit: e.debit,
            credit: e.credit,
            currency: e.currency,
            is_posted: e.is_posted
          }))
        });
        
        // Check for cash account entries (1100)
        const cashEntries = journalEntries.filter(e => e.account_code === '1100');
        if (cashEntries.length === 0) {
          console.warn(`[CASH_PURCHASE] ⚠️ No cash account (1100) journal entries found!`);
        } else {
          console.log(`[CASH_PURCHASE] ✅ Cash account entries found:`, cashEntries.length);
        }
      }

      // Notify UI of cash drawer update
      if (result.cashDrawerImpact) {
        console.log(`[CASH_PURCHASE] Notifying UI of cash drawer update:`, {
          newBalance: result.cashDrawerImpact.newBalance,
          previousBalance: result.cashDrawerImpact.previousBalance,
          balanceChange: result.cashDrawerImpact.newBalance - result.cashDrawerImpact.previousBalance
        });
        
        cashDrawerUpdateService.notifyCashDrawerUpdate(
          data.store_id,
          result.cashDrawerImpact.newBalance,
          result.transactionId || ''
        );
      } else {
        console.warn(`[CASH_PURCHASE] ⚠️ No cash drawer impact returned from transaction service`);
      }

      console.log(`[CASH_PURCHASE] ✅ Cash purchase processed successfully`);
      
      return {
        success: true,
        transactionId: result.transactionId || transactionId,
        totalAmount,
        cashDrawerImpact: -totalAmount, // Negative because we're deducting
        fees,
        items
      };
    } catch (error) {
      console.error(`[CASH_PURCHASE] ❌ Error processing cash purchase:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        transactionId,
        totalAmount,
        storeId: data.store_id,
        branchId: data.branch_id
      });
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
    console.log(`[TRADE_SUPPLIER] Getting/creating Trade supplier for store: ${storeId}`);
    
    try {
      // Look for existing "Trade" supplier entity
      const existingSupplier = await getDB().entities
        .where('[store_id+entity_type]')
        .equals([storeId, 'supplier'])
        .filter(e => e.name === 'Trade' && !e._deleted)
        .first();

      if (existingSupplier) {
        console.log(`[TRADE_SUPPLIER] ✅ Found existing Trade supplier: ${existingSupplier.id}`);
        return existingSupplier.id;
      }

      // Create new "Trade" supplier entity
      console.log(`[TRADE_SUPPLIER] Creating new Trade supplier entity`);
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
        // Note: lb_balance and usd_balance are not in Supabase schema - balances are calculated from journal entries
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
      console.log(`[TRADE_SUPPLIER] ✅ Created new Trade supplier: ${tradeSupplierId}`, {
        entityCode: tradeSupplier.entity_code,
        storeId: tradeSupplier.store_id
      });
      
      return tradeSupplierId;
    } catch (error) {
      console.error(`[TRADE_SUPPLIER] ❌ Error getting/creating Trade supplier:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        storeId
      });
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
