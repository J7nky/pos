import { getDB } from '../lib/db';
import { Customer, Supplier, Transaction, BillLineItem, InventoryItem, Product, inventory_bills } from '../types';
import { StatementTransaction, StatementProductDetail } from '../types';
import { PAYMENT_CATEGORIES } from '../constants/paymentCategories';
import { TRANSACTION_CATEGORIES } from '../constants/transactionCategories';
import { parseMultilingualString, getTranslatedString, type SupportedLanguage } from '../utils/multilingual';
// Note: snapshotService import removed - snapshots not implemented yet, using direct journal entry calculation

// Import locale dictionaries for direct translation access in services
import enLocale from '../i18n/locales/en';
import arLocale from '../i18n/locales/ar';
import frLocale from '../i18n/locales/fr';

const LOCALE_DICTIONARIES: Record<string, any> = { en: enLocale, ar: arLocale, fr: frLocale };

// Translation cache: Key format: "language:key", Value: translated string
const translationCache = new Map<string, string>();
let cachedLanguage: SupportedLanguage | null = null;

/**
 * Helper function to get translation strings in services (without React context)
 * Optimized with caching to reduce object traversal overhead
 * @param key - Translation key path (e.g., 'customers.priceAdjustment')
 * @param language - Language code ('en', 'ar', 'fr')
 * @returns Translated string or the key if not found
 */
function getTranslation(key: string, language: SupportedLanguage): string {
  // Clear cache if language changed
  if (cachedLanguage !== language) {
    translationCache.clear();
    cachedLanguage = language;
  }
  
  // Check cache first
  const cacheKey = `${language}:${key}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }
  
  const dict = LOCALE_DICTIONARIES[language] || LOCALE_DICTIONARIES.en || {};
  const parts = key.split('.');
  let value: any = dict;
  
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      // Fallback to English if translation not found
      const enDict = LOCALE_DICTIONARIES.en || {};
      let enValue: any = enDict;
      for (const enPart of parts) {
        if (enValue && typeof enValue === 'object' && enPart in enValue) {
          enValue = enValue[enPart];
        } else {
          const result = key; // Return key if not found in English either
          translationCache.set(cacheKey, result);
          return result;
        }
      }
      const result = typeof enValue === 'string' ? enValue : key;
      translationCache.set(cacheKey, result);
      return result;
    }
  }
  
  const result = typeof value === 'string' ? value : key;
  translationCache.set(cacheKey, result);
  return result;
}

export interface AccountStatement {
  entityId: string;
  entityName: string;
  entityType: 'customer' | 'supplier' | 'employee';
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
    entityType: 'customer' | 'supplier' | 'employee',
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
    
    // Optimize: Parallelize independent database queries
    // Pre-normalize bill references for efficient lookup
    const allBillReferences = new Set<string>();
    const inventoryBillIds = new Set<string>();
    const priceAdjustmentTransactionIds: string[] = [];
    
    // First, fetch transactions to determine what else we need
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

    // Pre-process transactions to collect all bill references and inventory bill IDs
    transactions.forEach(t => {
      // Collect bill references (normalize all variations upfront)
      if (t.reference) {
        allBillReferences.add(t.reference);
        if (t.reference.startsWith('BILL-')) {
          allBillReferences.add(t.reference.replace('BILL-', ''));
        } else {
          allBillReferences.add(`BILL-${t.reference}`);
        }
      }
      
      // Collect inventory bill IDs for suppliers
      if (entityType === 'supplier' && t.category !== TRANSACTION_CATEGORIES.INVENTORY_PRICE_ADJUSTMENT) {
        const batchId = (t.metadata as any)?.batch_id;
        if (batchId) {
          inventoryBillIds.add(batchId);
        }
      }
      
      // Collect price adjustment transaction IDs for batch fetching
      if (t.category === TRANSACTION_CATEGORIES.INVENTORY_PRICE_ADJUSTMENT) {
        priceAdjustmentTransactionIds.push(t.id);
      }
    });
    
    const billReferencesArray = Array.from(allBillReferences);
    const inventoryBillIdsArray = Array.from(inventoryBillIds);
    
    // Optimize: Parallelize independent queries (stage 1: bills, inventory bills, inventory items, price adjustments)
    const [bills, inventoryBills, allInventoryItems, priceAdjustmentData] = await Promise.all([
      // Fetch bills
      billReferencesArray.length > 0
        ? getDB().bills.where('bill_number').anyOf(billReferencesArray).toArray()
        : Promise.resolve([]),
      
      // Fetch inventory bills for suppliers
      inventoryBillIdsArray.length > 0 && viewMode === 'detailed'
        ? getDB().inventory_bills.where('id').anyOf(inventoryBillIdsArray).toArray()
        : Promise.resolve([]),
      
      // Fetch inventory items
      inventoryBillIdsArray.length > 0 && viewMode === 'detailed'
        ? getDB().inventory_items
            .where('batch_id')
            .anyOf(inventoryBillIdsArray)
            .filter(item => !item._deleted)
            .toArray()
        : Promise.resolve([]),
      
      // Batch fetch price adjustment data (inventory items and products)
      priceAdjustmentTransactionIds.length > 0 && viewMode === 'detailed'
        ? (async () => {
            const priceAdjustmentMetadata = transactions
              .filter(t => t.category === TRANSACTION_CATEGORIES.INVENTORY_PRICE_ADJUSTMENT)
              .map(t => ({
                transactionId: t.id,
                inventoryItemId: (t.metadata as any)?.inventory_item_id,
                oldPrice: (t.metadata as any)?.old_price,
                newPrice: (t.metadata as any)?.new_price
              }))
              .filter(m => m.inventoryItemId);
            
            const inventoryItemIds = [...new Set(priceAdjustmentMetadata.map(m => m.inventoryItemId))];
            
            if (inventoryItemIds.length === 0) {
              return { inventoryItems: [], products: [], metadata: [] };
            }
            
            // Fetch inventory items once
            const inventoryItems = await getDB().inventory_items.where('id').anyOf(inventoryItemIds).toArray();
            
            // Get product IDs from inventory items
            const productIds = [...new Set(inventoryItems.map(item => item.product_id))];
            const products = productIds.length > 0
              ? await getDB().products.where('id').anyOf(productIds).toArray()
              : [];
            
            return { inventoryItems, products, metadata: priceAdjustmentMetadata };
          })()
        : Promise.resolve({ inventoryItems: [], products: [], metadata: [] })
    ]);
    
    // Stage 2: Fetch bill line items and products (after we have bill IDs)
    const billIds = bills.map(b => b.id);
    
    // Collect all product IDs we need before fetching
    const productIdsSet = new Set<string>();
    allInventoryItems.forEach(item => productIdsSet.add(item.product_id));
    if (priceAdjustmentData.products) {
      priceAdjustmentData.products.forEach((p: any) => productIdsSet.add(p.id));
    }
    
    // Fetch bill line items and products in parallel
    const [allBillLineItemsFinal, inventoryProducts] = await Promise.all([
      // Fetch bill line items
      viewMode === 'detailed' && billIds.length > 0
        ? getDB().bill_line_items.where('bill_id').anyOf(billIds).toArray()
        : Promise.resolve([]),
      
      // Fetch products for inventory items and price adjustments
      (() => {
        const productIds = Array.from(productIdsSet);
        return productIds.length > 0 && viewMode === 'detailed'
          ? getDB().products.where('id').anyOf(productIds).toArray()
          : Promise.resolve([]);
      })()
    ]);
    
    // Add bill line item product IDs and fetch those products
    allBillLineItemsFinal.forEach(item => productIdsSet.add(item.product_id));
    const billLineItemProductIds = Array.from(productIdsSet).filter(id => 
      !inventoryProducts.some(p => p.id === id)
    );
    const billLineItemProducts = viewMode === 'detailed' && billLineItemProductIds.length > 0
      ? await getDB().products.where('id').anyOf(billLineItemProductIds).toArray()
      : [];
    
    // Combine all products (avoid duplicates)
    const allProductsMap = new Map(inventoryProducts.map(p => [p.id, p]));
    billLineItemProducts.forEach(p => {
      if (!allProductsMap.has(p.id)) {
        allProductsMap.set(p.id, p);
      }
    });
    const allProducts = Array.from(allProductsMap.values());
    
    // Create comprehensive bill map with all variations upfront (optimize bill lookup)
    const billMap = new Map<string, any>();
    for (const bill of bills) {
      billMap.set(bill.bill_number, bill);
      billMap.set(`BILL-${bill.bill_number}`, bill);
      if (bill.bill_number.startsWith('BILL-')) {
        billMap.set(bill.bill_number.replace('BILL-', ''), bill);
      }
    }
    
    const billLineItemsMap = new Map<string, any[]>();
    for (const item of allBillLineItemsFinal) {
      if (!billLineItemsMap.has(item.bill_id)) {
        billLineItemsMap.set(item.bill_id, []);
      }
      billLineItemsMap.get(item.bill_id)!.push(item);
    }

    // Build product map from all fetched products
    const productMap = new Map(allProducts.map(p => [p.id, p]));
    
    // Add price adjustment products to product map
    if (priceAdjustmentData.products) {
      priceAdjustmentData.products.forEach((p: any) => {
        if (!productMap.has(p.id)) {
          productMap.set(p.id, p);
        }
      });
    }

    const inventoryBillMap = new Map(inventoryBills.map(b => [b.id, b]));

    // Organize inventory items by batch
    const inventoryItemsByBatch = new Map<string, any[]>();
    for (const item of allInventoryItems) {
      if (item.batch_id) {
        if (!inventoryItemsByBatch.has(item.batch_id)) {
          inventoryItemsByBatch.set(item.batch_id, []);
        }
        inventoryItemsByBatch.get(item.batch_id)!.push(item);
      }
    }
    
    // Create price adjustment lookup map
    const priceAdjustmentMap = new Map<string, { inventoryItem: any; product: any; oldPrice: number; newPrice: number }>();
    if (priceAdjustmentData.inventoryItems && priceAdjustmentData.products) {
      for (const metadata of priceAdjustmentData.metadata) {
        const inventoryItem = priceAdjustmentData.inventoryItems.find((item: any) => item.id === metadata.inventoryItemId);
        const product = priceAdjustmentData.products.find((p: any) => inventoryItem && p.id === inventoryItem.product_id);
        if (inventoryItem && product) {
          priceAdjustmentMap.set(metadata.transactionId, {
            inventoryItem,
            product,
            oldPrice: metadata.oldPrice,
            newPrice: metadata.newPrice
          });
        }
      }
    }

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
    // Sort transaction IDs by posted_date (accounting date) for accurate chronological ordering
    // This ensures transactions are ordered by their accounting date, matching how they appear after sync
    const sortedTransactionIds = Array.from(entriesByTransaction.entries())
      .sort(([transactionIdA, entriesA], [transactionIdB, entriesB]) => {
        // Get account entries for both transactions
        // For employees, prefer account 1200 entries, fall back to 2200 if not found
        const accountEntryA = entriesA.find(e => 
          (entityType === 'customer' && e.account_code === '1200') ||
          (entityType === 'supplier' && e.account_code === '2100') ||
          (entityType === 'employee' && (e.account_code === '1200' || e.account_code === '2200'))
        ) || entriesA.find(e => entityType === 'employee' && e.account_code === '2200');
        const accountEntryB = entriesB.find(e => 
          (entityType === 'customer' && e.account_code === '1200') ||
          (entityType === 'supplier' && e.account_code === '2100') ||
          (entityType === 'employee' && (e.account_code === '1200' || e.account_code === '2200'))
        ) || entriesB.find(e => entityType === 'employee' && e.account_code === '2200');
        
        if (!accountEntryA || !accountEntryB) return 0;
        
        // Primary sort: Use posted_date (accounting date) - YYYY-MM-DD format sorts correctly with localeCompare
        const dateCompare = (accountEntryA.posted_date || '').localeCompare(accountEntryB.posted_date || '');
        if (dateCompare !== 0) return dateCompare;
        
        // Secondary sort: Use created_at as tiebreaker (convert to Date for proper comparison)
        const transactionA = transactionMap.get(transactionIdA);
        const transactionB = transactionMap.get(transactionIdB);
        
        if (transactionA && transactionB) {
          return new Date(transactionA.created_at).getTime() - new Date(transactionB.created_at).getTime();
        }
        
        // Fallback: Use journal entry created_at
        return new Date(accountEntryA.created_at).getTime() - new Date(accountEntryB.created_at).getTime();
      })
      .map(([transactionId]) => transactionId);

    // Process each transaction group in chronological order
    for (const transactionId of sortedTransactionIds) {
      const entries = entriesByTransaction.get(transactionId);
      if (!entries) continue;

      // Get the entry for the account we're querying
      // For employees, prefer account 1200 (credit sales), fall back to 2200 (payments)
      let accountEntry = entries.find(e => 
        (entityType === 'customer' && e.account_code === '1200') ||
        (entityType === 'supplier' && e.account_code === '2100') ||
        (entityType === 'employee' && e.account_code === '1200')
      );
      
      // For employees, if no 1200 entry found, use 2200 entry (salary payments)
      if (!accountEntry && entityType === 'employee') {
        accountEntry = entries.find(e => e.account_code === '2200');
      }

      if (!accountEntry) continue;
      const transaction = transactionMap.get(transactionId);
      
      // Skip reversal transactions, corrected original transactions, and deleted transactions from display
      // These affect balances but shouldn't appear as line items:
      // - Reversals: correction entries that reverse the original (check both transaction and journal entry)
      // - Corrected originals: original transactions that were corrected (only corrected version should appear)
      // - Deleted transactions: transactions that were deleted (neither original nor reversal should appear)
      // Reversal journal entries are still included in balance calculations (they're in journalEntries parameter)
      const isReversalTransaction = transaction && (transaction.is_reversal === true || transaction.reversal_of_transaction_id);
      const isReversalEntry = accountEntry.entry_type === 'reversal';
      const isCorrectedOriginal = transaction && (transaction.metadata as any)?.corrected === true;
      const isDeleted = transaction && (transaction.metadata as any)?.deleted === true;
      
      // Calculate amounts based on account type
      // For employees: net balance = Account 1200 balance - Account 2200 balance
      // Account 1200 (AR - asset): debit - credit (increases net balance)
      // Account 2100 (AP - liability): credit - debit (increases net balance for suppliers)
      // Account 2200 (Salaries Payable - liability): credit - debit (but DECREASES net balance for employees)
      // 
      // Opening balance = Account 1200 - Account 2200
      // When processing account 2200 entries, we need to subtract (credit - debit) from running balance
      // Subtracting (credit - debit) = adding -(credit - debit) = adding (debit - credit)
      
      let amountUSD: number;
      let amountLBP: number;
      
      if (entityType === 'employee') {
        // For employees: net balance = Account 1200 - Account 2200
        if (accountEntry.account_code === '1200') {
          // Account 1200: debit - credit (increases net balance)
          amountUSD = accountEntry.debit_usd - accountEntry.credit_usd;
          amountLBP = accountEntry.debit_lbp - accountEntry.credit_lbp;
        } else if (accountEntry.account_code === '2200') {
          // Account 2200: since opening balance = Account 1200 - Account 2200,
          // when we process a new account 2200 entry, we need to subtract (credit - debit) from running balance
          // Subtracting (credit - debit) = adding -(credit - debit) = adding (debit - credit)
          amountUSD = accountEntry.debit_usd - accountEntry.credit_usd;
          amountLBP = accountEntry.debit_lbp - accountEntry.credit_lbp;
        } else {
          // Fallback (shouldn't happen)
          amountUSD = accountEntry.debit_usd - accountEntry.credit_usd;
          amountLBP = accountEntry.debit_lbp - accountEntry.credit_lbp;
        }
      } else {
        // For customers/suppliers: standard calculation
        const isLiabilityAccount = accountEntry.account_code === '2100';
        amountUSD = isLiabilityAccount 
          ? accountEntry.credit_usd - accountEntry.debit_usd
          : accountEntry.debit_usd - accountEntry.credit_usd;
        amountLBP = isLiabilityAccount
          ? accountEntry.credit_lbp - accountEntry.debit_lbp
          : accountEntry.debit_lbp - accountEntry.credit_lbp;
      }
      
      if (isReversalTransaction || isReversalEntry || isCorrectedOriginal || isDeleted) {
        // Still update running balance because reversal/corrected/deleted entries affect the balance
        runningUSD += amountUSD;
        runningLBP += amountLBP;
        continue; // Skip adding to statementTransactions but keep balance updated
      }
      
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
      } else if (entityType === 'employee') {
        // For employees:
        // - Account 1200 (AR): Credit = payment received, Debit = credit sale
        // - Account 2200 (Salaries Payable - liability): Debit = payment made (salary), Credit = salary accrued
        if (accountEntry.account_code === '1200') {
          // Account 1200: same logic as customers
          if (hasCredit && !hasDebit) {
            type = 'payment';
          } else if (hasDebit && !hasCredit) {
            type = 'sale';
          }
        } else if (accountEntry.account_code === '2200') {
          // Account 2200 (Salaries Payable - liability):
          // - Debit to 2200 = payment made to employee (reduces what we owe)
          // - Credit to 2200 = salary accrued (increases what we owe)
          if (hasDebit && !hasCredit) {
            type = 'payment'; // Payment made to employee
          } else if (hasCredit && !hasDebit) {
            type = 'expense'; // Salary accrued/expense
          }
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
          // For supplier credit purchases, type should be 'income' (purchase/receiving)
          // For customer credit sales, type should be 'sale'
          type = entityType === 'customer' ? 'sale' : 'income';
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
        // Also check transaction category for supplier credit purchases when type wasn't set from debit/credit
        if (entityType === 'supplier' && transaction.category?.includes('CREDIT_SALE')) {
          type = 'income'; // Supplier credit purchase
        }
        // Update description from transaction if available (translate multilingual)
        description = transaction.description 
          ? getTranslatedString(parseMultilingualString(transaction.description), language, 'en')
          : description;
      }

      // Check if this is a price adjustment transaction
      const isPriceAdjustment = transaction?.category === TRANSACTION_CATEGORIES.INVENTORY_PRICE_ADJUSTMENT;

      // Format description for price adjustments with product details (using pre-fetched data)
      if (isPriceAdjustment && transaction) {
        const priceAdjustmentInfo = priceAdjustmentMap.get(transactionId);
        if (priceAdjustmentInfo) {
          const { product, oldPrice, newPrice } = priceAdjustmentInfo;
          
          // Parse and translate product name
          const parsedName = product.name ? parseMultilingualString(product.name) : null;
          const productName = parsedName ? getTranslatedString(parsedName, language, 'en') : 'Unknown Product';
          
          // Format prices with thousand separators
          const formatPrice = (price: number | null) => {
            if (price === null || price === undefined) return 'N/A';
            return new Intl.NumberFormat('en-US', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2
            }).format(price);
          };
          
          // Get translated strings for price adjustment description
          const priceAdjustmentLabel = getTranslation('customers.priceAdjustment', language);
          const fromLabel = getTranslation('customers.from', language);
          const toLabel = getTranslation('customers.to', language);
          
          // Build formatted description: "Price Adjustment | Product Name | from OldPrice | to NewPrice"
          description = `${priceAdjustmentLabel} | ${productName} | ${fromLabel} ${formatPrice(oldPrice)} | ${toLabel} ${formatPrice(newPrice)}`;
        }
      }

      // Get bill information if available (using pre-fetched data)
      // Optimize: Use comprehensive bill map (no expensive fallback searches)
      let bill: any = null;
      let billLineItems: any[] = [];
      if (transaction?.reference) {
        // Use pre-normalized bill map (all variations already included)
        bill = billMap.get(transaction.reference) || 
               billMap.get(transaction.reference.startsWith('BILL-') ? transaction.reference.replace('BILL-', '') : `BILL-${transaction.reference}`);
        
        // If bill is found, get line items from pre-fetched map
        if (bill) {
          billLineItems = billLineItemsMap.get(bill.id) || [];
        }
      }

      // Get inventory bill information for supplier transactions (inventory purchases)
      // Inventory purchases link to inventory_bills via metadata.batch_id
      // Skip price adjustments - they shouldn't show inventory items
      // Optimize: Use pre-fetched data (no individual queries)
      let inventoryBill: any = null;
      let inventoryItems: any[] = [];
      if (entityType === 'supplier' && transaction && !isPriceAdjustment) {
        const batchId = (transaction.metadata as any)?.batch_id;
        if (batchId) {
          // Get inventory bill from pre-fetched map
          inventoryBill = inventoryBillMap.get(batchId);
          
          // Get inventory items for this batch from pre-fetched map
          if (inventoryBill) {
            inventoryItems = inventoryItemsByBatch.get(batchId) || [];
          }
        }
      }

      // Build product details for detailed view (using pre-fetched products)
      const productDetails: StatementProductDetail[] = [];
      
      // Process bill line items (for customer bills and supplier bills from POS)
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
            // Supplier credit purchases: show as credit (increases payable)
            if (type === 'income' || 
                transaction?.category?.includes('SUPPLIER_CREDIT_SALE') || 
                transaction?.category?.includes('CREDIT_SALE')) {
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

      // Process inventory items for supplier inventory bills (inventory purchases)
      if (viewMode === 'detailed' && inventoryItems.length > 0 && entityType === 'supplier') {
        for (const item of inventoryItems) {
          const product = productMap.get(item.product_id);
          // Parse and translate multilingual product name
          const parsedName = product?.name ? parseMultilingualString(product.name) : null;
          const translatedName = parsedName ? getTranslatedString(parsedName, language, 'en') : 'Unknown Product';
          
          // Calculate credit/debit for each inventory item
          // For suppliers: purchases increase payable (credit)
          let debit_amount = 0;
          let credit_amount = 0;
          
          // Use the item's currency if available, otherwise use transaction currency
          const itemCurrency = item.currency || currency;
          // Calculate line total: quantity * price (or use received_quantity if different)
          const itemQuantity = item.received_quantity || item.quantity || 0;
          const itemPrice = item.price || 0;
          const lineTotal = itemQuantity * itemPrice;
          
          // Supplier inventory purchases: show as credit (increases payable)
          if (type === 'income' || 
              transaction?.category?.includes('SUPPLIER_CREDIT_SALE') || 
              transaction?.category?.includes('CREDIT_SALE')) {
            debit_amount = 0;
            credit_amount = lineTotal;
          } else {
            // Default: treat as purchase for suppliers
            debit_amount = 0;
            credit_amount = lineTotal;
          }
          
          productDetails.push({
            product_id: item.product_id,
            product_name: translatedName,
            quantity: itemQuantity,
            unit: item.unit || 'piece',
            unit_price: itemPrice,
            total_price: lineTotal,
            weight: item.weight || undefined,
            notes: undefined, // Inventory items don't have notes field
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

      // Calculate quantity and average price from line items (bill items or inventory items)
      const allLineItems = billLineItems.length > 0 ? billLineItems : inventoryItems;
      const totalQuantity = allLineItems.length > 0
        ? allLineItems.reduce((sum, item) => {
            if (item.quantity !== undefined) {
              return sum + (item.quantity || 0);
            } else if (item.received_quantity !== undefined) {
              return sum + (item.received_quantity || 0);
            }
            return sum;
          }, 0)
        : 0;
      
      const averagePrice = allLineItems.length > 0
        ? allLineItems.reduce((sum, item) => {
            const price = item.unit_price || item.price || 0;
            return sum + price;
          }, 0) / allLineItems.length
        : 0;

      statementTransactions.push({
        id: transactionId,
        date: accountEntry.posted_date || accountEntry.created_at,
        type,
        description: finalDescription,
        amount: Math.abs(amount),
        quantity: totalQuantity,
        weight: 0,
        price: averagePrice,
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
   * Enhanced to include inventory items for suppliers
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

    // Get bills for credit sales (customer/employee) and supplier bills
    const billReferences = transactions
      .filter(t => t.category?.includes('CREDIT_SALE') || t.category?.includes('SALE'))
      .map(t => t.reference)
      .filter(ref => ref && (ref.startsWith('BILL-') || /^[A-Z0-9-]+$/.test(ref)))
      .map(ref => ref!.replace('BILL-', ''));
    
    // Collect inventory bill IDs for suppliers
    const inventoryBillIds = new Set<string>();
    if (entityType === 'supplier') {
      transactions.forEach(t => {
        if (t.category !== TRANSACTION_CATEGORIES.INVENTORY_PRICE_ADJUSTMENT) {
          const batchId = (t.metadata as any)?.batch_id;
          if (batchId) {
            inventoryBillIds.add(batchId);
          }
        }
      });
    }
    
    const inventoryBillIdsArray = Array.from(inventoryBillIds);
    
    // Parallelize fetching bills, bill line items, inventory bills, and inventory items
    const [bills, inventoryBills] = await Promise.all([
      billReferences.length > 0
        ? getDB().bills.where('bill_number').anyOf(billReferences).toArray()
        : Promise.resolve([]),
      inventoryBillIdsArray.length > 0
        ? getDB().inventory_bills.where('id').anyOf(inventoryBillIdsArray).toArray()
        : Promise.resolve([])
    ]);

    const billIds = bills.map(b => b.id);
    
    // Fetch bill line items and inventory items in parallel
    const [billLineItems, allInventoryItems] = await Promise.all([
      billIds.length > 0
        ? getDB().bill_line_items.where('bill_id').anyOf(billIds).toArray()
        : Promise.resolve([]),
      inventoryBillIdsArray.length > 0
        ? getDB().inventory_items
            .where('batch_id')
            .anyOf(inventoryBillIdsArray)
            .filter(item => !item._deleted)
            .toArray()
        : Promise.resolve([])
    ]);

    // Collect all product IDs
    const productIdsSet = new Set<string>();
    billLineItems.forEach(item => productIdsSet.add(item.product_id));
    allInventoryItems.forEach(item => productIdsSet.add(item.product_id));
    
    const productIds = Array.from(productIdsSet);
    const products = productIds.length > 0
      ? await getDB().products.where('id').anyOf(productIds).toArray()
      : [];

    const productMap = new Map(products.map(p => [p.id, p]));

    // Aggregate product data from bill line items
    const productStats = new Map<string, {
      productName: string;
      category: string;
      totalQuantity: number;
      totalValue: number;
      transactionCount: number;
    }>();

    // Process bill line items
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

    // Process inventory items for suppliers (enhancement)
    if (entityType === 'supplier') {
      for (const item of allInventoryItems) {
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

        // Use received_quantity if available, otherwise quantity
        const itemQuantity = item.received_quantity || item.quantity || 0;
        const itemPrice = item.price || 0;
        const lineTotal = itemQuantity * itemPrice;

        existing.totalQuantity += itemQuantity;
        existing.totalValue += lineTotal;
        existing.transactionCount += 1;

        productStats.set(item.product_id, existing);
      }
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
   * Unified method to generate account statement for any entity type
   * Uses journal entries as the single source of truth
   */
  private async generateEntityStatement(
    entityId: string,
    entityType: 'customer' | 'supplier' | 'employee',
    storeId: string,
    dateRange?: { start: string; end: string },
    viewMode: 'summary' | 'detailed' = 'detailed',
    language: SupportedLanguage = 'en'
  ): Promise<AccountStatement> {
    const now = new Date();
    const startDate = this.startOfDayISO(dateRange?.start || new Date(now.getFullYear(), 0, 1));
    const endDate = this.endOfDayISO(dateRange?.end || now);

    // Get entity information
    const entity = await getDB().entities.get(entityId);
    if (!entity || entity.entity_type !== entityType) {
      throw new Error(`${entityType.charAt(0).toUpperCase() + entityType.slice(1)} ${entityId} not found`);
    }

    // Determine account code(s) based on entity type
    // Employees have entries in TWO accounts: 1200 (credit sales) and 2200 (salary payments)
    const accountCodes = entityType === 'supplier' 
      ? ['2100'] 
      : entityType === 'employee' 
        ? ['1200', '2200'] // Both AR and Salaries Payable for employees
        : ['1200']; // AR for customers
    const statementEntityType = entityType === 'employee' ? 'customer' : entityType; // Employees use customer logic

    // Optimize: Use string comparison for date filtering (faster than Date objects)
    const startDateStr = startDate.split('T')[0]; // YYYY-MM-DD format
    const endDateStr = endDate.split('T')[0];
    
    // Fetch entries for all relevant accounts
    // For employees, we need to combine entries from both accounts
    let allAccountEntries: any[] = [];
    
    for (const accountCode of accountCodes) {
      try {
        const entries = await getDB().journal_entries
          .where('[store_id+account_code]')
          .equals([storeId, accountCode])
          .filter(entry => 
            entry.entity_id === entityId && 
            entry.is_posted === true
          )
          .toArray();
        allAccountEntries.push(...entries);
      } catch (error) {
        // Fallback: If compound index doesn't exist, filter manually
        console.warn(`Compound index [store_id+account_code] not available for account ${accountCode}, using fallback query:`, error);
        const allStoreEntries = await getDB().journal_entries
          .where('store_id')
          .equals(storeId)
          .filter(entry => 
            entry.entity_id === entityId && 
            entry.account_code === accountCode &&
            entry.is_posted === true
          )
          .toArray();
        allAccountEntries.push(...allStoreEntries);
      }
    }
    
    console.log(`[ACCOUNT_STATEMENT] Found ${allAccountEntries.length} journal entries for ${entityType} ${entityId}, accounts: ${accountCodes.join(', ')}`);
    
    // Optimize: Use string comparison for date filtering (faster)
    const prePeriodEntries = allAccountEntries.filter(entry => 
      entry.posted_date < startDateStr
    );
    
    // Calculate opening balance based on entity type
    let openingBalance: { USD: number; LBP: number };
    
    if (entityType === 'employee') {
      // For employees: combine balances from both accounts
      // Account 1200 (AR - asset): debit - credit
      // Account 2200 (Salaries Payable - liability): credit - debit
      // Net opening balance = AR balance - Salaries Payable balance
      const prePeriod1200 = prePeriodEntries.filter(e => e.account_code === '1200');
      const prePeriod2200 = prePeriodEntries.filter(e => e.account_code === '2200');
      
      const opening1200 = {
        USD: prePeriod1200.reduce((sum, e) => sum + (e.debit_usd - e.credit_usd), 0),
        LBP: prePeriod1200.reduce((sum, e) => sum + (e.debit_lbp - e.credit_lbp), 0)
      };
      
      const opening2200 = {
        USD: prePeriod2200.reduce((sum, e) => sum + (e.credit_usd - e.debit_usd), 0), // Liability: credit - debit
        LBP: prePeriod2200.reduce((sum, e) => sum + (e.credit_lbp - e.debit_lbp), 0)
      };
      
      openingBalance = {
        USD: opening1200.USD - opening2200.USD,
        LBP: opening1200.LBP - opening2200.LBP
      };
    } else {
      // For customers/suppliers: standard calculation
      openingBalance = {
        USD: prePeriodEntries.reduce((sum, e) => sum + (e.debit_usd - e.credit_usd), 0),
        LBP: prePeriodEntries.reduce((sum, e) => sum + (e.debit_lbp - e.credit_lbp), 0)
      };
    }

    // Get journal entries for the period using string comparison
    const journalEntries = allAccountEntries.filter(entry => 
      entry.posted_date >= startDateStr && entry.posted_date <= endDateStr
    );

    // Map journal entries to statement transactions
    // Pass the actual entityType (not statementEntityType) so the method knows it's an employee
    const { statementTransactions, ending, totals } = await this.mapJournalEntriesToStatementTransactions(
      journalEntries,
      openingBalance,
      viewMode,
      entityType, // Pass actual entityType so method can handle employees correctly
      language
    );

    // Calculate product summary for detailed view
    const productSummary = viewMode === 'detailed' 
      ? await this.calculateProductSummaryFromJournalEntries(journalEntries, statementEntityType, language)
      : undefined;

    // Build financial summary based on entity type
    const financialSummary = {
      openingBalance,
      currentBalance: { USD: ending.USD, LBP: ending.LBP },
      totalSales: entityType === 'supplier' 
        ? { USD: 0, LBP: 0 } 
        : { USD: totals.salesUSD, LBP: totals.salesLBP },
      totalPayments: { USD: totals.paymentsUSD, LBP: totals.paymentsLBP },
      totalReceivings: entityType === 'supplier'
        ? { USD: totals.salesUSD, LBP: totals.salesLBP } // Received bills are "sales" in the totals
        : { USD: 0, LBP: 0 },
      netChange: { 
        USD: ending.USD - openingBalance.USD, 
        LBP: ending.LBP - openingBalance.LBP 
      }
    };

    return {
      entityId,
      entityName: entity.name,
      entityType,
      statementDate: now.toISOString(),
      dateRange: { start: startDate, end: endDate },
      viewMode,
      transactions: statementTransactions,
      financialSummary,
      productSummary
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
    return this.generateEntityStatement(customerId, 'customer', storeId, dateRange, viewMode, language);
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
    return this.generateEntityStatement(supplierId, 'supplier', storeId, dateRange, viewMode, language);
  }

  /**
   * Generate comprehensive account statement for an employee
   * Uses journal entries as the single source of truth (account_code='1200' for Accounts Receivable)
   * Employees are treated similar to customers for credit sales
   */
  public async generateEmployeeStatement(
    employeeId: string,
    storeId: string,
    dateRange?: { start: string; end: string },
    viewMode: 'summary' | 'detailed' = 'detailed',
    language: SupportedLanguage = 'en'
  ): Promise<AccountStatement> {
    return this.generateEntityStatement(employeeId, 'employee', storeId, dateRange, viewMode, language);
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