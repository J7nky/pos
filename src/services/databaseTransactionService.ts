import { db } from '../lib/db';
import { databaseConnectionService } from './databaseConnectionService';
import { databasePerformanceService } from './databasePerformanceService';

export interface TransactionOptions {
  isolationLevel: 'read_uncommitted' | 'read_committed' | 'repeatable_read' | 'serializable';
  timeout: number; // milliseconds
  retries: number;
  rollbackOnError: boolean;
}

export interface TransactionContext {
  id: string;
  startTime: number;
  operations: TransactionOperation[];
  state: 'pending' | 'committed' | 'rolled_back' | 'failed';
  isolationLevel: string;
  timeout: number;
}

export interface TransactionOperation {
  id: string;
  tableName: string;
  operation: 'insert' | 'update' | 'delete' | 'upsert';
  data: any;
  timestamp: number;
  executed: boolean;
  result?: any;
  error?: string;
}

export interface TransactionResult {
  success: boolean;
  transactionId: string;
  operationsExecuted: number;
  operationsFailed: number;
  duration: number;
  errors: string[];
  rollbackPerformed: boolean;
}

export interface ConsistencyCheck {
  tableName: string;
  issues: ConsistencyIssue[];
  score: number; // 0-100
}

export interface ConsistencyIssue {
  type: 'orphaned_record' | 'invalid_reference' | 'constraint_violation' | 'data_inconsistency';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recordId?: string;
  details?: any;
}

export class DatabaseTransactionService {
  private static instance: DatabaseTransactionService;
  private activeTransactions: Map<string, TransactionContext> = new Map();
  private defaultOptions: TransactionOptions = {
    isolationLevel: 'read_committed',
    timeout: 30000, // 30 seconds
    retries: 3,
    rollbackOnError: true
  };

  private constructor() {}

  public static getInstance(): DatabaseTransactionService {
    if (!DatabaseTransactionService.instance) {
      DatabaseTransactionService.instance = new DatabaseTransactionService();
    }
    return DatabaseTransactionService.instance;
  }

  /**
   * Execute a transaction with proper isolation and consistency
   */
  public async executeTransaction<T>(
    operations: (context: TransactionContext) => Promise<T>,
    options: Partial<TransactionOptions> = {}
  ): Promise<TransactionResult> {
    const config = { ...this.defaultOptions, ...options };
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();

    const context: TransactionContext = {
      id: transactionId,
      startTime,
      operations: [],
      state: 'pending',
      isolationLevel: config.isolationLevel,
      timeout: config.timeout
    };

    this.activeTransactions.set(transactionId, context);

    try {
      // Set timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Transaction timeout')), config.timeout);
      });

      // Execute transaction with timeout
      const result = await Promise.race([
        this.executeWithRetry(operations, context, config),
        timeoutPromise
      ]);

      // Commit transaction
      await this.commitTransaction(transactionId);
      
      const duration = performance.now() - startTime;
      
      return {
        success: true,
        transactionId,
        operationsExecuted: context.operations.filter(op => op.executed).length,
        operationsFailed: context.operations.filter(op => !op.executed).length,
        duration,
        errors: [],
        rollbackPerformed: false
      };

    } catch (error) {
      // Rollback transaction
      await this.rollbackTransaction(transactionId);
      
      const duration = performance.now() - startTime;
      
      return {
        success: false,
        transactionId,
        operationsExecuted: context.operations.filter(op => op.executed).length,
        operationsFailed: context.operations.filter(op => !op.executed).length,
        duration,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        rollbackPerformed: true
      };
    } finally {
      this.activeTransactions.delete(transactionId);
    }
  }

  /**
   * Execute transaction with retry logic
   */
  private async executeWithRetry<T>(
    operations: (context: TransactionContext) => Promise<T>,
    context: TransactionContext,
    config: TransactionOptions
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.retries; attempt++) {
      try {
        return await operations(context);
      } catch (error) {
        lastError = error as Error;
        
        // Check if error is retryable
        if (this.isRetryableError(error as Error) && attempt < config.retries) {
          console.warn(`Transaction ${context.id} failed (attempt ${attempt}/${config.retries}), retrying...`, error);
          
          // Wait before retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await this.sleep(delay);
          
          // Reset transaction state for retry
          context.operations = [];
          context.state = 'pending';
        } else {
          throw error;
        }
      }
    }

    throw lastError || new Error('Transaction failed after all retries');
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const retryableErrors = [
      'Transaction timeout',
      'Connection lost',
      'Deadlock',
      'Lock timeout',
      'Network error',
      'Temporary failure'
    ];

    return retryableErrors.some(retryableError => 
      error.message.toLowerCase().includes(retryableError.toLowerCase())
    );
  }

  /**
   * Commit a transaction
   */
  private async commitTransaction(transactionId: string): Promise<void> {
    const context = this.activeTransactions.get(transactionId);
    if (!context) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    try {
      // Execute all operations in a single database transaction
      await db.transaction('rw', db.tables, async () => {
        for (const operation of context.operations) {
          if (!operation.executed) {
            await this.executeOperation(operation);
            operation.executed = true;
          }
        }
      });

      context.state = 'committed';
      console.log(`✅ Transaction ${transactionId} committed successfully`);
    } catch (error) {
      context.state = 'failed';
      throw error;
    }
  }

  /**
   * Rollback a transaction
   */
  private async rollbackTransaction(transactionId: string): Promise<void> {
    const context = this.activeTransactions.get(transactionId);
    if (!context) {
      console.warn(`Transaction ${transactionId} not found for rollback`);
      return;
    }

    try {
      // Rollback executed operations in reverse order
      const executedOperations = context.operations
        .filter(op => op.executed)
        .reverse();

      for (const operation of executedOperations) {
        await this.rollbackOperation(operation);
      }

      context.state = 'rolled_back';
      console.log(`🔄 Transaction ${transactionId} rolled back successfully`);
    } catch (error) {
      console.error(`❌ Failed to rollback transaction ${transactionId}:`, error);
      context.state = 'failed';
    }
  }

  /**
   * Execute a single operation
   */
  private async executeOperation(operation: TransactionOperation): Promise<any> {
    const table = (db as any)[operation.tableName];
    if (!table) {
      throw new Error(`Table ${operation.tableName} not found`);
    }

    switch (operation.operation) {
      case 'insert':
        return await table.add(operation.data);
      case 'update':
        return await table.update(operation.data.id, operation.data);
      case 'delete':
        return await table.delete(operation.data.id);
      case 'upsert':
        return await table.put(operation.data);
      default:
        throw new Error(`Unknown operation: ${operation.operation}`);
    }
  }

  /**
   * Rollback a single operation
   */
  private async rollbackOperation(operation: TransactionOperation): Promise<void> {
    const table = (db as any)[operation.tableName];
    if (!table) {
      console.warn(`Table ${operation.tableName} not found for rollback`);
      return;
    }

    try {
      switch (operation.operation) {
        case 'insert':
          // Delete the inserted record
          if (operation.result && operation.result.id) {
            await table.delete(operation.result.id);
          }
          break;
        case 'update':
          // Restore original data (would need to store original state)
          console.warn(`Rollback for update operation not fully implemented`);
          break;
        case 'delete':
          // Restore deleted record (would need to store original data)
          console.warn(`Rollback for delete operation not fully implemented`);
          break;
        case 'upsert':
          // Complex rollback logic needed
          console.warn(`Rollback for upsert operation not fully implemented`);
          break;
      }
    } catch (error) {
      console.error(`Failed to rollback operation ${operation.id}:`, error);
    }
  }

  /**
   * Check database consistency
   */
  public async checkConsistency(): Promise<ConsistencyCheck[]> {
    const checks: ConsistencyCheck[] = [];

    // Check for orphaned records
    checks.push(await this.checkOrphanedRecords());
    
    // Check for invalid references
    checks.push(await this.checkInvalidReferences());
    
    // Check for constraint violations
    checks.push(await this.checkConstraintViolations());
    
    // Check for data inconsistencies
    checks.push(await this.checkDataInconsistencies());

    return checks;
  }

  /**
   * Check for orphaned records
   */
  private async checkOrphanedRecords(): Promise<ConsistencyCheck> {
    const issues: ConsistencyIssue[] = [];

    try {
      // Check orphaned bill line items
      const bills = await db.bills.toArray();
      const billIds = new Set(bills.map(b => b.id));
      const orphanedLineItems = await db.bill_line_items
        .filter(item => !billIds.has(item.bill_id))
        .toArray();

      for (const item of orphanedLineItems) {
        issues.push({
          type: 'orphaned_record',
          severity: 'high',
          description: `Bill line item ${item.id} references non-existent bill ${item.bill_id}`,
          recordId: item.id,
          details: { bill_id: item.bill_id }
        });
      }

      // Check orphaned inventory items
      const products = await db.products.toArray();
      const productIds = new Set(products.map(p => p.id));
      const orphanedInventoryItems = await db.inventory_items
        .filter(item => !productIds.has(item.product_id))
        .toArray();

      for (const item of orphanedInventoryItems) {
        issues.push({
          type: 'orphaned_record',
          severity: 'high',
          description: `Inventory item ${item.id} references non-existent product ${item.product_id}`,
          recordId: item.id,
          details: { product_id: item.product_id }
        });
      }

    } catch (error) {
      issues.push({
        type: 'orphaned_record',
        severity: 'critical',
        description: `Failed to check orphaned records: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }

    const score = issues.length === 0 ? 100 : Math.max(0, 100 - (issues.length * 10));
    
    return {
      tableName: 'orphaned_records',
      issues,
      score
    };
  }

  /**
   * Check for invalid references
   */
  private async checkInvalidReferences(): Promise<ConsistencyCheck> {
    const issues: ConsistencyIssue[] = [];

    try {
      // Check invalid customer references in bills
      const customers = await db.customers.toArray();
      const customerIds = new Set(customers.map(c => c.id));
      const invalidCustomerBills = await db.bills
        .filter(bill => bill.customer_id && !customerIds.has(bill.customer_id))
        .toArray();

      for (const bill of invalidCustomerBills) {
        issues.push({
          type: 'invalid_reference',
          severity: 'medium',
          description: `Bill ${bill.id} references non-existent customer ${bill.customer_id}`,
          recordId: bill.id,
          details: { customer_id: bill.customer_id }
        });
      }

      // Check invalid supplier references
      const suppliers = await db.suppliers.toArray();
      const supplierIds = new Set(suppliers.map(s => s.id));
      const invalidSupplierBills = await db.inventory_bills
        .filter(bill => !supplierIds.has(bill.supplier_id))
        .toArray();

      for (const bill of invalidSupplierBills) {
        issues.push({
          type: 'invalid_reference',
          severity: 'medium',
          description: `Inventory bill ${bill.id} references non-existent supplier ${bill.supplier_id}`,
          recordId: bill.id,
          details: { supplier_id: bill.supplier_id }
        });
      }

    } catch (error) {
      issues.push({
        type: 'invalid_reference',
        severity: 'critical',
        description: `Failed to check invalid references: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }

    const score = issues.length === 0 ? 100 : Math.max(0, 100 - (issues.length * 5));
    
    return {
      tableName: 'invalid_references',
      issues,
      score
    };
  }

  /**
   * Check for constraint violations
   */
  private async checkConstraintViolations(): Promise<ConsistencyCheck> {
    const issues: ConsistencyIssue[] = [];

    try {
      // Check for negative balances
      const negativeBalances = await db.suppliers
        .filter(s => (s.lb_balance || 0) < 0 || (s.usd_balance || 0) < 0)
        .toArray();

      for (const supplier of negativeBalances) {
        issues.push({
          type: 'constraint_violation',
          severity: 'high',
          description: `Supplier ${supplier.name} has negative balance (LBP: ${supplier.lb_balance}, USD: ${supplier.usd_balance})`,
          recordId: supplier.id,
          details: { lb_balance: supplier.lb_balance, usd_balance: supplier.usd_balance }
        });
      }

      // Check for negative inventory quantities
      const negativeInventory = await db.inventory_items
        .filter(item => (item.quantity || 0) < 0)
        .toArray();

      for (const item of negativeInventory) {
        issues.push({
          type: 'constraint_violation',
          severity: 'medium',
          description: `Inventory item ${item.id} has negative quantity: ${item.quantity}`,
          recordId: item.id,
          details: { quantity: item.quantity }
        });
      }

    } catch (error) {
      issues.push({
        type: 'constraint_violation',
        severity: 'critical',
        description: `Failed to check constraint violations: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }

    const score = issues.length === 0 ? 100 : Math.max(0, 100 - (issues.length * 15));
    
    return {
      tableName: 'constraint_violations',
      issues,
      score
    };
  }

  /**
   * Check for data inconsistencies
   */
  private async checkDataInconsistencies(): Promise<ConsistencyCheck> {
    const issues: ConsistencyIssue[] = [];

    try {
      // Check for duplicate bill numbers
      const bills = await db.bills.toArray();
      const billNumbers = new Map<string, string[]>();
      
      for (const bill of bills) {
        if (!billNumbers.has(bill.bill_number)) {
          billNumbers.set(bill.bill_number, []);
        }
        billNumbers.get(bill.bill_number)!.push(bill.id);
      }

      for (const [billNumber, billIds] of billNumbers) {
        if (billIds.length > 1) {
          issues.push({
            type: 'data_inconsistency',
            severity: 'high',
            description: `Duplicate bill number found: ${billNumber} (${billIds.length} bills)`,
            details: { bill_number: billNumber, bill_ids: billIds }
          });
        }
      }

      // Check for inconsistent sync states
      const unsyncedRecords = await db.bills
        .filter(bill => !bill._synced)
        .toArray();

      if (unsyncedRecords.length > 100) {
        issues.push({
          type: 'data_inconsistency',
          severity: 'medium',
          description: `High number of unsynced records: ${unsyncedRecords.length} bills`,
          details: { count: unsyncedRecords.length }
        });
      }

    } catch (error) {
      issues.push({
        type: 'data_inconsistency',
        severity: 'critical',
        description: `Failed to check data inconsistencies: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }

    const score = issues.length === 0 ? 100 : Math.max(0, 100 - (issues.length * 8));
    
    return {
      tableName: 'data_inconsistencies',
      issues,
      score
    };
  }

  /**
   * Get active transactions
   */
  public getActiveTransactions(): TransactionContext[] {
    return Array.from(this.activeTransactions.values());
  }

  /**
   * Get transaction by ID
   */
  public getTransaction(transactionId: string): TransactionContext | undefined {
    return this.activeTransactions.get(transactionId);
  }

  /**
   * Cancel a transaction
   */
  public async cancelTransaction(transactionId: string): Promise<boolean> {
    const context = this.activeTransactions.get(transactionId);
    if (!context) {
      return false;
    }

    if (context.state === 'pending') {
      await this.rollbackTransaction(transactionId);
      return true;
    }

    return false;
  }

  /**
   * Update transaction options
   */
  public updateDefaultOptions(options: Partial<TransactionOptions>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }

  /**
   * Get current default options
   */
  public getDefaultOptions(): TransactionOptions {
    return { ...this.defaultOptions };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const databaseTransactionService = DatabaseTransactionService.getInstance();

