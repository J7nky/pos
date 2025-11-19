import { db } from '../lib/db';
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
   * OPTIMIZED: Uses stored balance from customer table and queries all transactions from start date.
   * Opening balance = current stored balance - (all transactions from start date to today)
   * This way, when we add period transactions chronologically, we get the correct balance progression.
   */
  private async computeCustomerOpeningBalanceOptimized(
    customerId: string,
    storeId: string,
    startDateISO: string
  ): Promise<{ USD: number; LBP: number }> {
    // 1. Get current stored balance (source of truth)
    const customer = await db.customers.get(customerId);
    if (!customer) {
      return { USD: 0, LBP: 0 };
    }

    const currentBalance = {
      USD: customer.usd_balance || 0,
      LBP: customer.lb_balance || 0
    };

    // 2. Parse start date for comparison
    const startDate = new Date(startDateISO);
    startDate.setHours(0, 0, 0, 0);

    // 3. Calculate opening balance at start date:
    // Opening balance = Current balance - (all transactions from start date to today)
    // This way, when we add period transactions chronologically, we get the correct balance progression
    
    // Get customer payments from transactions table (filtered by store_id)
    const allTransactionsFromStart = await db.transactions
      .where('customer_id')
      .equals(customerId)
      .and(t => t.store_id === storeId && 
                !!t.created_at && 
                new Date(t.created_at) >= startDate)
      .toArray();

    // Get credit sales from bills (normalized approach, filtered by store_id)
    const allCreditBillsFromStart = await db.bills
      .where('customer_id')
      .equals(customerId)
      .and(b => b.store_id === storeId &&
                b.payment_method === 'credit' && 
                !!b.bill_date && 
                new Date(b.bill_date) >= startDate)
      .toArray();
    
    // Get line items for these bills
    const billIdsFromStart = allCreditBillsFromStart.map(b => b.id);
    const allSalesFromStart = billIdsFromStart.length > 0
      ? await db.bill_line_items
          .where('bill_id')
          .anyOf(billIdsFromStart)
          .toArray()
      : [];

    const allSalesFromStartLBP = allSalesFromStart.reduce((sum, s) => sum + (s.line_total || 0), 0);
    
    const allPaymentsFromStartUSD = allTransactionsFromStart
      .filter(t => t.currency === 'USD' && 
                   t.type === 'income' && 
                   t.category === PAYMENT_CATEGORIES.CUSTOMER_PAYMENT)
      .reduce((sum, t) => sum + t.amount, 0);

    const allPaymentsFromStartLBP = allTransactionsFromStart
      .filter(t => t.currency === 'LBP' && 
                   t.type === 'income' && 
                   t.category === PAYMENT_CATEGORIES.CUSTOMER_PAYMENT)
      .reduce((sum, t) => sum + t.amount, 0);

    const netChangeFromStart = {
      USD: -allPaymentsFromStartUSD,
      LBP: allSalesFromStartLBP - allPaymentsFromStartLBP
    };

    // Opening balance at start date = Current balance - (all transactions from start date to today)
    return {
      USD: currentBalance.USD - netChangeFromStart.USD,
      LBP: currentBalance.LBP - netChangeFromStart.LBP
    };
  }

  /**
   * Build period transactions (sorted) and compute running balances per currency for a customer
   * OPTIMIZED: Queries transactions directly from database using indexed queries
   */
  private async buildCustomerPeriodTransactionsOptimized(
    customer: Customer,
    storeId: string,
    products: Product[],
    inventory: InventoryItem[],
    startDateISO: string,
    endDateISO: string,
    viewMode: 'summary' | 'detailed',
    opening: { USD: number; LBP: number },
    bills?: any[]
  ): Promise<{ statementTransactions: StatementTransaction[]; ending: { USD: number; LBP: number }; totals: { salesLBP: number; paymentsUSD: number; paymentsLBP: number } }> {
    // Normalize dates for consistent comparison
    const startDate = new Date(startDateISO);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(endDateISO);
    endDate.setHours(23, 59, 59, 999); // Include entire end date
    
    // STEP 1: Query credit bills for this customer (normalized approach, filtered by store_id)
    // customer_id and payment_method are in bills table, not bill_line_items
    let customerBills: any[];
    
    if (bills) {
      // Filter the provided bills array to match the same criteria as the database query
      customerBills = bills.filter(b => 
        b.customer_id === customer.id &&
        b.store_id === storeId &&
        b.payment_method === 'credit' &&
        !!b.bill_date &&
        new Date(b.bill_date) >= startDate &&
        new Date(b.bill_date) <= endDate
      );
    } else {
      // Query from database
      customerBills = await db.bills
        .where('customer_id')
        .equals(customer.id)
        .and(b => b.store_id === storeId &&
                  b.payment_method === 'credit' &&
                  !!b.bill_date &&
                  new Date(b.bill_date) >= startDate &&
                  new Date(b.bill_date) <= endDate)
        .toArray();
    }
    
    // STEP 2: Get line items for these bills (JOIN operation)
    const billIds = customerBills.map(b => b.id);
    const periodSales = billIds.length > 0 
      ? await db.bill_line_items
          .where('bill_id')
          .anyOf(billIds)
          .toArray()
      : [];

    // STEP 3: Query period customer payments directly from database using indexed query (filtered by store_id)
    const periodPayments = await db.transactions
      .where('customer_id')
      .equals(customer.id)
      .and(t => t.store_id === storeId &&
                t.type === 'income' &&
                !!t.created_at &&
                new Date(t.created_at) >= startDate &&
                new Date(t.created_at) <= endDate)
      .toArray();
console.log("periodPayments", periodPayments);
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
      // Reference fields
      reference?: string | null;
      billNumber?: string;
    };

    let saleEvents: RawEvent[] = [];
    
    if (viewMode === 'summary' && customerBills.length > 0) {
      // In summary mode, create bill-level transactions
      // Calculate total from line items to ensure data normalization
      saleEvents = customerBills.map(bill => {
        // Get line items for this specific bill
        const billLineItems = periodSales.filter(sale => sale.bill_id === bill.id);
        // Calculate actual total from line items (normalized data)
        const calculatedTotal = billLineItems.reduce((sum, item) => sum + (item.line_total || 0), 0);
        
        return {
          id: bill.id,
          date: bill.bill_date,
          kind: 'sale' as const,
          currency: 'LBP' as const,
          amount: calculatedTotal,
          delta: calculatedTotal,
          productId: undefined,
          productName: `Bill #${bill.bill_number}`,
          unit: 'bill',
          quantity: billLineItems.length,
          weight: undefined,
          unitPrice: calculatedTotal,
          notes: bill.notes || null,
          billNumber: bill.bill_number
        };
      });
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
          amount: sale.line_total || 0,
          delta: (sale.line_total || 0),
          productId: product?.id,
          productName: product?.name,
          unit: inventoryItem?.unit || 'piece',
          quantity: sale.quantity,
          weight: sale.weight ?? undefined,
          unitPrice: sale.unit_price,
          notes: sale.notes || null,
          reference: `SALE-${sale.id.slice(-8)}`
        };
      });
    }

    const paymentEvents: RawEvent[] = periodPayments.map(t => ({
      id: t.id,
      date: t.created_at,
      kind: 'payment',
      currency: t.currency,
      amount: t.amount,
      delta: -t.amount,
      reference: t.reference || null
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

        const description: string = viewMode === 'summary' && ev.unit === 'bill'
          ? `Credit Sale - ${ev.productName}` // Bill-level description for summary mode
          : `Sale: ${ev.productName || '-'} | ${ev.unit || 'piece'}`; // Product-level description for detailed mode

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
          reference: viewMode === 'summary' && ev.unit === 'bill' && ev.billNumber 
            ? `BILL-${ev.billNumber}` 
            : (ev.reference || `SALE-${ev.id.slice(-8)}`)
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
          reference: ev.reference || `PAY-${ev.id.slice(-8)}`,
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
    storeId: string,
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

    // Pre-period supplier payments (filtered by store_id)
    const prePayments = allTransactions.filter(t =>
      t.store_id === storeId &&
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
    storeId: string,
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

    // 1. Credit purchases (instant received bills, filtered by store_id)
    
    const periodCreditPurchases = inventoryBills.filter(i =>
      i.store_id === storeId &&
      i.type === 'credit' && i.supplier_id === supplier.id &&
      !!i.created_at && new Date(i.created_at) >= startDate && new Date(i.created_at) <= endDate
    );

    // 2. Closed commission bills (only appear when closed, filtered by store_id)
    const periodClosedCommissionBills = inventoryBills.filter(bill =>
      bill.store_id === storeId &&
      bill.supplier_id === supplier.id &&
      !!bill.created_at && new Date(bill.created_at) >= startDate && new Date(bill.created_at) <= endDate &&
      (bill.status === 'closed' || (bill.notes && bill.notes.includes('[CLOSED]')))
    );

    // 3. Supplier payments (both receive and pay, filtered by store_id)
    const periodPayments = transactions.filter(t =>
      t.store_id === storeId &&
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
      // Reference field
      reference?: string | null;
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

    // Commission bill events (only closed bills with stored commission_amount)
    const commissionBillEvents: RawEvent[] = periodClosedCommissionBills
      .filter(bill => bill.commission_amount && bill.commission_amount > 0)
      .map(bill => {
        // Find all items in this bill for detailed view
        const billItems = inventoryItems.filter(item => item.batchId === bill.id);
        
        return {
          id: bill.id,
          date: bill.closed_at || bill.created_at, // Use closure date if available
          kind: 'commission_bill' as const,
          currency: 'LBP' as const,
          amount: bill.commission_amount, // Use stored commission amount
          delta: bill.commission_amount, // Increases what we owe to supplier
          billId: bill.id,
          billType: 'commission' as const,
          inventoryItems: billItems,
          commissionRate: bill.commission_rate ? Number(bill.commission_rate) : 10,
          notes: bill.notes
        };
      });

    // Payment events
    const paymentEvents: RawEvent[] = periodPayments.map(t => ({
      id: t.id,
      date: t.created_at,
      kind: 'payment' as const,
      currency: t.currency,
      amount: t.amount,
      delta: -t.amount, // Decreases what we owe
      notes: t.description,
      reference: t.reference || null
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
          reference: ev.reference || `PAY-${ev.id.slice(-8)}`,
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
   * OPTIMIZED: Uses indexed database queries and stored balances
   */
  public async generateCustomerStatement(
    customer: Customer,
    storeId: string,
    sales: BillLineItem[], // Kept for backward compatibility but not used
    transactions: Transaction[], // Kept for backward compatibility but not used
    products: Product[],
    inventory: InventoryItem[],
    dateRange?: { start: string; end: string },
    viewMode: 'summary' | 'detailed' = 'detailed',
    bills?: any[] // Kept for backward compatibility
  ): Promise<AccountStatement> {
    const now = new Date();
    const startDate = this.startOfDayISO(dateRange?.start || new Date(now.getFullYear(), 0, 1));
    const endDate = this.endOfDayISO(dateRange?.end || now);

    // Compute opening balances using optimized method (uses stored balance + queries only after start date)
    const openingBalance = await this.computeCustomerOpeningBalanceOptimized(customer.id, storeId, startDate);
    
    // Build period transactions and running balances using optimized method (queries directly from database)
    const { statementTransactions, ending, totals } = await this.buildCustomerPeriodTransactionsOptimized(
      customer,
      storeId,
      products,
      inventory,
      startDate,
      endDate,
      viewMode,
      openingBalance,
      bills
    );
    

    // Product summary based on period credit sales (query from database - normalized approach)
    const startDateObj = new Date(startDate);
    startDateObj.setHours(0, 0, 0, 0);
    const endDateObj = new Date(endDate);
    endDateObj.setHours(23, 59, 59, 999);
    
    // Get credit bills for this customer in the period (filtered by store_id)
    const periodCreditBills = await db.bills
      .where('customer_id')
      .equals(customer.id)
      .and(b => b.store_id === storeId &&
                b.payment_method === 'credit' &&
                !!b.bill_date &&
                new Date(b.bill_date) >= startDateObj &&
                new Date(b.bill_date) <= endDateObj)
      .toArray();
    
    // Get line items for these bills
    const periodBillIds = periodCreditBills.map(b => b.id);
    const periodCreditSales = periodBillIds.length > 0
      ? await db.bill_line_items
          .where('bill_id')
          .anyOf(periodBillIds)
          .toArray()
      : [];
    
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
    storeId: string,
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
      storeId,
      transactions,
      startDate
    );

    const { statementTransactions, ending, totals } = this.buildSupplierPeriodTransactions(
      supplier,
      storeId,
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
    // Need to resolve supplier via batchId -> inventory_bills
    const batchMap = new Map(inventoryBills.map(b => [b.id, b]));
    const periodReceivedBillItems = inventoryItems.filter(item => {
      if (!item.batchId) return false;
      const batch = batchMap.get(item.batchId);
      const itemSupplierId = batch?.supplier_id;
      return itemSupplierId === supplier.id && 
        !!item.createdAt && 
        new Date(item.createdAt) >= new Date(startDate) && 
        new Date(item.createdAt) <= new Date(endDate);
    });
    
    // Create synthetic sales for product summary calculation
    const syntheticSales: BillLineItem[] = periodReceivedBillItems.map(item => {
      const batch = item.batchId ? batchMap.get(item.batchId) : null;
      const supplierId = batch?.supplier_id || supplier.id;
      
      return {
        id: item.id,
        store_id: batch?.store_id || 'default-store',
        bill_id: item.batchId || 'synthetic-bill',
        inventory_item_id: item.id,
        product_id: item.productId,
        supplier_id: supplierId,
        customer_id: null,
        product_name: products.find(p => p.id === item.productId)?.name || '',
        supplier_name: supplier.name,
        quantity: item.quantity,
        weight: item.weight || null,
        unit_price: item.price || 0,
        line_total: (item.quantity || 0) * (item.price || 0),
        received_value: (item.quantity || 0) * (item.price || 0),
        payment_method: 'credit' as const,
        notes: null,
        line_order: 1,
        created_at: item.createdAt,
        updated_at: item.createdAt,
        created_by: 'system',
        _synced: true,
        _lastSyncedAt: undefined,
        _deleted: false
      };
    });

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