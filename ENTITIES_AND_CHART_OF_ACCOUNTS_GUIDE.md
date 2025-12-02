# Entities and Chart of Accounts Usage Guide

This guide explains where and how to use the `entities` and `chart_of_accounts` tables in the POS system.

## Table Overview

### 1. **Entities Table** (`entities`)
A unified table that replaces separate `customers`, `suppliers`, and `employees` tables. It provides a single abstraction for all business entities.

**Purpose:**
- Store all business entities (customers, suppliers, employees, cash, internal operations)
- Maintain cached balances (USD and LBP)
- Support entity-specific data via JSON fields (`customer_data`, `supplier_data`)

**Key Fields:**
- `entity_type`: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal'
- `entity_code`: Unique identifier per store (e.g., 'CUST-001', 'SUPP-001', 'CASH-CUST')
- `lb_balance` / `usd_balance`: Cached balances for quick access
- `is_system_entity`: True for system entities like "Cash Customer", "Internal", etc.

### 2. **Chart of Accounts Table** (`chart_of_accounts`)
Configuration table that defines all accounting accounts and their rules.

**Purpose:**
- Define all accounting accounts (Assets, Liabilities, Equity, Revenue, Expenses)
- Specify which accounts require entity tracking (`requires_entity`)
- Control account activation status

**Key Fields:**
- `account_code`: 4-digit code (e.g., '1100' = Cash, '1200' = Accounts Receivable)
- `account_type`: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
- `requires_entity`: Boolean indicating if account must have an `entity_id` in journal entries

---

## Where to Use These Tables

### 1. **Store Initialization** (Admin App)

**Location:** `apps/admin-app/src/services/storeService.ts`

When creating a new store, you must initialize both tables:

```typescript
// After creating a store
await initializeAccountingFoundation(storeId);
```

This function:
1. Creates system entities (Cash Customer, Internal, Bank, etc.) via `create_system_entities_for_store()` RPC
2. Creates default chart of accounts via `create_default_chart_of_accounts()` RPC

**System Entities Created:**
- `CASH-CUST`: Cash Customer (for cash sales)
- `CASH-SUPP`: Cash Supplier (for cash purchases)
- `SALARIES`: Employee salaries entity
- `INTERNAL`: Internal operations
- `OWNER`: Owner equity
- `BANK`: Bank account
- `TAX`: Tax authority
- `UTILITIES`: Utilities provider
- `RENT`: Rent provider

**Default Chart of Accounts:**
- Assets: 1100 (Cash), 1200 (AR), 1300 (Inventory), etc.
- Liabilities: 2100 (AP), 2200 (Accrued Expenses), etc.
- Equity: 3100 (Owner's Equity), 3200 (Retained Earnings)
- Revenue: 4100 (Sales), 4200 (Service Revenue), etc.
- Expenses: 5100 (COGS), 5200 (Salaries), etc.

---

### 2. **Querying Entities** (Store App)

**Location:** `apps/store-app/src/services/entityQueryService.ts`

Use `EntityQueryService` instead of directly querying `customers` or `suppliers` tables:

```typescript
import { entityQueryService } from '../services/entityQueryService';

// Get all customers
const customers = await entityQueryService.getCustomers(storeId, {
  includeInactive: false,
  includeSystemEntities: false,
  includeCurrentBalance: true
});

// Get all suppliers
const suppliers = await entityQueryService.getSuppliers(storeId);

// Get entities by type
const employees = await entityQueryService.getEntitiesByType(storeId, 'employee');

// Search entities
const results = await entityQueryService.searchEntities(storeId, 'John', {
  limit: 20
});

// Get entity with balance report
const report = await entityQueryService.getEntityBalanceReport(storeId, entityId);
```

**Key Methods:**
- `getCustomers()` - Get all customer entities
- `getSuppliers()` - Get all supplier entities
- `getEmployees()` - Get all employee entities
- `getEntitiesByType()` - Get entities by type with filters
- `getEntityById()` - Get single entity with balance
- `searchEntities()` - Search across all entity types
- `getEntityBalanceReport()` - Get detailed balance report per account
- `getEntitiesWithBalances()` - Get entities with outstanding balances

---

### 3. **Creating Journal Entries** (Store App)

**Location:** `apps/store-app/src/services/journalService.ts`

When creating financial transactions, you must:
1. Get the entity ID from the `entities` table
2. Get account codes from the `chart_of_accounts` table
3. Create journal entries with both references

```typescript
import { journalService } from '../services/journalService';
import { accountingInitService } from '../services/accountingInitService';

// Get entity (customer, supplier, or system entity)
const entity = await db.entities.get(entityId);
if (!entity) {
  throw new Error('Entity not found');
}

// Get account info from chart of accounts
const debitAccount = await accountingInitService.getAccount(storeId, '1100'); // Cash
const creditAccount = await accountingInitService.getAccount(storeId, '4100'); // Sales

// Create journal entry (creates both debit and credit)
await journalService.createJournalEntry({
  transactionId: transaction.id,
  debitAccount: '1100',  // Account code from chart_of_accounts
  creditAccount: '4100', // Account code from chart_of_accounts
  amount: 100.00,
  currency: 'USD',
  entityId: entity.id,   // Entity ID from entities table
  description: 'Sale to customer',
  postedDate: '2024-01-15'
});
```

**Important Rules:**
- Every journal entry **MUST** have an `entity_id` (never null)
- Account codes must exist in `chart_of_accounts` for the store
- If `requires_entity = true` in chart of accounts, the entity_id must be valid
- Journal entries are created in pairs (debit + credit) with the same `transaction_id`

---

### 4. **Transaction Service Integration** (Store App)

**Location:** `apps/store-app/src/services/transactionService.ts`

The transaction service automatically creates journal entries when transactions are created:

```typescript
// In transactionService.ts - createJournalEntriesForTransaction()
private async createJournalEntriesForTransaction(transaction: Transaction): Promise<void> {
  // Get entity ID (from customer_id, supplier_id, or system entity)
  const entityId = getEntityCodeForTransaction(transaction.category, providedEntityCode);
  
  // Get account mapping for transaction category
  const accountMapping = getAccountMapping(transaction.category);
  
  // Create journal entry
  await journalService.createJournalEntry({
    transactionId: transaction.id,
    debitAccount: accountMapping.debitAccount,   // From chart_of_accounts
    creditAccount: accountMapping.creditAccount, // From chart_of_accounts
    amount: transaction.amount,
    currency: transaction.currency,
    entityId,  // From entities table
    description: getJournalDescription(...)
  });
}
```

---

### 5. **Account Validation** (Store App)

**Location:** `apps/store-app/src/services/accountingInitService.ts`

Before creating journal entries, validate that accounts exist:

```typescript
import { accountingInitService } from '../services/accountingInitService';

// Validate accounting setup is initialized
await accountingInitService.validateAccountingSetup(storeId);

// Get account by code
const account = await accountingInitService.getAccount(storeId, '1100');
if (!account) {
  throw new Error('Account 1100 (Cash) not found');
}

// Get all active accounts
const allAccounts = await accountingInitService.getAccounts(storeId);
```

**Key Methods:**
- `isInitialized()` - Check if store has accounting foundation set up
- `validateAccountingSetup()` - Throw error if not initialized
- `getAccount()` - Get account by code
- `getAccounts()` - Get all active accounts
- `getSystemEntityByType()` - Get system entity (Cash, Internal, etc.)
- `getEntities()` - Get all entities (optionally filtered by type)

---

### 6. **Balance Queries** (Store App)

**Location:** `apps/store-app/src/services/snapshotService.ts` and `entityQueryService.ts`

Use entities table for cached balances, but use balance snapshots for historical queries:

```typescript
// Quick current balance (from entities table cache)
const entity = await db.entities.get(entityId);
const currentBalance = entity.usd_balance; // Cached value

// Historical balance (from balance_snapshots)
const historicalBalance = await snapshotService.getHistoricalBalance(
  storeId,
  '1200', // Account code (AR)
  entityId,
  '2024-01-01' // As of date
);

// Entity balance report (across all accounts)
const report = await entityQueryService.getEntityBalanceReport(
  storeId,
  entityId,
  '2024-01-15' // Optional: as of date
);
```

---

### 7. **Data Sync** (Store App)

**Location:** `apps/store-app/src/services/syncService.ts`

Both tables are synced between Supabase and local Dexie database:

```typescript
// Sync order matters:
// 1. chart_of_accounts (must sync first)
// 2. entities (must sync before journal_entries)
// 3. journal_entries (references both tables)
// 4. balance_snapshots (references entities)
```

**Sync Dependencies:**
- `chart_of_accounts` depends on: `stores`
- `entities` depends on: `stores`
- `journal_entries` depends on: `stores`, `entities`, `chart_of_accounts`
- `balance_snapshots` depends on: `stores`, `entities`

---

### 8. **Offline Data Context** (Store App)

**Location:** `apps/store-app/src/contexts/OfflineDataContext.tsx`

The context loads both tables for offline access:

```typescript
// In OfflineDataContext.tsx
const [entities, setEntities] = useState<any[]>([]);
const [chartOfAccounts, setChartOfAccounts] = useState<any[]>([]);

// Loaded during refreshData()
const entitiesData = await crudHelper.getEntitiesByStoreBranch('entities', storeId, branchId);
const chartOfAccountsData = await crudHelper.getEntitiesByStore('chart_of_accounts', storeId);

setEntities(entitiesData || []);
setChartOfAccounts(chartOfAccountsData || []);
```

---

## Common Usage Patterns

### Pattern 1: Get System Entity for Cash Transaction

```typescript
import { accountingInitService } from '../services/accountingInitService';

// Get Cash Customer entity (for cash sales)
const cashEntity = await accountingInitService.getSystemEntityByType(storeId, 'cash');
if (!cashEntity) {
  throw new Error('Cash Customer entity not initialized');
}

// Use in journal entry
await journalService.createJournalEntry({
  transactionId: transaction.id,
  debitAccount: '1100', // Cash
  creditAccount: '4100', // Sales
  amount: 100.00,
  currency: 'USD',
  entityId: cashEntity.id, // System entity
  description: 'Cash sale'
});
```

### Pattern 2: Create Customer Entity from Customer Record

```typescript
// When creating a customer, also create entity
const customerEntity: Entity = {
  id: createId(),
  store_id: storeId,
  branch_id: branchId,
  entity_type: 'customer',
  entity_code: `CUST-${customerNumber}`,
  name: customer.name,
  phone: customer.phone,
  lb_balance: 0,
  usd_balance: 0,
  is_system_entity: false,
  is_active: true,
  customer_data: {
    lb_max_balance: customer.lb_max_balance,
    credit_limit: customer.credit_limit
  },
  supplier_data: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  _synced: false
};

await db.entities.add(customerEntity);
```

### Pattern 3: Validate Account Before Use

```typescript
// Before creating journal entry, validate account exists
const account = await accountingInitService.getAccount(storeId, accountCode);
if (!account) {
  throw new Error(`Account ${accountCode} not found in chart of accounts`);
}

if (!account.is_active) {
  throw new Error(`Account ${accountCode} is not active`);
}

// Check if account requires entity
if (account.requires_entity && !entityId) {
  throw new Error(`Account ${accountCode} requires an entity_id`);
}
```

### Pattern 4: Query Entities with Filters

```typescript
import { entityQueryService } from '../services/entityQueryService';

// Get customers with outstanding balances
const customersWithBalances = await entityQueryService.getEntitiesWithBalances(
  storeId,
  'customer',
  {
    minimumBalance: 10.00,
    currency: 'USD'
  }
);

// Get entities by type with search
const suppliers = await entityQueryService.getEntitiesByType(storeId, 'supplier', {
  searchTerm: 'ABC',
  includeInactive: false,
  includeCurrentBalance: true,
  limit: 50
});
```

---

## Important Rules and Constraints

### Entities Table Rules:
1. **Entity Code Uniqueness**: `entity_code` must be unique per store (enforced by database constraint)
2. **System Entities**: System entities (`is_system_entity = true`) are created during store initialization and should not be deleted
3. **Balance Caching**: `lb_balance` and `usd_balance` are cached values. Use `balance_snapshots` for historical queries
4. **Entity Types**: Only use valid entity types: 'customer', 'supplier', 'employee', 'cash', 'internal'

### Chart of Accounts Rules:
1. **Account Code Format**: Must be 4-digit number (e.g., '1100', '1200')
2. **Account Type Ranges**:
   - Assets: 1000-1999
   - Liabilities: 2000-2999
   - Equity: 3000-3999
   - Revenue: 4000-4999
   - Expenses: 5000-5999
3. **Requires Entity Flag**: If `requires_entity = true`, all journal entries for this account must have a valid `entity_id`
4. **Account Uniqueness**: `account_code` must be unique per store

### Journal Entry Rules:
1. **Entity ID Required**: Every journal entry MUST have an `entity_id` (never null)
2. **Account Validation**: Account codes must exist in `chart_of_accounts` for the store
3. **Double Entry**: Journal entries are created in pairs (debit + credit) with same `transaction_id`
4. **Entity Type Match**: The `entity_type` in journal entry should match the entity's `entity_type`

---

## Migration Notes

### From Old System:
- **Customers Table**: Use `entities` table with `entity_type = 'customer'`
- **Suppliers Table**: Use `entities` table with `entity_type = 'supplier'`
- **Employees Table**: Use `entities` table with `entity_type = 'employee'`

### Query Migration:
```typescript
// OLD: Direct customer query
const customers = await db.customers.where('store_id').equals(storeId).toArray();

// NEW: Use entityQueryService
const customers = await entityQueryService.getCustomers(storeId);
```

---

## Files Reference

### Key Files:
- **Types**: `apps/store-app/src/types/accounting.ts`
- **Entity Service**: `apps/store-app/src/services/entityQueryService.ts`
- **Journal Service**: `apps/store-app/src/services/journalService.ts`
- **Accounting Init**: `apps/store-app/src/services/accountingInitService.ts`
- **Constants**: 
  - `apps/store-app/src/constants/chartOfAccounts.ts`
  - `apps/store-app/src/constants/systemEntities.ts`
- **Database Schema**: `apps/store-app/src/lib/db.ts`
- **Store Initialization**: `apps/admin-app/src/services/storeService.ts`

---

## Summary

**Entities Table:**
- Use for all customer/supplier/employee queries
- Use `EntityQueryService` instead of direct table queries
- Always reference entities by ID in journal entries
- System entities are created during store initialization

**Chart of Accounts:**
- Use to validate account codes before creating journal entries
- Use `accountingInitService.getAccount()` to retrieve account info
- Check `requires_entity` flag before creating journal entries
- Default accounts are created during store initialization

**Journal Entries:**
- Always require both `entity_id` (from entities) and `account_code` (from chart_of_accounts)
- Created automatically by transaction service
- Must validate both references exist before creation

