import { LocalSaleItem } from '../lib/db';
import { Customer, Supplier, Transaction, SaleItem, InventoryItem, Product, inventory_bills } from '../types';
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

  // Normalize to local day boundaries and return ISO strings
  private startOfDayISO(dateInput: string | Date): string {
    const d = new Date(dateInput);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  private endOfDayISO(dateInput: string | Date): string {
    const d = new Date(dateInput);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }

  /**
   * Compute opening balances for a customer prior to the given start date.
   * Opening = sum(credit sales) - sum(payments), per currency
   */
  private computeCustomerOpeningBalance(
    customerId: string,
    allSales: LocalSaleItem[],
    allTransactions: Transaction[],
    startDateISO: string
  ): { USD: number; LBP: number } {
    const startDate = new Date(startDateISO);

    // Credit sales (increase receivable) before start date (assumed LBP)
    const preCreditSalesLBP = allSales.filter(s =>
      s.customer_id === customerId &&
      s.payment_method === 'credit' &&
      !!s.created_at && new Date(s.created_at) < startDate
    );
    const creditSalesSumLBP = preCreditSalesLBP.reduce((sum, s) => sum + (s.received_value || 0), 0);

    // Customer payments (decrease receivable) before start date
    const prePayments = allTransactions.filter(t =>
      t.customer_id === customerId &&
      t.type === 'income' &&
      t.category === 'Customer Payment' &&
      new Date(t.created_at) < startDate
    );
    const paymentsSumUSD = prePayments
      .filter(t => t.currency === 'USD')
      .reduce((sum, t) => sum + t.amount, 0);
    const paymentsSumLBP = prePayments
      .filter(t => t.currency === 'LBP')
      .reduce((sum, t) => sum + t.amount, 0);

    // Opening per currency
    return {
      USD: 0 - paymentsSumUSD,
      LBP: creditSalesSumLBP - paymentsSumLBP
    };
  }

  /**
   * Build period transactions (sorted) and compute running balances per currency for a customer
   */
  private buildCustomerPeriodTransactions(
    customer: Customer,
    sales: LocalSaleItem[],
    transactions: Transaction[],
    products: Product[],
    inventory: InventoryItem[],
    startDateISO: string,
    endDateISO: string,
    viewMode: 'summary' | 'detailed',
    opening: { USD: number; LBP: number }
  ): { statementTransactions: StatementTransaction[]; ending: { USD: number; LBP: number }; totals: { salesLBP: number; paymentsUSD: number; paymentsLBP: number } } {
    const startDate = new Date(startDateISO);
    const endDate = new Date(endDateISO);
    // Period credit sales (LBP)
    const periodSales = sales.filter(s =>
      s.customer_id === customer.id &&
      s.payment_method === 'credit' &&
      !!s.created_at && new Date(s.created_at) >= startDate && new Date(s.created_at) <= endDate
    );


    // Period customer payments (USD or LBP)
    const periodPayments = transactions.filter(t =>
      t.customer_id === customer.id &&
      t.type === 'income' &&
      t.category === 'Customer Payment' &&
      new Date(t.created_at) >= startDate && new Date(t.created_at) <= endDate
    );

    type RawEvent = {
      id: string;
      date: string;
      kind: 'sale' | 'payment';
      currency: 'USD' | 'LBP';
      amount: number; // positive amount for display
      delta: number; // signed effect on balance
      // optional UI fields
      productId?: string;
      productName?: string;
      unit?: string;
      quantity?: number;
      weight?: number;
      unitPrice?: number;
      notes?: string | null;
    };

    const saleEvents: RawEvent[] = periodSales.map(sale => {
      const product = products.find(p => p.id === sale.product_id);
      const inventoryItem = inventory.find(i => i.id === sale.inventory_item_id);
      return {
        id: sale.id,
        date: sale.created_at || new Date().toISOString(),
        kind: 'sale',
        currency: 'LBP',
        amount: sale.received_value || 0,
        delta: (sale.received_value || 0),
        productId: product?.id,
        productName: product?.name,
        unit: inventoryItem?.unit || 'piece',
        quantity: sale.quantity,
        weight: sale.weight ?? undefined,
        unitPrice: sale.unit_price,
        notes: sale.notes || null
      };
    });

    const paymentEvents: RawEvent[] = periodPayments.map(t => ({
      id: t.id,
      date: t.created_at,
      kind: 'payment',
      currency: t.currency,
      amount: t.amount,
      delta: -t.amount
    }));

    const events: RawEvent[] = [...saleEvents, ...paymentEvents].sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (da !== db) return da - db;
      // Stable tie-breaker: sales before payments
      if (a.kind !== b.kind) return a.kind === 'sale' ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    const statementTransactions: StatementTransaction[] = [];
    let runningUSD = opening.USD;
    let runningLBP = opening.LBP;

    for (const ev of events) {
      if (ev.currency === 'USD') {
        runningUSD += ev.delta;
      } else {
        runningLBP += ev.delta;
      }

      if (ev.kind === 'sale') {
        const productDetails: StatementProductDetail[] = viewMode === 'detailed' && ev.productId && ev.productName ? [{
          productId: ev.productId,
          productName: ev.productName,
          quantity: ev.quantity || 0,
          unit: ev.unit || 'piece',
          unitPrice: ev.unitPrice || 0,
          totalPrice: ev.amount,
          weight: ev.weight,
          notes: ev.notes || undefined
        }] : [];

        statementTransactions.push({
          id: ev.id,
          date: ev.date,
          type: 'sale',
          description: viewMode === 'summary' ? 'Credit Sale' : `Sale: ${ev.productName || '-' } | ${ev.unit || 'piece'}`,
          quantity: ev.quantity || 0,
          weight: ev.weight || 0,
          price: ev.unitPrice || 0,
          amount: ev.amount,
          currency: 'LBP',
          balanceAfter: runningLBP,
          paymentMethod: 'credit',
          productDetails,
          reference: 'S-' + ev.id.slice(-8)
        });
      } else {
        statementTransactions.push({
          id: ev.id,
          date: ev.date,
          type: 'payment',
          description: 'Payment Received',
          quantity: 0,
          weight: 0,
          price: 0,
          amount: ev.amount,
          currency: ev.currency,
          balanceAfter: ev.currency === 'USD' ? runningUSD : runningLBP,
          reference: 'P-' + ev.id.slice(-8),
          paymentMethod: 'Payment Received'
        });
      }
    }

    const totals = {
      salesLBP: saleEvents.reduce((s, e) => s + e.amount, 0),
      paymentsUSD: paymentEvents.filter(e => e.currency === 'USD').reduce((s, e) => s + e.amount, 0),
      paymentsLBP: paymentEvents.filter(e => e.currency === 'LBP').reduce((s, e) => s + e.amount, 0)
    };

    return { statementTransactions, ending: { USD: runningUSD, LBP: runningLBP }, totals };
  }

  /**
   * Compute opening balances for a supplier prior to the given start date.
   * Opening LBP = sum(pre-period commissions) - sum(pre-period supplier payments LBP)
   * Opening USD = 0 - sum(pre-period supplier payments USD)
   * Note: Commission lookup follows existing code pattern using inventory_bills.
   */
  private computeSupplierOpeningBalance(
    supplierId: string,
    allSales: SaleItem[],
    allTransactions: Transaction[],
    inventoryBills: inventory_bills[],
    startDateISO: string
  ): { USD: number; LBP: number } {
    const startDate = new Date(startDateISO);

    // Pre-period commissions (LBP) per existing logic
    const preSales = allSales.filter(s =>
      s.supplierId === supplierId && !!s.createdAt && new Date(s.createdAt) < startDate
    );
    const commissionsLBP = preSales.reduce((sum, sale) => {
      const invBill = inventoryBills.find(i => i.id === (sale as any).inventoryItemId);
      const commissionRate = invBill?.commission_rate ? Number(invBill.commission_rate) : 0.1;
      const commission = (sale.totalPrice * commissionRate) / 100;
      return sum + commission;
    }, 0);

    // Pre-period supplier payments
    const prePayments = allTransactions.filter(t =>
      t.type === 'expense' &&
      t.category === 'Supplier Payment' &&
      !!t.created_at && new Date(t.created_at) < startDate &&
      // Heuristic: description contains supplier name OR future enhancement: use supplier_id when available
      true
    );
    const paymentsUSD = prePayments.filter(t => t.currency === 'USD').reduce((s, t) => s + t.amount, 0);
    const paymentsLBP = prePayments.filter(t => t.currency === 'LBP').reduce((s, t) => s + t.amount, 0);

    return { USD: 0 - paymentsUSD, LBP: commissionsLBP - paymentsLBP };
  }

  /**
   * Build period transactions and running balances for a supplier
   */
  private buildSupplierPeriodTransactions(
    supplier: Supplier,
    sales: SaleItem[],
    transactions: Transaction[],
    products: Product[],
    inventoryBills: inventory_bills[],
    startDateISO: string,
    endDateISO: string,
    viewMode: 'summary' | 'detailed',
    opening: { USD: number; LBP: number }
  ): { statementTransactions: StatementTransaction[]; ending: { USD: number; LBP: number }; totals: { commissionsLBP: number; paymentsUSD: number; paymentsLBP: number } } {
    const startDate = new Date(startDateISO);
    const endDate = new Date(endDateISO);

    const periodSales = sales.filter(s =>
      s.supplierId === supplier.id && !!s.createdAt && new Date(s.createdAt) >= startDate && new Date(s.createdAt) <= endDate
    );
    const periodPayments = transactions.filter(t =>
      t.type === 'expense' && t.category === 'Supplier Payment' &&
      !!t.created_at && new Date(t.created_at) >= startDate && new Date(t.created_at) <= endDate
    );

    type RawEvent = {
      id: string;
      date: string;
      kind: 'commission' | 'payment';
      currency: 'USD' | 'LBP';
      amount: number;
      delta: number;
      productId?: string;
      productName?: string;
      quantity?: number;
      unitPrice?: number;
      totalPrice?: number;
      weight?: number;
      commissionRate?: number;
      notes?: string | null;
    };

    const commissionEvents: RawEvent[] = periodSales.map(sale => {
      const product = products.find(p => p.id === sale.productId);
      const invBill = inventoryBills.find(i => i.id === sale.inventoryItemId);
      const commissionRate = invBill?.commission_rate ? Number(invBill.commission_rate) : 0.1;
      const amount = (sale.totalPrice * commissionRate) / 100;
      return {
        id: sale.id,
        date: sale.createdAt,
        kind: 'commission',
        currency: 'LBP',
        amount,
        delta: amount,
        productId: product?.id,
        productName: product?.name,
        quantity: sale.quantity,
        unitPrice: sale.unitPrice,
        totalPrice: sale.totalPrice,
        weight: sale.weight,
        commissionRate,
        notes: sale.notes
      };
    });

    const paymentEvents: RawEvent[] = periodPayments.map(t => ({
      id: t.id,
      date: t.created_at,
      kind: 'payment',
      currency: t.currency,
      amount: t.amount,
      delta: -t.amount
    }));

    const events: RawEvent[] = [...commissionEvents, ...paymentEvents].sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (da !== db) return da - db;
      if (a.kind !== b.kind) return a.kind === 'commission' ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    let runningUSD = opening.USD;
    let runningLBP = opening.LBP;
    const statementTransactions: StatementTransaction[] = [];

    for (const ev of events) {
      if (ev.currency === 'USD') runningUSD += ev.delta; else runningLBP += ev.delta;

      if (ev.kind === 'commission') {
        const productDetails: StatementProductDetail[] = viewMode === 'detailed' && ev.productId && ev.productName ? [{
          productId: ev.productId,
          productName: ev.productName,
          quantity: ev.quantity || 0,
          unit: 'piece',
          unitPrice: ev.unitPrice || 0,
          totalPrice: ev.totalPrice || 0,
          weight: ev.weight,
          commissionRate: ev.commissionRate,
          commissionAmount: ev.amount,
          notes: ev.notes || undefined
        }] : [];

        statementTransactions.push({
          id: ev.id,
          date: ev.date,
          type: 'income',
          description: viewMode === 'summary' ? `Commission (${ev.commissionRate ?? 0}%)` : `Commission: ${ev.productName || '-'} (${ev.commissionRate ?? 0}%)`,
          quantity: 0,
          weight: 0,
          price: 0,
          amount: ev.amount,
          currency: 'LBP',
          balanceAfter: runningLBP,
          reference: `SALE-${ev.id.slice(-8)}`,
          productDetails
        });
      } else {
        statementTransactions.push({
          id: ev.id,
          date: ev.date,
          type: 'payment',
          description: 'Payment Sent',
          quantity: 0,
          weight: 0,
          price: 0,
          amount: ev.amount,
          currency: ev.currency,
          balanceAfter: ev.currency === 'USD' ? runningUSD : runningLBP,
          reference: undefined,
          paymentMethod: 'Payment Sent'
        });
      }
    }

    const totals = {
      commissionsLBP: commissionEvents.reduce((s, e) => s + e.amount, 0),
      paymentsUSD: paymentEvents.filter(e => e.currency === 'USD').reduce((s, e) => s + e.amount, 0),
      paymentsLBP: paymentEvents.filter(e => e.currency === 'LBP').reduce((s, e) => s + e.amount, 0)
    };

    return { statementTransactions, ending: { USD: runningUSD, LBP: runningLBP }, totals };
  }

  /**
   * Generate comprehensive account statement for a customer
   */
  public generateCustomerStatement(
    customer: Customer,
    sales: LocalSaleItem[],
    transactions: Transaction[],
    products: Product[],
    inventory: InventoryItem[],
    dateRange?: { start: string; end: string },
    viewMode: 'summary' | 'detailed' = 'detailed'
  ): AccountStatement {
    const now = new Date();
    const startDate = this.startOfDayISO(dateRange?.start || new Date(now.getFullYear(), 0, 1));
    const endDate = this.endOfDayISO(dateRange?.end || now);

    // Compute opening balances from full history prior to start
    const openingBalance = this.computeCustomerOpeningBalance(customer.id, sales, transactions, startDate);
    // Build period transactions and running balances
    const { statementTransactions, ending, totals } = this.buildCustomerPeriodTransactions(
      customer,
      sales,
      transactions,
      products,
      inventory,
      startDate,
      endDate,
      viewMode,
      openingBalance
    );

    // Product summary based on period credit sales
    const periodCreditSales = sales.filter(s => s.customer_id === customer.id && s.payment_method === 'credit' && !!s.created_at && new Date(s.created_at) >= new Date(startDate) && new Date(s.created_at) <= new Date(endDate));
    const productSummary = viewMode === 'detailed' ? this.calculateProductSummary(periodCreditSales as unknown as SaleItem[], products) : undefined;

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
        currentBalance: { USD: ending.USD, LBP: ending.LBP },
        totalSales: { USD: 0, LBP: totals.salesLBP },
        totalPayments: { USD: totals.paymentsUSD, LBP: totals.paymentsLBP },
        totalReceivings: { USD: 0, LBP: 0 },
        netChange: { USD: totals.paymentsUSD, LBP: totals.paymentsLBP - totals.salesLBP }
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
    inventoryBills: inventory_bills[],
    dateRange?: { start: string; end: string },
    viewMode: 'summary' | 'detailed' = 'detailed'
  ): AccountStatement {
    const now = new Date();
    const startDate = this.startOfDayISO(dateRange?.start || new Date(now.getFullYear(), 0, 1));
    const endDate = this.endOfDayISO(dateRange?.end || now);

    const openingBalance = this.computeSupplierOpeningBalance(
      supplier.id,
      sales,
      transactions,
      inventoryBills,
      startDate
    );

    const { statementTransactions, ending, totals } = this.buildSupplierPeriodTransactions(
      supplier,
      sales,
      transactions,
      products,
      inventoryBills,
      startDate,
      endDate,
      viewMode,
      openingBalance
    );

    const periodSales = sales.filter(s => s.supplierId === supplier.id && !!s.createdAt && new Date(s.createdAt) >= new Date(startDate) && new Date(s.createdAt) <= new Date(endDate));
    const productSummary = viewMode === 'detailed' ? this.calculateProductSummary(periodSales, products) : undefined;

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
        currentBalance: { USD: ending.USD, LBP: ending.LBP },
        totalSales: { USD: 0, LBP: 0 },
        totalPayments: { USD: totals.paymentsUSD, LBP: totals.paymentsLBP },
        totalReceivings: { USD: 0, LBP: totals.commissionsLBP },
        netChange: { USD: -totals.paymentsUSD, LBP: totals.commissionsLBP - totals.paymentsLBP }
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
      const product = products.find(p => p.id === sale.productId);
      if (!product) return;

      const existing = productStats.get(sale.productId) || {
        productName: product.name,
        category: product.category,
        totalQuantity: 0,
        totalValue: 0,
        transactionCount: 0
      };

      existing.totalQuantity += sale.quantity;
      existing.totalValue += sale.totalPrice;
      existing.transactionCount += 1;

      productStats.set(sale.productId, existing);
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