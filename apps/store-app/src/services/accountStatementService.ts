import { getDB } from '../lib/db';
import { StatementTransaction, StatementProductDetail } from '../types';
import { TRANSACTION_CATEGORIES } from '../constants/transactionCategories';
import { parseMultilingualString, getTranslatedString, type SupportedLanguage } from '../utils/multilingual';
import {
  amountsFromLegacyEntry,
  getDebit,
  getCredit,
  amountCurrencies,
} from './accountingCurrencyHelpers';
import type { CurrencyCode } from '@pos-platform/shared';
import type { JournalEntryAmounts, BalanceSnapshotMap } from '../types/database';
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
    /** Per-currency opening balance. Sign convention: positive = entity owes us. */
    openingBalance: BalanceSnapshotMap;
    /** Per-currency closing balance. */
    currentBalance: BalanceSnapshotMap;
    totalSales: BalanceSnapshotMap;
    totalPayments: BalanceSnapshotMap;
    totalReceivings: BalanceSnapshotMap;
    netChange: BalanceSnapshotMap;
    /** 1 = entity owes us (net); -1 = we owe entity; 0 = settled. */
    netSign: 1 | -1 | 0;
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
   * Map journal entries to statement transactions, emitting ONE row per
   * journal entry. Group-by-transaction is used only to enrich description /
   * bill / inventory metadata — never to collapse multiple journal lines on
   * different account codes into a single row, which is what historically
   * hid cross-account activity (e.g. a supplier's POS purchase posted to
   * 1200 was invisible on the supplier ledger).
   *
   * Sign convention: per-currency balance += debit - credit, applied
   * uniformly across all account codes. Positive net = entity owes us;
   * negative net = we owe entity. AR debits and AP credits naturally
   * combine under this rule without per-account sign flipping.
   */
  private async mapJournalEntriesToStatementTransactions(
    journalEntries: any[],
    openingBalance: BalanceSnapshotMap,
    viewMode: 'summary' | 'detailed',
    _entityType: 'customer' | 'supplier' | 'employee',
    language: SupportedLanguage = 'en'
  ): Promise<{
    statementTransactions: StatementTransaction[];
    ending: BalanceSnapshotMap;
    totals: {
      sales: BalanceSnapshotMap;
      payments: BalanceSnapshotMap;
      receivings: BalanceSnapshotMap;
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
      
      // Collect inventory bill IDs for any transaction with a batch_id (supplier purchases).
      // Gating on entityType is wrong: an entity may have entries that mix sale-bills
      // (for sales TO a supplier-acting-as-customer) with received-inventory bills.
      if (t.category !== TRANSACTION_CATEGORIES.INVENTORY_PRICE_ADJUSTMENT) {
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

    // Build statement transactions — ONE ROW PER JOURNAL ENTRY (not per transaction)
    const statementTransactions: StatementTransaction[] = [];
    const running: Partial<Record<CurrencyCode, number>> = { ...openingBalance };

    const totals: { sales: Partial<Record<CurrencyCode, number>>; payments: Partial<Record<CurrencyCode, number>>; receivings: Partial<Record<CurrencyCode, number>> } = {
      sales: {},
      payments: {},
      receivings: {},
    };

    const addTo = (bucket: Partial<Record<CurrencyCode, number>>, ccy: CurrencyCode, amount: number) => {
      bucket[ccy] = (bucket[ccy] ?? 0) + amount;
    };

    // Pick a single representative currency for a row's display column.
    // Prefer the currency carrying the largest absolute net (debit - credit).
    const pickDominantCurrency = (amounts: JournalEntryAmounts): CurrencyCode => {
      const codes = amountCurrencies(amounts);
      if (codes.length === 0) return 'USD';
      let best: CurrencyCode = codes[0];
      let bestMag = -1;
      for (const c of codes) {
        const mag = Math.abs(getDebit(amounts, c) - getCredit(amounts, c));
        if (mag > bestMag) {
          bestMag = mag;
          best = c;
        }
      }
      return best;
    };

    // Friendly account name from the entry's stored account_name field, falling back to code
    const accountLabel = (entry: any): string => {
      if (entry.account_name && typeof entry.account_name === 'string') return entry.account_name;
      const code = entry.account_code;
      switch (code) {
        case '1100': return 'Cash';
        case '1200': return 'Accounts Receivable';
        case '1300': return 'Inventory';
        case '1400': return 'Prepaid Expenses';
        case '2100': return 'Accounts Payable';
        case '2200': return 'Salaries Payable';
        case '4100': return 'Sales Revenue';
        default: return code || '';
      }
    };

    // Sort entries chronologically: posted_date first, then transaction created_at, then journal entry created_at.
    const sortedEntries = [...journalEntries].sort((a, b) => {
      const dateCompare = (a.posted_date || '').localeCompare(b.posted_date || '');
      if (dateCompare !== 0) return dateCompare;
      const txA = transactionMap.get(a.transaction_id);
      const txB = transactionMap.get(b.transaction_id);
      if (txA && txB) {
        const t = new Date(txA.created_at).getTime() - new Date(txB.created_at).getTime();
        if (t !== 0) return t;
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    // Process each entry independently — one row per entry under the unified sign rule.
    for (const accountEntry of sortedEntries) {
      const transactionId: string = accountEntry.transaction_id;
      const transaction = transactionMap.get(transactionId);

      // Reversal / corrected-original / deleted entries still affect the running balance,
      // but we don't emit a visible row for them.
      const isReversalTransaction = transaction && (transaction.is_reversal === true || transaction.reversal_of_transaction_id);
      const isReversalEntry = accountEntry.entry_type === 'reversal';
      const isCorrectedOriginal = transaction && (transaction.metadata as any)?.corrected === true;
      const isDeleted = transaction && (transaction.metadata as any)?.deleted === true;

      // Normalize to the per-currency amounts map. Falls back to legacy USD/LBP columns
      // for entries written before Phase 11 dual-write landed.
      const amounts = amountsFromLegacyEntry(accountEntry);
      const presentCurrencies = amountCurrencies(amounts);

      // Apply unified sign rule: balance += debit - credit, for every currency present.
      for (const ccy of presentCurrencies) {
        const delta = getDebit(amounts, ccy) - getCredit(amounts, ccy);
        if (delta !== 0) {
          running[ccy] = (running[ccy] ?? 0) + delta;
        }
      }

      if (isReversalTransaction || isReversalEntry || isCorrectedOriginal || isDeleted) {
        continue;
      }

      // Skip rows that have no actual amount (zero-only entries).
      if (presentCurrencies.length === 0) continue;
      const totalNetMag = presentCurrencies.reduce(
        (sum, c) => sum + Math.abs(getDebit(amounts, c) - getCredit(amounts, c)),
        0
      );
      if (totalNetMag < 0.01) continue;

      const rowCurrency = pickDominantCurrency(amounts);
      const rowDebit = getDebit(amounts, rowCurrency);
      const rowCredit = getCredit(amounts, rowCurrency);
      const amountAbs = Math.abs(rowDebit - rowCredit);

      // Determine transaction type from this entry's debit/credit shape.
      // Drives the displayed icon/colour/label and totals bucketing.
      let type: 'sale' | 'payment' | 'income' | 'expense' = 'payment';
      const hasDebit = rowDebit > 0.01;
      const hasCredit = rowCredit > 0.01;
      const code: string | undefined = accountEntry.account_code;

      if (code === '1200') {
        // AR: debit = sale/charge to entity, credit = payment received from entity
        if (hasDebit && !hasCredit) type = 'sale';
        else if (hasCredit && !hasDebit) type = 'payment';
      } else if (code === '2100') {
        // AP: credit = receiving/purchase from entity, debit = payment made to entity
        if (hasCredit && !hasDebit) type = 'income';
        else if (hasDebit && !hasCredit) type = 'payment';
      } else if (code === '2200') {
        // Salaries Payable: credit = salary accrued, debit = paid to employee
        if (hasCredit && !hasDebit) type = 'expense';
        else if (hasDebit && !hasCredit) type = 'payment';
      }

      // Description: prefer the entry's description, then the transaction's, then a generic default.
      let description = accountEntry.description
        ? getTranslatedString(parseMultilingualString(accountEntry.description), language, 'en')
        : 'Transaction';
      if (transaction) {
        if (hasDebit && hasCredit) {
          if (transaction.category?.includes('CREDIT_SALE') || transaction.category?.includes('SALE')) {
            type = code === '2100' ? 'income' : 'sale';
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
        } else {
          description = transaction.description
            ? getTranslatedString(parseMultilingualString(transaction.description), language, 'en')
            : description;
        }
      }

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

      // Inventory bills (received from supplier) are gated on a metadata.batch_id —
      // they don't depend on entityType, so a sale-to-supplier scenario won't pick
      // them up incorrectly (it has no batch_id).
      let inventoryBill: any = null;
      let inventoryItems: any[] = [];
      if (transaction && !isPriceAdjustment) {
        const batchId = (transaction.metadata as any)?.batch_id;
        if (batchId) {
          inventoryBill = inventoryBillMap.get(batchId);
          if (inventoryBill) {
            inventoryItems = inventoryItemsByBatch.get(batchId) || [];
          }
        }
      }

      // Build product details for detailed view (using pre-fetched products)
      const productDetails: StatementProductDetail[] = [];

      // Determine line-item direction from the entry's dominant direction.
      // If the entry net-debits, lines show as debit; if it net-credits, lines show as credit.
      const dominantIsDebit = rowDebit >= rowCredit;

      // Process bill line items (POS bills — sales OR sales-to-supplier).
      if (viewMode === 'detailed' && billLineItems.length > 0) {
        for (const item of billLineItems) {
          const product = productMap.get(item.product_id);
          const parsedName = product?.name ? parseMultilingualString(product.name) : null;
          const translatedName = parsedName ? getTranslatedString(parsedName, language, 'en') : 'Unknown Product';

          const itemCurrency = (item.currency as CurrencyCode) || rowCurrency;
          const lineTotal = item.line_total || 0;
          const debit_amount = dominantIsDebit ? lineTotal : 0;
          const credit_amount = dominantIsDebit ? 0 : lineTotal;

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
            currency: itemCurrency,
          } as StatementProductDetail);
        }
      }

      // Process inventory items (received-from-supplier bills).
      if (viewMode === 'detailed' && inventoryItems.length > 0) {
        for (const item of inventoryItems) {
          const product = productMap.get(item.product_id);
          const parsedName = product?.name ? parseMultilingualString(product.name) : null;
          const translatedName = parsedName ? getTranslatedString(parsedName, language, 'en') : 'Unknown Product';

          const itemCurrency = (item.currency as CurrencyCode) || rowCurrency;
          const itemQuantity = item.received_quantity || item.quantity || 0;
          const itemPrice = item.price || 0;
          const lineTotal = itemQuantity * itemPrice;
          const debit_amount = dominantIsDebit ? lineTotal : 0;
          const credit_amount = dominantIsDebit ? 0 : lineTotal;

          productDetails.push({
            product_id: item.product_id,
            product_name: translatedName,
            quantity: itemQuantity,
            unit: item.unit || 'piece',
            unit_price: itemPrice,
            total_price: lineTotal,
            weight: item.weight || undefined,
            notes: undefined,
            debit_amount,
            credit_amount,
            currency: itemCurrency,
          } as StatementProductDetail);
        }
      }

      // Per-currency totals bucket. Drives the financial summary cards.
      for (const ccy of presentCurrencies) {
        const debit = getDebit(amounts, ccy);
        const credit = getCredit(amounts, ccy);
        if (type === 'sale') {
          addTo(totals.sales, ccy, Math.abs(debit - credit));
        } else if (type === 'income') {
          addTo(totals.receivings, ccy, Math.abs(debit - credit));
        } else if (type === 'payment') {
          addTo(totals.payments, ccy, Math.abs(debit - credit));
        }
      }

      // Quantity / average-price hint shown when there are no line items expanded.
      const allLineItems = billLineItems.length > 0 ? billLineItems : inventoryItems;
      const totalQuantity = allLineItems.length > 0
        ? allLineItems.reduce((sum: number, it: any) => {
            if (it.quantity !== undefined) return sum + (it.quantity || 0);
            if (it.received_quantity !== undefined) return sum + (it.received_quantity || 0);
            return sum;
          }, 0)
        : 0;
      const averagePrice = allLineItems.length > 0
        ? allLineItems.reduce((sum: number, it: any) => sum + (it.unit_price || it.price || 0), 0) / allLineItems.length
        : 0;

      // Snapshot the running balance map AFTER applying this entry.
      const balancesAfter: Partial<Record<CurrencyCode, number>> = {};
      for (const c of Object.keys(running) as CurrencyCode[]) {
        const v = running[c];
        if (v !== undefined) balancesAfter[c] = v;
      }

      statementTransactions.push({
        id: `${transactionId}:${accountEntry.id ?? statementTransactions.length}`,
        date: accountEntry.posted_date || accountEntry.created_at,
        type,
        description, // keep the meaningful description even when line items are present
        debit: rowDebit,
        credit: rowCredit,
        amount: amountAbs,
        quantity: totalQuantity,
        weight: 0,
        price: averagePrice,
        currency: rowCurrency,
        balances_after: balancesAfter,
        balance_after: balancesAfter[rowCurrency] ?? 0,
        account_code: accountEntry.account_code,
        account_name: accountLabel(accountEntry),
        payment_method: transaction?.category?.includes('CASH') ? 'cash'
          : transaction?.category?.includes('CREDIT') ? 'credit'
          : undefined,
        product_details: productDetails.length > 0 ? productDetails : undefined,
        reference: (transaction?.reference && transaction.reference.trim() !== '')
          ? transaction.reference
          : `TXN-${transactionId.slice(-8)}`,
      });
    }

    const ending: BalanceSnapshotMap = {};
    for (const c of Object.keys(running) as CurrencyCode[]) {
      const v = running[c];
      if (v !== undefined && Math.abs(v) > 0.005) ending[c] = v;
    }

    return {
      statementTransactions,
      ending,
      totals,
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
    const [bills] = await Promise.all([
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

    const statementEntityType = entityType === 'employee' ? 'customer' : entityType;

    const startDateStr = startDate.split('T')[0];
    const endDateStr = endDate.split('T')[0];

    // Both legs of a journal pair carry the SAME entity_id (see journalService.ts
    // lines 116 and 144). If we queried purely by entity_id, a $100 customer
    // payment would return BOTH the Cash debit (account 1100) and the AR credit
    // (account 1200), summing to zero on the ledger. To prevent that — and still
    // surface cross-account entity activity (supplier buying from POS posts to
    // 1200; employee salary posts to 2200) — restrict to the three entity-balance
    // accounts uniformly across all entity types.
    const ENTITY_BALANCE_ACCOUNTS = new Set(['1200', '2100', '2200']);

    let allAccountEntries: any[] = [];
    try {
      allAccountEntries = await getDB().journal_entries
        .where('entity_id')
        .equals(entityId)
        .filter(entry =>
          entry.store_id === storeId &&
          entry.is_posted === true &&
          ENTITY_BALANCE_ACCOUNTS.has(entry.account_code)
        )
        .toArray();
    } catch (error) {
      console.warn('[ACCOUNT_STATEMENT] entity_id index unavailable, falling back to store_id scan:', error);
      allAccountEntries = await getDB().journal_entries
        .where('store_id')
        .equals(storeId)
        .filter(entry =>
          entry.entity_id === entityId &&
          entry.is_posted === true &&
          ENTITY_BALANCE_ACCOUNTS.has(entry.account_code)
        )
        .toArray();
    }

    console.log(`[ACCOUNT_STATEMENT] Found ${allAccountEntries.length} journal entries for ${entityType} ${entityId} (entity-balance accounts: 1200, 2100, 2200)`);

    const prePeriodEntries = allAccountEntries.filter(entry =>
      (entry.posted_date || '') < startDateStr
    );

    // Per-currency opening balance under the unified sign rule:
    // balance += debit - credit, applied across ALL account codes uniformly.
    const openingBalance: BalanceSnapshotMap = {};
    for (const e of prePeriodEntries) {
      const amounts = amountsFromLegacyEntry(e);
      for (const ccy of amountCurrencies(amounts)) {
        const delta = getDebit(amounts, ccy) - getCredit(amounts, ccy);
        if (delta !== 0) {
          openingBalance[ccy] = (openingBalance[ccy] ?? 0) + delta;
        }
      }
    }

    const journalEntries = allAccountEntries.filter(entry =>
      (entry.posted_date || '') >= startDateStr &&
      (entry.posted_date || '') <= endDateStr
    );

    const { statementTransactions, ending, totals } = await this.mapJournalEntriesToStatementTransactions(
      journalEntries,
      openingBalance,
      viewMode,
      entityType,
      language
    );

    const productSummary = viewMode === 'detailed'
      ? await this.calculateProductSummaryFromJournalEntries(journalEntries, statementEntityType, language)
      : undefined;

    // Per-currency net change.
    const netChange: BalanceSnapshotMap = {};
    const currencyKeys = new Set<CurrencyCode>([
      ...(Object.keys(openingBalance) as CurrencyCode[]),
      ...(Object.keys(ending) as CurrencyCode[]),
    ]);
    for (const c of currencyKeys) {
      const delta = (ending[c] ?? 0) - (openingBalance[c] ?? 0);
      if (Math.abs(delta) > 0.005) netChange[c] = delta;
    }

    // Net sign aggregated across currencies. Used to show "owes us" / "we owe" labels.
    const netTotal = Object.values(ending).reduce<number>((sum, v) => sum + (v ?? 0), 0);
    const netSign: 1 | -1 | 0 = Math.abs(netTotal) < 0.005 ? 0 : (netTotal > 0 ? 1 : -1);

    const financialSummary = {
      openingBalance,
      currentBalance: ending,
      totalSales: totals.sales,
      totalPayments: totals.payments,
      totalReceivings: totals.receivings,
      netChange,
      netSign,
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

    // Financial Summary — per-currency, no FX conversion.
    text += `FINANCIAL SUMMARY\n`;
    text += `================\n`;
    const opening = statement.financialSummary.openingBalance;
    const current = statement.financialSummary.currentBalance;
    const allCurrencies = Array.from(new Set([
      ...Object.keys(opening),
      ...Object.keys(current),
    ])) as CurrencyCode[];
    if (allCurrencies.length === 0) {
      text += `(no balance activity)\n`;
    } else {
      for (const c of allCurrencies) {
        text += `Opening (${c}): ${(opening[c] ?? 0).toLocaleString()}\n`;
        text += `Current (${c}): ${(current[c] ?? 0).toLocaleString()}\n`;
      }
    }
    text += `\n`;

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