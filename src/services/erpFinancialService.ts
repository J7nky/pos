import { 
  Customer, 
  Supplier, 
  Transaction, 
  AccountsReceivable, 
  AccountsPayable, 
  Sale, 
  SaleItem, 
  InventoryItem,
  CashDrawer 
} from '../types';

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
  private sales: Sale[] = [];
  private inventory: InventoryItem[] = [];
  private cashDrawer: CashDrawer | null = null;
  private financialTransactions: FinancialTransaction[] = [];
  private accountBalances: Map<string, AccountBalance> = new Map();

  constructor() {
    this.loadData();
  }

  private loadData() {
    // Load data from localStorage or context
    this.customers = JSON.parse(localStorage.getItem('erp_customers') || '[]');
    this.suppliers = JSON.parse(localStorage.getItem('erp_suppliers') || '[]');
    this.transactions = JSON.parse(localStorage.getItem('erp_transactions') || '[]');
    this.accountsReceivable = JSON.parse(localStorage.getItem('erp_accounts_receivable') || '[]');
    this.accountsPayable = JSON.parse(localStorage.getItem('erp_accounts_payable') || '[]');
    this.sales = JSON.parse(localStorage.getItem('erp_sales') || '[]');
    this.inventory = JSON.parse(localStorage.getItem('erp_inventory') || '[]');
    this.cashDrawer = JSON.parse(localStorage.getItem('erp_cash_drawer') || 'null');
    this.financialTransactions = JSON.parse(localStorage.getItem('erp_financial_transactions') || '[]');
    
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

  private saveData() {
    localStorage.setItem('erp_customers', JSON.stringify(this.customers));
    localStorage.setItem('erp_suppliers', JSON.stringify(this.suppliers));
    localStorage.setItem('erp_transactions', JSON.stringify(this.transactions));
    localStorage.setItem('erp_accounts_receivable', JSON.stringify(this.accountsReceivable));
    localStorage.setItem('erp_accounts_payable', JSON.stringify(this.accountsPayable));
    localStorage.setItem('erp_sales', JSON.stringify(this.sales));
    localStorage.setItem('erp_inventory', JSON.stringify(this.inventory));
    localStorage.setItem('erp_cash_drawer', JSON.stringify(this.cashDrawer));
    localStorage.setItem('erp_financial_transactions', JSON.stringify(this.financialTransactions));
  }

  // Public method to reload data from localStorage
  reloadData() {
    this.loadData();
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
  processCustomerCreditSale(sale: Sale, items: SaleItem[]): TransactionSummary {
    const customer = this.customers.find(c => c.id === sale.customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const balanceBefore = customer.balance || 0; // Updated to use balance field with null safety
    const balanceAfter = balanceBefore + sale.amountDue;

    // Update customer balance
    this.updateAccountBalance(customer.id, sale.amountDue, true);
    
    // Update customer balance in customers array
    const customerIndex = this.customers.findIndex(c => c.id === customer.id);
    if (customerIndex !== -1) {
      this.customers[customerIndex].balance = balanceAfter; // Updated to use balance field
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
        itemName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalValue: item.totalPrice
      })),
      createdBy: sale.createdBy
    });

    this.saveData();

    return {
      transactionId: financialTransaction.id,
      transactionType: 'Customer Credit Sale',
      entityInvolved: customer.name,
      amount: sale.amountDue,
      currency: 'USD',
      balanceBefore,
      balanceAfter,
      cashDrawerImpact: 0,
      itemsAffected: items.map(item => item.productName),
      timestamp: financialTransaction.timestamp,
      status: 'completed',
      notes: `Credit sale processed. Invoice: ${receivable.invoiceNumber}`
    };
  }

  // Process customer payment
  processCustomerPayment(customerId: string, amount: number, currency: 'USD' | 'LBP', description: string, createdBy: string): TransactionSummary {
    const customer = this.customers.find(c => c.id === customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const amountInUSD = this.convertCurrency(amount, currency, 'USD');
    const balanceBefore = customer.balance || 0; // Updated to use balance field with null safety
    const balanceAfter = Math.max(0, balanceBefore - amountInUSD);

    // Update customer balance
    this.updateAccountBalance(customer.id, amountInUSD, false);
    
    // Update customer balance
    const customerIndex = this.customers.findIndex(c => c.id === customer.id);
    if (customerIndex !== -1) {
      this.customers[customerIndex].balance = balanceAfter; // Updated to use balance field
    }

    // Update cash drawer if cash payment
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

    this.saveData();

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

    const commissionAmount = totalValue * (commissionRate / 100);
    const netAmount = totalValue - commissionAmount;

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
      description: `Commission payment for sold items`,
      createdAt: new Date().toISOString()
    };
    this.accountsPayable.push(payable);

    // Log financial transaction
    const financialTransaction = this.logFinancialTransaction({
      type: 'supplier_commission',
      entityId: supplier.id,
      entityName: supplier.name,
      amount: netAmount,
      currency: 'USD',
      description: `Commission payment for sold items`,
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

    this.saveData();

    return {
      transactionId: financialTransaction.id,
      transactionType: 'Supplier Commission Payment',
      entityInvolved: supplier.name,
      amount: netAmount,
      currency: 'USD',
      balanceBefore,
      balanceAfter,
      cashDrawerImpact: 0,
      itemsAffected: items.map(item => `Product from ${supplier.name}`),
      timestamp: financialTransaction.timestamp,
      status: 'completed',
      notes: `Commission: ${commissionRate}% (${commissionAmount.toFixed(2)}), Net: ${netAmount.toFixed(2)}`
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
    const balanceAfter = Math.max(0, balanceBefore - amountInUSD);

    // Update supplier balance
    this.updateAccountBalance(supplierId, amountInUSD, true);

    // Update cash drawer if cash payment
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

    this.saveData();

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

  // Process cash sale
  processCashSale(sale: Sale, items: SaleItem[]): TransactionSummary {
    // Update cash drawer
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
        itemName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalValue: item.totalPrice
      })),
      createdBy: sale.createdBy
    });

    this.saveData();

    return {
      transactionId: financialTransaction.id,
      transactionType: 'Cash Sale',
      entityInvolved: 'Cash',
      amount: sale.amountPaid,
      currency: 'USD',
      balanceBefore: this.cashDrawer?.currentAmount || 0,
      balanceAfter: (this.cashDrawer?.currentAmount || 0) + sale.amountPaid,
      cashDrawerImpact: sale.amountPaid,
      itemsAffected: items.map(item => item.productName),
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

    this.saveData();

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
    const nonPricedItems = JSON.parse(localStorage.getItem('erp_non_priced_items') || '[]');
    return nonPricedItems.some((item: any) => item.supplierId === supplierId);
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