import { ChartOfAccount } from '../types';

export class ChartOfAccountsService {
  private static instance: ChartOfAccountsService;
  private accounts: Map<string, ChartOfAccount> = new Map();

  private constructor() {
    this.initializeStandardAccounts();
  }

  public static getInstance(): ChartOfAccountsService {
    if (!ChartOfAccountsService.instance) {
      ChartOfAccountsService.instance = new ChartOfAccountsService();
    }
    return ChartOfAccountsService.instance;
  }

  private initializeStandardAccounts() {
    const standardAccounts: Omit<ChartOfAccount, 'id' | 'createdAt'>[] = [
      // ASSETS
      { code: '1000', name: 'Cash', type: 'asset', subType: 'current', isActive: true, balance: 0, description: 'Cash on hand and in bank' },
      { code: '1100', name: 'Accounts Receivable', type: 'asset', subType: 'current', isActive: true, balance: 0, description: 'Money owed by customers' },
      { code: '1200', name: 'Inventory', type: 'asset', subType: 'current', isActive: true, balance: 0, description: 'Products for sale' },
      { code: '1300', name: 'Prepaid Expenses', type: 'asset', subType: 'current', isActive: true, balance: 0, description: 'Expenses paid in advance' },
      
      // Fixed Assets
      { code: '1500', name: 'Equipment', type: 'asset', subType: 'fixed', isActive: true, balance: 0, description: 'Equipment and fixtures' },
      { code: '1510', name: 'Accumulated Depreciation - Equipment', type: 'asset', subType: 'contra', isActive: true, balance: 0, description: 'Accumulated depreciation on equipment' },

      // LIABILITIES
      { code: '2000', name: 'Accounts Payable', type: 'liability', subType: 'current', isActive: true, balance: 0, description: 'Money owed to suppliers' },
      { code: '2100', name: 'Accrued Commissions Payable', type: 'liability', subType: 'current', isActive: true, balance: 0, description: 'Commissions owed to suppliers' },
      { code: '2200', name: 'Accrued Expenses', type: 'liability', subType: 'current', isActive: true, balance: 0, description: 'Expenses incurred but not yet paid' },
      { code: '2300', name: 'Sales Tax Payable', type: 'liability', subType: 'current', isActive: true, balance: 0, description: 'Sales taxes collected' },

      // EQUITY
      { code: '3000', name: 'Owner\'s Equity', type: 'equity', subType: 'capital', isActive: true, balance: 0, description: 'Owner\'s investment in business' },
      { code: '3100', name: 'Retained Earnings', type: 'equity', subType: 'retained', isActive: true, balance: 0, description: 'Accumulated profits/losses' },
      { code: '3200', name: 'Owner Withdrawals', type: 'equity', subType: 'withdrawals', isActive: true, balance: 0, description: 'Owner withdrawals from business' },

      // REVENUE
      { code: '4000', name: 'Sales Revenue', type: 'revenue', subType: 'sales', isActive: true, balance: 0, description: 'Revenue from product sales' },
      { code: '4100', name: 'Service Revenue', type: 'revenue', subType: 'service', isActive: true, balance: 0, description: 'Revenue from services' },
      { code: '4900', name: 'Other Revenue', type: 'revenue', subType: 'other', isActive: true, balance: 0, description: 'Miscellaneous revenue' },

      // COST OF GOODS SOLD
      { code: '5000', name: 'Cost of Goods Sold', type: 'expense', subType: 'cogs', isActive: true, balance: 0, description: 'Direct cost of products sold' },
      { code: '5100', name: 'Commission Expense', type: 'expense', subType: 'cogs', isActive: true, balance: 0, description: 'Commissions paid to suppliers' },
      { code: '5200', name: 'Inventory Adjustments', type: 'expense', subType: 'cogs', isActive: true, balance: 0, description: 'Inventory losses and adjustments' },

      // OPERATING EXPENSES
      { code: '6000', name: 'Administrative Expenses', type: 'expense', subType: 'operating', isActive: true, balance: 0, description: 'General administrative costs' },
      { code: '6100', name: 'Rent Expense', type: 'expense', subType: 'operating', isActive: true, balance: 0, description: 'Rent and facility costs' },
      { code: '6200', name: 'Utilities Expense', type: 'expense', subType: 'operating', isActive: true, balance: 0, description: 'Electricity, water, gas, internet' },
      { code: '6300', name: 'Transportation Expense', type: 'expense', subType: 'operating', isActive: true, balance: 0, description: 'Transportation and delivery costs' },
      { code: '6400', name: 'Insurance Expense', type: 'expense', subType: 'operating', isActive: true, balance: 0, description: 'Insurance premiums' },
      { code: '6500', name: 'Depreciation Expense', type: 'expense', subType: 'operating', isActive: true, balance: 0, description: 'Depreciation of fixed assets' },
      { code: '6600', name: 'Office Supplies', type: 'expense', subType: 'operating', isActive: true, balance: 0, description: 'Office supplies and materials' },
      { code: '6700', name: 'Marketing Expense', type: 'expense', subType: 'operating', isActive: true, balance: 0, description: 'Marketing and advertising costs' },
      { code: '6800', name: 'Professional Fees', type: 'expense', subType: 'operating', isActive: true, balance: 0, description: 'Legal and accounting fees' },
      { code: '6900', name: 'Other Operating Expenses', type: 'expense', subType: 'operating', isActive: true, balance: 0, description: 'Miscellaneous operating expenses' },
    ];

    // Load existing accounts from storage or create new ones
    const existingAccounts = this.loadAccountsFromStorage();
    
    if (existingAccounts.length === 0) {
      // Initialize with standard accounts
      standardAccounts.forEach(account => {
        const newAccount: ChartOfAccount = {
          ...account,
          id: this.generateAccountId(),
          createdAt: new Date().toISOString(),
        };
        this.accounts.set(account.code, newAccount);
      });
      this.saveAccountsToStorage();
    } else {
      // Load existing accounts
      existingAccounts.forEach(account => {
        this.accounts.set(account.code, account);
      });
    }
  }

  private generateAccountId(): string {
    return `acc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private loadAccountsFromStorage(): ChartOfAccount[] {
    try {
      const stored = localStorage.getItem('erp_chart_of_accounts');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading chart of accounts:', error);
      return [];
    }
  }

  private saveAccountsToStorage() {
    try {
      const accountsArray = Array.from(this.accounts.values());
      localStorage.setItem('erp_chart_of_accounts', JSON.stringify(accountsArray));
    } catch (error) {
      console.error('Error saving chart of accounts:', error);
    }
  }

  // Public methods
  public getAccount(code: string): ChartOfAccount | null {
    return this.accounts.get(code) || null;
  }

  public getAccountByName(name: string): ChartOfAccount | null {
    for (const account of this.accounts.values()) {
      if (account.name.toLowerCase() === name.toLowerCase()) {
        return account;
      }
    }
    return null;
  }

  public getAllAccounts(): ChartOfAccount[] {
    return Array.from(this.accounts.values()).sort((a, b) => a.code.localeCompare(b.code));
  }

  public getAccountsByType(type: ChartOfAccount['type']): ChartOfAccount[] {
    return Array.from(this.accounts.values())
      .filter(account => account.type === type)
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  public getAccountsBySubType(subType: string): ChartOfAccount[] {
    return Array.from(this.accounts.values())
      .filter(account => account.subType === subType)
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  public updateAccountBalance(code: string, amount: number, isDebit: boolean): boolean {
    const account = this.accounts.get(code);
    if (!account) return false;

    // Determine how the balance should be affected
    let balanceChange = amount;
    
    // For assets, expenses: debit increases, credit decreases
    if (account.type === 'asset' || account.type === 'expense') {
      if (!isDebit) balanceChange = -amount;
    }
    // For liabilities, equity, revenue: credit increases, debit decreases
    else if (account.type === 'liability' || account.type === 'equity' || account.type === 'revenue') {
      if (isDebit) balanceChange = -amount;
    }

    account.balance += balanceChange;
    this.accounts.set(code, account);
    this.saveAccountsToStorage();
    return true;
  }

  public addAccount(account: Omit<ChartOfAccount, 'id' | 'createdAt'>): ChartOfAccount {
    const newAccount: ChartOfAccount = {
      ...account,
      id: this.generateAccountId(),
      createdAt: new Date().toISOString(),
    };
    
    this.accounts.set(account.code, newAccount);
    this.saveAccountsToStorage();
    return newAccount;
  }

  public updateAccount(code: string, updates: Partial<ChartOfAccount>): boolean {
    const account = this.accounts.get(code);
    if (!account) return false;

    const updatedAccount = { ...account, ...updates };
    this.accounts.set(code, updatedAccount);
    this.saveAccountsToStorage();
    return true;
  }

  public deleteAccount(code: string): boolean {
    const deleted = this.accounts.delete(code);
    if (deleted) {
      this.saveAccountsToStorage();
    }
    return deleted;
  }

  // Get account balances for financial statements
  public getTrialBalance(): { account: ChartOfAccount; debitBalance: number; creditBalance: number }[] {
    return Array.from(this.accounts.values())
      .filter(account => account.isActive)
      .map(account => {
        const isNormalDebitAccount = account.type === 'asset' || account.type === 'expense';
        return {
          account,
          debitBalance: isNormalDebitAccount && account.balance >= 0 ? account.balance : 0,
          creditBalance: !isNormalDebitAccount && account.balance >= 0 ? account.balance : Math.abs(account.balance)
        };
      })
      .sort((a, b) => a.account.code.localeCompare(b.account.code));
  }

  // Reset balances (typically done at year-end)
  public closeTemporaryAccounts(): void {
    const temporaryAccounts = Array.from(this.accounts.values())
      .filter(account => account.type === 'revenue' || account.type === 'expense');

    let totalRevenue = 0;
    let totalExpenses = 0;

    temporaryAccounts.forEach(account => {
      if (account.type === 'revenue') {
        totalRevenue += account.balance;
      } else if (account.type === 'expense') {
        totalExpenses += account.balance;
      }
      account.balance = 0;
    });

    // Transfer net income to retained earnings
    const retainedEarnings = this.accounts.get('3100');
    if (retainedEarnings) {
      const netIncome = totalRevenue - totalExpenses;
      retainedEarnings.balance += netIncome;
    }

    this.saveAccountsToStorage();
  }
}

export const chartOfAccountsService = ChartOfAccountsService.getInstance(); 