import { createId, getDB } from '../lib/db';
import { getTodayLocalDate } from '../utils/dateUtils';
import { cashDrawerUpdateService } from './cashDrawerUpdateService';
import { TransactionService } from './transactionService';
import { currencyService } from './currencyService';
import { journalService } from './journalService';
import { accountingInitService } from './accountingInitService';
import { TRANSACTION_CATEGORIES } from '../constants/transactionCategories';
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
  currency: 'USD' | 'LBP';
  items: InventoryPurchaseItem[];
  porterage_fee?: number;
  transfer_fee?: number;
  plastic_fee?: number;
  commission_rate?: number;
  created_by: string;
  store_id: string;
  branch_id: string; // NEW: Branch context required
  status?: string;
  batch_id?: string; // Batch ID for linking transactions to inventory bills
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
      // Calculate item values, fees, and separate itemsTotal
      const { items, fees, itemsTotal } = this.calculatePurchaseAmounts(data);

      // Handle different purchase types
      switch (data.type) {
        case 'cash':
          return await this.processCashPurchase(data, items, itemsTotal, fees);
        case 'credit':
          return await this.processCreditPurchase(data, items, itemsTotal, fees);
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

    return { items, totalAmount, fees, itemsTotal };
  }

  /**
   * Create journal entries for fees (porterage, transfer, plastic)
   * Each fee type gets its own transaction if > 0
   * 
   * @param fees - Fee amounts object
   * @param currency - Currency for fees
   * @param billType - Type of bill (commission, cash, credit)
   * @param supplierId - Supplier ID (for commission bills)
   * @param storeId - Store ID
   * @param branchId - Branch ID
   * @param createdBy - User ID who created the bill
   * @returns Array of transaction IDs for fee transactions
   */
  private async createFeeJournalEntries(
    fees: { porterage: number; transfer: number; plastic: number; total: number },
    currency: 'USD' | 'LBP',
    billType: 'cash' | 'credit' | 'commission',
    supplierId: string | null,
    storeId: string,
    branchId: string,
    createdBy: string
  ): Promise<string[]> {
    const transactionIds: string[] = [];

    // Note: Don't check session here - let transactionService.createTransaction handle it
    // transactionService will auto-open session if needed (for CASH_DRAWER_EXPENSE category)
    const context = {
      userId: createdBy,
      storeId,
      branchId,
      module: 'inventory_purchase',
      source: 'web' as const
    };

    // Create separate transactions for each fee type
    const feeTypes = [
      { name: 'porterage', amount: fees.porterage, label: 'Porterage' },
      { name: 'transfer', amount: fees.transfer, label: 'Transfer' },
      { name: 'plastic', amount: fees.plastic, label: 'Plastic' }
    ];

    // Create fee transactions sequentially to avoid Dexie transaction conflicts
    // Each transaction creates its own Dexie transaction, so we need to ensure
    // each completes fully before starting the next one
    for (const feeType of feeTypes) {
      if (feeType.amount > 0) {
        try {
          let result;

          // Add a delay between transactions to ensure each completes fully
          // This prevents "Transaction committed too early" errors in Dexie
          // when multiple transactions are created in quick succession
          if (transactionIds.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }

          if (billType === 'commission' && supplierId) {
            // Commission fees: Use supplier entity
            console.log(`[FEES] Creating commission fee transaction for ${feeType.label}:`, {
              amount: feeType.amount,
              currency,
              supplierId,
              billType
            });

            result = await transactionService.createTransaction({
              category: TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE,
              amount: feeType.amount,
              currency,
              description: `Fees for commission purchase - ${feeType.label}`,
              context,
              supplierId, // Will be used as entityId
              updateCashDrawer: true,
              reference: `FEE-${feeType.name.toUpperCase()}-${createId().substring(0, 8)}`
            });
          } else {
            // Cash/Credit fees: Use internal entity (default)
            console.log(`[FEES] Creating ${billType} fee transaction for ${feeType.label}:`, {
              amount: feeType.amount,
              currency,
              billType
            });

            result = await transactionService.createCashDrawerExpense(
              feeType.amount,
              currency,
              `Fees for ${billType} purchase - ${feeType.label}`,
              context,
              {
                category: 'Inventory Purchase Fees',
                reference: `FEE-${feeType.name.toUpperCase()}-${createId().substring(0, 8)}`
              }
            );
          }

          if (result.success && result.transactionId) {
            transactionIds.push(result.transactionId);
            console.log(`[FEES] ✅ Fee transaction created for ${feeType.label}:`, {
              transactionId: result.transactionId,
              amount: feeType.amount,
              currency,
              billType,
              cashDrawerImpact: result.cashDrawerImpact
            });

            // Notify UI of cash drawer update (outside transaction scope)
            // Use setTimeout to ensure transaction has fully committed
            if (result.cashDrawerImpact) {
              setTimeout(() => {
                console.log(`[FEES] Updating cash drawer for ${feeType.label}:`, {
                  previousBalance: result.cashDrawerImpact.previousBalance,
                  newBalance: result.cashDrawerImpact.newBalance,
                  balanceChange: result.cashDrawerImpact.newBalance - result.cashDrawerImpact.previousBalance
                });
                cashDrawerUpdateService.notifyCashDrawerUpdate(
                  storeId,
                  result.cashDrawerImpact.newBalance,
                  result.transactionId
                );
              }, 50);
            } else {
              console.warn(`[FEES] ⚠️ No cash drawer impact returned for ${feeType.label} (billType: ${billType})`);
            }
          } else {
            console.error(`[FEES] ❌ Failed to create fee transaction for ${feeType.label}:`, result.error);
            throw new Error(result.error || `Failed to create fee transaction for ${feeType.label}`);
          }
        } catch (error) {
          console.error(`[FEES] ❌ Error creating fee transaction for ${feeType.label}:`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            feeType: feeType.name,
            amount: feeType.amount
          });
          // Re-throw to fail the entire operation if fee creation fails
          throw error;
        }
      }
    }

    return transactionIds;
  }

  /**
   * Process cash purchase - deduct from cash drawer
   * Separates inventory cost from fees - both deduct from cash drawer
   */
  private async processCashPurchase(
    data: InventoryPurchaseData,
    items: any[],
    itemsTotal: number,
    fees: any
  ): Promise<PurchaseTransactionResult> {
    const transactionId = createId();

    console.log(`[CASH_PURCHASE] Starting cash purchase processing:`, {
      transactionId,
      storeId: data.store_id,
      branchId: data.branch_id,
      itemsTotal,
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

      // Create inventory cash purchase transaction for items only (excluding fees)
      // This creates journal entries: Debit Inventory (1300), Credit Cash (1100)
      console.log(`[CASH_PURCHASE] Creating inventory cash purchase transaction (items only):`, {
        amount: itemsTotal,
        currency: data.currency,
        reference: `INV-PURCH-${transactionId.substring(0, 8)}`
      });

      const inventoryResult = await transactionService.createInventoryCashPurchase(
        itemsTotal,
        data.currency,
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
          metadata: data.batch_id ? { batch_id: data.batch_id } : undefined
        }
      );

      console.log(`[CASH_PURCHASE] Inventory transaction result:`, {
        success: inventoryResult.success,
        transactionId: inventoryResult.transactionId,
        cashDrawerImpact: inventoryResult.cashDrawerImpact,
        error: inventoryResult.error
      });

      if (!inventoryResult.success) {
        console.error(`[CASH_PURCHASE] ❌ Inventory transaction creation failed:`, inventoryResult.error);
        throw new Error(inventoryResult.error || 'Failed to create inventory transaction');
      }

      // Verify journal entries were created with correct accounts
      if (inventoryResult.transactionId) {
        const { getDB } = await import('../lib/db');
        const journalEntries = await getDB().journal_entries
          .where('transaction_id')
          .equals(inventoryResult.transactionId)
          .toArray();

        console.log(`[CASH_PURCHASE] Inventory journal entries created:`, {
          transactionId: inventoryResult.transactionId,
          entryCount: journalEntries.length,
          entries: journalEntries.map(e => ({
            account_code: e.account_code,
            account_name: e.account_name,
            debit_usd: e.debit_usd,
            credit_usd: e.credit_usd,
            debit_lbp: e.debit_lbp,
            credit_lbp: e.credit_lbp,
            is_posted: e.is_posted
          }))
        });

        // Verify correct accounts: Inventory (1300) and Cash (1100)
        const inventoryEntries = journalEntries.filter(e => e.account_code === '1300');
        const cashEntries = journalEntries.filter(e => e.account_code === '1100');

        if (journalEntries.length === 0) {
          console.error(`[CASH_PURCHASE] ❌ CRITICAL: No journal entries found for transaction ${inventoryResult.transactionId}`);
          throw new Error('Journal entries were not created for cash purchase transaction');
        }

        if (inventoryEntries.length === 0) {
          console.error(`[CASH_PURCHASE] ❌ CRITICAL: No inventory account (1300) journal entries found!`);
          throw new Error('Inventory journal entries were not created correctly');
        }

        if (cashEntries.length === 0) {
          console.error(`[CASH_PURCHASE] ❌ CRITICAL: No cash account (1100) journal entries found!`);
          throw new Error('Cash journal entries were not created correctly');
        }

        console.log(`[CASH_PURCHASE] ✅ Inventory journal entries verified:`, {
          inventoryEntries: inventoryEntries.length,
          cashEntries: cashEntries.length,
          totalEntries: journalEntries.length
        });

        // Update journal entries to include bill_id (batch_id) if available
        if (data.batch_id) {
          for (const entry of journalEntries) {
            await getDB().journal_entries.update(entry.id, {
              bill_id: data.batch_id,
              _synced: false
            });
          }
          console.log(`[CASH_PURCHASE] ✅ Updated journal entries with bill_id: ${data.batch_id}`);
        }
      } else {
        console.error(`[CASH_PURCHASE] ❌ CRITICAL: No transaction ID returned from transaction service`);
        throw new Error('Inventory transaction was not created successfully');
      }

      // Create separate fee journal entries (with internal entity)
      let feeTransactionIds: string[] = [];
      let totalCashDrawerImpact = inventoryResult.cashDrawerImpact?.newBalance || 0;

      if (fees.total > 0) {
        console.log(`[CASH_PURCHASE] Creating fee journal entries:`, {
          fees,
          currency: data.currency
        });

        feeTransactionIds = await this.createFeeJournalEntries(
          fees,
          data.currency,
          'cash',
          null, // No supplier for cash purchase fees
          data.store_id,
          data.branch_id,
          data.created_by
        );

        // Get final cash drawer balance after fees
        if (feeTransactionIds.length > 0) {
          const balances = await cashDrawerUpdateService.getCurrentCashDrawerBalances(
            data.store_id,
            data.branch_id
          );
          const finalBalance = data.currency === 'USD' ? balances.USD : balances.LBP;
          totalCashDrawerImpact = finalBalance;
        }
      }

      // Notify UI of cash drawer update
      if (inventoryResult.cashDrawerImpact) {
        console.log(`[CASH_PURCHASE] Notifying UI of cash drawer update:`, {
          newBalance: totalCashDrawerImpact,
          previousBalance: inventoryResult.cashDrawerImpact.previousBalance,
          balanceChange: totalCashDrawerImpact - inventoryResult.cashDrawerImpact.previousBalance
        });

        cashDrawerUpdateService.notifyCashDrawerUpdate(
          data.store_id,
          totalCashDrawerImpact,
          inventoryResult.transactionId || ''
        );
      }

      const totalAmount = itemsTotal + fees.total;
      console.log(`[CASH_PURCHASE] ✅ Cash purchase processed successfully`);

      return {
        success: true,
        transactionId: inventoryResult.transactionId || transactionId,
        totalAmount,
        cashDrawerImpact: -(itemsTotal + fees.total), // Negative because we're deducting both
        fees,
        items
      };
    } catch (error) {
      console.error(`[CASH_PURCHASE] ❌ Error processing cash purchase:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        transactionId,
        itemsTotal,
        fees,
        storeId: data.store_id,
        branchId: data.branch_id
      });
      throw new Error(`Failed to process cash purchase: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process credit purchase - add to supplier balance, deduct fees from cash drawer
   * Inventory cost increases accounts payable (no cash impact)
   * Fees are our expense and deduct from cash drawer
   */
  private async processCreditPurchase(
    data: InventoryPurchaseData,
    items: any[],
    itemsTotal: number,
    fees: any
  ): Promise<PurchaseTransactionResult> {
    const transactionId = createId();

    console.log(`[CREDIT_PURCHASE] Starting credit purchase processing:`, {
      transactionId,
      storeId: data.store_id,
      branchId: data.branch_id,
      itemsTotal,
      fees,
      itemsCount: items.length,
      supplierId: data.supplier_id,
      createdBy: data.created_by
    });

    try {
      // Get supplier entity
      const supplierEntity = await getDB().entities.get(data.supplier_id);
      const supplierName = supplierEntity?.name || 'Supplier';

      let creditPurchaseResult: any = { success: true, transactionId: undefined };

      // Only create credit purchase transaction if itemsTotal > 0
      // If items don't have prices yet, skip the transaction (will be created when prices are added)
      if (itemsTotal > 0) {
        // Create credit purchase transaction using SUPPLIER_CREDIT_SALE
        // This creates: Debit Inventory (1300), Credit Accounts Payable (2100)
        // Does NOT affect cash drawer
        console.log(`[CREDIT_PURCHASE] Creating supplier credit purchase transaction:`, {
          amount: itemsTotal,
          currency: data.currency,
          supplierId: data.supplier_id,
          reference: `CBILL-${transactionId.substring(0, 8)}`
        });

        creditPurchaseResult = await transactionService.createSupplierCreditPurchase(
          data.supplier_id,
          itemsTotal,
          data.currency,
          `Credit purchase - ${items.length} items from ${supplierName}`,
          {
            userId: data.created_by,
            module: 'inventory_purchase',
            storeId: data.store_id,
            source: 'web',
            branchId: data.branch_id
          },
          {
            reference: `CBILL-${transactionId.substring(0, 8)}`,
            metadata: data.batch_id ? { batch_id: data.batch_id } : undefined
          }
        );

        console.log(`[CREDIT_PURCHASE] Credit purchase transaction result:`, {
          success: creditPurchaseResult.success,
          transactionId: creditPurchaseResult.transactionId,
          error: creditPurchaseResult.error
        });

        if (!creditPurchaseResult.success) {
          console.error(`[CREDIT_PURCHASE] ❌ Credit purchase transaction creation failed:`, creditPurchaseResult.error);
          throw new Error(creditPurchaseResult.error || 'Failed to create credit purchase transaction');
        }

        // Verify journal entries were created with correct accounts
        if (creditPurchaseResult.transactionId) {
          const { getDB } = await import('../lib/db');
          const journalEntries = await getDB().journal_entries
            .where('transaction_id')
            .equals(creditPurchaseResult.transactionId)
            .toArray();

          console.log(`[CREDIT_PURCHASE] Credit purchase journal entries created:`, {
            transactionId: creditPurchaseResult.transactionId,
            entryCount: journalEntries.length,
            entries: journalEntries.map(e => ({
              account_code: e.account_code,
              account_name: e.account_name,
              debit_usd: e.debit_usd,
              credit_usd: e.credit_usd,
              debit_lbp: e.debit_lbp,
              credit_lbp: e.credit_lbp,
              is_posted: e.is_posted
            }))
          });

          // Verify correct accounts: Inventory (1300) and Accounts Payable (2100)
          const inventoryEntries = journalEntries.filter(e => e.account_code === '1300');
          const apEntries = journalEntries.filter(e => e.account_code === '2100');

          if (journalEntries.length === 0) {
            console.error(`[CREDIT_PURCHASE] ❌ CRITICAL: No journal entries found for transaction ${creditPurchaseResult.transactionId}`);
            throw new Error('Journal entries were not created for credit purchase transaction');
          }

          if (inventoryEntries.length === 0) {
            console.error(`[CREDIT_PURCHASE] ❌ CRITICAL: No inventory account (1300) journal entries found!`);
            throw new Error('Inventory journal entries were not created correctly');
          }

          if (apEntries.length === 0) {
            console.error(`[CREDIT_PURCHASE] ❌ CRITICAL: No accounts payable account (2100) journal entries found!`);
            throw new Error('Accounts payable journal entries were not created correctly');
          }

          console.log(`[CREDIT_PURCHASE] ✅ Credit purchase journal entries verified:`, {
            inventoryEntries: inventoryEntries.length,
            apEntries: apEntries.length,
            totalEntries: journalEntries.length
          });

          // Update journal entries to include bill_id (batch_id) if available
          if (data.batch_id) {
            for (const entry of journalEntries) {
              await getDB().journal_entries.update(entry.id, {
                bill_id: data.batch_id,
                _synced: false
              });
            }
            console.log(`[CREDIT_PURCHASE] ✅ Updated journal entries with bill_id: ${data.batch_id}`);
          }
        }
      } else {
        console.log(`[CREDIT_PURCHASE] Skipping inventory transaction (itemsTotal = 0, items may not have prices yet)`);
      }

      // Create separate fee journal entries (with internal entity)
      // Fees deduct from cash drawer
      let feeTransactionIds: string[] = [];
      let cashDrawerImpact = 0;

      if (fees.total > 0) {
        console.log(`[CREDIT_PURCHASE] Creating fee journal entries:`, {
          fees,
          currency: data.currency
        });

        feeTransactionIds = await this.createFeeJournalEntries(
          fees,
          data.currency,
          'credit',
          null, // No supplier for credit purchase fees (our expense)
          data.store_id,
          data.branch_id,
          data.created_by
        );

        if (feeTransactionIds.length > 0) {
          cashDrawerImpact = -fees.total;

          // Get final cash drawer balance after fees
          const balances = await cashDrawerUpdateService.getCurrentCashDrawerBalances(
            data.store_id,
            data.branch_id
          );
          const finalBalance = data.currency === 'USD' ? balances.USD : balances.LBP;

          // Notify UI of cash drawer update
          cashDrawerUpdateService.notifyCashDrawerUpdate(
            data.store_id,
            finalBalance,
            feeTransactionIds[0] || ''
          );
        }
      }

      const totalAmount = itemsTotal + fees.total;
      console.log(`[CREDIT_PURCHASE] ✅ Credit purchase processed successfully`);

      return {
        success: true,
        transactionId: creditPurchaseResult.transactionId || transactionId,
        totalAmount,
        cashDrawerImpact, // Only fees affect cash drawer
        supplierBalanceImpact: itemsTotal, // Positive because we owe them more (items only, not fees)
        fees,
        items
      };
    } catch (error) {
      console.error(`[CREDIT_PURCHASE] ❌ Error processing credit purchase:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        transactionId,
        itemsTotal,
        fees,
        storeId: data.store_id,
        branchId: data.branch_id
      });
      throw new Error(`Failed to process credit purchase: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process commission purchase - no inventory cost (COGS = 0, we're acting as agent)
   * Only fees are deducted from cash drawer, recorded on supplier entity (recoverable)
   */
  private async processCommissionPurchase(
    data: InventoryPurchaseData,
    items: any[],
    fees: any
  ): Promise<PurchaseTransactionResult> {
    const transactionId = createId();

    console.log(`[COMMISSION_PURCHASE] Starting commission purchase processing:`, {
      transactionId,
      storeId: data.store_id,
      branchId: data.branch_id,
      fees,
      itemsCount: items.length,
      supplierId: data.supplier_id,
      createdBy: data.created_by
    });

    try {
      // For commission purchases:
      // - No inventory cost journal entry (COGS = 0, we're acting as agent)
      // - Only fees are deducted from cash drawer
      // - Fees are recorded on supplier entity (we'll recover them when closing bill)

      let feeTransactionIds: string[] = [];
      let cashDrawerImpact = 0;

      if (fees.total > 0) {
        console.log(`[COMMISSION_PURCHASE] Creating fee journal entries with supplier entity:`, {
          fees,
          currency: data.currency,
          supplierId: data.supplier_id
        });

        feeTransactionIds = await this.createFeeJournalEntries(
          fees,
          data.currency,
          'commission',
          data.supplier_id, // Fees are on supplier (recoverable)
          data.store_id,
          data.branch_id,
          data.created_by
        );

        if (feeTransactionIds.length > 0) {
          cashDrawerImpact = -fees.total;

          // Get final cash drawer balance after fees
          const balances = await cashDrawerUpdateService.getCurrentCashDrawerBalances(
            data.store_id,
            data.branch_id
          );
          const finalBalance = data.currency === 'USD' ? balances.USD : balances.LBP;

          // Notify UI of cash drawer update
          cashDrawerUpdateService.notifyCashDrawerUpdate(
            data.store_id,
            finalBalance,
            feeTransactionIds[0] || ''
          );
        }
      } else {
        console.log(`[COMMISSION_PURCHASE] No fees to process`);
      }

      console.log(`[COMMISSION_PURCHASE] ✅ Commission purchase processed successfully`);

      return {
        success: true,
        transactionId: feeTransactionIds.length > 0 ? feeTransactionIds[0] : undefined,
        totalAmount: 0, // No immediate cost for commission items (COGS = 0)
        cashDrawerImpact,
        fees,
        items
      };
    } catch (error) {
      console.error(`[COMMISSION_PURCHASE] ❌ Error processing commission purchase:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        transactionId,
        fees,
        supplierId: data.supplier_id,
        storeId: data.store_id,
        branchId: data.branch_id
      });
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
        .filter(e => e.name === 'Trade' && !(e as any)._deleted)
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

  /**
   * Validate cash drawer balance for cash purchases
   * NOTE: Balance validation removed - negative balances are now allowed
   * This method is kept for backward compatibility but always returns isValid: true
   */
  public async validateCashDrawerBalance(
    data: InventoryPurchaseData
  ): Promise<{ isValid: boolean; error?: string; currentBalance?: number; requiredAmount?: number; formattedBalance?: string; formattedAmount?: string }> {
    // Always return valid - negative balances are allowed
    if (data.type !== 'cash') {
      return { isValid: true };
    }

    try {
      // Calculate total amount that will be deducted (items + fees)
      const { totalAmount } = this.calculatePurchaseAmounts(data);

      // Get current cash drawer balance in the transaction currency (for informational purposes only)
      const balances = await cashDrawerUpdateService.getCurrentCashDrawerBalances(
        data.store_id,
        data.branch_id
      );
      const currentBalance = data.currency === 'USD' ? balances.USD : balances.LBP;

      // Format currency for informational purposes
      const formattedBalance = currencyService.format(currentBalance, data.currency);
      const formattedAmount = currencyService.format(totalAmount, data.currency);

      // Always return valid - negative balances are allowed
      return { isValid: true, currentBalance, requiredAmount: totalAmount, formattedBalance, formattedAmount };
    } catch (error) {
      console.error('[CASH_BALANCE_VALIDATION] Error getting cash drawer balance:', error);
      // Even on error, return valid since we're not blocking transactions
      return { isValid: true };
    }
  }

  /**
   * Find the original transaction for an inventory batch
   * Searches transactions by metadata.batch_id
   */
  public async findOriginalTransactionForBatch(
    batchId: string,
    storeId: string
  ): Promise<any | null> {
    try {
      const allTransactions = await getDB().transactions
        .where('store_id')
        .equals(storeId)
        .toArray();

      const transactions = allTransactions.filter(t =>
        !(t._deleted ?? false) &&
        (t.category === TRANSACTION_CATEGORIES.INVENTORY_CASH_PURCHASE ||
          t.category === TRANSACTION_CATEGORIES.SUPPLIER_CREDIT_SALE) &&
        t.metadata &&
        typeof t.metadata === 'object' &&
        (t.metadata as any).batch_id === batchId &&
        !(t.metadata as any).adjustment_of // Exclude adjustment transactions
      );

      // Return the first matching transaction (should be only one per batch)
      return transactions.length > 0 ? transactions[0] : null;
    } catch (error) {
      console.error('[FIND_ORIGINAL_TRANSACTION] Error finding original transaction:', error);
      return null;
    }
  }

  /**
   * Create a new adjustment transaction when inventory item price changes
   * Creates NEW transaction (immutable audit trail pattern)
   * Journal entries are automatically created by transactionService
   * 
   * @returns New transaction ID
   */
  public async createPriceAdjustmentTransaction(
    inventoryItemId: string,
    oldPrice: number | null,
    newPrice: number | null,
    batchId: string,
    originalTransactionId: string,
    currency: 'USD' | 'LBP',
    storeId: string,
    branchId: string,
    userId: string
  ): Promise<string> {
    try {
      console.log(`[PRICE_ADJUSTMENT] Creating price adjustment transaction:`, {
        inventoryItemId,
        oldPrice,
        newPrice,
        batchId,
        originalTransactionId,
        currency,
        storeId,
        branchId
      });

      // Get the inventory item and its batch
      const inventoryItem = await getDB().inventory_items.get(inventoryItemId);
      if (!inventoryItem) {
        throw new Error(`Inventory item not found: ${inventoryItemId}`);
      }

      const batch = await getDB().inventory_bills.get(batchId);
      if (!batch) {
        throw new Error(`Batch not found: ${batchId}`);
      }

      // Skip commission bills (COGS = 0, no inventory cost entries)
      if (batch.type === 'commission') {
        console.log(`[PRICE_ADJUSTMENT] Skipping commission bill (COGS = 0)`);
        return '';
      }

      // Get all inventory items in the same batch
      const batchItems = await getDB().inventory_items
        .where('batch_id')
        .equals(batchId)
        .toArray();

      // Calculate old batch total: sum of all item prices (using old price for the edited item)
      const oldBatchTotal = batchItems.reduce((total, item) => {
        const itemPrice = item.id === inventoryItemId
          ? (oldPrice ?? 0)
          : (item.price ?? 0);
        const itemValue = item.weight && itemPrice
          ? item.weight * itemPrice
          : (item.quantity || 0) * itemPrice;
        return total + itemValue;
      }, 0);

      // Calculate new batch total: sum of all item prices (using new price for the edited item)
      const newBatchTotal = batchItems.reduce((total, item) => {
        const itemPrice = item.id === inventoryItemId
          ? (newPrice ?? 0)
          : (item.price ?? 0);
        const itemValue = item.weight && itemPrice
          ? item.weight * itemPrice
          : (item.quantity || 0) * itemPrice;
        return total + itemValue;
      }, 0);

      // Calculate difference = new total - old total
      const difference = newBatchTotal - oldBatchTotal;

      console.log(`[PRICE_ADJUSTMENT] Batch totals calculated:`, {
        oldBatchTotal,
        newBatchTotal,
        difference,
        batchItemsCount: batchItems.length
      });

      // If difference is zero, skip transaction creation
      if (Math.abs(difference) < 0.01) {
        console.log(`[PRICE_ADJUSTMENT] Difference is zero, skipping transaction creation`);
        return '';
      }

      // Get original transaction to determine category
      const originalTransaction = await getDB().transactions.get(originalTransactionId);
      if (!originalTransaction) {
        throw new Error(`Original transaction not found: ${originalTransactionId}`);
      }

      // Determine transaction category from original
      const category = originalTransaction.category;
      const isCashPurchase = category === TRANSACTION_CATEGORIES.INVENTORY_CASH_PURCHASE;
      const isCreditPurchase = category === TRANSACTION_CATEGORIES.SUPPLIER_CREDIT_SALE;

      if (!isCashPurchase && !isCreditPurchase) {
        throw new Error(`Unsupported transaction category for adjustment: ${category}`);
      }

      // Create adjustment transaction
      // If difference > 0: same direction as original (increase inventory cost)
      // If difference < 0: reverse direction (decrease inventory cost)
      const adjustmentAmount = Math.abs(difference);
      const description = `Price adjustment - ${difference > 0 ? 'increase' : 'decrease'}`;

      // Cash drawer balance validation removed - negative balances are now allowed

      // Pre-fetch all data needed for writes BEFORE entering transaction
      // This prevents PrematureCommitError by ensuring all reads happen outside transaction
      // Imports moved to top-level to avoid async pauses within transaction


      let internalEntity: any = null;
      let supplierEntity: any = null;

      if (isCashPurchase) {
        // Get internal entity for cash drawer (read outside transaction)
        internalEntity = await accountingInitService.getSystemEntityByType(storeId, 'internal');
        if (!internalEntity) {
          throw new Error('Internal entity not found');
        }
      } else if (isCreditPurchase) {
        // Get supplier entity (read outside transaction)
        const supplierId = batch.supplier_id;
        if (!supplierId) {
          throw new Error('Supplier ID not found in batch');
        }
        supplierEntity = await getDB().entities.get(supplierId);
        if (!supplierEntity) {
          throw new Error(`Supplier entity not found: ${supplierId}`);
        }
      }



      let adjustmentResult: any;
      const adjustmentTransactionId = createId();

      if (isCashPurchase) {
        if (difference > 0) {
          // Increase: Debit Inventory (1300), Credit Cash (1100) - same as original
          // Use journal service directly to create correct entries with INVENTORY_PRICE_ADJUSTMENT category

          // Create transaction record first
          const transaction = {
            id: adjustmentTransactionId,
            store_id: storeId,
            branch_id: branchId,
            type: 'expense' as const,
            category: TRANSACTION_CATEGORIES.INVENTORY_PRICE_ADJUSTMENT,
            amount: adjustmentAmount,
            currency,
            description,
            reference: `PRICE-ADJ-${adjustmentTransactionId.substring(0, 8)}`,
            entity_id: internalEntity.id,

            created_at: new Date().toISOString(),
            created_by: userId,
            _synced: false,
            _deleted: false,
            metadata: {
              batch_id: batchId,
              adjustment_of: originalTransactionId,
              reason: 'Price correction',
              inventory_item_id: inventoryItemId,
              old_price: oldPrice,
              new_price: newPrice
            }
          };

          await getDB().transactions.add(transaction);

          // Create journal entries: Debit Inventory (1300), Credit Cash (1100)
          await journalService.createJournalEntry({
            transactionId: adjustmentTransactionId,
            debitAccount: '1300', // Inventory
            creditAccount: '1100', // Cash
            amountUSD: currency === 'USD' ? adjustmentAmount : 0,
            amountLBP: currency === 'LBP' ? adjustmentAmount : 0,
            entityId: internalEntity.id,
            description: description,
            postedDate: getTodayLocalDate(),
            createdBy: userId,
            branchId,
            skipVerification: true  // Skip verification when called within transaction
          });

          adjustmentResult = {
            success: true,
            transactionId: adjustmentTransactionId
          };
        } else {
          // Decrease: Debit Cash (1100), Credit Inventory (1300) - reverse direction
          // Use CASH_DRAWER_EXPENSE category which creates: Debit Expense, Credit Cash
          // But we need: Debit Cash, Credit Inventory
          // So we'll use the journal service directly to create the correct entries
          // internalEntity already fetched above

          // Create transaction record first
          const transaction = {
            id: adjustmentTransactionId,
            store_id: storeId,
            branch_id: branchId,
            type: 'expense' as const,
            category: TRANSACTION_CATEGORIES.INVENTORY_PRICE_ADJUSTMENT,
            amount: adjustmentAmount,
            currency,
            description,
            reference: `PRICE-ADJ-${adjustmentTransactionId.substring(0, 8)}`,
            entity_id: internalEntity.id,
            created_at: new Date().toISOString(),
            created_by: userId,
            _synced: false,
            _deleted: false,
            metadata: {
              batch_id: batchId,
              adjustment_of: originalTransactionId,
              reason: 'Price correction',
              inventory_item_id: inventoryItemId,
              old_price: oldPrice,
              new_price: newPrice
            }
          };

          await getDB().transactions.add(transaction);

          // Create reverse journal entries: Debit Cash (1100), Credit Inventory (1300)
          await journalService.createJournalEntry({
            transactionId: adjustmentTransactionId,
            debitAccount: '1100', // Cash
            creditAccount: '1300', // Inventory
            amountUSD: currency === 'USD' ? adjustmentAmount : 0,
            amountLBP: currency === 'LBP' ? adjustmentAmount : 0,
            entityId: internalEntity.id,
            description: `${description} - Reverse adjustment`,
            postedDate: getTodayLocalDate(),
            createdBy: userId,
            branchId,
            skipVerification: true  // Skip verification when called within transaction
          });

          adjustmentResult = {
            success: true,
            transactionId: adjustmentTransactionId
          };
        }
      } else {
        // Credit purchase adjustment
        // supplierEntity already fetched above

        if (difference > 0) {
          // Increase: Debit Inventory (1300), Credit Accounts Payable (2100) - same as original
          // Use journal service directly to create correct entries with INVENTORY_PRICE_ADJUSTMENT category

          // Create transaction record first
          const transaction = {
            id: adjustmentTransactionId,
            store_id: storeId,
            branch_id: branchId,
            type: 'expense' as const,
            category: TRANSACTION_CATEGORIES.INVENTORY_PRICE_ADJUSTMENT,
            amount: adjustmentAmount,
            currency,
            description,
            reference: `PRICE-ADJ-${adjustmentTransactionId.substring(0, 8)}`,
            entity_id: supplierEntity.id,
            created_at: new Date().toISOString(),
            created_by: userId,
            _synced: false,
            _deleted: false,
            metadata: {
              batch_id: batchId,
              adjustment_of: originalTransactionId,
              reason: 'Price correction',
              inventory_item_id: inventoryItemId,
              old_price: oldPrice,
              new_price: newPrice
            }
          };

          await getDB().transactions.add(transaction);

          // Create journal entries: Debit Inventory (1300), Credit Accounts Payable (2100)
          await journalService.createJournalEntry({
            transactionId: adjustmentTransactionId,
            debitAccount: '1300', // Inventory
            creditAccount: '2100', // Accounts Payable
            amountUSD: currency === 'USD' ? adjustmentAmount : 0,
            amountLBP: currency === 'LBP' ? adjustmentAmount : 0,
            entityId: supplierEntity.id,
            description: description,
            postedDate: getTodayLocalDate(),
            createdBy: userId,
            branchId,
            skipVerification: true  // Skip verification when called within transaction
          });

          adjustmentResult = {
            success: true,
            transactionId: adjustmentTransactionId
          };
        } else {
          // Decrease: Debit Accounts Payable (2100), Credit Inventory (1300) - reverse direction
          // Use journal service directly to create reverse entries
          // supplierEntity already fetched above

          // Create transaction record first
          const transaction = {
            id: adjustmentTransactionId,
            store_id: storeId,
            branch_id: branchId,
            type: 'expense' as const,
            category: TRANSACTION_CATEGORIES.INVENTORY_PRICE_ADJUSTMENT,
            amount: adjustmentAmount,
            currency,
            description,
            reference: `PRICE-ADJ-${adjustmentTransactionId.substring(0, 8)}`,
            entity_id: supplierEntity.id,
            created_at: new Date().toISOString(),
            created_by: userId,
            _synced: false,
            _deleted: false,
            metadata: {
              batch_id: batchId,
              adjustment_of: originalTransactionId,
              reason: 'Price correction',
              inventory_item_id: inventoryItemId,
              old_price: oldPrice,
              new_price: newPrice
            }
          };

          await getDB().transactions.add(transaction);

          // Create reverse journal entries: Debit Accounts Payable (2100), Credit Inventory (1300)
          await journalService.createJournalEntry({
            transactionId: adjustmentTransactionId,
            debitAccount: '2100', // Accounts Payable
            creditAccount: '1300', // Inventory
            amountUSD: currency === 'USD' ? adjustmentAmount : 0,
            amountLBP: currency === 'LBP' ? adjustmentAmount : 0,
            entityId: supplierEntity.id,
            description: `${description} - Reverse adjustment`,
            postedDate: getTodayLocalDate(),
            createdBy: userId,
            branchId,
            skipVerification: true  // Skip verification when called within transaction
          });

          adjustmentResult = {
            success: true,
            transactionId: adjustmentTransactionId
          };
        }
      }

      if (!adjustmentResult.success) {
        throw new Error(adjustmentResult.error || 'Failed to create adjustment transaction');
      }

      console.log(`[PRICE_ADJUSTMENT] ✅ Adjustment transaction created:`, {
        transactionId: adjustmentResult.transactionId,
        amount: adjustmentAmount,
        difference,
        category: TRANSACTION_CATEGORIES.INVENTORY_PRICE_ADJUSTMENT,
        originalCategory: category
      });

      return adjustmentResult.transactionId || '';
    } catch (error) {
      console.error(`[PRICE_ADJUSTMENT] ❌ Error creating adjustment transaction:`, error);
      throw error;
    }
  }
}

export const inventoryPurchaseService = InventoryPurchaseService.getInstance();
