import { erpFinancialService } from './erpFinancialService';
import { SaleItem, Customer, Supplier } from '../types';

export interface POSSaleData {
  customer_id?: string;
  subtotal: number;
  total: number;
  payment_method: 'cash' | 'credit' | 'partial';
  amount_paid: number;
  amount_due: number;
  status: 'completed' | 'pending';
  notes?: string;
  created_by: string;
}

export interface POSSaleItem {
  product_id: string;
  product_name: string;
  supplier_id: string;
  supplier_name: string;
  quantity: number;
  weight?: number | null;
  unit_price: number;
  received_value: number;
  notes?: string | null;
  store_id: string;
  created_at: string;
  created_by: string;
}

export class POSAccountingIntegration {
  private static instance: POSAccountingIntegration;

  private constructor() {}

  public static getInstance(): POSAccountingIntegration {
    if (!POSAccountingIntegration.instance) {
      POSAccountingIntegration.instance = new POSAccountingIntegration();
    }
    return POSAccountingIntegration.instance;
  }

  /**
   * Process a completed POS sale and create appropriate accounting entries
   */
  public async processPOSSale(saleData: POSSaleData, items: POSSaleItem[]): Promise<{
    success: boolean;
    saleId?: string;
    journalEntryId?: string;
    error?: string;
    summary?: {
      transactionType: string;
      totalAmount: number;
      customerName?: string;
      itemsCount: number;
      cogsAmount: number;
      commissionsAmount: number;
    };
  }> {
    try {
      // Reload data to ensure we have the latest information
      erpFinancialService.reloadData();

      const saleId = `pos-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Convert POS data to ERP format
      const sale: Sale = {
        id: saleId,
        customerId: saleData.customer_id,
        items: items.map(item => ({
          id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          productId: item.product_id,
          productName: item.product_name,
          supplierId: item.supplier_id,
          supplierName: item.supplier_name,
          quantity: item.quantity,
          weight: item.weight || undefined,
          unitPrice: item.unit_price,
          receivedValue: item.received_value,
          notes: item.notes || ''
        })),
        subtotal: saleData.subtotal,
        total: saleData.total,
        // Map "partial" payment method to "cash" for ERP compatibility
        paymentMethod: saleData.payment_method === 'partial' ? 'cash' : saleData.payment_method,
        amountPaid: saleData.amount_paid,
        amountDue: saleData.amount_due,
        status: saleData.status,
        notes: saleData.notes,
        createdBy: saleData.created_by,
        createdAt: new Date().toISOString()
      };

      const saleItems: SaleItem[] = sale.items;

      let transactionSummary;
      let customerName = 'Walk-in Customer';

      // Determine transaction type and process accordingly
      if (saleData.payment_method === 'cash' || (saleData.payment_method === 'partial' && saleData.amount_due === 0)) {
        // Cash sale
        transactionSummary = erpFinancialService.processCashSale(sale, saleItems);
        
        if (saleData.customer_id) {
          const customers = JSON.parse(localStorage.getItem('erp_customers') || '[]');
          const customer = customers.find((c: Customer) => c.id === saleData.customer_id);
          if (customer) {
            customerName = customer.name;
          }
        }
      } else if (saleData.payment_method === 'credit' || saleData.amount_due > 0) {
        // Credit sale
        if (!saleData.customer_id) {
          throw new Error('Customer is required for credit sales');
        }

        const customers = JSON.parse(localStorage.getItem('erp_customers') || '[]');
        const customer = customers.find((c: Customer) => c.id === saleData.customer_id);
        if (!customer) {
          throw new Error('Customer not found');
        }

        customerName = customer.name;
        transactionSummary = erpFinancialService.processCustomerCreditSale(sale, saleItems);

        // If there was a partial payment, also process the payment
        if (saleData.amount_paid > 0) {
          await erpFinancialService.processCustomerPayment(
            saleData.customer_id,
            saleData.amount_paid,
            'USD',
            `Partial payment for sale ${saleId}`,
            saleData.created_by
          );
        }
      } else {
        throw new Error('Invalid payment method or sale configuration');
      }

      // Calculate additional metrics for summary
      const cogsAmount = this.calculateCOGS(items);
      const commissionsAmount = this.calculateCommissions(items);

      return {
        success: true,
        saleId: sale.id,
        journalEntryId: transactionSummary.journalEntryId,
        summary: {
          transactionType: transactionSummary.transactionType,
          totalAmount: saleData.total,
          customerName,
          itemsCount: items.length,
          cogsAmount,
          commissionsAmount
        }
      };

    } catch (error) {
      console.error('POS Accounting Integration Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Process a customer payment from POS
   */
  public async processPOSPayment(
    customerId: string,
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    createdBy: string
  ): Promise<{
    success: boolean;
    transactionId?: string;
    journalEntryId?: string;
    error?: string;
  }> {
    try {
      erpFinancialService.reloadData();
      
      const result = erpFinancialService.processCustomerPayment(
        customerId,
        amount,
        currency,
        description,
        createdBy
      );

      return {
        success: true,
        transactionId: result.transactionId,
        journalEntryId: result.journalEntryId
      };

    } catch (error) {
      console.error('POS Payment Integration Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Get enhanced customer information for POS display
   */
  public getEnhancedCustomerInfo(customerId: string): {
    customer: any;
    creditStatus: {
      available: number;
      limit: number;
      balance: number; // Updated to use balance field instead of currentDebt
      isOverLimit: boolean;
      agingDays: number;
    };
    recentTransactions: any[];
  } | null {
    try {
      const enhancedCustomer = erpFinancialService.getEnhancedCustomerData(customerId);
      if (!enhancedCustomer) return null;

      const recentTransactions = erpFinancialService
        .getTransactionHistory(customerId)
        .slice(0, 5) // Last 5 transactions
        .map(t => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          timestamp: t.timestamp,
          description: t.description
        }));

      return {
        customer: enhancedCustomer,
        creditStatus: {
          available: enhancedCustomer.availableCredit,
          limit: enhancedCustomer.creditLimit,
          balance: enhancedCustomer.balance || 0, // Updated to use balance field with null safety
          isOverLimit: (enhancedCustomer.balance || 0) > enhancedCustomer.creditLimit, // Updated to use balance field
          agingDays: enhancedCustomer.daysSinceLastPayment
        },
        recentTransactions
      };

    } catch (error) {
      console.error('Error getting enhanced customer info:', error);
      return null;
    }
  }

  /**
   * Calculate Cost of Goods Sold for given items
   */
  private calculateCOGS(items: POSSaleItem[]): number {
    let totalCOGS = 0;

    // Get inventory data
    const inventory = JSON.parse(localStorage.getItem('erp_inventory') || '[]');

    items.forEach(item => {
      // Find inventory items for this product/supplier (FIFO)
      const inventoryItems = inventory
        .filter((inv: any) => 
          inv.product_id === item.product_id && 
          inv.supplier_id === item.supplier_id &&
          inv.quantity > 0
        )
        .sort((a: any, b: any) => new Date(a.received_at || a.created_at).getTime() - new Date(b.received_at || b.created_at).getTime());

      let remainingQty = item.quantity;
      let itemCOGS = 0;

      inventoryItems.forEach((inv: any) => {
        if (remainingQty <= 0) return;
        
        const qtyFromThisLot = Math.min(remainingQty, inv.quantity);
        const lotCost = (inv.price || 0) * qtyFromThisLot;
        
        itemCOGS += lotCost;
        remainingQty -= qtyFromThisLot;
      });

      totalCOGS += itemCOGS;
    });

    return totalCOGS;
  }

  /**
   * Calculate commission amounts for given items
   */
  private calculateCommissions(items: POSSaleItem[]): number {
    let totalCommissions = 0;

    // Get inventory data
    const inventory = JSON.parse(localStorage.getItem('erp_inventory') || '[]');

    items.forEach(item => {
      // Find inventory items for this product/supplier (FIFO)
      const inventoryItems = inventory
        .filter((inv: any) => 
          inv.product_id === item.product_id && 
          inv.supplier_id === item.supplier_id &&
          inv.quantity > 0
        )
        .sort((a: any, b: any) => new Date(a.received_at || a.created_at).getTime() - new Date(b.received_at || b.created_at).getTime());

      let remainingQty = item.quantity;
      let itemCommission = 0;

      inventoryItems.forEach((inv: any) => {
        if (remainingQty <= 0) return;
        
        const qtyFromThisLot = Math.min(remainingQty, inv.quantity);
        const lotCost = (inv.price || 0) * qtyFromThisLot;
        const lotCommission = inv.type === 'commission' ? lotCost * (inv.commission_rate || 10) / 100 : 0;
        
        itemCommission += lotCommission;
        remainingQty -= qtyFromThisLot;
      });

      totalCommissions += itemCommission;
    });

    return totalCommissions;
  }

  /**
   * Get financial dashboard data for POS
   */
  public getDashboardSummary(): {
    todaysSales: number;
    todaysTransactionCount: number;
    cashDrawerAmount: number;
    pendingReceivables: number;
          topCustomers: Array<{
        name: string;
        totalSales: number;
        balance: number; // Updated to use balance field instead of currentDebt
      }>;
  } {
    try {
      const balanceSheet = erpFinancialService.generateBalanceSheet();
      const incomeStatement = erpFinancialService.generateIncomeStatement();
      const cashDrawer = erpFinancialService.getCashDrawerStatus();

      // Get today's transactions
      const today = new Date().toISOString().split('T')[0];
      const todaysTransactions = erpFinancialService.getJournalEntries(today, today);
      
      const todaysSales = todaysTransactions
        .filter(je => je.sourceType === 'sale')
        .reduce((sum, je) => sum + je.totalCredit, 0);

      // Get customer data for top customers
      const customers = JSON.parse(localStorage.getItem('erp_customers') || '[]');
      const topCustomers = customers
        .map((customer: Customer) => {
          const enhancedData = erpFinancialService.getEnhancedCustomerData(customer.id);
          return {
            name: customer.name,
            totalSales: enhancedData?.totalSales || 0,
            balance: customer.balance || 0 // Updated to use balance field with null safety
          };
        })
        .sort((a: { totalSales: number }, b: { totalSales: number }) => b.totalSales - a.totalSales)
        .slice(0, 5);

      return {
        todaysSales,
        todaysTransactionCount: todaysTransactions.filter(je => je.sourceType === 'sale').length,
        cashDrawerAmount: balanceSheet.assets.current.cash,
        pendingReceivables: balanceSheet.assets.current.accountsReceivable,
        topCustomers
      };

    } catch (error) {
      console.error('Error getting dashboard summary:', error);
      return {
        todaysSales: 0,
        todaysTransactionCount: 0,
        cashDrawerAmount: 0,
        pendingReceivables: 0,
        topCustomers: []
      };
    }
  }

  /**
   * Validate sale before processing
   */
  public validateSale(saleData: POSSaleData, items: POSSaleItem[]): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!items || items.length === 0) {
      errors.push('Sale must contain at least one item');
    }

    if (saleData.total <= 0) {
      errors.push('Sale total must be greater than zero');
    }

    if (saleData.payment_method === 'credit' && !saleData.customer_id) {
      errors.push('Customer is required for credit sales');
    }

    // Credit limit validation for credit sales
    if (saleData.customer_id && saleData.amount_due > 0) {
      const customerInfo = this.getEnhancedCustomerInfo(saleData.customer_id);
      if (customerInfo) {
        const newDebt = customerInfo.creditStatus.balance + saleData.amount_due; // Updated to use balance field
        if (newDebt > customerInfo.creditStatus.limit) {
          warnings.push(`Sale will exceed customer credit limit ($${customerInfo.creditStatus.limit})`);
        }

        if (customerInfo.creditStatus.agingDays > 30) {
          warnings.push(`Customer has overdue payments (${customerInfo.creditStatus.agingDays} days)`);
        }
      }
    }

    // Inventory validation
    const inventory = JSON.parse(localStorage.getItem('erp_inventory') || '[]');
    items.forEach(item => {
      const availableStock = inventory
        .filter((inv: any) => 
          inv.product_id === item.product_id && 
          inv.supplier_id === item.supplier_id &&
          inv.quantity > 0
        )
        .reduce((sum: number, inv: any) => sum + inv.quantity, 0);

      if (availableStock < item.quantity) {
        warnings.push(`Insufficient stock for ${item.product_name} (Available: ${availableStock}, Requested: ${item.quantity})`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

export const posAccountingIntegration = POSAccountingIntegration.getInstance(); 