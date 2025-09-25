import { 
  Customer, 
  Supplier, 
  Transaction, 
  AccountsReceivable, 
  AccountsPayable, 
  BillLineItem, 
  InventoryItem,
  CashDrawer 
} from '../types';
// Remove dataAccessService import - use OfflineDataContext instead

export interface SaleData {
  id: string;
  customerId?: string;
  paymentMethod: 'cash' | 'card' | 'credit';
  total: number;
  amountPaid: number;
  amountDue: number;
  createdBy: string;
  createdAt: string;
}

export interface FinancialTransaction {
  id: string;
  type: 'customer_payment' | 'customer_credit_sale' | 'supplier_payment' | 'supplier_commission' | 'cash_sale' | 'expense';
  entityId: string; // customer or supplier ID
  entityName: string;
  amount: number;
  currency: 'USD' | 'LBP';
  description: string;
  reference?: string;
  relatedItems?: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    totalValue: number;
  }>;
  commissionRate?: number;
  commissionAmount?: number;
  netAmount?: number;
  timestamp: string;
  createdBy: string;
}

export interface AccountBalance {
  entityId: string;
  entityName: string;
  entityType: 'customer' | 'supplier';
  currentBalance: number;
  currency: 'USD' | 'LBP';
  lastTransactionDate: string;
  totalTransactions: number;
  pendingReceivables?: number;
  pendingPayables?: number;
}

export interface TransactionSummary {
  transactionId: string;
  transactionType: string;
  entityInvolved: string;
  amount: number;
  currency: string;
  balanceBefore: number;
  balanceAfter: number;
  cashDrawerImpact: number;
  itemsAffected: string[];
  timestamp: string;
  status: 'completed' | 'pending' | 'failed';
  notes: string;
}

export interface CashDrawerUpdate {
  openingAmount: number;
  currentAmount: number;
  totalCashSales: number;
  totalCashPayments: number;
  totalExpenses: number;
  lastTransaction: string;
}

export class ERPFinancialService {
  private customers: Customer[] = [];
  private suppliers: Supplier[] = [];
  private transactions: Transaction[] = [];
  private accountsReceivable: AccountsReceivable[] = [];
  private accountsPayable: AccountsPayable[] = [];
  private inventory: InventoryItem[] = [];
  private cashDrawer: CashDrawer | null = null;
  private financialTransactions: FinancialTransaction[] = [];
  private accountBalances: Map<string, AccountBalance> = new Map();
  private storeId: string | null = null;

  constructor() {
    // No longer load data in constructor - load on demand
  }

  private async loadData(storeId: string) {
    if (this.storeId === storeId && this.customers.length > 0) {
      return; // Already loaded
    }

    // Validate storeId to prevent Dexie errors
    if (!storeId || storeId.trim() === '') {
      throw new Error('Invalid storeId provided. StoreId cannot be empty or null.');
    }

    this.storeId = storeId;
    
    // Load data directly from IndexedDB (OfflineDataContext handles the architecture)
    const { db } = await import('../lib/db');
    
    const [customers, suppliers, transactions] = await Promise.all([
      db.customers.where('store_id').equals(storeId).toArray(),
      db.suppliers.where('store_id').equals(storeId).toArray(),
      db.transactions.where('store_id').equals(storeId).toArray()
    ]);
    
    // Transform to expected format
    this.customers = customers.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email || '',
      address: c.address || '',
      lbBalance: c.lb_balance || 0,
      usdBalance: c.usd_balance || 0,
      isActive: c.is_active,
      createdAt: c.created_at,
      balance: c.usd_balance || 0,
    }));
    
    this.suppliers = suppliers.map(s => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      email: s.email || '',
      address: s.address,
      lbBalance: s.lb_balance || 0,
      usdBalance: s.usd_balance || 0,
      createdAt: s.created_at,
      balance: s.usd_balance || 0,
    }));
    
    this.transactions = transactions;
    this.accountsReceivable = []; // Will be calculated from bill_line_items
    this.accountsPayable = []; // Will be calculated from bill_line_items
    this.inventory = []; // Will be loaded separately
    this.cashDrawer = null; // Managed separately
    
    this.initializeAccountBalances();
  }

  private initializeAccountBalances() {
    // Initialize customer balances
    this.customers.forEach(customer => {
      this.accountBalances.set(customer.id, {
        entityId: customer.id,
        entityName: customer.name,
        entityType: 'customer',
        currentBalance: customer.balance || 0, // Updated to use balance field with null safety
        currency: 'USD',
        lastTransactionDate: customer.createdAt,
        totalTransactions: 0,
        pendingReceivables: 0
      });
    });

    // Initialize supplier balances
    this.suppliers.forEach(supplier => {
      this.accountBalances.set(supplier.id, {
        entityId: supplier.id,
        entityName: supplier.name,
        entityType: 'supplier',
        currentBalance: 0,
        currency: 'USD',
        lastTransactionDate: supplier.createdAt,
        totalTransactions: 0,
        pendingPayables: 0
      });
    });
  }

  // Public method to reload data from IndexedDB
  async reloadData(storeId: string) {
    await this.loadData(storeId);
  }

  private convertCurrency(amount: number, fromCurrency: 'USD' | 'LBP', toCurrency: 'USD' | 'LBP'): number {
    if (fromCurrency === toCurrency) return amount;
    
    // Fixed exchange rate: 1 USD = 89,500 LBP
    const exchangeRate = 89500;
    
    if (fromCurrency === 'USD' && toCurrency === 'LBP') {
      return amount * exchangeRate;
    } else if (fromCurrency === 'LBP' && toCurrency === 'USD') {
      return amount / exchangeRate;
    }
    
    return amount;
  }

  private updateAccountBalance(entityId: string, amount: number, isDebit: boolean) {
    const balance = this.accountBalances.get(entityId);
    if (balance) {
      const change = isDebit ? amount : -amount;
      balance.currentBalance += change;
      balance.lastTransactionDate = new Date().toISOString();
      balance.totalTransactions += 1;
      this.accountBalances.set(entityId, balance);
    }
  }

  private updateCashDrawer(amount: number, isIncome: boolean) {
    if (this.cashDrawer) {
      if (isIncome) {
        this.cashDrawer.currentAmount += amount;
        this.cashDrawer.totalCashSales += amount;
      } else {
        this.cashDrawer.currentAmount -= amount;
        this.cashDrawer.totalExpenses += amount;
      }
    }
  }

  private logFinancialTransaction(transaction: Omit<FinancialTransaction, 'id' | 'timestamp'>): FinancialTransaction {
    const financialTransaction: FinancialTransaction = {
      ...transaction,
      id: Date.now().toString(),
      timestamp: new Date().toISOString()
    };
    
    this.financialTransactions.push(financialTransaction);
    return financialTransaction;
  }

  // Process customer credit sale
  async processCustomerCreditSale(sale: SaleData, items: BillLineItem[], storeId: string): Promise<TransactionSummary> {
    await this.loadData(storeId);
    
    const customer = this.customers.find(c => c.id === sale.customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const balanceBefore = customer.balance || 0; // Updated to use balance field with null safety
    // RULE 3 FIX: For credit sales, INCREASE customer balance (debt they owe us)
    const balanceAfter = balanceBefore + sale.amountDue;

    // Update customer balance
    this.updateAccountBalance(customer.id, sale.amountDue, true);
    
    // Update customer balance in IndexedDB
    const { db } = await import('../lib/db');
    await db.customers.update(customer.id, { 
      usd_balance: balanceAfter,
      _synced: false,
      updated_at: new Date().toISOString()
    });
    
    // Update local cache
    const customerIndex = this.customers.findIndex(c => c.id === customer.id);
    if (customerIndex !== -1) {
      this.customers[customerIndex].balance = balanceAfter;
    }

    // Create accounts receivable entry
    const receivable: AccountsReceivable = {
      id: Date.now().toString(),
      customerId: customer.id,
      customerName: customer.name,
      invoiceNumber: `INV-${Date.now()}`,
      amount: sale.total,
      amountPaid: sale.amountPaid,
      amountDue: sale.amountDue,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days
      status: sale.amountDue > 0 ? 'pending' : 'paid',
      createdAt: new Date().toISOString()
    };
    this.accountsReceivable.push(receivable);

    // Log financial transaction
    const financialTransaction = this.logFinancialTransaction({
      type: 'customer_credit_sale',
      entityId: customer.id,
      entityName: customer.name,
      amount: sale.amountDue,
      currency: 'USD',
      description: `Credit sale - ${items.map(item => item.productName).join(', ')}`,
      reference: receivable.invoiceNumber,
      relatedItems: items.map(item => ({
        itemId: item.id,
        itemName: item.productName || 'Unknown Product',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalValue: item.totalPrice || (item.unitPrice * item.quantity)
      })),
      createdBy: sale.createdBy
    });

    // Data is now persisted directly to IndexedDB

    return {
      transactionId: financialTransaction.id,
      transactionType: 'Customer Credit Sale',
      entityInvolved: customer.name,
      amount: sale.amountDue,
      currency: 'USD',
      balanceBefore,
      balanceAfter,
      cashDrawerImpact: 0,
      itemsAffected: items.map(item => item.productName || 'Unknown Product'),
      timestamp: financialTransaction.timestamp,
      status: 'completed',
      notes: `Credit sale processed. Invoice: ${receivable.invoiceNumber}`
    };
  }

  // Process customer payment
  async processCustomerPayment(customerId: string, amount: number, currency: 'USD' | 'LBP', description: string, createdBy: string, storeId: string): Promise<TransactionSummary> {
    await this.loadData(storeId);
    
    const customer = this.customers.find(c => c.id === customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const amountInUSD = this.convertCurrency(amount, currency, 'USD');
    const balanceBefore = customer.usd_balance || 0; // Updated to use balance field with null safety
    // RULE 5 FIX: When receiving payment FROM customer, DECREASE their balance (reduce their debt to us)
    const balanceAfter = Math.max(0, balanceBefore - amountInUSD);

    // Update customer balance
    this.updateAccountBalance(customer.id, amountInUSD, false);
    
    // Update customer balance in IndexedDB
    const { db } = await import('../lib/db');
    await db.customers.update(customer.id, { 
      usd_balance: balanceAfter,
      _synced: false,
      updated_at: new Date().toISOString()
    });
    
    // Update local cache
    const customerIndex = this.customers.findIndex(c => c.id === customer.id);
    if (customerIndex !== -1) {
      this.customers[customerIndex].balance = balanceAfter;
    }

    // RULE 2 FIX: For cash payments, INCREASE cash drawer by payment amount
    if (currency === 'USD') {
      this.updateCashDrawer(amountInUSD, true);
    }

    // Update accounts receivable
    const pendingReceivables = this.accountsReceivable.filter(ar => 
      ar.customerId === customerId && ar.status !== 'paid'
    );
    
    let remainingAmount = amountInUSD;
    for (const receivable of pendingReceivables) {
      if (remainingAmount <= 0) break;
      
      const paymentAmount = Math.min(remainingAmount, receivable.amountDue);
      receivable.amountPaid += paymentAmount;
      receivable.amountDue -= paymentAmount;
      remainingAmount -= paymentAmount;
      
      if (receivable.amountDue === 0) {
        receivable.status = 'paid';
        receivable.lastPaymentDate = new Date().toISOString();
      } else {
        receivable.status = 'partial';
      }
    }

    // Log financial transaction
    const financialTransaction = this.logFinancialTransaction({
      type: 'customer_payment',
      entityId: customer.id,
      entityName: customer.name,
      amount: amountInUSD,
      currency: 'USD',
      description,
      reference: `PAY-${Date.now()}`,
      createdBy
    });

    // Data is now persisted directly to IndexedDB

    return {
      transactionId: financialTransaction.id,
      transactionType: 'Customer Payment',
      entityInvolved: customer.name,
      amount: amountInUSD,
      currency: 'USD',
      balanceBefore,
      balanceAfter,
      cashDrawerImpact: currency === 'USD' ? amountInUSD : 0,
      itemsAffected: [],
      timestamp: financialTransaction.timestamp,
      status: 'completed',
      notes: `Payment received. Amount: ${currency} ${amount}`
    };
  }

  // Process supplier commission payment
  processSupplierCommissionPayment(supplierId: string, items: InventoryItem[], commissionRate: number, createdBy: string): TransactionSummary {
    const supplier = this.suppliers.find(s => s.id === supplierId);
    if (!supplier) {
      throw new Error('Supplier not found');
    }

    // Calculate total value of sold items
    const totalValue = items.reduce((sum, item) => {
      const itemValue = (item.price || 0) * (item.weight || item.quantity);
      return sum + itemValue;
    }, 0);

    // RULE 4 FIX: Calculate fees from inventory items
    const totalPorterage = items.reduce((sum, item) => sum + (item.porterage || 0), 0);
    const totalTransferFee = items.reduce((sum, item) => sum + (item.transferFee || 0), 0);
    const totalFees = totalPorterage + totalTransferFee;

    const commissionAmount = totalValue * (commissionRate / 100);
    // RULE 4 FIX: Deduct commission AND fees from total bill amount
    const netAmount = totalValue - commissionAmount - totalFees;

    const balanceBefore = this.accountBalances.get(supplierId)?.currentBalance || 0;
    const balanceAfter = balanceBefore + netAmount;

    // Update supplier balance
    this.updateAccountBalance(supplierId, netAmount, false);

    // Create accounts payable entry
    const payable: AccountsPayable = {
      id: Date.now().toString(),
      supplierId: supplier.id,
      supplierName: supplier.name,
      invoiceNumber: `SUP-${Date.now()}`,
      amount: totalValue,
      amountPaid: 0,
      amountDue: netAmount,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days
      status: 'pending',
      description: `Commission payment for sold items (Commission: ${commissionAmount.toFixed(2)}, Fees: ${totalFees.toFixed(2)})`,
      createdAt: new Date().toISOString()
    };
    this.accountsPayable.push(payable);

    // RULE 4 FIX: Record porterage and transfer fees as separate expenses
    if (totalPorterage > 0) {
      const porterageTransaction: Transaction = {
        id: (Date.now() + 1).toString(),
        type: 'expense',
        category: 'Porterage Fee',
        amount: totalPorterage,
        currency: 'USD',
        description: `Porterage fees for commission bill closure - ${supplier.name}`,
        reference: `PORTERAGE-${payable.invoiceNumber}`,
        createdAt: new Date().toISOString(),
        createdBy
      };
      this.transactions.push(porterageTransaction);
    }

    if (totalTransferFee > 0) {
      const transferTransaction: Transaction = {
        id: (Date.now() + 2).toString(),
        type: 'expense',
        category: 'Transfer Fee',
        amount: totalTransferFee,
        currency: 'USD',
        description: `Transfer fees for commission bill closure - ${supplier.name}`,
        reference: `TRANSFER-${payable.invoiceNumber}`,
        createdAt: new Date().toISOString(),
        createdBy
      };
      this.transactions.push(transferTransaction);
    }
    // Log financial transaction
    const financialTransaction = this.logFinancialTransaction({
      type: 'supplier_commission',
      entityId: supplier.id,
      entityName: supplier.name,
      amount: netAmount,
      currency: 'USD',
      description: `Commission payment for sold items (Net after commission: ${commissionAmount.toFixed(2)} and fees: ${totalFees.toFixed(2)})`,
      reference: payable.invoiceNumber,
      relatedItems: items.map(item => ({
        itemId: item.id,
        itemName: `Product from ${supplier.name}`,
        quantity: item.quantity,
        unitPrice: item.price || 0,
        totalValue: (item.price || 0) * (item.weight || item.quantity)
      })),
      commissionRate,
      commissionAmount,
      netAmount,
      createdBy
    });

    // Data is now persisted directly to IndexedDB

    return {
      transactionId: financialTransaction.id,
      transactionType: 'Supplier Commission Payment',
      entityInvolved: supplier.name,
      amount: netAmount,
      currency: 'USD',
      balanceBefore,
      balanceAfter,
      cashDrawerImpact: 0,
      itemsAffected: items.map(() => `Product from ${supplier.name}`),
      timestamp: financialTransaction.timestamp,
      status: 'completed',
      notes: `Commission: ${commissionRate}% (${commissionAmount.toFixed(2)}), Fees: ${totalFees.toFixed(2)}, Net: ${netAmount.toFixed(2)}`
    };
  }

  // Process supplier payment
  processSupplierPayment(supplierId: string, amount: number, currency: 'USD' | 'LBP', description: string, createdBy: string): TransactionSummary {
    const supplier = this.suppliers.find(s => s.id === supplierId);
    if (!supplier) {
      throw new Error('Supplier not found');
    }

    const amountInUSD = this.convertCurrency(amount, currency, 'USD');
    const balanceBefore = this.accountBalances.get(supplierId)?.currentBalance || 0;
    // RULE 5 FIX: When making payment TO supplier, DECREASE their balance (reduce what we owe them)
    const balanceAfter = Math.max(0, balanceBefore - amountInUSD);

    // Update supplier balance
    this.updateAccountBalance(supplierId, amountInUSD, true);

    // RULE 2 FIX: For cash payments, DECREASE cash drawer by payment amount (money going out)
    if (currency === 'USD') {
      this.updateCashDrawer(amountInUSD, false);
    }

    // Update accounts payable
    const pendingPayables = this.accountsPayable.filter(ap => 
      ap.supplierId === supplierId && ap.status !== 'paid'
    );
    
    let remainingAmount = amountInUSD;
    for (const payable of pendingPayables) {
      if (remainingAmount <= 0) break;
      
      const paymentAmount = Math.min(remainingAmount, payable.amountDue);
      payable.amountPaid += paymentAmount;
      payable.amountDue -= paymentAmount;
      remainingAmount -= paymentAmount;
      
      if (payable.amountDue === 0) {
        payable.status = 'paid';
        payable.lastPaymentDate = new Date().toISOString();
      } else {
        payable.status = 'partial';
      }
    }

    // Log financial transaction
    const financialTransaction = this.logFinancialTransaction({
      type: 'supplier_payment',
      entityId: supplier.id,
      entityName: supplier.name,
      amount: amountInUSD,
      currency: 'USD',
      description,
      reference: `SUP-PAY-${Date.now()}`,
      createdBy
    });

    // Data is now persisted directly to IndexedDB

    return {
      transactionId: financialTransaction.id,
      transactionType: 'Supplier Payment',
      entityInvolved: supplier.name,
      amount: amountInUSD,
      currency: 'USD',
      balanceBefore,
      balanceAfter,
      cashDrawerImpact: currency === 'USD' ? -amountInUSD : 0,
      itemsAffected: [],
      timestamp: financialTransaction.timestamp,
      status: 'completed',
      notes: `Payment sent. Amount: ${currency} ${amount}`
    };
  }

  // Unified entity payment processing
  processEntityPayment(entityType: 'customer' | 'supplier', entityId: string, amount: number, currency: 'USD' | 'LBP', description: string, createdBy: string): TransactionSummary {
    const entity = entityType === 'customer' 
      ? this.customers.find(c => c.id === entityId)
      : this.suppliers.find(s => s.id === entityId);
    
    if (!entity) {
      throw new Error(`${entityType === 'customer' ? 'Customer' : 'Supplier'} not found`);
    }

    const amountInUSD = this.convertCurrency(amount, currency, 'USD');
    const balanceBefore = this.accountBalances.get(entityId)?.currentBalance || 0;
    
    // For customer payments (receiving money), reduce their debt
    // For supplier payments (sending money), reduce our debt to them
    const balanceAfter = Math.max(0, balanceBefore - amountInUSD);

    // Update entity balance
    this.updateAccountBalance(entityId, amountInUSD, true);

    // Update cash drawer if cash payment
    if (currency === 'USD') {
      // For customer payments: money comes in (positive)
      // For supplier payments: money goes out (negative)
      const cashImpact = entityType === 'customer' ? amountInUSD : -amountInUSD;
      this.updateCashDrawer(Math.abs(cashImpact), entityType === 'customer');
    }

    // Update accounts receivable/payable
    if (entityType === 'customer') {
      const pendingReceivables = this.accountsReceivable.filter(ar => 
        ar.customerId === entityId && ar.status !== 'paid'
      );
      
      let remainingAmount = amountInUSD;
      for (const receivable of pendingReceivables) {
        if (remainingAmount <= 0) break;
        
        const paymentAmount = Math.min(remainingAmount, receivable.amountDue);
        receivable.amountPaid += paymentAmount;
        receivable.amountDue -= paymentAmount;
        remainingAmount -= paymentAmount;
        
        if (receivable.amountDue === 0) {
          receivable.status = 'paid';
          receivable.lastPaymentDate = new Date().toISOString();
        } else {
          receivable.status = 'partial';
        }
      }
    } else {
      const pendingPayables = this.accountsPayable.filter(ap => 
        ap.supplierId === entityId && ap.status !== 'paid'
      );
      
      let remainingAmount = amountInUSD;
      for (const payable of pendingPayables) {
        if (remainingAmount <= 0) break;
        
        const paymentAmount = Math.min(remainingAmount, payable.amountDue);
        payable.amountPaid += paymentAmount;
        payable.amountDue -= paymentAmount;
        remainingAmount -= paymentAmount;
        
        if (payable.amountDue === 0) {
          payable.status = 'paid';
          payable.lastPaymentDate = new Date().toISOString();
        } else {
          payable.status = 'partial';
        }
      }
    }

    // Log financial transaction
    const transactionType = entityType === 'customer' ? 'customer_payment' : 'supplier_payment';
    const financialTransaction = this.logFinancialTransaction({
      type: transactionType,
      entityId: entity.id,
      entityName: entity.name,
      amount: amountInUSD,
      currency: 'USD',
      description,
      reference: `${entityType.toUpperCase()}-PAY-${Date.now()}`,
      createdBy
    });

    // Data is now persisted directly to IndexedDB

    return {
      transactionId: financialTransaction.id,
      transactionType: entityType === 'customer' ? 'Customer Payment' : 'Supplier Payment',
      entityInvolved: entity.name,
      amount: amountInUSD,
      currency: 'USD',
      balanceBefore,
      balanceAfter,
      cashDrawerImpact: currency === 'USD' ? (entityType === 'customer' ? amountInUSD : -amountInUSD) : 0,
      itemsAffected: [],
      timestamp: financialTransaction.timestamp,
      status: 'completed',
      notes: `${entityType === 'customer' ? 'Payment received' : 'Payment sent'}. Amount: ${currency} ${amount}`
    };
  }

  // Process cash sale
  processCashSale(sale: SaleData, items: BillLineItem[]): TransactionSummary {
    // RULE 2 FIX: For cash sales, INCREASE cash drawer by sale amount
    this.updateCashDrawer(sale.amountPaid, true);

    // Log financial transaction
    const financialTransaction = this.logFinancialTransaction({
      type: 'cash_sale',
      entityId: 'cash',
      entityName: 'Cash Sale',
      amount: sale.amountPaid,
      currency: 'USD',
      description: `Cash sale - ${items.map(item => item.productName).join(', ')}`,
      reference: `CASH-${Date.now()}`,
      relatedItems: items.map(item => ({
        itemId: item.id,
        itemName: item.productName || 'Unknown Product',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalValue: item.totalPrice || (item.unitPrice * item.quantity)
      })),
      createdBy: sale.createdBy
    });

    // Data is now persisted directly to IndexedDB

    return {
      transactionId: financialTransaction.id,
      transactionType: 'Cash Sale',
      entityInvolved: 'Cash',
      amount: sale.amountPaid,
      currency: 'USD',
      balanceBefore: this.cashDrawer?.currentAmount || 0,
      balanceAfter: (this.cashDrawer?.currentAmount || 0) + sale.amountPaid,
      cashDrawerImpact: sale.amountPaid,
      itemsAffected: items.map(item => item.productName || 'Unknown Product'),
      timestamp: financialTransaction.timestamp,
      status: 'completed',
      notes: `Cash sale completed. Items: ${items.length}`
    };
  }

  // Process expense
  processExpense(amount: number, currency: 'USD' | 'LBP', category: string, description: string, createdBy: string): TransactionSummary {
    const amountInUSD = this.convertCurrency(amount, currency, 'USD');

    // Update cash drawer
    this.updateCashDrawer(amountInUSD, false);

    // Log financial transaction
    const financialTransaction = this.logFinancialTransaction({
      type: 'expense',
      entityId: 'expense',
      entityName: category,
      amount: amountInUSD,
      currency: 'USD',
      description,
      reference: `EXP-${Date.now()}`,
      createdBy
    });

    // Data is now persisted directly to IndexedDB

    return {
      transactionId: financialTransaction.id,
      transactionType: 'Expense',
      entityInvolved: category,
      amount: amountInUSD,
      currency: 'USD',
      balanceBefore: this.cashDrawer?.currentAmount || 0,
      balanceAfter: (this.cashDrawer?.currentAmount || 0) - amountInUSD,
      cashDrawerImpact: -amountInUSD,
      itemsAffected: [],
      timestamp: financialTransaction.timestamp,
      status: 'completed',
      notes: `Expense: ${category} - ${description}`
    };
  }

  // Get account balance
  getAccountBalance(entityId: string): AccountBalance | null {
    return this.accountBalances.get(entityId) || null;
  }

  // Get all account balances
  getAllAccountBalances(): AccountBalance[] {
    return Array.from(this.accountBalances.values());
  }

  // Get cash drawer status
  getCashDrawerStatus(): CashDrawerUpdate | null {
    if (!this.cashDrawer) return null;

    return {
      openingAmount: this.cashDrawer.openingAmount,
      currentAmount: this.cashDrawer.currentAmount,
      totalCashSales: this.cashDrawer.totalCashSales,
      totalCashPayments: this.cashDrawer.totalCashPayments,
      totalExpenses: this.cashDrawer.totalExpenses,
      lastTransaction: this.financialTransactions[this.financialTransactions.length - 1]?.timestamp || ''
    };
  }

  // Get transaction history for an entity
  getTransactionHistory(entityId: string): FinancialTransaction[] {
    return this.financialTransactions.filter(t => t.entityId === entityId);
  }

  // Get pending receivables for a customer
  getPendingReceivables(customerId: string): AccountsReceivable[] {
    return this.accountsReceivable.filter(ar => 
      ar.customerId === customerId && ar.status !== 'paid'
    );
  }

  // Get pending payables for a supplier
  getPendingPayables(supplierId: string): AccountsPayable[] {
    return this.accountsPayable.filter(ap => 
      ap.supplierId === supplierId && ap.status !== 'paid'
    );
  }

  // Check if supplier has non-priced items
  hasNonPricedItems(supplierId: string): boolean {
    // This function now needs to be called with sales data from the main application
    // The implementation should be moved to the Accounting component
    return false; // Placeholder - actual implementation should use sales data
  }

  // Generate comprehensive transaction report
  generateTransactionReport(startDate?: string, endDate?: string): {
    summary: {
      totalTransactions: number;
      totalIncome: number;
      totalExpenses: number;
      netCashFlow: number;
      customerPayments: number;
      supplierPayments: number;
      cashSales: number;
    };
    transactions: FinancialTransaction[];
    accountBalances: AccountBalance[];
    cashDrawer: CashDrawerUpdate | null;
  } {
    let filteredTransactions = this.financialTransactions;

    if (startDate && endDate) {
      filteredTransactions = this.financialTransactions.filter(t => 
        t.timestamp >= startDate && t.timestamp <= endDate
      );
    }

    const summary = {
      totalTransactions: filteredTransactions.length,
      totalIncome: filteredTransactions
        .filter(t => ['customer_payment', 'cash_sale'].includes(t.type))
        .reduce((sum, t) => sum + t.amount, 0),
      totalExpenses: filteredTransactions
        .filter(t => ['supplier_payment', 'expense'].includes(t.type))
        .reduce((sum, t) => sum + t.amount, 0),
      netCashFlow: 0,
      customerPayments: filteredTransactions
        .filter(t => t.type === 'customer_payment')
        .reduce((sum, t) => sum + t.amount, 0),
      supplierPayments: filteredTransactions
        .filter(t => t.type === 'supplier_payment')
        .reduce((sum, t) => sum + t.amount, 0),
      cashSales: filteredTransactions
        .filter(t => t.type === 'cash_sale')
        .reduce((sum, t) => sum + t.amount, 0)
    };

    summary.netCashFlow = summary.totalIncome - summary.totalExpenses;

    return {
      summary,
      transactions: filteredTransactions,
      accountBalances: this.getAllAccountBalances(),
      cashDrawer: this.getCashDrawerStatus()
    };
  }
}

// Export singleton instance
export const erpFinancialService = new ERPFinancialService(); 