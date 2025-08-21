import { Customer, Supplier, Transaction, SaleItem, InventoryItem, Product } from '../types';
import { StatementTransaction, StatementProductDetail } from '../types';

export interface AccountStatement {
  entityId: string;
  entityName: string;
  entityType: 'customer' | 'supplier';
  statementDate: string;
  dateRange: {
    start: string;
    end: string;
  };

  viewMode: 'summary' | 'detailed';
  transactions: StatementTransaction[];

  financialSummary: {
    openingBalance: {
      USD: number;
      LBP: number;
    };
    currentBalance: {
      USD: number;
      LBP: number;
    };
    totalSales: {
      USD: number;
      LBP: number;
    };
    totalPayments: {
      USD: number;
      LBP: number;
    };
    totalReceivings: {
      USD: number;
      LBP: number;
    };
    netChange: {
      USD: number;
      LBP: number;
    };
  };

  // Additional metrics for detailed view
  productSummary?: {
    totalProducts: number;
    topProducts: Array<{
      productName: string;
      totalQuantity: number;
      totalValue: number;
      averagePrice: number;
    }>;
    categoryBreakdown: Record<string, {
      quantity: number;
      value: number;
    }>;
  };
}

export class AccountStatementService {
  private static instance: AccountStatementService;

  public static getInstance(): AccountStatementService {
    if (!AccountStatementService.instance) {
      AccountStatementService.instance = new AccountStatementService();
    }
    return AccountStatementService.instance;
  }

  /**
   * Generate comprehensive account statement for a customer
   */
  public generateCustomerStatement(
    customer: Customer,
    sales: SaleItem[],
    transactions: Transaction[],
    products: Product[],
    inventory: InventoryItem[],
    dateRange?: { start: string; end: string },
    viewMode: 'summary' | 'detailed' = 'detailed'
  ): AccountStatement {
    const now = new Date();
    const startDate = dateRange?.start || new Date(now.getFullYear(), 0, 1).toISOString(); // Start of year
    const endDate = dateRange?.end || now.toISOString();

    // Filter transactions within date range
    const filteredSales = sales.filter(sale => 
      sale.customer_id === customer.id && 
      new Date(sale.created_at) >= new Date(startDate) &&
      new Date(sale.created_at) <= new Date(endDate)
    );

    const filteredTransactions = transactions.filter(transaction => 
      transaction.description.includes(customer.name) &&
      new Date(transaction.created_at) >= new Date(startDate) &&
      new Date(transaction.created_at) <= new Date(endDate)
    );

    // Build transaction history
    const statementTransactions: StatementTransaction[] = [];
    let runningBalance = {
      USD: customer.usd_balance || 0,
      LBP: customer.lb_balance || 0
    };

    // Add sales transactions
    filteredSales.forEach(sale => {
      const product = products.find(p => p.id === sale.product_id);
      const inventoryItem = inventory.find(i => i.id === sale.inventory_item_id);

      if (product) {
        // Create product details for detailed view
        const productDetails: StatementProductDetail[] = viewMode === 'detailed' ? [{
          productId: product.id,
          productName: product.name,
          quantity: sale.quantity,
          unit: inventoryItem?.unit || 'piece',
          unitPrice: sale.unit_price,
          totalPrice: sale.received_value,
          weight: sale.weight || undefined,
          notes: sale.notes || undefined
        }] : undefined;

        const transaction: StatementTransaction = {
          id: sale.id,
          date: sale.created_at,
          type: sale.payment_method === 'credit' ? 'credit_sale' : 'sale',
          description: viewMode === 'summary' 
            ? `${sale.payment_method === 'credit' ? 'Credit Sale' : 'Sale'}`
            : `Sale: ${product.name} (${sale.quantity} ${inventoryItem?.unit || 'piece'}${sale.weight ? `, ${sale.weight}kg` : ''})`,
          amount: sale.received_value,
          currency: 'USD', // Assuming USD for sales
          balanceAfter: runningBalance.USD,
          paymentMethod: sale.payment_method,
          productDetails
        };

        if (sale.payment_method === 'credit') {
          runningBalance.USD += sale.received_value;
          transaction.balanceAfter = runningBalance.USD;
        }

        statementTransactions.push(transaction);
      }
    });

    // Add payment transactions
    filteredTransactions.forEach(transaction => {
      if (transaction.type === 'income' && transaction.category === 'Customer Payment') {
        const transactionRecord: StatementTransaction = {
          id: transaction.id,
          date: transaction.created_at,
          type: 'payment',
          description: viewMode === 'summary' 
            ? 'Payment Received'
            : transaction.description,
          amount: transaction.amount,
          currency: transaction.currency as 'USD' | 'LBP',
          balanceAfter: runningBalance[transaction.currency as 'USD' | 'LBP'],
          reference: transaction.reference || undefined,
          paymentMethod: 'Payment Received'
        };

        // Update running balance
        if (transaction.currency === 'USD') {
          runningBalance.USD = Math.max(0, runningBalance.USD - transaction.amount);
        } else {
          runningBalance.LBP = Math.max(0, runningBalance.LBP - transaction.amount);
        }

        transactionRecord.balanceAfter = runningBalance[transaction.currency as 'USD' | 'LBP'];
        statementTransactions.push(transactionRecord);
      }
    });

    // Sort transactions by date
    statementTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate financial summary
    const totalSales = filteredSales.reduce((sum, sale) => {
      if (sale.payment_method === 'credit') {
        return sum + sale.received_value;
      }
      return sum;
    }, 0);

    const totalPayments = filteredTransactions
      .filter(t => t.type === 'income' && t.category === 'Customer Payment')
      .reduce((sum, t) => sum + t.amount, 0);

    const openingBalance = {
      USD: customer.usd_balance || 0,
      LBP: customer.lb_balance || 0
    };

    // Calculate product summary for detailed view
    const productSummary = viewMode === 'detailed' ? this.calculateProductSummary(filteredSales, products) : undefined;

    return {
      entityId: customer.id,
      entityName: customer.name,
      entityType: 'customer',
      statementDate: now.toISOString(),
      dateRange: { start: startDate, end: endDate },
      viewMode,
      transactions: statementTransactions,
      financialSummary: {
        openingBalance,
        currentBalance: runningBalance,
        totalSales: { USD: totalSales, LBP: 0 },
        totalPayments: { USD: totalPayments, LBP: 0 },
        totalReceivings: { USD: 0, LBP: 0 },
        netChange: {
          USD: totalPayments - totalSales,
          LBP: 0
        }
      },
      productSummary
    };
  }

  /**
   * Generate comprehensive account statement for a supplier
   */
  public generateSupplierStatement(
    supplier: Supplier,
    sales: SaleItem[],
    transactions: Transaction[],
    products: Product[],
    inventory: InventoryItem[],
    dateRange?: { start: string; end: string },
    viewMode: 'summary' | 'detailed' = 'detailed'
  ): AccountStatement {
    const now = new Date();
    const startDate = dateRange?.start || new Date(now.getFullYear(), 0, 1).toISOString();
    const endDate = dateRange?.end || now.toISOString();

    // Filter sales related to this supplier
    const filteredSales = sales.filter(sale => 
      sale.supplier_id === supplier.id && 
      new Date(sale.created_at) >= new Date(startDate) &&
      new Date(sale.created_at) <= new Date(endDate)
    );

    const filteredTransactions = transactions.filter(transaction => 
      transaction.description.includes(supplier.name) &&
      new Date(transaction.created_at) >= new Date(startDate) &&
      new Date(transaction.created_at) <= new Date(endDate)
    );

    // Build transaction history
    const statementTransactions: StatementTransaction[] = [];
    let runningBalance = {
      USD: supplier.usd_balance || 0,
      LBP: supplier.lb_balance || 0
    };

    // Add commission transactions (sales generate commission for suppliers)
    filteredSales.forEach(sale => {
      const product = products.find(p => p.id === sale.product_id);
      const inventoryItem = inventory.find(i => i.id === sale.inventory_item_id);

      if (product && inventoryItem) {
        const commissionAmount = (sale.received_value * (inventoryItem.commission_rate || 0.1)) / 100;

        // Create product details for detailed view
        const productDetails: StatementProductDetail[] = viewMode === 'detailed' ? [{
          productId: product.id,
          productName: product.name,
          quantity: sale.quantity,
          unit: inventoryItem.unit || 'piece',
          unitPrice: sale.unit_price,
          totalPrice: sale.received_value,
          weight: sale.weight || undefined,
          commissionRate,
          commissionAmount,
          notes: sale.notes || undefined
        }] : undefined;

        const transaction: StatementTransaction = {
          id: sale.id,
          date: sale.created_at,
          type: 'commission',
          description: viewMode === 'summary'
            ? `Commission (${commissionRate}%)`
            : `Commission: ${product.name} sale (${commissionRate}% of $${sale.received_value.toFixed(2)})`,
          amount: commissionAmount,
          currency: 'USD',
          balanceAfter: runningBalance.USD,
          reference: `SALE-${sale.id.slice(-8)}`,
          productDetails
        };

        runningBalance.USD += commissionAmount;
        transaction.balanceAfter = runningBalance.USD;
        statementTransactions.push(transaction);
      }
    });

    // Add payment transactions
    filteredTransactions.forEach(transaction => {
      if (transaction.type === 'expense' && transaction.category === 'Supplier Payment') {
        const transactionRecord: StatementTransaction = {
          id: transaction.id,
          date: transaction.created_at,
          type: 'payment',
          description: viewMode === 'summary'
            ? 'Payment Sent'
            : transaction.description,
          amount: transaction.amount,
          currency: transaction.currency as 'USD' | 'LBP',
          balanceAfter: runningBalance[transaction.currency as 'USD' | 'LBP'],
          reference: transaction.reference || undefined,
          paymentMethod: 'Payment Sent'
        };

        // Update running balance
        if (transaction.currency === 'USD') {
          runningBalance.USD = Math.max(0, runningBalance.USD - transaction.amount);
        } else {
          runningBalance.LBP = Math.max(0, runningBalance.LBP - transaction.amount);
        }

        transactionRecord.balanceAfter = runningBalance[transaction.currency as 'USD' | 'LBP'];
        statementTransactions.push(transactionRecord);
      }
    });

    // Sort transactions by date
    statementTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate financial summary
    const totalCommissions = filteredSales.reduce((sum, sale) => {
      const inventoryItem = inventory.find(i => i.id === sale.inventory_item_id);
      const commissionRate = inventoryItem?.commission_rate || 0.1;
      return sum + ((sale.received_value * commissionRate) / 100);
    }, 0);

    const totalPayments = filteredTransactions
      .filter(t => t.type === 'expense' && t.category === 'Supplier Payment')
      .reduce((sum, t) => sum + t.amount, 0);

    const openingBalance = {
      USD: supplier.usd_balance || 0,
      LBP: supplier.lb_balance || 0
    };

    // Calculate product summary for detailed view
    const productSummary = viewMode === 'detailed' ? this.calculateProductSummary(filteredSales, products) : undefined;

    return {
      entityId: supplier.id,
      entityName: supplier.name,
      entityType: 'supplier',
      statementDate: now.toISOString(),
      dateRange: { start: startDate, end: endDate },
      viewMode,
      transactions: statementTransactions,
      financialSummary: {
        openingBalance,
        currentBalance: runningBalance,
        totalSales: { USD: 0, LBP: 0 },
        totalPayments: { USD: totalPayments, LBP: 0 },
        totalReceivings: { USD: totalCommissions, LBP: 0 },
        netChange: {
          USD: totalCommissions - totalPayments,
          LBP: 0
        }
      },
      productSummary
    };
  }

  /**
   * Calculate product summary statistics
   */
  private calculateProductSummary(sales: SaleItem[], products: Product[]): {
    totalProducts: number;
    topProducts: Array<{
      productName: string;
      totalQuantity: number;
      totalValue: number;
      averagePrice: number;
    }>;
    categoryBreakdown: Record<string, {
      quantity: number;
      value: number;
    }>;
  } {
    const productStats = new Map<string, {
      productName: string;
      category: string;
      totalQuantity: number;
      totalValue: number;
      transactionCount: number;
    }>();

    // Aggregate product data
    sales.forEach(sale => {
      const product = products.find(p => p.id === sale.product_id);
      if (!product) return;

      const existing = productStats.get(sale.product_id) || {
        productName: product.name,
        category: product.category,
        totalQuantity: 0,
        totalValue: 0,
        transactionCount: 0
      };

      existing.totalQuantity += sale.quantity;
      existing.totalValue += sale.received_value;
      existing.transactionCount += 1;

      productStats.set(sale.product_id, existing);
    });

    // Calculate top products
    const topProducts = Array.from(productStats.values())
      .map(stat => ({
        productName: stat.productName,
        totalQuantity: stat.totalQuantity,
        totalValue: stat.totalValue,
        averagePrice: stat.totalValue / stat.totalQuantity
      }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 10);

    // Calculate category breakdown
    const categoryBreakdown: Record<string, { quantity: number; value: number }> = {};

    productStats.forEach(stat => {
      if (!categoryBreakdown[stat.category]) {
        categoryBreakdown[stat.category] = { quantity: 0, value: 0 };
      }
      categoryBreakdown[stat.category].quantity += stat.totalQuantity;
      categoryBreakdown[stat.category].value += stat.totalValue;
    });

    return {
      totalProducts: productStats.size,
      topProducts,
      categoryBreakdown
    };
  }

  /**
   * Export statement to PDF format
   */
  public async exportToPDF(statement: AccountStatement): Promise<Blob> {
    // This would integrate with a PDF library like jsPDF
    // For now, return a mock blob
    const content = this.generateStatementText(statement);
    return new Blob([content], { type: 'text/plain' });
  }

  /**
   * Generate printable text version of statement
   */
  private generateStatementText(statement: AccountStatement): string {
    let text = `ACCOUNT STATEMENT\n`;
    text += `==================\n\n`;
    text += `Entity: ${statement.entityName}\n`;
    text += `Type: ${statement.entityType.charAt(0).toUpperCase() + statement.entityType.slice(1)}\n`;
    text += `View Mode: ${statement.viewMode.charAt(0).toUpperCase() + statement.viewMode.slice(1)}\n`;
    text += `Statement Date: ${new Date(statement.statementDate).toLocaleDateString()}\n`;
    text += `Period: ${new Date(statement.dateRange.start).toLocaleDateString()} - ${new Date(statement.dateRange.end).toLocaleDateString()}\n\n`;

    // Financial Summary
    text += `FINANCIAL SUMMARY\n`;
    text += `================\n`;
    text += `Opening Balance (USD): $${statement.financialSummary.openingBalance.USD.toFixed(2)}\n`;
    text += `Opening Balance (LBP): ${statement.financialSummary.openingBalance.LBP.toLocaleString()}\n`;
    text += `Current Balance (USD): $${statement.financialSummary.currentBalance.USD.toFixed(2)}\n`;
    text += `Current Balance (LBP): ${statement.financialSummary.currentBalance.LBP.toLocaleString()}\n\n`;

    // Product Summary (for detailed view)
    if (statement.viewMode === 'detailed' && statement.productSummary) {
      text += `PRODUCT SUMMARY\n`;
      text += `==============\n`;
      text += `Total Products: ${statement.productSummary.totalProducts}\n\n`;

      text += `Top Products:\n`;
      statement.productSummary.topProducts.forEach((product, index) => {
        text += `${index + 1}. ${product.productName}: ${product.totalQuantity} units, $${product.totalValue.toFixed(2)} (avg: $${product.averagePrice.toFixed(2)})\n`;
      });
      text += `\n`;

      text += `Category Breakdown:\n`;
      Object.entries(statement.productSummary.categoryBreakdown).forEach(([category, data]) => {
        text += `${category}: ${data.quantity} units, $${data.value.toFixed(2)}\n`;
      });
      text += `\n`;
    }

    // Transaction History
    text += `TRANSACTION HISTORY\n`;
    text += `==================\n`;
    statement.transactions.forEach(transaction => {
      text += `${new Date(transaction.date).toLocaleDateString()} - ${transaction.type.toUpperCase()}\n`;
      text += `  ${transaction.description}\n`;
      text += `  Amount: ${transaction.currency} ${transaction.amount.toFixed(2)}\n`;
      text += `  Balance After: ${transaction.currency} ${transaction.balanceAfter.toFixed(2)}\n`;
      if (transaction.reference) {
        text += `  Reference: ${transaction.reference}\n`;
      }

      // Add product details for detailed view
      if (statement.viewMode === 'detailed' && transaction.productDetails) {
        transaction.productDetails.forEach(detail => {
          text += `    Product: ${detail.productName}\n`;
          text += `    Quantity: ${detail.quantity} ${detail.unit}\n`;
          text += `    Unit Price: $${detail.unitPrice.toFixed(2)}\n`;
          text += `    Total: $${detail.totalPrice.toFixed(2)}\n`;
          if (detail.weight) text += `    Weight: ${detail.weight}kg\n`;
          if (detail.commissionRate) text += `    Commission: ${detail.commissionRate}% ($${detail.commissionAmount?.toFixed(2)})\n`;
          if (detail.notes) text += `    Notes: ${detail.notes}\n`;
        });
      }
      text += `\n`;
    });

    return text;
  }
}