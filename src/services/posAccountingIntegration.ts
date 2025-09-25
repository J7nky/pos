import { erpFinancialService } from './erpFinancialService';
import { BillLineItem, Customer, Supplier } from '../types';
import { userProfile } from '../auth/authContext';

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
      
      // Convert POS data to ERP format - create sale items directly
      const billLineItems: BillLineItem[] = items.map(item => ({
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        inventoryItemId: '', // Will be populated by ERP service
        productId: item.product_id,
        supplierId: item.supplier_id,
        quantity: item.quantity,
        weight: item.weight || undefined,
        unitPrice: item.unit_price,
        receivedValue: item.received_value,
        paymentMethod: saleData.payment_method === 'partial' ? 'cash' : saleData.payment_method,
        notes: item.notes || undefined,
        customerId: saleData.customer_id || undefined,   
        createdBy: saleData.created_by,
        storeId: item.store_id,
        createdAt: new Date().toISOString(),
        synced: false,
        // Add ERP service compatibility fields
        productName: item.product_name,
        supplierName: item.supplier_name,
        totalPrice: item.unit_price * item.quantity
      }));

      // Create temporary sale object for ERP service compatibility
      const tempSale = {
        id: saleId,
        customerId: saleData.customer_id,
        paymentMethod: saleData.payment_method === 'partial' ? 'cash' : saleData.payment_method,
        total: saleData.total,
        amountPaid: saleData.amount_paid,
        amountDue: saleData.amount_due,
        createdAt: new Date().toISOString(),
        createdBy: saleData.created_by
      };

      let transactionSummary;
      let customerName = 'Walk-in Customer';

      // Determine transaction type and process accordingly
      if (saleData.payment_method === 'cash' || (saleData.payment_method === 'partial' && saleData.amount_due === 0)) {
        // Cash sale
        transactionSummary = erpFinancialService.processCashSale(tempSale, saleItems);
        
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
        transactionSummary = erpFinancialService.processCustomerCreditSale(tempSale, saleItems);
const storeId = userProfile?.store_id || 'default-store';
        // If there was a partial payment, also process the payment
        if (saleData.amount_paid > 0) {
          await erpFinancialService.processCustomerPayment(
            saleData.customer_id,
            saleData.amount_paid,
            'USD',
            `Partial payment for sale ${saleId}`,
            saleData.created_by,
            storeId
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
        saleId: tempSale.id,
        journalEntryId: transactionSummary.transactionId,
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
      const storeId = userProfile?.store_id || 'default-store';

      erpFinancialService.reloadData(storeId);
      const result = erpFinancialService.processCustomerPayment(
        customerId,
        amount,
        currency,
        description,
        createdBy,
        storeId
      );

      return {
        success: true,
        transactionId: result.transactionId,
        journalEntryId: result.transactionId
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
      // Get customer data from localStorage
      const customers = JSON.parse(localStorage.getItem('erp_customers') || '[]');
      const customer = customers.find((c: Customer) => c.id === customerId);
      if (!customer) return null;

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

      // Calculate credit status
      const balance = customer.balance || 0;
      const creditLimit = 1000; // Default credit limit
      const available = Math.max(0, creditLimit - balance);

      return {
        customer,
        creditStatus: {
          available,
          limit: creditLimit,
          balance,
          isOverLimit: balance > creditLimit,
          agingDays: 0 // TODO: Calculate from transaction history
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
      const cashDrawer = erpFinancialService.getCashDrawerStatus();

      // Get today's transactions from localStorage
      const today = new Date().toISOString().split('T')[0];
      const transactions = JSON.parse(localStorage.getItem('erp_financial_transactions') || '[]');
      const todaysTransactions = transactions.filter((t: any) => 
        t.timestamp.startsWith(today) && t.type === 'cash_sale'
      );
      
      const todaysSales = todaysTransactions.reduce((sum: number, t: any) => sum + t.amount, 0);

      // Get customer data for top customers
      const customers = JSON.parse(localStorage.getItem('erp_customers') || '[]');
      const topCustomers = customers
        .map((customer: Customer) => ({
          name: customer.name,
          totalSales: 0, // TODO: Calculate from transaction history
          balance: customer.balance || 0 // Updated to use balance field with null safety
        }))
        .sort((a: { totalSales: number }, b: { totalSales: number }) => b.totalSales - a.totalSales)
        .slice(0, 5);

      return {
        todaysSales,
        todaysTransactionCount: todaysTransactions.length,
        cashDrawerAmount: cashDrawer?.currentAmount || 0,
        pendingReceivables: 0, // TODO: Calculate from accounts receivable
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