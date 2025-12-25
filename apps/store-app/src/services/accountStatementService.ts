import { getDB } from '../lib/db';
import { Customer, Supplier, Transaction, BillLineItem, InventoryItem, Product, inventory_bills } from '../types';
import { StatementTransaction, StatementProductDetail } from '../types';
import { PAYMENT_CATEGORIES } from '../constants/paymentCategories';
import { parseMultilingualString, getTranslatedString, type SupportedLanguage } from '../utils/multilingual';
// Note: snapshotService import removed - snapshots not implemented yet, using direct journal entry calculation

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
   * Map journal entries to statement transactions, grouping by transaction_id
   * This creates one StatementTransaction per transaction (not per journal entry)
   */
  private async mapJournalEntriesToStatementTransactions(
    journalEntries: any[],
    openingBalance: { USD: number; LBP: number },
    viewMode: 'summary' | 'detailed',
    entityType: 'customer' | 'supplier',
    language: SupportedLanguage = 'en'
  ): Promise<{
    statementTransactions: StatementTransaction[];
    ending: { USD: number; LBP: number };
    totals: {
      salesUSD: number;
      salesLBP: number;
      paymentsUSD: number;
      paymentsLBP: number;
    };
  }> {
    // Group journal entries by transaction_id
    const entriesByTransaction = new Map<string, any[]>();
    for (const entry of journalEntries) {
      if (!entriesByTransaction.has(entry.transaction_id)) {
        entriesByTransaction.set(entry.transaction_id, []);
      }
      entriesByTransaction.get(entry.transaction_id)!.push(entry);
    }

    // Get all transaction IDs to look up related transactions and bills
    const transactionIds = Array.from(entriesByTransaction.keys());
    const transactions = transactionIds.length > 0
      ? await getDB().transactions.where('id').anyOf(transactionIds).toArray()
      : [];

    // Debug: Check if all transactions were found
    if (transactions.length !== transactionIds.length) {
      const foundIds = new Set(transactions.map(t => t.id));
      const missingIds = transactionIds.filter(id => !foundIds.has(id));
      console.warn(`⚠️ Some transactions not found: ${missingIds.length} missing out of ${transactionIds.length}`, missingIds.slice(0, 5));
    }

    const transactionMap = new Map(transactions.map(t => [t.id, t]));

    // Get bills for transactions that have references
    // Handle both 'BILL-' prefix and direct bill numbers
    const allBillReferences = new Set<string>();
    transactions.forEach(t => {
      if (t.reference) {
        // Add the reference as-is
        allBillReferences.add(t.reference);
        // Also add normalized versions
        if (t.reference.startsWith('BILL-')) {
          allBillReferences.add(t.reference.replace('BILL-', ''));
        } else {
          allBillReferences.add(`BILL-${t.reference}`);
        }
      }
    });
    
    const billReferencesArray = Array.from(allBillReferences);
    const bills = billReferencesArray.length > 0
      ? await getDB().bills.where('bill_number').anyOf(billReferencesArray).toArray()
      : [];
    
    // Create map with all possible lookup keys for flexible matching
    const billMap = new Map<string, any>();
    for (const bill of bills) {
      // Add bill_number as-is
      billMap.set(bill.bill_number, bill);
      // Add with BILL- prefix
      billMap.set(`BILL-${bill.bill_number}`, bill);
      // Also handle if bill_number already has BILL- prefix
      if (bill.bill_number.startsWith('BILL-')) {
        billMap.set(bill.bill_number.replace('BILL-', ''), bill);
      }
    }

    // Pre-fetch all bill_line_items and products for detailed view (performance optimization)
    const billIds = bills.map(b => b.id);
    const allBillLineItems = viewMode === 'detailed' && billIds.length > 0
      ? await getDB().bill_line_items.where('bill_id').anyOf(billIds).toArray()
      : [];
    
    const billLineItemsMap = new Map<string, any[]>();
    for (const item of allBillLineItems) {
      if (!billLineItemsMap.has(item.bill_id)) {
        billLineItemsMap.set(item.bill_id, []);
      }
      billLineItemsMap.get(item.bill_id)!.push(item);
    }

    // Pre-fetch all products for detailed view (performance optimization)
    const productIds = [...new Set(allBillLineItems.map(item => item.product_id))];
    const allProducts = viewMode === 'detailed' && productIds.length > 0
      ? await getDB().products.where('id').anyOf(productIds).toArray()
      : [];
    const productMap = new Map(allProducts.map(p => [p.id, p]));

    // Build statement transactions
    const statementTransactions: StatementTransaction[] = [];
    let runningUSD = openingBalance.USD;
    let runningLBP = openingBalance.LBP;
    
    const totals = {
      salesUSD: 0,
      salesLBP: 0,
      paymentsUSD: 0,
      paymentsLBP: 0
    };
    // Sort transaction IDs by transaction created_at for accurate chronological ordering
    // This ensures transactions are ordered by when they were actually created, not posted_date
    const sortedTransactionIds = Array.from(entriesByTransaction.entries())
      .sort(([transactionIdA, entriesA], [transactionIdB, entriesB]) => {
        // Use transaction created_at as primary sort key (most accurate)
        const transactionA = transactionMap.get(transactionIdA);
        const transactionB = transactionMap.get(transactionIdB);
        
        if (transactionA && transactionB) {
          return transactionA.created_at.localeCompare(transactionB.created_at);
        }
        
        // Fallback: Get account entry and use its created_at
        const accountEntryA = entriesA.find(e => 
          (entityType === 'customer' && e.account_code === '1200') ||
          (entityType === 'supplier' && e.account_code === '2100')
        );
        const accountEntryB = entriesB.find(e => 
          (entityType === 'customer' && e.account_code === '1200') ||
          (entityType === 'supplier' && e.account_code === '2100')
        );
        
        if (!accountEntryA || !accountEntryB) return 0;
        
        // Use journal entry created_at as fallback
        return accountEntryA.created_at.localeCompare(accountEntryB.created_at);
      })
      .map(([transactionId]) => transactionId);

    // Process each transaction group in chronological order
    for (const transactionId of sortedTransactionIds) {
      const entries = entriesByTransaction.get(transactionId);
      if (!entries) continue;

      // Get the entry for the account we're querying (AR for customers, AP for suppliers)
      const accountEntry = entries.find(e => 
        (entityType === 'customer' && e.account_code === '1200') ||
        (entityType === 'supplier' && e.account_code === '2100')
      );

      if (!accountEntry) continue;
      const transaction = transactionMap.get(transactionId);
      
      // Calculate amounts for both currencies
      const amountUSD = accountEntry.debit_usd - accountEntry.credit_usd;
      const amountLBP = accountEntry.debit_lbp - accountEntry.credit_lbp;
      
      // Determine which currency has the transaction (prefer USD if both exist)
      const hasUSD = Math.abs(amountUSD) > 0.01;
      const hasLBP = Math.abs(amountLBP) > 0.01;
      const currency = hasUSD ? 'USD' : (hasLBP ? 'LBP' : 'USD'); // Default to USD
      const amount = hasUSD ? amountUSD : amountLBP;

      // Update running balance for both currencies
      runningUSD += amountUSD;
      runningLBP += amountLBP;

      // Determine transaction type and description
      // PRIMARY: Determine type from journal entry debit/credit values
      // This is more reliable than transaction categories
      let type: 'sale' | 'payment' | 'income' | 'expense' = 'payment';
      // Parse and translate account entry description (may be multilingual)
      let description = accountEntry.description 
        ? getTranslatedString(parseMultilingualString(accountEntry.description), language, 'en')
        : 'Transaction';
      
      // Check debit/credit values to determine transaction type
      const hasDebitUSD = Math.abs(accountEntry.debit_usd) > 0.01;
      const hasDebitLBP = Math.abs(accountEntry.debit_lbp) > 0.01;
      const hasCreditUSD = Math.abs(accountEntry.credit_usd) > 0.01;
      const hasCreditLBP = Math.abs(accountEntry.credit_lbp) > 0.01;
      const hasDebit = hasDebitUSD || hasDebitLBP;
      const hasCredit = hasCreditUSD || hasCreditLBP;
      
      if (entityType === 'customer') {
        // For customers (AR account 1200):
        // - Credit to AR = payment received (reduces receivable)
        // - Debit to AR = sale/charge (increases receivable)
        if (hasCredit && !hasDebit) {
          type = 'payment';
        } else if (hasDebit && !hasCredit) {
          type = 'sale';
        }
        // If both debit and credit exist, fall through to transaction category check
      } else if (entityType === 'supplier') {
        // For suppliers (AP account 2100):
        // - Credit to AP = receiving/purchase (increases payable)
        // - Debit to AP = payment made (reduces payable)
        if (hasCredit && !hasDebit) {
          type = 'income'; // Receiving/purchase
        } else if (hasDebit && !hasCredit) {
          type = 'payment'; // Payment made to supplier
        }
        // If both debit and credit exist, fall through to transaction category check
      }
      
      // FALLBACK: Use transaction category if type couldn't be determined from debit/credit
      if (transaction && (hasDebit && hasCredit)) {
        // Both debit and credit exist, use transaction category
        if (transaction.category?.includes('CREDIT_SALE') || transaction.category?.includes('SALE')) {
          type = entityType === 'customer' ? 'sale' : 'expense';
          description = transaction.description 
            ? getTranslatedString(parseMultilingualString(transaction.description), language, 'en')
            : description;
        } else if (transaction.category?.includes('PAYMENT')) {
          type = 'payment';
          description = transaction.description 
            ? getTranslatedString(parseMultilingualString(transaction.description), language, 'en')
            : description;
        } else if (transaction.type === 'income') {
          type = 'income';
        } else if (transaction.type === 'expense') {
          type = 'expense';
        }
      } else if (transaction) {
        // Update description from transaction if available (translate multilingual)
        description = transaction.description 
          ? getTranslatedString(parseMultilingualString(transaction.description), language, 'en')
          : description;
      }

      // Get bill information if available (using pre-fetched data)
      let bill: any = null;
      let billLineItems: any[] = [];
      if (transaction?.reference) {
        // Try multiple lookup strategies for bill reference
        // First try direct lookup with the reference as-is
        bill = billMap.get(transaction.reference);
        
        // If not found, try without BILL- prefix
        if (!bill && transaction.reference.startsWith('BILL-')) {
          const billNumber = transaction.reference.replace('BILL-', '');
          bill = billMap.get(billNumber);
        }
        
        // If still not found, try with BILL- prefix
        if (!bill && !transaction.reference.startsWith('BILL-')) {
          bill = billMap.get(`BILL-${transaction.reference}`);
        }
        
        // Last resort: if still not found and reference looks like a bill, search all bills
        // This handles cases where bill_number format doesn't match exactly
        if (!bill && (transaction.reference.startsWith('BILL-') || /^[0-9]+$/.test(transaction.reference))) {
          const normalizedRef = transaction.reference.startsWith('BILL-') 
            ? transaction.reference.replace('BILL-', '') 
            : transaction.reference;
          // Search for bills where bill_number matches (with or without BILL- prefix)
          const allBills = await getDB().bills
            .filter(b => 
              b.bill_number === normalizedRef || 
              b.bill_number === `BILL-${normalizedRef}` ||
              b.bill_number === transaction.reference ||
              (b.bill_number.startsWith('BILL-') && b.bill_number.replace('BILL-', '') === normalizedRef)
            )
            .toArray();
          if (allBills.length > 0) {
            bill = allBills[0];
            // Add to map for future lookups
            billMap.set(bill.bill_number, bill);
            billMap.set(`BILL-${bill.bill_number}`, bill);
            if (bill.bill_number.startsWith('BILL-')) {
              billMap.set(bill.bill_number.replace('BILL-', ''), bill);
            }
          }
        }
        
        // If bill is found, get line items (always fetch, but only use in detailed mode)
        if (bill) {
          billLineItems = billLineItemsMap.get(bill.id) || [];
          
          // If no line items found in pre-fetched data and we're in detailed mode, try direct fetch
          // This handles edge cases where bills might have been created after pre-fetch
          if (viewMode === 'detailed' && billLineItems.length === 0) {
            const directLineItems = await getDB().bill_line_items
              .where('bill_id')
              .equals(bill.id)
              .toArray();
            if (directLineItems.length > 0) {
              billLineItems = directLineItems;
              // Update the map for future use
              billLineItemsMap.set(bill.id, directLineItems);
              
              // Also fetch products if not already in productMap
              const missingProductIds = directLineItems
                .map(item => item.product_id)
                .filter(id => !productMap.has(id));
              if (missingProductIds.length > 0) {
                const missingProducts = await getDB().products
                  .where('id')
                  .anyOf(missingProductIds)
                  .toArray();
                missingProducts.forEach(p => productMap.set(p.id, p));
              }
            }
          }
        }
      }

      // Build product details for detailed view (using pre-fetched products)
      const productDetails: StatementProductDetail[] = [];
      if (viewMode === 'detailed' && billLineItems.length > 0) {
        for (const item of billLineItems) {
          const product = productMap.get(item.product_id);
          // Parse and translate multilingual product name
          const parsedName = product?.name ? parseMultilingualString(product.name) : null;
          const translatedName = parsedName ? getTranslatedString(parsedName, language, 'en') : 'Unknown Product';
          
          // Calculate credit/debit for each line item based on transaction type
          // Sales show as debit (increases receivable), payments show as credit (decreases receivable)
          let debit_amount = 0;
          let credit_amount = 0;
          
          // Use the item's currency if available, otherwise use transaction currency
          const itemCurrency = item.currency || currency;
          const lineTotal = item.line_total || 0;
          
          // Determine debit/credit based on transaction type and entity type
          // For customers: sales increase receivable (debit), payments decrease receivable (credit)
          // For suppliers: purchases increase payable (credit), payments decrease payable (debit)
          if (entityType === 'customer') {
            if (type === 'sale' || (type === 'income' && transaction?.category?.includes('CREDIT_SALE'))) {
              // Sales: show as debit (increases receivable)
              debit_amount = lineTotal;
              credit_amount = 0;
            } else if (type === 'payment') {
              // Payments: show as credit (decreases receivable)
              debit_amount = 0;
              credit_amount = lineTotal;
            } else {
              // Default: treat as sale for customers
              debit_amount = lineTotal;
              credit_amount = 0;
            }
          } else if (entityType === 'supplier') {
            if (type === 'income' || (type === 'sale' && transaction?.category?.includes('CREDIT_SALE'))) {
              // Supplier receiving: show as credit (increases payable)
              debit_amount = 0;
              credit_amount = lineTotal;
            } else if (type === 'payment') {
              // Payments: show as debit (decreases payable)
              debit_amount = lineTotal;
              credit_amount = 0;
            } else if (type === 'expense') {
              // Expenses: show as debit
              debit_amount = lineTotal;
              credit_amount = 0;
            } else {
              // Default: treat as purchase for suppliers
              debit_amount = 0;
              credit_amount = lineTotal;
            }
          }
          
          productDetails.push({
            product_id: item.product_id,
            product_name: translatedName,
            quantity: item.quantity || 0,
            unit: item.unit || 'piece',
            unit_price: item.unit_price || 0,
            total_price: lineTotal,
            weight: item.weight || undefined,
            notes: item.notes || undefined,
            debit_amount,
            credit_amount,
            currency: itemCurrency
          } as StatementProductDetail);
        }
      }

      // Calculate totals for both currencies
      if (type === 'sale' || (type === 'income' && entityType === 'customer')) {
        totals.salesUSD += Math.abs(amountUSD);
        totals.salesLBP += Math.abs(amountLBP);
      } else if (type === 'payment') {
        totals.paymentsUSD += Math.abs(amountUSD);
        totals.paymentsLBP += Math.abs(amountLBP);
      }

      // When product_details (line items) exist, don't use multilingual description
      // The line items will be displayed instead, so description should be empty or a summary
      const finalDescription = productDetails.length > 0 
        ? '' // Empty when line items are shown - they will display the product details
        : description; // Use multilingual description only when no line items

      statementTransactions.push({
        id: transactionId,
        date: transaction?.created_at || accountEntry.created_at,
        type,
        description: finalDescription,
        amount: Math.abs(amount),
        quantity: billLineItems.length || 0,
        weight: 0,
        price: billLineItems.length > 0 
          ? billLineItems.reduce((sum, item) => sum + (item.unit_price || 0), 0) / billLineItems.length
          : 0,
        currency,
        balance_after: currency === 'USD' ? runningUSD : runningLBP,
        payment_method: transaction?.category?.includes('CASH') ? 'cash' : 
                       transaction?.category?.includes('CREDIT') ? 'credit' : undefined,
        product_details: productDetails.length > 0 ? productDetails : undefined,
        reference: (transaction?.reference && transaction.reference.trim() !== '') 
          ? transaction.reference 
          : `TXN-${transactionId.slice(-8)}`
      });
    }

    // DO NOT re-sort after calculating balances - this would break the running balance calculation
    // Transactions are already in chronological order from processing
    // The balance_after values depend on the processing order, so we must maintain it

    return {
      statementTransactions,
      ending: { USD: runningUSD, LBP: runningLBP },
      totals
    };
  }

  /**
   * Calculate product summary from journal entries
   */
  private async calculateProductSummaryFromJournalEntries(
    journalEntries: any[],
    entityType: 'customer' | 'supplier',
    language: SupportedLanguage = 'en'
  ): Promise<{
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
  }> {
    // Get transaction IDs from journal entries
    const transactionIds = [...new Set(journalEntries.map(e => e.transaction_id))];
    const transactions = transactionIds.length > 0
      ? await getDB().transactions.where('id').anyOf(transactionIds).toArray()
      : [];

    // Get bills for credit sales
    const billReferences = transactions
      .filter(t => t.category?.includes('CREDIT_SALE') || t.category?.includes('SALE'))
      .map(t => t.reference)
      .filter(ref => ref && (ref.startsWith('BILL-') || /^[A-Z0-9-]+$/.test(ref)))
      .map(ref => ref!.replace('BILL-', ''));
    
    const bills = billReferences.length > 0
      ? await getDB().bills.where('bill_number').anyOf(billReferences).toArray()
      : [];

    const billIds = bills.map(b => b.id);
    const billLineItems = billIds.length > 0
      ? await getDB().bill_line_items.where('bill_id').anyOf(billIds).toArray()
      : [];

    // Get products
    const productIds = [...new Set(billLineItems.map(item => item.product_id))];
    const products = productIds.length > 0
      ? await getDB().products.where('id').anyOf(productIds).toArray()
      : [];

    const productMap = new Map(products.map(p => [p.id, p]));

    // Aggregate product data
    const productStats = new Map<string, {
      productName: string;
      category: string;
      totalQuantity: number;
      totalValue: number;
      transactionCount: number;
    }>();

    for (const item of billLineItems) {
      const product = productMap.get(item.product_id);
      if (!product) continue;

      // Parse and translate multilingual product name
      const parsedName = parseMultilingualString(product.name);
      const translatedName = getTranslatedString(parsedName, language, 'en');

      const existing = productStats.get(item.product_id) || {
        productName: translatedName,
        category: product.category || 'Uncategorized',
        totalQuantity: 0,
        totalValue: 0,
        transactionCount: 0
      };

      existing.totalQuantity += item.quantity || 0;
      existing.totalValue += item.line_total || 0;
      existing.transactionCount += 1;

      productStats.set(item.product_id, existing);
    }

    // Calculate top products
    const topProducts = Array.from(productStats.values())
      .map(stat => ({
        productName: stat.productName,
        totalQuantity: stat.totalQuantity,
        totalValue: stat.totalValue,
        averagePrice: stat.totalQuantity > 0 ? stat.totalValue / stat.totalQuantity : 0
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
   * Generate comprehensive account statement for a customer
   * Uses journal entries as the single source of truth (account_code='1200' for Accounts Receivable)
   */
  public async generateCustomerStatement(
    customerId: string,
    storeId: string,
    dateRange?: { start: string; end: string },
    viewMode: 'summary' | 'detailed' = 'detailed',
    language: SupportedLanguage = 'en'
  ): Promise<AccountStatement> {
    const now = new Date();
    const startDate = this.startOfDayISO(dateRange?.start || new Date(now.getFullYear(), 0, 1));
    const endDate = this.endOfDayISO(dateRange?.end || now);

    // Get entity information
    const entity = await getDB().entities.get(customerId);
    if (!entity || entity.entity_type !== 'customer') {
      throw new Error(`Customer ${customerId} not found`);
    }

    // Calculate opening balance from journal entries (snapshots not implemented yet)
    // Use existing index [store_id+account_code] and filter by entity_id
    const startDateObj = new Date(startDate);
    startDateObj.setHours(0, 0, 0, 0);
    
    // Get all journal entries for this account and entity, then filter by date
    const allAccountEntries = await getDB().journal_entries
      .where('[store_id+account_code]')
      .equals([storeId, '1200'])
      .filter(entry => 
        entry.entity_id === customerId && 
        entry.is_posted === true
      )
      .toArray();
    
    // Calculate opening balance (all entries before start date)
    const prePeriodEntries = allAccountEntries.filter(entry => {
      const entryDate = new Date(entry.posted_date);
      return entryDate < startDateObj;
    });
    
    const openingBalance = {
      USD: prePeriodEntries.reduce((sum, e) => sum + (e.debit_usd - e.credit_usd), 0),
      LBP: prePeriodEntries.reduce((sum, e) => sum + (e.debit_lbp - e.credit_lbp), 0)
    };

    // Get journal entries for the period (account_code='1200' for Accounts Receivable)
    // Use existing index [store_id+account_code] and filter by entity_id and date
    const endDateObj = new Date(endDate);
    endDateObj.setHours(23, 59, 59, 999);
    
    const journalEntries = allAccountEntries.filter(entry => {
      const entryDate = new Date(entry.posted_date);
      return entryDate >= startDateObj && entryDate <= endDateObj;
    });

    // Map journal entries to statement transactions
    // Note: Sorting happens inside mapJournalEntriesToStatementTransactions by transaction_id
    const { statementTransactions, ending, totals } = await this.mapJournalEntriesToStatementTransactions(
      journalEntries,
      openingBalance,
      viewMode,
      'customer',
      language
    );

    // Calculate product summary for detailed view
    const productSummary = viewMode === 'detailed' 
      ? await this.calculateProductSummaryFromJournalEntries(journalEntries, 'customer', language)
      : undefined;

    // Use ending balance from date range as current balance for the statement period
    // This shows the balance as of the end date, not the current balance
    return {
      entityId: customerId,
      entityName: entity.name,
      entityType: 'customer',
      statementDate: now.toISOString(),
      dateRange: { start: startDate, end: endDate },
      viewMode,
      transactions: statementTransactions,
      financialSummary: {
        openingBalance,
        currentBalance: { USD: ending.USD, LBP: ending.LBP },
        totalSales: { USD: totals.salesUSD, LBP: totals.salesLBP },
        totalPayments: { USD: totals.paymentsUSD, LBP: totals.paymentsLBP },
        totalReceivings: { USD: 0, LBP: 0 },
        netChange: { 
          USD: ending.USD - openingBalance.USD, 
          LBP: ending.LBP - openingBalance.LBP 
        }
      },
      productSummary
    };
  }

  /**
   * Generate comprehensive account statement for a supplier
   * Uses journal entries as the single source of truth (account_code='2100' for Accounts Payable)
   */
  public async generateSupplierStatement(
    supplierId: string,
    storeId: string,
    dateRange?: { start: string; end: string },
    viewMode: 'summary' | 'detailed' = 'detailed',
    language: SupportedLanguage = 'en'
  ): Promise<AccountStatement> {
    const now = new Date();
    const startDate = this.startOfDayISO(dateRange?.start || new Date(now.getFullYear(), 0, 1));
    const endDate = this.endOfDayISO(dateRange?.end || now);

    // Get entity information
    const entity = await getDB().entities.get(supplierId);
    if (!entity || entity.entity_type !== 'supplier') {
      throw new Error(`Supplier ${supplierId} not found`);
    }

    // Calculate opening balance from journal entries (snapshots not implemented yet)
    // Use existing index [store_id+account_code] and filter by entity_id
    const startDateObj = new Date(startDate);
    startDateObj.setHours(0, 0, 0, 0);
    
    // Get all journal entries for this account and entity, then filter by date
    const allAccountEntries = await getDB().journal_entries
      .where('[store_id+account_code]')
      .equals([storeId, '2100'])
      .filter(entry => 
        entry.entity_id === supplierId && 
        entry.is_posted === true
      )
      .toArray();
    
    // Calculate opening balance (all entries before start date)
    const prePeriodEntries = allAccountEntries.filter(entry => {
      const entryDate = new Date(entry.posted_date);
      return entryDate < startDateObj;
    });
    
    const openingBalance = {
      USD: prePeriodEntries.reduce((sum, e) => sum + (e.debit_usd - e.credit_usd), 0),
      LBP: prePeriodEntries.reduce((sum, e) => sum + (e.debit_lbp - e.credit_lbp), 0)
    };

    // Get journal entries for the period (account_code='2100' for Accounts Payable)
    // Use existing index [store_id+account_code] and filter by entity_id and date
    const endDateObj = new Date(endDate);
    endDateObj.setHours(23, 59, 59, 999);
    
    const journalEntries = allAccountEntries.filter(entry => {
      const entryDate = new Date(entry.posted_date);
      return entryDate >= startDateObj && entryDate <= endDateObj;
    });

    // Map journal entries to statement transactions
    // Note: Sorting happens inside mapJournalEntriesToStatementTransactions by transaction_id
    const { statementTransactions, ending, totals } = await this.mapJournalEntriesToStatementTransactions(
      journalEntries,
      openingBalance,
      viewMode,
      'supplier',
      language
    );

    // Calculate product summary for detailed view
    const productSummary = viewMode === 'detailed' 
      ? await this.calculateProductSummaryFromJournalEntries(journalEntries, 'supplier', language)
      : undefined;

    // Use ending balance from date range as current balance for the statement period
    // This shows the balance as of the end date, not the current balance
    return {
      entityId: supplierId,
      entityName: entity.name,
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
        totalReceivings: { USD: totals.salesUSD, LBP: totals.salesLBP }, // Received bills are "sales" in the totals
        netChange: { 
          USD: ending.USD - openingBalance.USD, 
          LBP: ending.LBP - openingBalance.LBP 
        }
      },
      productSummary
    };
  }

  /**
   * Calculate product summary statistics
   * @deprecated This method is not used. Use calculateProductSummaryFromJournalEntries instead.
   */
  private calculateProductSummary(
    sales: BillLineItem[], 
    products: Product[],
    language: SupportedLanguage = 'en'
  ): {
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

      // Parse and translate multilingual product name
      const parsedName = parseMultilingualString(product.name);
      const translatedName = getTranslatedString(parsedName, language, 'en');

      const existing = productStats.get(sale.product_id) || {
        productName: translatedName,
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
      text += `  Balance After: ${transaction.currency} ${transaction.balance_after.toFixed(2)}\n`;
      if (transaction.reference) {
        text += `  Reference: ${transaction.reference}\n`;
      }

      // Add product details for detailed view
      if (statement.viewMode === 'detailed' && transaction.product_details) {
        transaction.product_details.forEach(detail => {
          text += `    Product: ${detail.product_name}\n`;
          text += `    Quantity: ${detail.quantity} ${detail.unit}\n`;
          text += `    Unit Price: $${detail.unit_price.toFixed(2)}\n`;
          text += `    Total: $${detail.total_price.toFixed(2)}\n`;
          if (detail.weight) text += `    Weight: ${detail.weight}kg\n`;
          if (detail.commission_rate) text += `    Commission: ${detail.commission_rate}% ($${detail.commission_amount?.toFixed(2)})\n`;
          if (detail.notes) text += `    Notes: ${detail.notes}\n`;
        });
      }
      text += `\n`;
    });

    return text;
  }
}