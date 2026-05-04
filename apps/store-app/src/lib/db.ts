import Dexie, { Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import { generateBillReference } from '@pos-platform/shared';
import {
  V54_STORES,
  V55_STORES,
  V56_STORES,
  V57_STORES,
  V58_STORES,
  V59_STORES,
  V60_STORES,
  upgradeV54,
  upgradeV55,
  upgradeV56,
  upgradeV57,
  upgradeV58,
  upgradeV59,
  upgradeV60,
} from './dbSchema';
import { PAYMENT_CATEGORIES } from '../constants/paymentCategories';
import { 
  Product, 
  Supplier, 
  Customer, 
  InventoryItem, 
  Transaction, 
  Bill, 
  BillLineItem,
  CashDrawerAccount,
  CashDrawerSession,
  MissedProduct,
  inventory_bills,
  Store,
  Branch,
  BillAuditLog,
  SyncMetadata,
  PendingSync,
  Employee,
  NotificationRecord,
  NotificationPreferences,
  Reminder,
  EmployeeAttendance,
  RolePermission,
  UserPermission,
  UserModuleAccess // @deprecated - kept for migration
} from '../types';
import {
  JournalEntry,
  BalanceSnapshot,
  Entity,
  ChartOfAccounts
} from '../types/accounting';
import { calculateBothCurrencies } from '../utils/balanceCalculation';
import { changeTracker } from '../services/changeTracker';


// Base interface for all entities with sync support
interface BaseEntity {
  id: string;
  store_id: string;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

// Store interface moved to /types/index.ts
// Supplier interface moved to /types/index.ts

// Customer interface moved to /types/index.ts

// InventoryItem interface moved to /types/index.ts



// LocalSaleItem interface moved to /types/index.ts

// Bill management interface for comprehensive bill operations
// Bill interface moved to /types/index.ts

// Bill line items for detailed bill management
// BillLineItem interface moved to /types/index.ts

// Bill audit trail for tracking all changes
// BillAuditLog interface moved to /types/index.ts
// Transaction interface moved to /types/index.ts

// All remaining interfaces moved to centralized type files:
// - /types/database.ts (Supabase-generated types)  
// - /types/index.ts (business logic types)



class POSDatabase extends Dexie {
  // Store configuration
  stores!: Table<Store, string>;
  branches!: Table<Branch, string>;
  
  // Core tables
  products!: Table<Product, string>;
  // suppliers!: Table<Supplier, string>; // REMOVED in v38 - migrated to entities table
  // customers!: Table<Customer, string>; // REMOVED in v38 - migrated to entities table
  inventory_items!: Table<InventoryItem, string>;
  transactions!: Table<Transaction, string>;
  inventory_bills!: Table<inventory_bills, string>;
  users!: Table<Employee, string>;

  // Bill management tables
  bills!: Table<Bill, string>;
  bill_line_items!: Table<BillLineItem, string>;
  bill_audit_logs!: Table<BillAuditLog, string>;
  // Currency management tables
  
  // Sync management tables
  sync_metadata!: Table<SyncMetadata, string>;
  pending_syncs!: Table<PendingSync, string>;
  sync_state!: Table<{ branch_id: string; last_seen_event_version: number; updated_at: string }, string>;
  cash_drawer_accounts!: Table<CashDrawerAccount, string>;
  cash_drawer_sessions!: Table<CashDrawerSession, string>;
  missed_products!: Table<MissedProduct, string>;
  notifications!: Table<NotificationRecord, string>;
  notification_preferences!: Table<NotificationPreferences, string>;
  reminders!: Table<Reminder, string>;
  employee_attendance!: Table<EmployeeAttendance, string>;
  
  // Accounting foundation tables (Phase 1)
  journal_entries!: Table<JournalEntry, string>;
  balance_snapshots!: Table<BalanceSnapshot, string>;
  entities!: Table<Entity, string>;
  chart_of_accounts!: Table<ChartOfAccounts, string>;
  
  // RBAC tables (Role-Based Access Control)
  role_permissions!: Table<RolePermission, string>;
  user_permissions!: Table<UserPermission, string>;
  user_module_access!: Table<UserModuleAccess, string>; // @deprecated - will be removed in v46
  
  // Subscription management tables (Offline licensing)
  subscriptions!: Table<any, string>; // Will be properly typed when imported
  license_validations!: Table<any, string>;
  
  // Local authentication tables
  localPasswords!: Table<{ userId: string; passwordHash: string }, string>; // Legacy table for LocalAuthService
  localCredentials!: Table<{
    userId: string;
    email: string;
    encryptedPasswordHash: string;
    iv: string;
    salt: string;
    createdAt: string;
    lastSyncedAt?: string;
    supabaseUserId?: string;
  }, string>; // Secure credential storage
  
  // Database initialization state
  private _isInitialized = false;
  private _initPromise: Promise<void> | null = null;
  
  constructor() {
    super('POSDatabase');
    
  
    // Schema versions + migrations live in ./dbSchema.ts; bump CURRENT_DB_VERSION there
    // when adding a new version, and apply it below.
    this.version(54).stores(V54_STORES).upgrade(upgradeV54);
    this.version(55).stores(V55_STORES).upgrade(upgradeV55);
    this.version(56).stores(V56_STORES).upgrade(upgradeV56);
    this.version(57).stores(V57_STORES).upgrade(upgradeV57);
    this.version(58).stores(V58_STORES).upgrade(upgradeV58);
    this.version(59).stores(V59_STORES).upgrade(upgradeV59);
    this.version(60).stores(V60_STORES).upgrade(upgradeV60);

    // Add hooks for cash drawer tables
    this.cash_drawer_accounts.hook('creating', this.addCreateFieldsWithUpdatedAt);
    this.cash_drawer_sessions.hook('creating', this.addCreateFields);
    this.cash_drawer_accounts.hook('updating', this.addUpdateFields);
    this.missed_products.hook('creating', this.addCreateFieldsWithUpdatedAt);
    this.missed_products.hook('updating', this.addUpdateFields);

    // Add hooks for automatic timestamping and ID generation
    // Tables WITH updated_at: products, users, branches
    this.products.hook('creating', this.addCreateFieldsWithUpdatedAt);
    this.users.hook('creating', this.addCreateFieldsWithUpdatedAt);
    this.branches.hook('creating', this.addCreateFieldsWithUpdatedAt);

    // Tables WITHOUT updated_at: inventory_items, inventory_bills
    this.inventory_items.hook('creating', this.addCreateFields);
    this.inventory_bills.hook('creating', this.addCreateFields);

    // Only add update hooks for tables that have updated_at
    this.products.hook('updating', this.addUpdateFields);
    this.users.hook('updating', this.addUpdateFields);
    this.branches.hook('updating', this.addUpdateFields);

    // Bill management hooks
    this.bills.hook('creating', this.addCreateFieldsWithUpdatedAt);
    this.bill_line_items.hook('creating', this.addCreateFields);
    this.bill_audit_logs.hook('creating', this.addCreateFields);
    this.bills.hook('updating', this.addUpdateFields);

    // ========================================================================
    // AUTOMATIC SYNC TRIGGERS - Generic solution for all tables
    // ========================================================================
    // These hooks automatically trigger sync when _synced: false is detected
    // This ensures ALL database write operations trigger sync, regardless of
    // whether they go through crudHelperService or direct DB calls
    // ========================================================================
    
    // Get all table names that should trigger sync
    const syncableTables = [
      'stores', 'branches', 'products', 'users', 'entities',
      'inventory_items', 'inventory_bills', 'transactions', 'journal_entries',
      'bills', 'bill_line_items', 'bill_audit_logs',
      'cash_drawer_accounts', 'cash_drawer_sessions',
      'missed_products', 'reminders', 'chart_of_accounts',
      'role_permissions', 'user_permissions', 'balance_snapshots'
    ];

    // Register sync trigger hooks for all tables
    for (const tableName of syncableTables) {
      const table = (this as any)[tableName];
      if (table) {
        // Hook for create operations — factory binds tableName via closure (avoids trans.table.name being undefined)
        table.hook('creating', this.makeCreateTracker(tableName));
        // Hook for update operations — factory binds tableName via closure
        table.hook('updating', this.makeUpdateTracker(tableName));
        // Hook for delete operations (undo tracking)
        table.hook('deleting', this.makeDeleteTracker(tableName));
      }
    }
  }

  /**
   * Ensures the database is properly initialized before any operations
   * This prevents "DatabaseClosedError" by guaranteeing the database is open
   * 
   * Features:
   * - Guards against multiple open() calls
   * - Handles IndexedDB corruption by resetting the database
   * - Ensures atomic initialization to prevent race conditions
   */
  async ensureOpen(): Promise<void> {
    // If already initialized and open, return immediately
    if (this._isInitialized && this.isOpen()) {
      return;
    }

    // If initialization is in progress, wait for it
    if (this._initPromise) {
      return this._initPromise;
    }

    // Start initialization
    this._initPromise = (async () => {
      try {
        // Explicit guard: only open if not already open
        if (!this.isOpen()) {
          console.log('🔄 Opening IndexedDB database...');
          await this.open();
          console.log('✅ IndexedDB database opened successfully');
        }
        this._isInitialized = true;
      } catch (err: any) {
        // Handle IndexedDB corruption - this is critical for POS systems
        const isUnknownError = err?.name === 'UnknownError' || 
                              err?.message?.includes('backing store') ||
                              err?.message?.includes('Internal error');
        
        console.error('❌ Dexie open failed, attempting corruption recovery:', err);
        
        if (isUnknownError) {
          console.warn('⚠️ UnknownError detected - likely schema mismatch or corruption');
          console.warn('   This can happen after major schema changes. Clearing database...');
        }
        
        try {
          // Close database if it's partially open
          if (this.isOpen()) {
            await this.close();
          }
          
          // Delete corrupted database
          await Dexie.delete(this.name);
          console.log('🗑️ Deleted corrupted database, recreating...');
          
          // Wait a bit to ensure deletion completes
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Recreate and reopen
          await this.open();
          console.log('✅ Database recreated and opened successfully after corruption recovery');
          console.log('   📊 Database will initialize with latest schema');
          this._isInitialized = true;
        } catch (recoveryError: any) {
          // If recovery also fails, reset state and throw
          console.error('❌ Corruption recovery failed:', recoveryError);
          this._isInitialized = false;
          this._initPromise = null;
          
          // Provide helpful error message
          const errorMessage = isUnknownError
            ? `Database initialization failed due to schema mismatch. Please clear your browser's IndexedDB: DevTools > Application > IndexedDB > Delete "POSDatabase"`
            : `Database initialization failed and recovery unsuccessful: ${recoveryError?.message || recoveryError}`;
          
          throw new Error(errorMessage);
        }
      }
    })();

    return this._initPromise;
  }

  /**
   * Wraps a database operation with automatic initialization and error recovery
   */
  private async withDb<T>(operation: () => Promise<T>): Promise<T> {
    try {
      await this.ensureOpen();
      return await operation();
    } catch (error: any) {
      // If we get a DatabaseClosedError, try to recover by reopening
      if (error?.name === 'DatabaseClosedError' || error?.message?.includes('backing store')) {
        console.warn('⚠️ Database closed unexpectedly, attempting to reopen...');
        this._isInitialized = false;
        this._initPromise = null;
        
        try {
          await this.ensureOpen();
          return await operation();
        } catch (retryError) {
          console.error('❌ Failed to recover from database error:', retryError);
          throw retryError;
        }
      }
      throw error;
    }
  }

  async getCashDrawerAccount(storeId: string, branchId: string): Promise<CashDrawerAccount | null> {
    return this.withDb(async () => {
      // Validate inputs to prevent IDBKeyRange errors
      if (!storeId || !branchId || typeof storeId !== 'string' || typeof branchId !== 'string') {
        console.error('Invalid storeId or branchId:', { storeId, branchId });
        return null;
      }
      
      // First, check if any accounts exist for this store/branch (for debugging)
      const allAccounts = await this.cash_drawer_accounts
        .where('[store_id+branch_id]')
        .equals([storeId, branchId])
        .toArray();
      
  
      
      // Prefer an explicitly active account; treat undefined as active to support older records
      let account = await this.cash_drawer_accounts
        .where('[store_id+branch_id]')
        .equals([storeId, branchId])
        .filter(acc => {
          // Don't include deleted accounts
          if (acc._deleted) {
            console.log(`   ⚠️ Account ${acc.id} filtered out: _deleted=true`);
            return false;
          }
          
          // Check is_active field (primary field in interface)
          if ((acc as any).is_active === false) {
            console.log(`   ⚠️ Account ${acc.id} filtered out: is_active=false`);
            return false;
          }
          
          // Also check legacy isActive field for backward compatibility
          if ((acc as any).isActive === false) {
            console.log(`   ⚠️ Account ${acc.id} filtered out: isActive=false`);
            return false;
          }
          
          // If neither field is explicitly false, consider it active
          return true;
        })
        .first();
     
      if (account) {
        return account;
      }

      // Before creating a new account, check if cash_drawer_accounts table has been synced yet
      // This prevents creating duplicates when a full resync is still downloading the table
      // During full resync, tables are cleared first, then downloaded sequentially
      const syncMetadata = await this.getSyncMetadata('cash_drawer_accounts');
      const { syncService } = await import('../services/syncService');
      const isSyncing = syncService.isCurrentlyRunning();
      
      // If sync is running or table hasn't been synced yet, don't create a new account
      // Components should wait for sync to complete before accessing cash drawer accounts
      if (isSyncing || !syncMetadata) {
        console.log(`⏳ Sync in progress or table not synced yet. Returning null - account will be available after sync completes.`);
        return null;
      }

      // If no account found for specific branch, create a new one
      // NOTE: This account will be synced to Supabase. If a duplicate exists in Supabase,
      // the sync service will handle the conflict by deleting this local duplicate.
      console.log(`⚠️ No cash drawer account found for store ${storeId}, branch ${branchId}. Creating new account...`);
      console.log(`   ℹ️  Note: If account exists in Supabase, sync will resolve the duplicate automatically.`);
      
      // Get store to retrieve preferred currency
      const store = await this.stores.get(storeId);
      if (!store) {
        console.error(`❌ Store ${storeId} not found. Cannot create cash drawer account.`);
        return null;
      }

      // Verify branch exists
      const branch = await this.branches.get(branchId);
      if (!branch) {
        console.error(`❌ Branch ${branchId} not found. Cannot create cash drawer account.`);
        return null;
      }

      // Create new cash drawer account
      const now = new Date().toISOString();
      const newAccount: CashDrawerAccount = {
        id: uuidv4(),
        store_id: storeId,
        branch_id: branchId,
        account_code: '1100', // Cash account code
        name: 'Main Cash Drawer',
        currency: store.preferred_currency || 'LBP',
        is_active: true,
        current_balance: 0, // For backward compatibility
        usd_balance: 0, // Performance cache: USD balance
        lbp_balance: 0, // Performance cache: LBP balance
        created_at: now,
        updated_at: now,
        _synced: false // Mark as unsynced so it will be uploaded to Supabase
      };

      try {
        // Add the new account to the database
        await this.cash_drawer_accounts.add(newAccount);
        
        // Verify the account was created successfully
        const verifiedAccount = await this.cash_drawer_accounts.get(newAccount.id);
        if (!verifiedAccount) {
          console.error(`❌ Failed to verify cash drawer account creation. Account ${newAccount.id} not found after add.`);
          return null;
        }
        
        console.log(`✅ Created new cash drawer account for store ${storeId}, branch ${branchId} (${newAccount.id})`);
        console.log(`   ℹ️  This account will be synced to Supabase. If a duplicate exists, sync service will handle it.`);
        return verifiedAccount;
      } catch (error) {
        console.error(`❌ Error creating cash drawer account:`, error);
        throw error;
      }
    });
  }

  async getCurrentCashDrawerSession(storeId: string, branchId: string): Promise<CashDrawerSession | null> {

    return this.withDb(async () => {
      // Validate inputs to prevent IDBKeyRange errors
      if (!storeId || !branchId || typeof storeId !== 'string' || typeof branchId !== 'string') {
        console.error('Invalid storeId or branchId:', { storeId, branchId });
        return null;
      }
      
      // Fetch all sessions for the store and branch using compound index
      // Use bracket notation for compound index: '[store_id+branch_id]'
      let all: CashDrawerSession[];
      try {
        all = await this.cash_drawer_sessions
          .where('[store_id+branch_id]')
          .equals([storeId, branchId])
          .toArray();
      } catch (error) {
        // Fallback: if compound index query fails, use store_id index and filter manually
        console.warn('Compound index query failed, using fallback:', error);
        const allSessions = await this.cash_drawer_sessions
          .where('store_id')
          .equals(storeId)
          .filter(sess => sess.branch_id === branchId )
          .toArray();
        all = allSessions;
      }
      // console.log('DEBUG: Current session:',all);

      // Find open sessions, robust to whitespace/case issues
      const open = all.filter(sess => String(sess.status).trim().toLowerCase() === 'open');
      open.sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());
      return open[0] || null;
    });
  }

  async openCashDrawerSession(
    storeId: string,
    branchId: string,
    accountId: string,
    openingAmount: number,
    openedBy: string
  ): Promise<string> {
    const sessionId = uuidv4();
    const now = new Date().toISOString();
    
    const session: CashDrawerSession = {
      id: sessionId,
      store_id: storeId,
      branch_id: branchId,
      created_at: now,
      updated_at: now,
      _synced: false,
      account_id: accountId,
      opened_by: openedBy,
      opened_at: now,
      opening_amount: openingAmount,
      status: 'open'
    };

    await this.cash_drawer_sessions.add(session);
    
    // Note: Balance is computed from journal entries, no need to update current_balance field
    
    return sessionId;
  }

  async closeCashDrawerSession(
    sessionId: string,
    actualAmount: number,
    closedBy: string,
    notes?: string
  ): Promise<void> {
    const session = await this.cash_drawer_sessions.get(sessionId);
    if (!session || session.status !== 'open') return;

    // Calculate expected amount from transactions
    const expectedAmount = await this.calculateExpectedCashDrawerAmount(sessionId, session.opening_amount);
    const variance = actualAmount - expectedAmount;
    const now = new Date().toISOString();

    // Update session
    await this.cash_drawer_sessions.update(sessionId, {
      closed_at: now,
      closed_by: closedBy,
      expected_amount: expectedAmount,
      actual_amount: actualAmount,
      variance,
      status: 'closed',
      notes,
      _synced: false
    });

    // Note: Balance is computed from journal entries, no need to update current_balance field
  }

  /**
   * Calculate expected cash drawer amount based on actual transactions during the session
   */
  private async calculateExpectedCashDrawerAmount(sessionId: string, openingAmount: number): Promise<number> {
    try {
      console.log(`Calculating expected amount for session ${sessionId} with opening amount ${openingAmount}`);
      
      // Get all cash transactions that occurred during this session
      const session = await this.cash_drawer_sessions.get(sessionId);
      if (!session) {
        console.warn('Session not found for expected amount calculation');
        return openingAmount;
      }

      const sessionStartTime = new Date(session.opened_at);
      const sessionEndTime = session.closed_at ? new Date(session.closed_at) : new Date();
      
      // Get all cash drawer transactions during this session period
      // These transactions are created by the cash drawer update service
      // and represent the actual cash flow affecting the physical drawer
      const cashDrawerTransactions = await this.transactions
        .filter(trans => 
          trans.category?.startsWith('cash_drawer_') &&
          new Date(trans.created_at) >= sessionStartTime &&
          new Date(trans.created_at) <= sessionEndTime
        )
        .toArray();
      
      console.log(`Found ${cashDrawerTransactions.length} cash drawer transactions during session`);

      // Calculate expected amount by applying all cash drawer transactions to the opening amount
      // Income transactions (sales, payments) increase the balance
      // Expense transactions decrease the balance
      let expectedAmount = openingAmount;
      
      for (const trans of cashDrawerTransactions) {
        if (trans.type === 'income') {
          expectedAmount += trans.amount || 0;
        } else if (trans.type === 'expense') {
          expectedAmount -= trans.amount || 0;
        }
      }
      
      console.log(`Cash flow calculation:`, {
        openingAmount,
        cashDrawerTransactions: cashDrawerTransactions.length,
        expectedAmount
      });
      
      return expectedAmount;
    } catch (error) {
      console.error('Error calculating expected cash drawer amount:', error);
      // Return opening amount as fallback
      return openingAmount;
    }
  }

  // Removed: updateCashDrawerBalance() - Balance is now computed from journal entries
  // Use cashDrawerUpdateService.getCurrentCashDrawerBalances() for session-scoped balance

  /**
   * Get the chart of accounts entry linked to a cash drawer account
   * This leverages the FK relationship between cash_drawer_accounts and chart_of_accounts
   * @param cashDrawerAccountId - The ID of the cash drawer account
   * @returns The linked chart of accounts entry, or null if not found
   */
  async getChartOfAccountsForCashDrawer(cashDrawerAccountId: string): Promise<ChartOfAccounts | null> {
    return this.withDb(async () => {
      const cashDrawerAccount = await this.cash_drawer_accounts.get(cashDrawerAccountId);
      if (!cashDrawerAccount) {
        console.warn(`Cash drawer account not found: ${cashDrawerAccountId}`);
        return null;
      }

      // Use the compound index [store_id+account_code] to find the linked chart of accounts entry
      const chartAccount = await this.chart_of_accounts
        .where('[store_id+account_code]')
        .equals([cashDrawerAccount.store_id, cashDrawerAccount.account_code])
        .first();

      if (!chartAccount) {
        console.warn(`Chart of accounts entry not found for store: ${cashDrawerAccount.store_id}, account_code: ${cashDrawerAccount.account_code}`);
      }

      return chartAccount || null;
    });
  }

  /**
   * Validate that a cash drawer account has a valid account_code in chart_of_accounts
   * @param storeId - The store ID
   * @param accountCode - The account code to validate
   * @returns True if the account code exists in chart_of_accounts for the store
   */
  async validateCashDrawerAccountCode(storeId: string, accountCode: string): Promise<boolean> {
    return this.withDb(async () => {
      const chartAccount = await this.chart_of_accounts
        .where('[store_id+account_code]')
        .equals([storeId, accountCode])
        .first();
      
      return !!chartAccount;
    });
  }

  /**
   * Get cash drawer account with its linked chart of accounts info
   * Returns enriched cash drawer data including account type and name from chart of accounts
   */
  async getCashDrawerAccountWithChartInfo(storeId: string, branchId: string): Promise<(CashDrawerAccount & { 
    chart_account_name?: string; 
    chart_account_type?: string;
  }) | null> {
    return this.withDb(async () => {
      const account = await this.getCashDrawerAccount(storeId, branchId);
      if (!account) return null;

      const chartAccount = await this.chart_of_accounts
        .where('[store_id+account_code]')
        .equals([storeId, account.account_code])
        .first();

      return {
        ...account,
        chart_account_name: chartAccount?.account_name,
        chart_account_type: chartAccount?.account_type
      };
    });
  }

  async getCurrentCashDrawerStatus(storeId: string, branchId: string): Promise<any> {
    try {
      const currentSession = await this.getCurrentCashDrawerSession(storeId, branchId);

      if (!currentSession) {
        return {
          status: 'no_session',
          message: 'No active cash drawer session'
        };
      }

      // Get account for currency info
      const account = await this.cash_drawer_accounts
        .where('[store_id+branch_id]')
        .equals([storeId, branchId])
        .first();

      if (!account) {
        return {
          status: 'no_account',
          message: 'No cash drawer account found'
        };
      }

      // Session-scoped balance (same formula as cashDrawerUpdateService.getCurrentCashDrawerBalances; inlined to avoid db↔service circular import)
      const currency = (account as any)?.currency || 'USD';
      const accountCurrency = currency;
      const openedAt = new Date(currentSession.opened_at);
      const closedAt = currentSession.closed_at ? new Date(currentSession.closed_at) : new Date();

      let sessionEntries;
      try {
        sessionEntries = await this.journal_entries
          .where('[store_id+account_code]')
          .equals([storeId, '1100'])
          .and(e => {
            if (e.is_posted !== true || e.branch_id !== branchId) {
              return false;
            }
            const entryDate = new Date(e.created_at);
            return entryDate >= openedAt && entryDate <= closedAt;
          })
          .toArray();
      } catch (error) {
        console.warn('Compound index [store_id+account_code] not available, using fallback:', error);
        sessionEntries = await this.journal_entries
          .where('[store_id+branch_id]')
          .equals([storeId, branchId])
          .and(e => {
            if (e.account_code !== '1100' || e.is_posted !== true) {
              return false;
            }
            const entryDate = new Date(e.created_at);
            return entryDate >= openedAt && entryDate <= closedAt;
          })
          .toArray();
      }

      const netChange = calculateBothCurrencies(sessionEntries);
      const openingAmountSession = currentSession.opening_amount || 0;
      const balances = {
        USD: netChange.USD + (accountCurrency === 'USD' ? openingAmountSession : 0),
        LBP: netChange.LBP + (accountCurrency === 'LBP' ? openingAmountSession : 0),
      };
      const currentBalance = currency === 'LBP' ? balances.LBP : balances.USD;

      return {
        status: 'active',
        sessionId: currentSession.id,
        openedBy: currentSession.opened_by,
        openedAt: currentSession.opened_at,
        openingAmount: currentSession.opening_amount,
        currentBalance,
        sessionDuration: Date.now() - new Date(currentSession.opened_at).getTime()
      };
    } catch (error) {
      console.error('Error getting current cash drawer status:', error);
      return {
        status: 'error',
        message: 'Error retrieving cash drawer status'
      };
    }
  }

  async getCashDrawerSessionDetails(sessionId: string): Promise<any> {
    try {
      const session = await this.cash_drawer_sessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      const sessionStartTime = new Date(session.opened_at);
      const sessionEndTime = session.closed_at ? new Date(session.closed_at) : new Date();

      // Get all cash drawer transactions during this session period
      // These represent the actual cash flow affecting the physical drawer
      const cashDrawerTransactions = await this.transactions
        .filter(trans => 
          trans.category?.startsWith('cash_drawer_') &&
          new Date(trans.created_at) >= sessionStartTime &&
          new Date(trans.created_at) <= sessionEndTime
        )
        .toArray();

      // Group transactions by type for display
      const cashSales = cashDrawerTransactions.filter(trans => 
        trans.category === PAYMENT_CATEGORIES.CASH_DRAWER_SALE && trans.type === 'income'
      );
      
      const cashPayments = cashDrawerTransactions.filter(trans => 
        (trans.category === PAYMENT_CATEGORIES.CASH_DRAWER_PAYMENT || trans.category === PAYMENT_CATEGORIES.CASH_DRAWER_CUSTOMER_PAYMENT) && trans.type === 'income'
      );
      
      const cashExpenses = cashDrawerTransactions.filter(trans => 
        trans.category === PAYMENT_CATEGORIES.CASH_DRAWER_EXPENSE && trans.type === 'expense'
      );

      return {
        session,
        transactions: {
          sales: cashSales.map(trans => ({
            id: trans.id,
            product_name: trans.description?.split(' -')[0] || 'Sale',
            quantity: 1, // Transaction-based, so quantity is 1
            unit_price: trans.amount,
            received_value: trans.amount,
            created_at: trans.created_at
          })),
          payments: cashPayments.map(trans => ({
            id: trans.id,
            description: trans.description,
            amount: trans.amount,
            reference: trans.reference,
            created_at: trans.created_at
          })),
          expenses: cashExpenses.map(trans => ({
            id: trans.id,
            description: trans.description,
            amount: trans.amount,
            category: trans.category?.replace('cash_drawer_', ''),
            created_at: trans.created_at
          }))
        },
        totals: {
          sales: cashSales.reduce((sum, trans) => sum + trans.amount, 0),
          payments: cashPayments.reduce((sum, trans) => sum + trans.amount, 0),
          expenses: cashExpenses.reduce((sum, trans) => sum + trans.amount, 0)
        }
      };
    } catch (error) {
      console.error('Error getting session details:', error);
      throw error;
    }
  }

  async getCashDrawerBalanceReport(storeId: string, branchId: string, startDate?: string, endDate?: string): Promise<any> {
    try {
      let sessions = await this.cash_drawer_sessions
        .where('[store_id+branch_id]')
        .equals([storeId, branchId])
        .filter(sess => sess.status === 'closed')
        .toArray();

      // Filter by date range if provided
      if (startDate) {
        // If startDate is just a date (YYYY-MM-DD), include the entire day
        const startFilter = startDate.includes('T') ? startDate : `${startDate}T00:00:00.000Z`;
        sessions = sessions.filter(sess => sess.closed_at! >= startFilter);
      }
      if (endDate) {
        // If endDate is just a date (YYYY-MM-DD), include the entire day
        const endFilter = endDate.includes('T') ? endDate : `${endDate}T23:59:59.999Z`;
        sessions = sessions.filter(sess => sess.closed_at! <= endFilter);
      }

      // Sort by closing date (most recent first)
      sessions.sort((a, b) => new Date(b.closed_at!).getTime() - new Date(a.closed_at!).getTime());

      const reportData = sessions.map(session => ({
        id: session.id,
        sessionId: session.id,
        date: session.closed_at!,
        employeeName: session.closed_by || 'Unknown',
        openingAmount: session.opening_amount || 0,
        expectedAmount: session.expected_amount || 0,
        actualAmount: session.actual_amount || 0,
        variance: session.variance || 0,
        status: session.variance === 0 ? 'balanced' : 'unbalanced',
        closedBy: session.closed_by || 'Unknown',
        notes: session.notes || null
      }));

      const summary = {
        totalSessions: reportData.length,
        totalOpening: reportData.reduce((sum, session) => sum + session.openingAmount, 0),
        totalExpected: reportData.reduce((sum, session) => sum + session.expectedAmount, 0),
        totalActual: reportData.reduce((sum, session) => sum + session.actualAmount, 0),
        totalVariance: reportData.reduce((sum, session) => sum + session.variance, 0),
        balancedSessions: reportData.filter(session => session.variance === 0).length,
        unbalancedSessions: reportData.filter(session => session.variance !== 0).length,
        averageVariance: reportData.reduce((sum, session) => sum + session.variance, 0) / reportData.length
      };

      return {
        sessions: reportData,
        summary,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error generating cash drawer balance report:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Failed to generate cash drawer balance report: ${errorMessage}`);
    }
  }

  private addCreateFields = (primKey: any, obj: any, trans: any) => {
    const now = new Date().toISOString();
    if (!obj.id) obj.id = uuidv4();
    if (!obj.created_at) obj.created_at = now;
    if (obj._synced === undefined) obj._synced = false;
  };

  private addCreateFieldsWithUpdatedAt = (primKey: any, obj: any, trans: any) => {
    const now = new Date().toISOString();
    if (!obj.id) obj.id = uuidv4();
    if (!obj.created_at) obj.created_at = now;
    if (obj.updated_at === undefined) obj.updated_at = now;
    if (obj._synced === undefined) obj._synced = false;
  };

  private addUpdateFields = (modifications: any, primKey: any, obj: any, trans: any) => {
    // Only stamp updated_at when the caller didn't supply one. Sync downloads pass
    // the server's updated_at and must not have it stomped to "now" — doing so makes
    // the row look newer than the server on the next change-detection pass and
    // causes a download↔upload ping-pong.
    if (modifications.updated_at === undefined) {
      modifications.updated_at = new Date().toISOString();
    }
    // Do NOT default _synced to false. User-initiated edits go through
    // crudHelperService.updateEntity which sets _synced: false explicitly.
    // Sync-path writes set _synced: true explicitly. Defaulting to false here
    // silently flips records back to unsynced on metadata-only writes (e.g.
    // when only _lastSyncedAt changes), causing spurious upload churn.
  };

  /**
   * Factory for the 'creating' hook. Binds tableName via closure so the correct
   * table name is always available — trans.table.name can be undefined inside
   * nested Dexie transactions (e.g. transactionService calls).
   */
  private makeCreateTracker = (tableName: string) => {
    return (primKey: any, obj: any, _trans: any) => {
      if (obj._synced === false) {
        console.log(`🔄 [DB Hook] Creating record with _synced: false - ${tableName}/${primKey}`);
        changeTracker.trackCreate(tableName, primKey, obj);
        setTimeout(() => {
          import('../services/syncTriggerService').then(({ syncTriggerService }) => {
            syncTriggerService.triggerSync();
          }).catch(err => {
            console.warn('⚠️ [DB Hook] Sync trigger service not available:', err);
          });
        }, 0);
      }
    };
  };

  /**
   * Factory for the 'updating' hook. Binds tableName via closure — same reason
   * as makeCreateTracker.
   */
  private makeUpdateTracker = (tableName: string) => {
    return (modifications: any, primKey: any, obj: any, _trans: any) => {
      if (modifications._synced === false || (modifications._synced === undefined && obj._synced === false)) {
        console.log(`🔄 [DB Hook] Updating record with _synced: false - ${tableName}/${primKey}`);
        // obj = state BEFORE modifications; modifications = fields being changed
        changeTracker.trackUpdate(tableName, primKey, obj, modifications);
        setTimeout(() => {
          import('../services/syncTriggerService').then(({ syncTriggerService }) => {
            syncTriggerService.triggerSync();
          }).catch(err => {
            console.warn('⚠️ [DB Hook] Sync trigger service not available:', err);
          });
        }, 0);
      }
    };
  };

  /**
   * Factory to create a deleting hook for a specific table.
   * Tracks delete operations for undo system.
   */
  private makeDeleteTracker = (tableName: string) => {
    return (primKey: any, obj: any, trans: any) => {
      // Track this delete for undo system
      changeTracker.trackDelete(tableName, primKey, obj);
    };
  };

  // ⚠️ DEPRECATED: Hook for automatic cash drawer updates - NO LONGER USED
  // Cash drawer updates are now handled atomically within transactionService
  // This prevents race conditions, circular dependencies, and double-processing
  // Kept for reference only - DO NOT RE-ENABLE
  /*
  private handleTransactionCreated = async (primKey: any, obj: any, trans: any) => {
    try {
      if (obj.category && obj.category.startsWith('cash_drawer_')) {
        return;
      }
      const { cashDrawerUpdateService } = await import('../services/cashDrawerUpdateService');
      if (obj.type === 'expense') {
        await cashDrawerUpdateService.updateCashDrawerForExpense({
          amount: obj.amount,
          currency: obj.currency,
          storeId: obj.store_id,
          createdBy: obj.created_by,
          description: obj.description,
          category: obj.category,
          allowAutoSessionOpen: true
        });
      }
    } catch (error) {
      console.error('Error in transaction created hook:', error);
    }
  };
  */

  // Cash drawer updates now handled atomically by transactionService

  // Utility methods for sync management
  async markAsSynced(tableName: string, recordId: string) {
    const table = (this as any)[tableName];
    if (table) {
      await table.update(recordId, { 
        _synced: true, 
        _lastSyncedAt: new Date().toISOString() 
      });
    }
  }

  async getUnsyncedRecords(tableName: string) {
    const table = (this as any)[tableName];
    if (table) {
      return await table.filter((record: any) => record._synced === false).toArray();
    }
    return [];
  }

  async softDelete(tableName: string, recordId: string) {
    const table = (this as any)[tableName];
    if (table) {
      await table.update(recordId, { 
        _deleted: true, 
        _synced: false,
        updated_at: new Date().toISOString()
      });
    }
  }

  async addPendingSync(tableName: string, recordId: string, operation: 'create' | 'update' | 'delete', payload: any) {
    await this.pending_syncs.add({
      id: uuidv4(),
      table_name: tableName,
      record_id: recordId,
      operation,
      payload,
      created_at: new Date().toISOString(),
      retry_count: 0,
      idempotency_key: uuidv4(),
      status: 'pending',
    });
  }

  async getPendingSyncs() {
    return await this.pending_syncs
      .where('status')
      .equals('pending')
      .sortBy('created_at');
  }

  async removePendingSync(id: string) {
    await this.pending_syncs.delete(id);
  }

  async updateSyncMetadata(
    tableName: string,
    lastSyncedAt: string,
    extras?: Partial<{
      sync_token: string;
      last_synced_version: number;
      store_id: string | null;
      hydration_complete: boolean;
    }>
  ) {
    const existing = await this.sync_metadata.get(tableName);
    await this.sync_metadata.put({
      id: tableName,
      table_name: tableName,
      last_synced_at: lastSyncedAt,
      sync_token: extras?.sync_token ?? existing?.sync_token,
      last_synced_version: extras?.last_synced_version ?? existing?.last_synced_version ?? 0,
      store_id: extras?.store_id !== undefined ? extras.store_id : (existing?.store_id ?? null),
      hydration_complete: extras?.hydration_complete ?? existing?.hydration_complete ?? false,
    });
  }

  async getSyncMetadata(tableName: string) {
    return await this.sync_metadata.get(tableName);
  }

  // Validation methods moved to dataValidationService for centralized validation logic
  // Use dataValidationService.validateRecords() and dataValidationService.autoFixRecord() instead
  
  async cleanupInvalidInventoryItems(): Promise<number> {
    return this.withDb(async () => {
      // Simple cleanup for truly invalid rows (negative quantities)
      const invalidItems = await this.inventory_items.filter(item => item.quantity < 0).toArray();
      
      if (invalidItems.length > 0) {
        await this.inventory_items.bulkDelete(invalidItems.map(item => item.id));
      }
      
      return invalidItems.length;
    });
  }

  async cleanupOrphanedRecords(storeId: string): Promise<number> {
    return this.withDb(async () => {
      // Note: For comprehensive validation, use dataValidationService.validateRecords()
      // This is a simple cleanup for obvious orphaned records
      
      // Include both store-specific and global products (inventory can reference global products)
      const products = await this.getAvailableProducts(storeId);
      const productIds = new Set(products.map(p => p.id));
      
      // Clean up orphaned inventory items (supplier_id was removed from inventory_items)
      // Inventory items now reference suppliers via inventory_bills.batch_id -> inventory_bills.supplier_id
      const orphanedInventory = await this.inventory_items
        .where('store_id').equals(storeId)
        .filter(item => !productIds.has(item.product_id))
        .toArray();
      
      let cleaned = 0;
      if (orphanedInventory.length > 0) {
        await this.inventory_items.bulkDelete(orphanedInventory.map(item => item.id));
        cleaned += orphanedInventory.length;
      }
      
      return cleaned;
    });
  }

  // ==================== GLOBAL PRODUCTS HELPER METHODS ====================
  
  /**
   * Get all products available to a specific store (both global and store-specific)
   * @param storeId - The store ID to get products for
   * @returns Array of products (global + store-specific)
   */
  async getAvailableProducts(storeId: string): Promise<Product[]> {
    return this.withDb(async () => {
      // Get global products - defensive approach to handle different value types
      const globalProducts = await this.products
        .where('is_global')
        .anyOf(1, true, '1', 'true')
        .filter(p => !p._deleted)
        .toArray();
      
      // Get store-specific products (excluding global)
      const storeProducts = await this.products
        .where('store_id')
        .equals(storeId)
        .filter(p => {
          const notDeleted = !p._deleted;
          const notGlobal = !(p.is_global === 1 || p.is_global === true || p.is_global === '1' || p.is_global === 'true');
          return notDeleted && notGlobal;
        })
        .toArray();
      
      // Combine and return
      return [...globalProducts, ...storeProducts];
    });
  }

  /**
   * Get only global predefined products
   * @returns Array of global products
   */
  async getGlobalProducts(): Promise<Product[]> {
    // Defensive approach to handle different value types for is_global
    return await this.products
      .where('is_global')
      .anyOf(1, true, '1', 'true')
      .filter(p => !p._deleted)
      .toArray();
  }


  /**
   * Get only store-specific products (excluding global)
   * @param storeId - The store ID
   * @returns Array of store-specific products
   */
  async getStoreSpecificProducts(storeId: string): Promise<Product[]> {
    return await this.products
      .where('store_id')
      .equals(storeId)
      .filter(p => {
        const notDeleted = !p._deleted;
        const notGlobal = !(p.is_global === 1 || p.is_global === true || p.is_global === '1' || p.is_global === 'true');
        return notDeleted && notGlobal;
      })
      .toArray();
  }

  /**
   * Create a global product (accessible to all stores)
   * @param productData - Product data without store_id
   * @returns The created product ID
   */
  async createGlobalProduct(productData: Omit<Product, 'id' | 'createdAt' | 'is_global'>): Promise<string> {
    const now = new Date().toISOString();
    const productId = uuidv4();
    
    const globalProduct: any = {
      id: productId,
      ...productData,
      store_id: 'global', // Use 'global' as a special store_id for global products
      is_global: true,
      created_at: now,
      updated_at: now,
      _synced: false,
      _deleted: false
    };
    
    await this.products.add(globalProduct);
    return productId;
  }

  /**
   * Create a store-specific product
   * @param storeId - The store ID
   * @param productData - Product data
   * @returns The created product ID
   */
  async createStoreProduct(storeId: string, productData: Omit<Product, 'id' | 'createdAt' | 'is_global'>): Promise<string> {
    const now = new Date().toISOString();
    const productId = uuidv4();
    
    const storeProduct: any = {
      id: productId,
      ...productData,
      store_id: storeId,
      is_global: false,
      created_at: now,
      updated_at: now,
      _synced: false,
      _deleted: false
    };
    
    await this.products.add(storeProduct);
    return productId;
  }

  /**
   * Check if a product is global
   * @param productId - The product ID
   * @returns True if the product is global, false otherwise
   */
  async isProductGlobal(productId: string): Promise<boolean> {
    const product = await this.products.get(productId);
    return product?.is_global === true;
  }

  // Bill management methods
  async createBillFromLineItems(lineItems: Omit<BillLineItem, 'id' | 'bill_id' | keyof BaseEntity>[], billData: Partial<Bill>, useSupabase: boolean = true): Promise<string> {
    // If using Supabase, delegate to SupabaseService
    if (useSupabase) {
      console.log('Using Supabase for bill creation - delegating to SupabaseService');
      return 'supabase-handled';
    }

    // Fallback to local database creation
    const billId = uuidv4();
    const now = new Date().toISOString();
    
    return await this.transaction('rw', [this.bills, this.bill_line_items, this.bill_audit_logs], async () => {
      // Create the bill
      const bill: Bill = {
        id: billId,
        store_id: billData.store_id!,
        branch_id: billData.branch_id!,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_number: billData.bill_number || generateBillReference(),
        customer_id: billData.customer_id || null,
        payment_method: billData.payment_method || 'cash',
        payment_status: billData.payment_status || 'paid',
        amount_paid: billData.amount_paid || 0,
        bill_date: billData.bill_date || now,
        notes: billData.notes || null,
        status: billData.status || 'active',
        created_by: billData.created_by!,
        last_modified_by: null
      };
      
      await this.bills.add(bill);
      
      // Create bill line items with proper field mapping
      const billLineItems: BillLineItem[] = lineItems.map((item, index) => ({
        id: uuidv4(),
        store_id: billData.store_id!,
        branch_id: billData.branch_id!,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        product_id: item.product_id,
        inventory_item_id: item.inventory_item_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        weight: item.weight,
        notes: item.notes,
        line_order: item.line_order || index + 1,
        received_value: item.received_value
      }));
      
      await this.bill_line_items.bulkAdd(billLineItems);
      
      // Create audit log entry
      await this.bill_audit_logs.add({
        id: uuidv4(),
        store_id: billData.store_id!,
        branch_id: billData.branch_id!,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        action: 'created',
        field_changed: null,
        old_value: null,
        new_value: JSON.stringify(bill),
        change_reason: 'Bill created from POS sale',
        changed_by: billData.created_by!,
        ip_address: null,
        user_agent: null,
      });

      return billId;
    });
  }

  async updateBill(billId: string, updates: Partial<Bill>, changedBy: string, changeReason?: string): Promise<void> {
    const originalBill = await this.bills.get(billId);
    if (!originalBill) throw new Error('Bill not found');
    
    return await this.transaction('rw', [this.bills, this.bill_audit_logs], async () => {
      const now = new Date().toISOString();
      
      // Update the bill
      await this.bills.update(billId, {
        ...updates,
        last_modified_by: changedBy,
        updated_at: now,
        _synced: false,
      });

      // Log each changed field
      for (const [field, newValue] of Object.entries(updates)) {
        if (field !== 'last_modified_by' && field !== 'last_modified_at' && field !== '_synced') {
          const oldValue = (originalBill as any)[field];
          if (oldValue !== newValue) {
            await this.bill_audit_logs.add({
              id: uuidv4(),
              store_id: originalBill.store_id,
              branch_id: originalBill.branch_id,
              created_at: now,
              updated_at: now,
              _synced: false,
              bill_id: billId,
              action: 'updated',
              field_changed: field,
              old_value: JSON.stringify(oldValue),
              new_value: JSON.stringify(newValue),
              change_reason: changeReason || 'Bill updated',
              changed_by: changedBy,
              ip_address: null,
              user_agent: null,
            });
          }
        }
      }
    });
  }

  async getBillsWithLineItems(storeId: string, filters?: {
    searchTerm?: string;
    dateFrom?: string;
    dateTo?: string;
    paymentStatus?: string;
    customerId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    let bills = await this.bills
      .where('store_id')
      .equals(storeId)
      .filter(bill => !bill._deleted || bill._deleted === undefined)
      .toArray();
    
    // Apply filters
    if (filters?.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      bills = bills.filter(bill => 
        bill.bill_number.toLowerCase().includes(searchLower) ||
        (bill.id && bill.id.toLowerCase().includes(searchLower)) ||
        (bill.notes && bill.notes.toLowerCase().includes(searchLower))
      );
    }
    
    if (filters?.dateFrom) {
      bills = bills.filter(bill => bill.bill_date >= filters.dateFrom!);
    }
    if (filters?.dateTo) {
      bills = bills.filter(bill => bill.bill_date <= filters.dateTo!);
    }
    if (filters?.paymentStatus) {
      bills = bills.filter(bill => bill.payment_status === filters.paymentStatus);
    }
    if (filters?.customerId) {
      bills = bills.filter(bill => bill.customer_id === filters.customerId);
    }
    if (filters?.status) {
      bills = bills.filter(bill => bill.status === filters.status);
    }
    
    // Sort by date
    bills.sort((a, b) => new Date(b.bill_date).getTime() - new Date(a.bill_date).getTime());
    
    // Apply pagination
    if (filters?.offset) {
      bills = bills.slice(filters.offset);
    }
    if (filters?.limit) {
      bills = bills.slice(0, filters.limit);
    }
    
    // Get line items and audit logs for each bill
    const billsWithDetails = await Promise.all(bills.map(async (bill) => {
      const [lineItems, auditLogs] = await Promise.all([
        this.bill_line_items.where('bill_id').equals(bill.id).sortBy('line_order'),
        this.bill_audit_logs.where('bill_id').equals(bill.id).reverse().sortBy('created_at')
      ]);
      
      return {
        ...bill,
        bill_line_items: lineItems,
        bill_audit_logs: auditLogs
      };
    }));
    
    return billsWithDetails;
  }

  async getBillDetails(billId: string): Promise<any | null> {
    const bill = await this.bills.get(billId);
    if (!bill) return null;
    
    const [lineItems, auditLogs] = await Promise.all([
      this.bill_line_items.where('bill_id').equals(billId).sortBy('line_order'),
      this.bill_audit_logs.where('bill_id').equals(billId).reverse().sortBy('created_at')
    ]);
    
    return {
      ...bill,
      bill_line_items: lineItems,
      bill_audit_logs: auditLogs
    };
  }

  // ==================== LINE ITEM AUDIT TRAIL FUNCTIONS ====================
  
  /**
   * Add a line item to a bill with audit trail
   */
  async addBillLineItem(
    billId: string,
    lineItem: Partial<BillLineItem>,
    addedBy: string
  ): Promise<string> {
    const bill = await this.bills.get(billId);
    if (!bill) throw new Error('Bill not found');

    const now = new Date().toISOString();
    const lineItemId = uuidv4();
    
    const newLineItem = {
      id: lineItemId,
      bill_id: billId,
      store_id: bill.store_id,
      branch_id: bill.branch_id,
      created_at: now,
      updated_at: now,
      _synced: false,
      ...lineItem
    } as BillLineItem;

    await this.transaction('rw', [this.bill_line_items, this.bill_audit_logs, this.products], async () => {
      await this.bill_line_items.add(newLineItem);

      // Resolve product name for audit log
      const product = await this.products.get(newLineItem.product_id);
      const productName = product?.name || 'Unknown Product';
      
      // Create audit log with descriptive reason
      const generatedReason = `Adding line item: ${productName} (Qty: ${newLineItem.quantity}, Price: ${newLineItem.unit_price})`;

      await this.bill_audit_logs.add({
        id: uuidv4(),
        store_id: bill.store_id,
        branch_id: bill.branch_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        action: 'item_added',
        field_changed: 'line_items',
        old_value: null,
        new_value: JSON.stringify(newLineItem),
        change_reason: generatedReason,
        changed_by: addedBy,
        ip_address: null,
        user_agent: null
      });
    });

    return lineItemId;
  }

  /**
   * Update a line item with field-level audit trail and ID resolution
   */
  async updateBillLineItem(
    lineItemId: string,
    updates: Partial<BillLineItem>,
    updatedBy: string
  ): Promise<void> {
    const originalItem = await this.bill_line_items.get(lineItemId);
    if (!originalItem) throw new Error('Line item not found');

    const now = new Date().toISOString();

    await this.transaction('rw', [this.bill_line_items, this.bill_audit_logs, this.products], async () => {
      // Update the line item
      await this.bill_line_items.update(lineItemId, {
        ...updates,
        updated_at: now,
        _synced: false
      });

      // Create audit log for each changed field with ID resolution
      // Skip computed/automatic fields that are consequences of other changes
      const computedFields = ['line_total', 'received_value', 'updated_at', '_synced'];
      
      for (const [field, newValue] of Object.entries(updates)) {
        if (!computedFields.includes(field)) {
          const oldValue = (originalItem as any)[field];
          if (oldValue !== newValue) {
            // Resolve IDs to human-readable names
            let oldValueDisplay = oldValue != null ? String(oldValue) : 'empty';
            let newValueDisplay = newValue != null ? String(newValue) : 'empty';

            // Resolve product_id to product name
            if (field === 'product_id') {
              if (oldValue && typeof oldValue === 'string') {
                const oldProduct = await this.products.get(oldValue);
                oldValueDisplay = oldProduct?.name || oldValue;
              }
              if (newValue && typeof newValue === 'string') {
                const newProduct = await this.products.get(newValue);
                newValueDisplay = newProduct?.name || String(newValue);
              }
            }

            // Resolve product name for audit log
            const product = await this.products.get(originalItem.product_id);
            const productName = product?.name || 'Unknown Product';
            
            // Generate descriptive change reason
            const fieldLabel = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const generatedReason = `Modifying line item: ${fieldLabel} from ${oldValueDisplay} to ${newValueDisplay} (Product: ${productName})`;

            await this.bill_audit_logs.add({
              id: uuidv4(),
              store_id: originalItem.store_id,
              branch_id: originalItem.branch_id,
              created_at: now,
              updated_at: now,
              _synced: false,
              bill_id: originalItem.bill_id,
              action: 'item_modified',
              field_changed: field,
              old_value: oldValueDisplay !== 'empty' ? oldValueDisplay : null,
              new_value: newValueDisplay !== 'empty' ? newValueDisplay : null,
              change_reason: generatedReason,
              changed_by: updatedBy,
              ip_address: null,
              user_agent: null
            });
          }
        }
      }
    });
  }

  /**
   * Remove a line item with audit trail
   */
  async removeBillLineItem(
    lineItemId: string,
    removedBy: string
  ): Promise<void> {
    const lineItem = await this.bill_line_items.get(lineItemId);
    if (!lineItem) throw new Error('Line item not found');

    const now = new Date().toISOString();

    await this.transaction('rw', [this.bill_line_items, this.bill_audit_logs, this.products], async () => {
      // Soft delete the line item
      await this.bill_line_items.update(lineItemId, {
        _deleted: true,
        updated_at: now,
        _synced: false
      });

      // Resolve product name for audit log
      const product = await this.products.get(lineItem.product_id);
      const productName = product?.name || 'Unknown Product';
      
      // Create audit log with descriptive reason
      const generatedReason = `Removing line item: ${productName} (Qty: ${lineItem.quantity}, Price: ${lineItem.unit_price})`;

      await this.bill_audit_logs.add({
        id: uuidv4(),
        store_id: lineItem.store_id,
        branch_id: lineItem.branch_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: lineItem.bill_id,
        action: 'item_removed',
        field_changed: 'line_items',
        old_value: JSON.stringify(lineItem),
        new_value: null,
        change_reason: generatedReason,
        changed_by: removedBy,
        ip_address: null,
        user_agent: null
      });
    });
  }

  /**
   * Update bill line item totals after modification
   * Note: Bill totals (subtotal, total_amount, amount_due) are now computed dynamically,
   * not stored in the database
   */
  async updateBillsForLineItem(lineItemId: string): Promise<void> {
    try {
      // Find the bill line item
      const lineItem = await this.bill_line_items.get(lineItemId);
      if (!lineItem) {
        console.warn('Bill line item not found for update:', lineItemId);
        return;
      }

      // Update the line item totals
      await this.bill_line_items.update(lineItemId, {
        line_total: lineItem.quantity * lineItem.unit_price,
        received_value: lineItem.quantity * lineItem.unit_price,
        _synced: false
      });

      console.log(`Updated bill line item ${lineItemId}`);
    } catch (error) {
      console.error('Error updating bill line item:', error);
    }
  }
}

// Singleton pattern: ensure only one database instance exists
let dbInstance: POSDatabase | null = null;

/**
 * Get the singleton database instance
 * This ensures only one POSDatabase instance exists across the entire application
 */
export function getDB(): POSDatabase {
  if (!dbInstance) {
    dbInstance = new POSDatabase();
  }
  return dbInstance;
}

/**
 * Clears all Dexie tables without deleting the database. Used only by sync parity baseline tests
 * (see apps/store-app/tests/sync-parity). Must not call `db.delete()` — `syncService` holds a
 * module-scope reference from the first `getDB()`; deleting the DB would close it and break sync.
 */
export async function resetDbSingletonForTests(): Promise<void> {
  const db = getDB();
  const names = db.tables.map((t) => t.name);
  if (names.length === 0) return;
  await db.transaction('rw', names, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}

// Re-export Bill type for convenience
export type { Bill } from '../types';



  // Hook testing function removed - hooks no longer used for sales

 

// Export utility functions
export const createId = () => uuidv4();

export const createBaseEntity = (storeId: string, data: Partial<BaseEntity> = {}): Partial<BaseEntity> => {
  const now = new Date().toISOString();
  // Ensure ID is always valid - use provided ID only if it's valid, otherwise generate one
  const providedId = data.id && typeof data.id === 'string' && data.id.trim() !== '' ? data.id : null;
  const finalId = providedId || createId();
  
  return {
    ...data,
    id: finalId, // Ensure ID is always set correctly
    store_id: storeId,
    created_at: now,
    updated_at: now,
    _synced: false
  };
};