import { currencyService } from './currencyService';
import { auditLogService } from './auditLogService';
import { TransactionService, TransactionResult } from './transactionService';
// Remove dataAccessService import - use direct IndexedDB access
import { db, createId } from '../lib/db';

const transactionService = TransactionService.getInstance();
import { 
  AccountsPayable, 
  Customer, 
  Supplier,
  SaleItem,
  InventoryItem
} from '../types';

export interface EnhancedTransactionResult extends TransactionResult {
  auditLogId: string;
  correlationId: string;
  activitySummary: string;
}

export interface TransactionContext {
  userId: string;
  userEmail?: string;
  userName?: string;
  sessionId?: string;
  source?: 'web' | 'mobile' | 'api';
  module: string;
  correlationId?: string;
  storeId: string;
}

export interface BalanceSnapshot {
  entityId: string;
  entityType: 'customer' | 'supplier' | 'cash_drawer';
  balanceBefore: number;
  balanceAfter: number;
  currency: string;
  timestamp: string;
}

export class EnhancedTransactionService {
  private static instance: EnhancedTransactionService;

  private constructor() {}

  public static getInstance(): EnhancedTransactionService {
    if (!EnhancedTransactionService.instance) {
      EnhancedTransactionService.instance = new EnhancedTransactionService();
    }
    return EnhancedTransactionService.instance;
  }

  // Enhanced customer payment processing with comprehensive logging
  public async processCustomerPayment(
    customerId: string,
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    context: TransactionContext,
    storeId: string,
    options: {
      paymentMethod?: 'cash' | 'card' | 'transfer';
      reference?: string;
      updateCustomerBalance?: boolean;
      createReceivable?: boolean;
    } = {}
  ): Promise<EnhancedTransactionResult> {
    try {
      // Get customer data for balance tracking
      const customerData = await db.customers.get(customerId);
      if (!customerData) {
        throw new Error('Customer not found');
      }
      
      const customer: Customer = {
        id: customerData.id,
        name: customerData.name,
        phone: customerData.phone,
        email: customerData.email || '',
        address: customerData.address || '',
        lbBalance: customerData.lb_balance || 0,
        usdBalance: customerData.usd_balance || 0,
        isActive: customerData.is_active,
        createdAt: customerData.created_at,
        balance: customerData.usd_balance || 0,
      };

      const balanceBefore = customer.balance || 0; // Updated to use balance field with null safety
      const amountInUSD = currencyService.convertCurrency(amount, currency, 'USD');
      // RULE 5 FIX: When receiving payment FROM customer, DECREASE their balance (reduce their debt to us)
      const balanceAfter = Math.max(0, balanceBefore - amountInUSD); // Prevent negative debt

      // Create correlation ID for this transaction group
      const correlationId = context.correlationId || this.generateCorrelationId();

      // Process the payment using existing service
      const paymentContext: TransactionContext = {
        ...context,
        storeId
      };
      const result = await transactionService.createCustomerPayment(
        customerId,
        amount,
        currency,
        description,
        paymentContext,
        {
          reference: options.reference,
          updateCashDrawer: true
        }
      );

      if (!result.success) {
        throw new Error(result.error || 'Payment processing failed');
      }

      // Log the payment with comprehensive audit trail
      const auditLogId = auditLogService.logCustomerPayment({
        customerId,
        customerName: customer.name,
        amount,
        currency,
        balanceBefore,
        balanceAfter,
        transactionId: result.transactionId!,
        userId: context.userId,
        userEmail: context.userEmail,
        paymentMethod: options.paymentMethod
      });

      // Log related activities
      if (options.updateCustomerBalance !== false) {
        auditLogService.log({
          action: 'customer_balance_adjusted',
          entityType: 'customer',
          entityId: customerId,
          entityName: customer.name,
          description: `Balance updated from ${currencyService.formatCurrency(balanceBefore, 'USD')} to ${currencyService.formatCurrency(balanceAfter, 'USD')} due to payment`,
          userId: context.userId,
          userEmail: context.userEmail,
          userName: context.userName,
          previousData: { balance: balanceBefore },
          newData: { balance: balanceAfter },
          changedFields: ['balance'], // Updated to use balance field
          balanceChange: {
            entityType: 'customer',
            balanceBefore,
            balanceAfter,
            currency: 'USD'
          },
          relatedTransactions: [result.transactionId!],
          correlationId,
          severity: 'medium',
          tags: ['balance_adjustment', 'payment', 'customer'],
          metadata: {
            source: context.source || 'web',
            module: context.module,
            sessionId: context.sessionId
          }
        });
      }

      // Update accounts receivable and log changes
      await this.updateAccountsReceivableForPayment(
        customerId,
        amountInUSD,
        result.transactionId!,
        correlationId,
        context,
        storeId
      );

      const activitySummary = this.generateActivitySummary('customer_payment', {
        customerName: customer.name,
        amount,
        currency,
        balanceBefore,
        balanceAfter,
        paymentMethod: options.paymentMethod
      });

      return {
        ...result,
        auditLogId,
        correlationId,
        activitySummary
      };

    } catch (error) {
      // Log the error
      auditLogService.log({
        action: 'customer_payment_received',
        entityType: 'customer',
        entityId: customerId,
        description: `Payment processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        userId: context.userId,
        userEmail: context.userEmail,
        severity: 'critical',
        tags: ['error', 'payment', 'customer']
      });

      throw error;
    }
  }

  // Enhanced supplier payment processing
  public async processSupplierPayment(
    supplierId: string,
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    context: TransactionContext,
    storeId: string,
    options: {
      paymentMethod?: 'cash' | 'card' | 'transfer';
      reference?: string;
      updateSupplierBalance?: boolean;
      createPayable?: boolean;
    } = {}
  ): Promise<EnhancedTransactionResult> {
    try {
      // Get supplier data
      const supplierData = await db.suppliers.get(supplierId);
      if (!supplierData) {
        throw new Error('Supplier not found');
      }
      
      const supplier: Supplier = {
        id: supplierData.id,
        name: supplierData.name,
        phone: supplierData.phone,
        email: supplierData.email || '',
        address: supplierData.address,
        lbBalance: supplierData.lb_balance || 0,
        usdBalance: supplierData.usd_balance || 0,
        createdAt: supplierData.created_at,
        balance: supplierData.usd_balance || 0,
      };

      // Calculate current balance owed to supplier
      // For now, we'll use a simplified approach - in a real implementation,
      // this would query bill_line_items or a dedicated payables table
      const payables: AccountsPayable[] = [];
      const supplierPayables = payables.filter((ap: AccountsPayable) => 
        ap.supplierId === supplierId && ap.status !== 'paid'
      );
      
      const balanceBefore = supplierPayables.reduce((sum: number, ap: AccountsPayable) => 
        sum + ap.amountDue, 0
      );

      const amountInUSD = currencyService.convertCurrency(amount, currency, 'USD');
      // RULE 5 FIX: When making payment TO supplier, DECREASE their balance (reduce what we owe them)
      const balanceAfter = Math.max(0, balanceBefore - amountInUSD);

      const correlationId = context.correlationId || this.generateCorrelationId();

      // Process payment
      const paymentContext: TransactionContext = {
        ...context,
        storeId
      };
      const result = await transactionService.createSupplierPayment(
        supplierId,
        amount,
        currency,
        description,
        paymentContext,
        {
          reference: options.reference,
          updateCashDrawer: true
        }
      );

      if (!result.success) {
        throw new Error(result.error || 'Payment processing failed');
      }

      // Log the payment
      const auditLogId = auditLogService.logSupplierPayment({
        supplierId,
        supplierName: supplier.name,
        amount,
        currency,
        balanceBefore,
        balanceAfter,
        transactionId: result.transactionId!,
        userId: context.userId,
        userEmail: context.userEmail,
        paymentMethod: options.paymentMethod
      });

      // Update accounts payable and log changes
      await this.updateAccountsPayableForPayment(
        supplierId,
        amountInUSD,
        result.transactionId!,
        correlationId,
        context,
        storeId
      );

      const activitySummary = this.generateActivitySummary('supplier_payment', {
        supplierName: supplier.name,
        amount,
        currency,
        balanceBefore,
        balanceAfter,
        paymentMethod: options.paymentMethod
      });

      return {
        ...result,
        auditLogId,
        correlationId,
        activitySummary
      };

    } catch (error) {
      auditLogService.log({
        action: 'supplier_payment_sent',
        entityType: 'supplier',
        entityId: supplierId,
        description: `Payment processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        userId: context.userId,
        userEmail: context.userEmail,
        severity: 'critical',
        tags: ['error', 'payment', 'supplier']
      });

      throw error;
    }
  }

  // Enhanced sale processing with comprehensive logging
  public async processSale(
    saleData: {
      customerId?: string;
      paymentMethod: 'cash' | 'card' | 'credit';
      total: number;
      amountPaid: number;
      amountDue: number;
      createdBy: string;
    },
    items: Omit<SaleItem, 'id'>[],
    context: TransactionContext,
    storeId: string
  ): Promise<EnhancedTransactionResult> {
    try {
      const correlationId = context.correlationId || this.generateCorrelationId();
      const saleId = this.generateId();
      const timestamp = new Date().toISOString();

      // Create sale record
      const completeSale = {
        ...saleData,
        id: saleId,
        createdAt: timestamp
      };

      // Create sale items with IDs
      const completeSaleItems: SaleItem[] = items.map(item => ({
        ...item,
        id: this.generateId()
      }));

      // Store sale items data in bill_line_items format
      // Note: customer_id, payment_method, created_by are in bills table, not bill_line_items
      for (const item of completeSaleItems) {
        await db.bill_line_items.add({
          id: this.generateId(),
          bill_id: saleId,
          store_id: storeId,
          product_id: item.productId,
          quantity: item.quantity,
          weight: item.weight,
          unit_price: item.unitPrice,
          line_total: item.totalPrice,
          received_value: 0,
          notes: item.notes || null,
          created_at: timestamp,
          updated_at: timestamp,
          line_order: 1,
          inventory_item_id: item.inventoryItemId,
          _synced: false,
          _deleted: false
        });
      }

      // Process customer balance if credit sale
      let customerBalanceChange: BalanceSnapshot | undefined;
      let customer: Customer | undefined;

      if (saleData.customerId && saleData.amountDue > 0) {
        const customerData = await db.customers.get(saleData.customerId);
        if (customerData) {
          customer = {
            id: customerData.id,
            name: customerData.name,
            phone: customerData.phone,
            email: customerData.email || '',
            address: customerData.address || '',
            lbBalance: customerData.lb_balance || 0,
            usdBalance: customerData.usd_balance || 0,
            isActive: customerData.is_active,
            createdAt: customerData.created_at,
            balance: customerData.usd_balance || 0,
          };
        }
        
        if (customer) {
          const balanceBefore = customer.balance || 0;
          
          // Create accounts receivable for credit amount
          // NOTE: transactionService will handle balance updates
          if (saleData.amountDue > 0) {
            // Use transactionService to create AR transaction with proper validation and balance update
            const arContext: TransactionContext = {
              userId: saleData.createdBy,
              userEmail: context.userEmail,
              userName: context.userName,
              sessionId: context.sessionId,
              source: context.source,
              module: context.module,
              correlationId,
              storeId
            };
            const result = await transactionService.createAccountsReceivable(
              saleData.customerId,
              saleData.amountDue,
              'USD',
              `Credit sale - ${saleData.customerId}`,
              arContext
            );

            const balanceAfter = result.balanceAfter || (balanceBefore + saleData.amountDue);
            
            customerBalanceChange = {
              entityId: saleData.customerId,
              entityType: 'customer',
              balanceBefore,
              balanceAfter,
              currency: 'USD',
              timestamp
            };
          }
        }
      }

      // Update inventory quantities
      await this.updateInventoryForSale(completeSaleItems, correlationId, context);

      // Log the sale
      const auditLogId = auditLogService.logSaleTransaction({
        sale: completeSale,
        items: completeSaleItems,
        customerId: saleData.customerId,
        customerName: customer?.name,
        userId: context.userId,
        userEmail: context.userEmail,
        balanceChange: customerBalanceChange ? {
          entityType: 'customer',
          balanceBefore: customerBalanceChange.balanceBefore,
          balanceAfter: customerBalanceChange.balanceAfter,
          currency: customerBalanceChange.currency
        } : undefined
      });

      // Log inventory updates
      for (const item of completeSaleItems) {
        auditLogService.log({
          action: 'inventory_sold',
          entityType: 'inventory_item',
          entityId: item.productId,
          entityName: item.productName,
          description: `Sold ${item.quantity}${item.weight ? ` (${item.weight}kg)` : ''} of ${item.productName} to ${customer?.name || 'Walk-in Customer'}`,
          userId: context.userId,
          userEmail: context.userEmail,
          newData: {
            quantitySold: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice
          },
          relatedTransactions: [saleId],
          correlationId,
          severity: 'low',
          tags: ['inventory', 'sale', 'stock_reduction']
        });
      }

      const activitySummary = this.generateActivitySummary('sale', {
        customerName: customer?.name || 'Walk-in Customer',
        itemCount: completeSaleItems.length,
        total: saleData.total,
        paymentMethod: saleData.paymentMethod,
        amountDue: saleData.amountDue
      });

      return {
        success: true,
        transactionId: saleId,
        balanceBefore: customerBalanceChange?.balanceBefore || 0,
        balanceAfter: customerBalanceChange?.balanceAfter || 0,
        affectedRecords: [saleId, ...(saleData.customerId ? [saleData.customerId] : [])],
        auditLogId,
        correlationId,
        activitySummary
      };

    } catch (error) {
      auditLogService.log({
        action: 'sale_created',
        entityType: 'sale',
        entityId: 'unknown',
        description: `Sale processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        userId: context.userId,
        userEmail: context.userEmail,
        severity: 'critical',
        tags: ['error', 'sale']
      });

      throw error;
    }
  }

  // Enhanced inventory receiving with comprehensive logging
  public async processInventoryReceived(
    inventoryData: Omit<InventoryItem, 'id'>,
    productName: string,
    supplierName: string,
    context: TransactionContext,
    storeId: string
  ): Promise<EnhancedTransactionResult> {
    try {
      const correlationId = context.correlationId || this.generateCorrelationId();
      const inventoryId = this.generateId();
      const timestamp = new Date().toISOString();

      const inventoryItem: InventoryItem = {
        ...inventoryData,
        id: inventoryId,
        receivedAt: timestamp,
        receivedBy: context.userId
      };

      // Store inventory item in IndexedDB
      await db.inventory_items.add({
        id: inventoryId,
        store_id: storeId,
        product_id: inventoryData.productId,
        supplier_id: inventoryData.supplierId,
        quantity: inventoryData.quantity,
        received_quantity: inventoryData.receivedQuantity,
        unit: inventoryData.unit,
        weight: inventoryData.weight,
        price: inventoryData.price,
        received_at: timestamp,
        created_at: timestamp,
        batch_id: inventoryData.batchId,
        _synced: false
      });

      // Log inventory received
      const auditLogId = auditLogService.logInventoryReceived({
        inventoryItem,
        productName,
        supplierName,
        userId: context.userId,
        userEmail: context.userEmail
      });

      // Log detailed inventory tracking
      auditLogService.log({
        action: 'inventory_received',
        entityType: 'inventory_item',
        entityId: inventoryId,
        entityName: productName,
        description: `Received ${inventoryData.quantity} ${inventoryData.unit} of ${productName} from ${supplierName}${inventoryData.weight ? ` (${inventoryData.weight}kg)` : ''}`,
        userId: context.userId,
        userEmail: context.userEmail,
        newData: inventoryItem,
        correlationId,
        severity: 'low',
        tags: ['inventory', 'receiving', inventoryData.type, 'stock_increase'],
        metadata: {
          source: context.source || 'web',
          module: context.module,
          sessionId: context.sessionId
        }
      });

      const activitySummary = this.generateActivitySummary('inventory_received', {
        productName,
        supplierName,
        quantity: inventoryData.quantity,
        unit: inventoryData.unit,
        type: inventoryData.type
      });

      return {
        success: true,
        transactionId: inventoryId,
        balanceBefore: 0,
        balanceAfter: 0,
        affectedRecords: [inventoryId],
        auditLogId,
        correlationId,
        activitySummary
      };

    } catch (error) {
      auditLogService.log({
        action: 'inventory_received',
        entityType: 'inventory_item',
        entityId: 'unknown',
        description: `Inventory receiving failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        userId: context.userId,
        userEmail: context.userEmail,
        severity: 'critical',
        tags: ['error', 'inventory']
      });

      throw error;
    }
  }

  // Helper methods
  private async updateAccountsReceivableForPayment(
    customerId: string,
    amountInUSD: number,
    transactionId: string,
    correlationId: string,
    context: TransactionContext,
    storeId: string
  ): Promise<void> {
    // Update accounts receivable through transaction service
    const arContext: TransactionContext = {
      ...context,
      correlationId,
      storeId
    };
    await transactionService.createAccountsReceivable(
      customerId,
      amountInUSD,
      'USD',
      `Receivable update for customer ${customerId}`,
      arContext
    );
    
    // Log the update
    auditLogService.log({
      action: 'receivable_updated',
      entityType: 'accounts_receivable',
      entityId: customerId,
      entityName: `Customer ${customerId}`,
      description: `Payment applied: $${amountInUSD.toFixed(2)} to customer receivables`,
      userId: context.userId,
      userEmail: context.userEmail,
      relatedTransactions: [transactionId],
      correlationId,
      severity: 'medium',
      tags: ['receivable', 'payment', 'status_change']
    });
  }

  private async updateAccountsPayableForPayment(
    supplierId: string,
    amountInUSD: number,
    transactionId: string,
    correlationId: string,
    context: TransactionContext,
    storeId: string
  ): Promise<void> {
    // Update accounts payable through transaction record
    const apContext: TransactionContext = {
      ...context,
      correlationId,
      storeId
    };
    await transactionService.createAccountsPayable(
      supplierId,
      amountInUSD,
      'USD',
      `Payable update for supplier ${supplierId}`,
      apContext
    );
    
    // Log the update
    auditLogService.log({
      action: 'payable_updated',
      entityType: 'accounts_payable',
      entityId: supplierId,
      entityName: `Supplier ${supplierId}`,
      description: `Payment sent: $${amountInUSD.toFixed(2)} to supplier payables`,
      userId: context.userId,
      userEmail: context.userEmail,
      relatedTransactions: [transactionId],
      correlationId,
      severity: 'medium',
      tags: ['payable', 'payment', 'status_change']
    });
  }

  private async updateInventoryForSale(
    items: SaleItem[],
    correlationId: string,
    context: TransactionContext
  ): Promise<void> {
    for (const saleItem of items) {
      // Find matching inventory items (FIFO - First In, First Out)
      const matchingItems = await db.inventory_items
        .where('product_id')
        .equals(saleItem.productId)
        .and(item => item.supplier_id === saleItem.supplierId && item.quantity > 0)
        .toArray();

      // Sort by received_at for FIFO
      matchingItems.sort((a, b) => 
        new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
      );

      let remainingToSell = saleItem.quantity;

      for (const inventoryItem of matchingItems) {
        if (remainingToSell <= 0) break;

        const quantityToDeduct = Math.min(remainingToSell, inventoryItem.quantity);
        const previousQuantity = inventoryItem.quantity;
        
        // Update inventory in IndexedDB
        await db.inventory_items.update(inventoryItem.id, { 
          quantity: inventoryItem.quantity - quantityToDeduct,
          _synced: false
        });
        
        remainingToSell -= quantityToDeduct;

        // Log inventory reduction
        auditLogService.log({
          action: 'inventory_sold',
          entityType: 'inventory_item',
          entityId: inventoryItem.id,
          entityName: saleItem.productName,
          description: `Inventory reduced by ${quantityToDeduct} ${inventoryItem.unit}. Remaining: ${inventoryItem.quantity - quantityToDeduct}`,
          userId: context.userId,
          userEmail: context.userEmail,
          previousData: { quantity: previousQuantity },
          newData: { quantity: inventoryItem.quantity - quantityToDeduct },
          changedFields: ['quantity'],
          correlationId,
          severity: 'low',
          tags: ['inventory', 'reduction', 'sale']
        });
      }

      if (remainingToSell > 0) {
        // Log potential inventory shortage
        auditLogService.log({
          action: 'inventory_sold',
          entityType: 'inventory_item',
          entityId: saleItem.productId,
          entityName: saleItem.productName,
          description: `Warning: Insufficient inventory. Attempted to sell ${saleItem.quantity}, but only had ${saleItem.quantity - remainingToSell} available`,
          userId: context.userId,
          userEmail: context.userEmail,
          correlationId,
          severity: 'high',
          tags: ['inventory', 'shortage', 'warning']
        });
      }
    }
  }

  private generateActivitySummary(action: string, data: any): string {
    switch (action) {
      case 'customer_payment':
        return `Payment received from ${data.customerName}: ${data.currency} ${data.amount}${data.paymentMethod ? ` via ${data.paymentMethod}` : ''}. Balance: ${currencyService.formatCurrency(data.balanceBefore, data.currency)} → ${currencyService.formatCurrency(data.balanceAfter, data.currency)}`;
      
      case 'supplier_payment':
        return `Payment sent to ${data.supplierName}: ${data.currency} ${data.amount}${data.paymentMethod ? ` via ${data.paymentMethod}` : ''}. Balance: ${currencyService.formatCurrency(data.balanceBefore, data.currency)} → ${currencyService.formatCurrency(data.balanceAfter, data.currency)}`;
      case 'sale':
        return `Sale to ${data.customerName}: ${data.itemCount} items, Total: $${data.total}${data.amountDue > 0 ? ` (Credit: $${data.amountDue})` : ''}`;
      
      case 'inventory_received':
        return `Received ${data.quantity} ${data.unit} of ${data.productName} from ${data.supplierName} (${data.type})`;
      
      default:
        return `Transaction completed: ${action}`;
    }
  }

  private generateCorrelationId(): string {
    return `corr-${createId()}`;
  }

  private generateId(): string {
    return createId();
  }

  // Query methods for comprehensive transaction history
  public getTransactionHistory(
    entityId?: string,
    entityType?: string,
    startDate?: string,
    endDate?: string
  ): any[] {
    return auditLogService.queryLogs({
      entityId,
      entityType: entityType as any,
      startDate,
      endDate,
      limit: 100
    });
  }

  public getBalanceHistory(entityId: string, entityType: 'customer' | 'supplier'): any[] {
    return auditLogService.getBalanceHistory(entityId, entityType);
  }

  public getCorrelatedTransactions(correlationId: string): string[] {
    return auditLogService.getCorrelatedTransactions(correlationId);
  }
}

export const enhancedTransactionService = EnhancedTransactionService.getInstance(); 