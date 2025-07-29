import { currencyService } from './currencyService';
import { auditLogService } from './auditLogService';
import { transactionService, TransactionResult } from './transactionService';
import { 
  Transaction, 
  AccountsReceivable, 
  AccountsPayable, 
  Customer, 
  Supplier,
  Sale,
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
    options: {
      paymentMethod?: 'cash' | 'card' | 'transfer';
      reference?: string;
      updateCustomerBalance?: boolean;
      createReceivable?: boolean;
    } = {}
  ): Promise<EnhancedTransactionResult> {
    try {
      // Get customer data for balance tracking
      const customers = JSON.parse(localStorage.getItem('erp_customers') || '[]');
      const customer = customers.find((c: Customer) => c.id === customerId);
      
      if (!customer) {
        throw new Error('Customer not found');
      }

      const balanceBefore = customer.currentDebt;
      const amountInUSD = currencyService.convertCurrency(amount, currency, 'USD');
      const balanceAfter = Math.max(0, balanceBefore - amountInUSD);

      // Create correlation ID for this transaction group
      const correlationId = context.correlationId || this.generateCorrelationId();

      // Process the payment using existing service
      const result = await transactionService.processCustomerPayment(
        customerId,
        amount,
        currency,
        description,
        context.userId,
        {
          updateCustomerBalance: options.updateCustomerBalance,
          createReceivable: options.createReceivable
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
          changedFields: ['currentDebt'],
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
        context
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
    options: {
      paymentMethod?: 'cash' | 'card' | 'transfer';
      reference?: string;
      updateSupplierBalance?: boolean;
      createPayable?: boolean;
    } = {}
  ): Promise<EnhancedTransactionResult> {
    try {
      // Get supplier data
      const suppliers = JSON.parse(localStorage.getItem('erp_suppliers') || '[]');
      const supplier = suppliers.find((s: Supplier) => s.id === supplierId);
      
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      // Calculate current balance owed to supplier
      const payables = JSON.parse(localStorage.getItem('erp_accounts_payable') || '[]');
      const supplierPayables = payables.filter((ap: AccountsPayable) => 
        ap.supplierId === supplierId && ap.status !== 'paid'
      );
      
      const balanceBefore = supplierPayables.reduce((sum: number, ap: AccountsPayable) => 
        sum + ap.amountDue, 0
      );

      const amountInUSD = currencyService.convertCurrency(amount, currency, 'USD');
      const balanceAfter = Math.max(0, balanceBefore - amountInUSD);

      const correlationId = context.correlationId || this.generateCorrelationId();

      // Process payment
      const result = await transactionService.processSupplierPayment(
        supplierId,
        amount,
        currency,
        description,
        context.userId,
        {
          updateSupplierBalance: options.updateSupplierBalance,
          createPayable: options.createPayable
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
        context
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
    sale: Omit<Sale, 'id' | 'createdAt'>,
    items: Omit<SaleItem, 'id'>[],
    context: TransactionContext
  ): Promise<EnhancedTransactionResult> {
    try {
      const correlationId = context.correlationId || this.generateCorrelationId();
      const saleId = this.generateId();
      const timestamp = new Date().toISOString();

      // Create sale record
      const completeSale: Sale = {
        ...sale,
        id: saleId,
        createdAt: timestamp
      };

      // Create sale items with IDs
      const completeSaleItems: SaleItem[] = items.map(item => ({
        ...item,
        id: this.generateId()
      }));

      // Store sale data
      const existingSales = JSON.parse(localStorage.getItem('erp_sales') || '[]');
      existingSales.push(completeSale);
      localStorage.setItem('erp_sales', JSON.stringify(existingSales));

      // Process customer balance if credit sale
      let customerBalanceChange: BalanceSnapshot | undefined;
      let customer: Customer | undefined;

      if (sale.customerId && sale.amountDue > 0) {
        const customers = JSON.parse(localStorage.getItem('erp_customers') || '[]');
        customer = customers.find((c: Customer) => c.id === sale.customerId);
        
        if (customer) {
          const balanceBefore = customer.currentDebt;
          const balanceAfter = balanceBefore + sale.amountDue;
          
          // Update customer balance
          const updatedCustomers = customers.map((c: Customer) => 
            c.id === sale.customerId 
              ? { ...c, currentDebt: balanceAfter }
              : c
          );
          localStorage.setItem('erp_customers', JSON.stringify(updatedCustomers));

          customerBalanceChange = {
            entityId: sale.customerId,
            entityType: 'customer',
            balanceBefore,
            balanceAfter,
            currency: 'USD',
            timestamp
          };

          // Create accounts receivable for credit amount
          if (sale.amountDue > 0) {
            const receivable: AccountsReceivable = {
              id: this.generateId(),
              customerId: sale.customerId,
              customerName: customer.name,
              invoiceNumber: `SALE-${saleId.slice(-8)}`,
              amount: sale.total,
              amountPaid: sale.amountPaid,
              amountDue: sale.amountDue,
              dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              status: 'pending',
              createdAt: timestamp
            };

            const existingReceivables = JSON.parse(localStorage.getItem('erp_accounts_receivable') || '[]');
            existingReceivables.push(receivable);
            localStorage.setItem('erp_accounts_receivable', JSON.stringify(existingReceivables));
          }
        }
      }

      // Update inventory quantities
      await this.updateInventoryForSale(completeSaleItems, correlationId, context);

      // Log the sale
      const auditLogId = auditLogService.logSaleTransaction({
        sale: completeSale,
        items: completeSaleItems,
        customerId: sale.customerId,
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
        total: sale.total,
        paymentMethod: sale.paymentMethod,
        amountDue: sale.amountDue
      });

      return {
        success: true,
        transactionId: saleId,
        balanceBefore: customerBalanceChange?.balanceBefore || 0,
        balanceAfter: customerBalanceChange?.balanceAfter || 0,
        affectedRecords: [saleId, ...(sale.customerId ? [sale.customerId] : [])],
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
    context: TransactionContext
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

      // Store inventory item
      const existingInventory = JSON.parse(localStorage.getItem('erp_inventory') || '[]');
      existingInventory.push(inventoryItem);
      localStorage.setItem('erp_inventory', JSON.stringify(existingInventory));

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
    context: TransactionContext
  ): Promise<void> {
    const receivables = JSON.parse(localStorage.getItem('erp_accounts_receivable') || '[]');
    const customerReceivables = receivables.filter((ar: AccountsReceivable) => 
      ar.customerId === customerId && ar.status !== 'paid'
    );

    let remainingAmount = amountInUSD;
    const updatedReceivables = [...receivables];

    for (const receivable of customerReceivables) {
      if (remainingAmount <= 0) break;
      
      const paymentAmount = Math.min(remainingAmount, receivable.amountDue);
      const previousStatus = receivable.status;
      
      receivable.amountPaid += paymentAmount;
      receivable.amountDue -= paymentAmount;
      remainingAmount -= paymentAmount;
      
      if (receivable.amountDue === 0) {
        receivable.status = 'paid';
        receivable.lastPaymentDate = new Date().toISOString();
      } else {
        receivable.status = 'partial';
      }

      // Log receivable update
      auditLogService.log({
        action: 'receivable_updated',
        entityType: 'accounts_receivable',
        entityId: receivable.id,
        entityName: `Invoice ${receivable.invoiceNumber}`,
        description: `Payment applied: $${paymentAmount.toFixed(2)}. Status: ${previousStatus} → ${receivable.status}`,
        userId: context.userId,
        userEmail: context.userEmail,
        previousData: { 
          amountPaid: receivable.amountPaid - paymentAmount,
          amountDue: receivable.amountDue + paymentAmount,
          status: previousStatus
        },
        newData: { 
          amountPaid: receivable.amountPaid,
          amountDue: receivable.amountDue,
          status: receivable.status
        },
        changedFields: ['amountPaid', 'amountDue', 'status'],
        relatedTransactions: [transactionId],
        correlationId,
        severity: 'medium',
        tags: ['receivable', 'payment', 'status_change']
      });
    }

    localStorage.setItem('erp_accounts_receivable', JSON.stringify(updatedReceivables));
  }

  private async updateAccountsPayableForPayment(
    supplierId: string,
    amountInUSD: number,
    transactionId: string,
    correlationId: string,
    context: TransactionContext
  ): Promise<void> {
    const payables = JSON.parse(localStorage.getItem('erp_accounts_payable') || '[]');
    const supplierPayables = payables.filter((ap: AccountsPayable) => 
      ap.supplierId === supplierId && ap.status !== 'paid'
    );

    let remainingAmount = amountInUSD;
    const updatedPayables = [...payables];

    for (const payable of supplierPayables) {
      if (remainingAmount <= 0) break;
      
      const paymentAmount = Math.min(remainingAmount, payable.amountDue);
      const previousStatus = payable.status;
      
      payable.amountPaid += paymentAmount;
      payable.amountDue -= paymentAmount;
      remainingAmount -= paymentAmount;
      
      if (payable.amountDue === 0) {
        payable.status = 'paid';
        payable.lastPaymentDate = new Date().toISOString();
      } else {
        payable.status = 'partial';
      }

      // Log payable update
      auditLogService.log({
        action: 'payable_updated',
        entityType: 'accounts_payable',
        entityId: payable.id,
        entityName: `Invoice ${payable.invoiceNumber}`,
        description: `Payment sent: $${paymentAmount.toFixed(2)}. Status: ${previousStatus} → ${payable.status}`,
        userId: context.userId,
        userEmail: context.userEmail,
        previousData: { 
          amountPaid: payable.amountPaid - paymentAmount,
          amountDue: payable.amountDue + paymentAmount,
          status: previousStatus
        },
        newData: { 
          amountPaid: payable.amountPaid,
          amountDue: payable.amountDue,
          status: payable.status
        },
        changedFields: ['amountPaid', 'amountDue', 'status'],
        relatedTransactions: [transactionId],
        correlationId,
        severity: 'medium',
        tags: ['payable', 'payment', 'status_change']
      });
    }

    localStorage.setItem('erp_accounts_payable', JSON.stringify(updatedPayables));
  }

  private async updateInventoryForSale(
    items: SaleItem[],
    correlationId: string,
    context: TransactionContext
  ): Promise<void> {
    const inventory = JSON.parse(localStorage.getItem('erp_inventory') || '[]');
    const updatedInventory = [...inventory];

    for (const saleItem of items) {
      // Find matching inventory items (FIFO - First In, First Out)
      const matchingItems = updatedInventory
        .filter((inv: InventoryItem) => 
          inv.productId === saleItem.productId && 
          inv.supplierId === saleItem.supplierId &&
          inv.quantity > 0
        )
        .sort((a: InventoryItem, b: InventoryItem) => 
          new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
        );

      let remainingToSell = saleItem.quantity;

      for (const inventoryItem of matchingItems) {
        if (remainingToSell <= 0) break;

        const quantityToDeduct = Math.min(remainingToSell, inventoryItem.quantity);
        const previousQuantity = inventoryItem.quantity;
        
        inventoryItem.quantity -= quantityToDeduct;
        remainingToSell -= quantityToDeduct;

        // Log inventory reduction
        auditLogService.log({
          action: 'inventory_sold',
          entityType: 'inventory_item',
          entityId: inventoryItem.id,
          entityName: saleItem.productName,
          description: `Inventory reduced by ${quantityToDeduct} ${inventoryItem.unit}. Remaining: ${inventoryItem.quantity}`,
          userId: context.userId,
          userEmail: context.userEmail,
          previousData: { quantity: previousQuantity },
          newData: { quantity: inventoryItem.quantity },
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

    localStorage.setItem('erp_inventory', JSON.stringify(updatedInventory));
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
    return `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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