import { LocalSaleItem, Bill, BillLineItem } from '../lib/db';
import { Customer, Supplier, Transaction, BillLineItem, InventoryItem, Product, inventory_bills } from '../types';
import { StatementTransaction, StatementProductDetail } from '../types';
import { PAYMENT_CATEGORIES } from '../constants/paymentCategories';

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
    allSales: BillLineItem[],
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
      t.category === PAYMENT_CATEGORIES.CUSTOMER_PAYMENT &&
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
    opening: { USD: number; LBP: number },
    bills?: Bill[]
  ): { statementTransactions: StatementTransaction[]; ending: { USD: number; LBP: number }; totals: { salesLBP: number; paymentsUSD: number; paymentsLBP: number } } {
    const startDate = new Date(startDateISO);
    const endDate = new Date(endDateISO);
    
    // Period credit sales (LBP) - filter by customer and date range
    const periodSales = sales.filter(s =>
      s.customer_id === customer.id &&
      s.payment_method === 'credit' &&
      !!s.created_at && new Date(s.created_at) >= startDate && new Date(s.created_at) <= endDate
    );

    // Period customer payments (USD or LBP)
    const periodPayments = transactions.filter(t =>
      t.customer_id === customer.id &&
      t.type === 'income' &&
      new Date(t.created_at) >= startDate && new Date(t.created_at) <= endDate
    );

    // In summary mode, group sales by bills if bills data is available
    if (viewMode === 'summary' && bills && bills.length > 0) {
      // Group sales by bill_id if available, otherwise use individual sales
      const salesByBill = new Map<string, LocalSaleItem[]>();
      
      periodSales.forEach(sale => {
        // Check if sale has a bill_id (this might be stored in a different field)
        const billId = (sale as any).bill_id || 'individual';
        if (!salesByBill.has(billId)) {
          salesByBill.set(billId, []);
        }
        salesByBill.get(billId)!.push(sale);
      });

      // For summary mode, we'll process bills instead of individual sales
      // Keep original logic for now, will modify below
    }

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

    let saleEvents: RawEvent[] = [];
    
    if (viewMode === 'summary' && bills && bills.length > 0) {
      // In summary mode, create bill-level transactions
      const customerBills = bills.filter(bill => 
        bill.customer_id === customer.id &&
        bill.payment_method === 'credit' &&
        new Date(bill.bill_date) >= startDate && 
        new Date(bill.bill_date) <= endDate
      );

      saleEvents = customerBills.map(bill => ({
        id: bill.id,
        date: bill.bill_date,
        kind: 'sale' as const,
        currency: 'LBP' as const,
        amount: bill.total_amount,
        delta: bill.total_amount,
        productId: undefined,
        productName: `Bill #${bill.bill_number}`,
        unit: 'bill',
        quantity: 1,
        weight: undefined,
        unitPrice: bill.total_amount,
        notes: bill.notes || null
      }));
    } else {
      // In detailed mode, create individual sale item transactions
      saleEvents = periodSales.map(sale => {
        const product = products.find(p => p.id === sale.product_id);
        const inventoryItem = inventory.find(i => i.id === sale.inventory_item_id);
        return {
          id: sale.id,
          date: sale.created_at || new Date().toISOString(),
          kind: 'sale' as const,
          currency: 'LBP' as const,
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
    }

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

        let description: string;
        if (viewMode === 'summary' && ev.unit === 'bill') {
          // Bill-level description for summary mode
          description = `Credit Sale - ${ev.productName}`;
        } else {
          // Product-level description for detailed mode
          description = `Sale: ${ev.productName || '-'} | ${ev.unit || 'piece'}`;
        }

        statementTransactions.push({
          id: ev.id,
          date: ev.date,
          type: 'sale',
          description,
          quantity: ev.quantity || 0,
          weight: ev.weight || 0,
          price: ev.unitPrice || 0,
          amount: ev.amount,
          currency: 'LBP',
          balanceAfter: runningLBP,
          paymentMethod: 'credit',
          productDetails,
          reference: viewMode === 'summary' && ev.unit === 'bill' ? `B-${ev.id.slice(-8)}` : 'S-' + ev.id.slice(-8)
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
   * New logic: Only includes received bills and payments
   * Opening = sum(pre-period received bills) - sum(pre-period supplier payments)
   */
  private computeSupplierOpeningBalance(
    supplierId: string,
    allTransactions: Transaction[],
    startDateISO: string
  ): { USD: number; LBP: number } {
    const startDate = new Date(startDateISO);

    // Pre-period credit purchases (instant received bills) - now from inventory_bills
    // For opening balance, we'll use a simplified calculation
    // In practice, this should be calculated from historical data
    const creditPurchasesUSD = 0; // Credit purchases are typically in LBP
    const creditPurchasesLBP = 0; // We'll skip historical calculation for now

    // Pre-period closed commission bills (only closed bills appear)
    // For opening balance calculation, we'll need to store the commission amount when bills are closed
    // For now, we'll skip this complex calculation in opening balance
    // This would require iterating through all sales and calculating commissions for closed bills
    let closedCommissionsLBP = 0;

    // Pre-period supplier payments
    const prePayments = allTransactions.filter(t =>
      t.type === 'expense' &&
      t.category === PAYMENT_CATEGORIES.SUPPLIER_PAYMENT &&
      t.supplier_id === supplierId &&
      !!t.created_at && new Date(t.created_at) < startDate
    );
    const paymentsUSD = prePayments.filter(t => t.currency === 'USD').reduce((s, t) => s + t.amount, 0);
    const paymentsLBP = prePayments.filter(t => t.currency === 'LBP').reduce((s, t) => s + t.amount, 0);

    return { 
      USD: creditPurchasesUSD - paymentsUSD, 
      LBP: creditPurchasesLBP + closedCommissionsLBP - paymentsLBP 
    };
  }

  /**
   * Build period transactions and running balances for a supplier
   * New logic: Only shows received bills (credit purchases + closed commission bills) and payments
   */
  private buildSupplierPeriodTransactions(
    supplier: Supplier,
    sales: BillLineItem[],
    transactions: Transaction[],
    products: Product[],
    inventoryBills: inventory_bills[],
    startDateISO: string,
    endDateISO: string,
    viewMode: 'summary' | 'detailed',
    inventoryItems: InventoryItem[],
    opening: { USD: number; LBP: number }
  ): { statementTransactions: StatementTransaction[]; ending: { USD: number; LBP: number }; totals: { receivedBillsUSD: number; receivedBillsLBP: number; paymentsUSD: number; paymentsLBP: number } } {
    const startDate = new Date(startDateISO);
    const endDate = new Date(endDateISO);

    // 1. Credit purchases (instant received bills)
    
    const periodCreditPurchases = inventoryBills.filter(i =>
      i.type === 'credit' && i.supplier_id === supplier.id &&
      !!i.created_at && new Date(i.created_at) >= startDate && new Date(i.created_at) <= endDate
    );

    // 2. Closed commission bills (only appear when closed)
    const periodClosedCommissionBills = inventoryBills.filter(bill =>
      bill.supplier_id === supplier.id &&
      !!bill.created_at && new Date(bill.created_at) >= startDate && new Date(bill.created_at) <= endDate &&
      (bill.status === 'closed' || (bill.notes && bill.notes.includes('[CLOSED]')))
    );

    // 3. Supplier payments (both receive and pay)
    const periodPayments = transactions.filter(t =>
      t.type === 'expense' && t.supplier_id === supplier.id &&
      !!t.created_at && new Date(t.created_at) >= startDate && new Date(t.created_at) <= endDate
    );

    type RawEvent = {
      id: string;
      date: string;
      kind: 'credit_purchase' | 'commission_bill' | 'payment';
      currency: 'USD' | 'LBP';
      amount: number;
      delta: number; // positive increases what we owe, negative decreases
      // For detailed view
      billId?: string;
      billType?: 'credit' | 'commission';
      inventoryItems?: InventoryItem[];
      commissionRate?: number;
      notes?: string | null;
    };

    
    // Credit purchase events (instant received bills)
    const creditPurchaseEvents: RawEvent[] = periodCreditPurchases.map(bill => {
      // Find related inventory items for this credit purchase bill
      const relatedInventoryItems = inventoryItems.filter(item => 
        item.batchId === bill.id
      );

      // Calculate total amount from inventory items
      const totalAmount = relatedInventoryItems.reduce((sum, item) => 
        sum + ((item.quantity || 0) * (item.price || 0)), 0
      );

      return {
        id: bill.id,
        date: bill.created_at,
        kind: 'credit_purchase' as const,
        currency: 'LBP' as const, // inventory_bills are typically in LBP
        amount: totalAmount,
        delta: totalAmount, // Increases what we owe
        billType: 'credit' as const,
        inventoryItems: relatedInventoryItems,
        notes: bill.notes || null
      };
    });

    // Commission bill events (only closed bills)
    const commissionBillEvents: RawEvent[] = [];
    periodClosedCommissionBills.forEach(bill => {
      // Find all sales from items in this bill to calculate total commission
      const billItems = inventoryItems.filter(item => item.batchId === bill.id);
      let totalCommission = 0;
      let billDate = bill.created_at;

      // Calculate commission from sales of items in this bill
      billItems.forEach(item => {
        const itemSales = sales.filter(sale => sale.inventory_item_id === item.id);
        itemSales.forEach(sale => {
          const commissionRate = bill.commission_rate ? Number(bill.commission_rate) : 10;
          totalCommission += (sale.line_total * commissionRate) / 100;
          // Use the latest sale date as the bill date for statement purposes
          if (new Date(sale.created_at) > new Date(billDate)) {
            billDate = sale.created_at;
          }
        });
      });

      if (totalCommission > 0) {
        commissionBillEvents.push({
          id: bill.id,
          date: billDate,
          kind: 'commission_bill' as const,
          currency: 'LBP' as const,
          amount: totalCommission,
          delta: totalCommission, // Increases what we owe to supplier
          billId: bill.id,
          billType: 'commission' as const,
          inventoryItems: billItems,
          commissionRate: bill.commission_rate ? Number(bill.commission_rate) : 10,
          notes: bill.notes
        });
      }
    });

    // Payment events
    const paymentEvents: RawEvent[] = periodPayments.map(t => ({
      id: t.id,
      date: t.created_at,
      kind: 'payment' as const,
      currency: t.currency,
      amount: t.amount,
      delta: -t.amount, // Decreases what we owe
      notes: t.description
    }));

    // Sort all events by date
    const events: RawEvent[] = [...creditPurchaseEvents, ...commissionBillEvents, ...paymentEvents].sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (da !== db) return da - db;
      // Sort order: received bills before payments
      if (a.kind !== b.kind) {
        const order = { credit_purchase: 0, commission_bill: 1, payment: 2 };
        return order[a.kind] - order[b.kind];
      }
      return a.id.localeCompare(b.id);
    });

    let runningUSD = opening.USD;
    let runningLBP = opening.LBP;
    const statementTransactions: StatementTransaction[] = [];

    for (const ev of events) {
      // Update running balance first (like customer logic)
      if (ev.currency === 'USD') {
        runningUSD += ev.delta;
      } else {
        runningLBP += ev.delta;
      }

      if (ev.kind === 'credit_purchase') {
        
        if (viewMode === 'detailed' && ev.inventoryItems && ev.inventoryItems.length > 0) {
          
          // Show individual inventory items in detailed mode
          // For detailed mode, we need to track running balance per item since each item affects the balance
          let itemRunningUSD = runningUSD;
          let itemRunningLBP = runningLBP;
          
          // Reset to pre-event balance to apply each item incrementally
          if (ev.currency === 'USD') {
            itemRunningUSD = runningUSD - ev.delta;
          } else {
            itemRunningLBP = runningLBP - ev.delta;
          }
          
          ev.inventoryItems.forEach((inventoryItem, index) => {
            console.log('inventoryItem', inventoryItem);
            const product = products.find(p => p.id === inventoryItem.productId);
            const totalPrice=inventoryItem.weight=== null ? inventoryItem.quantity * Number(inventoryItem.price) : Number(inventoryItem.weight )* Number(inventoryItem.price);
            console.log(totalPrice)
            
            // Update running balance for this specific item
            if (ev.currency === 'USD') {
              itemRunningUSD += totalPrice;
            } else {
              itemRunningLBP += totalPrice;
            }
            
            const productDetails: StatementProductDetail[] = [{
              productId: inventoryItem.productId,
              productName: product?.name || 'Unknown Product',
              quantity: inventoryItem.receivedQuantity || 0,
              unit: inventoryItem.unit || 'piece',
              unitPrice: inventoryItem.price || 0,
              totalPrice: totalPrice,
              weight: inventoryItem.weight || 0,
              notes: undefined // InventoryItem doesn't have notes property
            }];

            statementTransactions.push({
              id: `${ev.id}-${index}`,
              date: ev.date,
              type: 'expense',
              description: `Received Bill: ${product?.name || 'Unknown Product'} | ${inventoryItem.unit || 'piece'}`,
              quantity: inventoryItem.quantity || 0,
              weight: inventoryItem.weight || 0,
              price: inventoryItem.price || 0,
              amount: totalPrice,
              currency: ev.currency,
              balanceAfter: ev.currency === 'USD' ? itemRunningUSD : itemRunningLBP,
              reference: `CREDIT-${ev.id.slice(-8)}`,
              paymentMethod: 'Received Bill',
              productDetails
            });
          });
        } else {
          // Summary mode - show single transaction
          const itemCount = ev.inventoryItems?.length || 0;
          const description = itemCount > 0 
            ? `Received Bill: ${itemCount} items`
            : 'Received Bill';

          statementTransactions.push({
            id: ev.id,
            date: ev.date,
            type: 'expense',
            description,
            quantity: 0,
            weight: 0,
            price: 0,
            amount: ev.amount,
            currency: ev.currency,
            balanceAfter: ev.currency === 'USD' ? runningUSD : runningLBP,
            reference: `CREDIT-${ev.id.slice(-8)}`,
            paymentMethod: 'Received Bill'
          });
        }
      } else if (ev.kind === 'commission_bill') {
        if (viewMode === 'detailed' && ev.inventoryItems && ev.inventoryItems.length > 0) {
          // Show individual inventory items in detailed mode
          // For detailed mode, we need to track running balance per item since each item affects the balance
          let itemRunningLBP = runningLBP - ev.delta; // Reset to pre-event balance
          
          ev.inventoryItems.forEach((inventoryItem, index) => {
            const product = products.find(p => p.id === inventoryItem.productId);
            
            // Calculate commission for this specific item
            const itemSales = sales.filter(sale => sale.inventory_item_id === inventoryItem.id);
            const itemTotalRevenue = itemSales.reduce((sum, sale) => sum + sale.line_total, 0);
            const itemCommission = (itemTotalRevenue * (ev.commissionRate || 10)) / 100;

            // Update running balance for this specific item
            itemRunningLBP += itemCommission;

            const productDetails: StatementProductDetail[] = [{
              productId: inventoryItem.productId,
              productName: product?.name || 'Unknown Product',
              quantity: inventoryItem.quantity || 0,
              unit: inventoryItem.unit || 'piece',
              unitPrice: inventoryItem.price || 0,
              totalPrice: itemTotalRevenue,
              weight: inventoryItem.weight || 0,
              commissionRate: ev.commissionRate,
              commissionAmount: itemCommission,
              notes: undefined // InventoryItem doesn't have notes property
            }];

            statementTransactions.push({
              id: `${ev.id}-${index}`,
              date: ev.date,
              type: 'income',
              description: `Commission Bill: ${product?.name || 'Unknown Product'} | ${inventoryItem.unit || 'piece'} (${ev.commissionRate || 10}%)`,
              quantity: inventoryItem.quantity || 0,
              weight: inventoryItem.weight || 0,
              price: inventoryItem.price || 0,
              amount: itemCommission,
              currency: 'LBP',
              balanceAfter: itemRunningLBP,
              reference: `COMM-${ev.id.slice(-8)}`,
              productDetails
            });
          });
        } else {
          // Summary mode - show single transaction
          const itemCount = ev.inventoryItems?.length || 0;
          const description = itemCount > 0 
            ? `Commission Bill: ${itemCount} items (${ev.commissionRate || 10}%)`
            : `Commission Bill (${ev.commissionRate || 10}%)`;

          statementTransactions.push({
            id: ev.id,
            date: ev.date,
            type: 'income',
            description,
            quantity: 0,
            weight: 0,
            price: 0,
            amount: ev.amount,
            currency: 'LBP',
            balanceAfter: runningLBP,
            reference: `COMM-${ev.id.slice(-8)}`
          });
        }
      } else if (ev.kind === 'payment') {
        statementTransactions.push({
          id: ev.id,
          date: ev.date,
          type: 'payment',
          description: 'Payment',
          quantity: 0,
          weight: 0,
          price: 0,
          amount: ev.amount,
          currency: ev.currency,
          balanceAfter: ev.currency === 'USD' ? runningUSD : runningLBP,
          reference: `PAY-${ev.id.slice(-8)}`,
          paymentMethod: 'Payment'
        });
      }
    }

    const totals = {
      receivedBillsUSD: [...creditPurchaseEvents, ...commissionBillEvents].filter(e => e.currency === 'USD').reduce((s, e) => s + e.amount, 0),
      receivedBillsLBP: [...creditPurchaseEvents, ...commissionBillEvents].filter(e => e.currency === 'LBP').reduce((s, e) => s + e.amount, 0),
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
    sales: BillLineItem[],
    transactions: Transaction[],
    products: Product[],
    inventory: InventoryItem[],
    dateRange?: { start: string; end: string },
    viewMode: 'summary' | 'detailed' = 'detailed',
    bills?: Bill[]
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
      openingBalance,
      bills
    );

    // Product summary based on period credit sales
    const periodCreditSales = sales.filter(s => s.customer_id === customer.id && s.payment_method === 'credit' && !!s.created_at && new Date(s.created_at) >= new Date(startDate) && new Date(s.created_at) <= new Date(endDate));
    const productSummary = viewMode === 'detailed' ? this.calculateProductSummary(periodCreditSales as unknown as BillLineItem[], products) : undefined;

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
   * New logic: Only shows received bills and payments (excludes individual fees)
   */
  public generateSupplierStatement(
    supplier: Supplier,
    sales: BillLineItem[],
    inventoryItems: InventoryItem[],
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
      transactions,
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
      inventoryItems,
      openingBalance
    );

    // Product summary based on items in received bills only
    const periodReceivedBillItems = inventoryItems.filter(item => 
      item.supplierId === supplier.id && 
      !!item.createdAt && 
      new Date(item.createdAt) >= new Date(startDate) && 
      new Date(item.createdAt) <= new Date(endDate)
    );
    
    // Create synthetic sales for product summary calculation
    const syntheticSales: BillLineItem[] = periodReceivedBillItems.map(item => ({
      id: item.id,
      storeId: 'default-store',
      billId: item.batchId || 'synthetic-bill',
      inventoryItemId: item.id,
      productId: item.productId,
      supplierId: item.supplierId,
      customerId: undefined,
      quantity: item.quantity,
      weight: item.weight,
      unitPrice: item.price || 0,
      lineTotal: (item.quantity || 0) * (item.price || 0),
      receivedValue: (item.quantity || 0) * (item.price || 0),
      paymentMethod: 'credit' as const,
      notes: undefined,
      createdAt: item.createdAt,
      createdBy: 'system',
      inventoryType: 'cash' as const,
      synced: true,
      deleted: false
    }));

    const productSummary = viewMode === 'detailed' ? this.calculateProductSummary(syntheticSales, products) : undefined;

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
        totalSales: { USD: 0, LBP: 0 }, // Not applicable for suppliers
        totalPayments: { USD: totals.paymentsUSD, LBP: totals.paymentsLBP },
        totalReceivings: { USD: totals.receivedBillsUSD, LBP: totals.receivedBillsLBP },
        netChange: { 
          USD: totals.receivedBillsUSD - totals.paymentsUSD, 
          LBP: totals.receivedBillsLBP - totals.paymentsLBP 
        }
      },
      productSummary
    };
  }

  /**
   * Calculate product summary statistics
   */
  private calculateProductSummary(sales: BillLineItem[], products: Product[]): {
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
      existing.totalValue += sale.line_total;
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