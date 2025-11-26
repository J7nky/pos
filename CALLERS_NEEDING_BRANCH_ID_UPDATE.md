# All Callers Needing branch_id Parameter

## ✅ Summary of Changes Made

### Database Layer (db.ts) - COMPLETE ✅
All methods updated with `branchId` parameter:
- ✅ `getCashDrawerAccount(storeId, branchId)`
- ✅ `getCurrentCashDrawerSession(storeId, branchId)`
- ✅ `openCashDrawerSession(storeId, branchId, accountId, amount, user)`
- ✅ `getCurrentCashDrawerStatus(storeId, branchId)`
- ✅ `getCashDrawerBalanceReport(storeId, branchId, startDate?, endDate?)`
- ✅ `createBillFromLineItems()` - requires `billData.branch_id`
- ✅ `updateBill()` - audit log includes `branch_id`
- ✅ `addBillLineItem()` - line item and audit log include `branch_id`

---

## 🔴 CALLERS REQUIRING UPDATES

### 1. **services/cashDrawerUpdateService.ts** - HIGH PRIORITY

#### Method: `getOrCreateCashDrawerAccount()` (Line 729-740)
```typescript
// CURRENT (Missing branchId parameter)
private async getOrCreateCashDrawerAccount(storeId: string, storeCurrency?: 'USD' | 'LBP')

// Line 731: ❌
const account = await db.getCashDrawerAccount(storeId);

// NEEDS TO BECOME:
private async getOrCreateCashDrawerAccount(storeId: string, branchId: string, storeCurrency?: 'USD' | 'LBP')

// Line 731: ✅
const account = await db.getCashDrawerAccount(storeId, branchId);
```

#### Method: `openCashDrawerSession()` (Line 81-130)
```typescript
// CURRENT (Missing branchId parameter)
public async openCashDrawerSession(
  storeId: string,
  openingAmount: number,
  openedBy: string,
  notes?: string
)

// Line 97: ❌
const existingSession = await db.getCurrentCashDrawerSession(storeId);

// Line 106: ❌
const account = await this.getOrCreateCashDrawerAccount(storeId);

// Line 115: ❌
const sessionId = await db.openCashDrawerSession(storeId, account.id, openingAmount, openedBy);

// NEEDS TO BECOME:
public async openCashDrawerSession(
  storeId: string,
  branchId: string,
  openingAmount: number,
  openedBy: string,
  notes?: string
)

// Line 97: ✅
const existingSession = await db.getCurrentCashDrawerSession(storeId, branchId);

// Line 106: ✅
const account = await this.getOrCreateCashDrawerAccount(storeId, branchId);

// Line 115: ✅
const sessionId = await db.openCashDrawerSession(storeId, branchId, account.id, openingAmount, openedBy);
```

#### Method: `calculateBalanceFromTransactions()` (Line 557-600)
```typescript
// CURRENT
private async calculateBalanceFromTransactions(storeId: string): Promise<number>

// Line 560: ❌
const currentSession = await db.getCurrentCashDrawerSession(storeId);

// NEEDS TO BECOME:
private async calculateBalanceFromTransactions(storeId: string, branchId: string): Promise<number>

// Line 560: ✅
const currentSession = await db.getCurrentCashDrawerSession(storeId, branchId);
```

#### Method: `getOrCreateCashDrawerSession()` (Line 746-778)
```typescript
// CURRENT
private async getOrCreateCashDrawerSession(
  transactionData: CashTransactionData, 
  account: any
): Promise<any>

// Line 750: ❌
let session = await db.getCurrentCashDrawerSession(transactionData.storeId);

// Line 757-760: ❌
const sessionResult = await this.openCashDrawerSession(
  transactionData.storeId,
  0,
  transactionData.createdBy,
  ...
);

// Line 770: ❌
session = await db.getCurrentCashDrawerSession(transactionData.storeId);

// NEEDS: Add branchId to CashTransactionData interface
// NEEDS: Update all calls
```

---

### 2. **services/transactionService.ts** - HIGH PRIORITY

#### Method: `updateCashDrawerAtomic()` (Line 989-1036)
```typescript
// CURRENT
private async updateCashDrawerAtomic(
  transaction: Transaction,
  storeId: string
): Promise<{ previousBalance: number; newBalance: number } | undefined>

// Lines 995-1003: ❌
const activeSession = await db.cash_drawer_sessions
  .where('store_id')
  .equals(storeId)
  .and(session => session.closed_at === null)
  .first();

// NEEDS TO BECOME:
private async updateCashDrawerAtomic(
  transaction: Transaction,
  storeId: string,
  branchId: string
): Promise<{ previousBalance: number; newBalance: number } | undefined>

// Lines 995-1003: ✅
const activeSession = await db.cash_drawer_sessions
  .where(['store_id', 'branch_id'])
  .equals([storeId, branchId])
  .and(session => session.closed_at === null)
  .first();
```

#### Callers of `updateCashDrawerAtomic()`:
- Line 220: `await this.updateCashDrawerAtomic(transaction, params.context.storeId);`
  - **Needs:** `params.context.branchId`
- Line 665: `await this.updateCashDrawerAtomic(reversalForCash, context.storeId);`
  - **Needs:** `context.branchId`
- Line 1055: `result = await this.updateCashDrawerAtomic(transaction, context.storeId);`
  - **Needs:** `context.branchId`

#### Interface Update Needed:
```typescript
// Add to TransactionContext interface
export interface TransactionContext {
  storeId: string;
  branchId: string;  // ← ADD THIS
  userId?: string;
  // ... rest
}
```

---

### 3. **contexts/OfflineDataContext.tsx** - MEDIUM PRIORITY

#### Method: `refreshCashDrawerStatus()` (Line 469-480)
```typescript
// Line 472: ❌
const status = await db.getCurrentCashDrawerStatus(storeId);

// NEEDS: Get branchId from context/state
// Line 472: ✅
const branchId = currentBranchId || (await ensureDefaultBranch(storeId));
const status = await db.getCurrentCashDrawerStatus(storeId, branchId);
```

#### Method: `getCashDrawerAccount()` (Lines 2995, 3214, 3429, 4335, 4395)
```typescript
// Multiple locations: ❌
const account = await db.getCashDrawerAccount(storeId);

// NEEDS: Get branchId from context
// ✅
const branchId = currentBranchId || (await ensureDefaultBranch(storeId));
const account = await db.getCashDrawerAccount(storeId, branchId);
```

#### Method: `openCashDrawer()` (Line 4328)
```typescript
// Line 4328: ❌
const result = await cashDrawerUpdateService.openCashDrawerSession(storeId, amount, openedBy);

// NEEDS: Pass branchId
// ✅
const branchId = currentBranchId || (await ensureDefaultBranch(storeId));
const result = await cashDrawerUpdateService.openCashDrawerSession(storeId, branchId, amount, openedBy);
```

#### Method: `getCurrentCashDrawerStatus()` (Line 4456-4459)
```typescript
// Line 4458: ❌
return await db.getCurrentCashDrawerStatus(storeId);

// NEEDS: Get branchId
// ✅
const branchId = currentBranchId || (await ensureDefaultBranch(storeId));
return await db.getCurrentCashDrawerStatus(storeId, branchId);
```

#### Method: `getCashDrawerBalanceReport()` (Line 4451-4454)
```typescript
// Line 4453: ❌
return await db.getCashDrawerBalanceReport(storeId, startDate, endDate);

// NEEDS: Get branchId
// ✅
const branchId = currentBranchId || (await ensureDefaultBranch(storeId));
return await db.getCashDrawerBalanceReport(storeId, branchId, startDate, endDate);
```

---

### 4. **pages/POS.tsx** - LOW PRIORITY (Uses context)

#### Line 711:
```typescript
// Uses context method - will work once OfflineDataContext is updated
const currentCashDrawerStatus = await raw.getCurrentCashDrawerStatus();
```
**No direct changes needed** - will automatically get branchId once context is updated.

---

### 5. **pages/Accounting.tsx** - LOW PRIORITY (Uses context)

#### Lines 60, 196, 1042, 1048:
```typescript
// Uses context methods - will work once OfflineDataContext is updated
const getCurrentCashDrawerStatus = raw.getCurrentCashDrawerStatus;
const getCashDrawerBalanceReport = raw.getCashDrawerBalanceReport;
```
**No direct changes needed** - will automatically get branchId once context is updated.

---

## 📋 **Implementation Order**

### **Phase 1: Add Branch State to Context** (Do This First!)
1. Add `currentBranchId` state to `OfflineDataContext`
2. Initialize with default branch on mount
3. Provide `setCurrentBranchId()` for branch switching

```typescript
// In OfflineDataContext.tsx
const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);

// On mount
useEffect(() => {
  if (storeId && !currentBranchId) {
    ensureDefaultBranch(storeId).then(setCurrentBranchId);
  }
}, [storeId]);

// Export in context
return (
  <OfflineDataContext.Provider value={{
    ...existingValues,
    currentBranchId,
    setCurrentBranchId
  }}>
```

### **Phase 2: Update Service Layer** (Critical Path)
1. ✅ Update `cashDrawerUpdateService.ts` methods
2. ✅ Update `transactionService.ts` methods
3. ✅ Add `branchId` to `TransactionContext` interface
4. ✅ Add `branchId` to `CashTransactionData` interface

### **Phase 3: Update Context Methods** (After services)
1. ✅ Update all `OfflineDataContext` method calls to use `currentBranchId`
2. ✅ Use `ensureDefaultBranch()` as fallback

### **Phase 4: UI Components** (Future)
- Add branch selector component
- Allow users to switch branches
- Display current branch in header

---

## 🎯 **Critical Dependencies**

### Before updating services, we need:
1. ✅ **Branch state in context** - So services can get `branchId`
2. ✅ **TransactionContext interface** - Must include `branchId`
3. ✅ **CashTransactionData interface** - Must include `branchId`

### Once services are updated:
- ✅ All context method calls will work automatically
- ✅ UI pages will work through context (no direct changes needed)
- ✅ Only need to ensure branch selection UI for multi-branch scenarios

---

## ✅ **Readiness Checklist**

### Database Layer
- ✅ Schema updated with `branch_id` indexes
- ✅ Migration v31 working
- ✅ All db methods accept `branchId` parameter
- ✅ Audit logs include `branch_id`

### Helper Utilities
- ✅ `branchHelpers.ts` created
- ✅ `ensureDefaultBranch()` working
- ✅ `validateBranch()` available

### Ready to Proceed?
- ✅ **YES** - Database layer is complete
- ✅ **YES** - Helper utilities ready
- ⚠️ **NEED** - Branch state in context (quick add)
- ⚠️ **NEED** - Update service interfaces
- ⚠️ **NEED** - Update service method signatures

---

## 💡 **Quick Start for Services**

Use this pattern in services:
```typescript
import { ensureDefaultBranch } from '../lib/branchHelpers';

// Temporary: Get branch from context or use default
const branchId = context.branchId || await ensureDefaultBranch(storeId);

// Then use in all db calls
await db.getCurrentCashDrawerSession(storeId, branchId);
```

Once context provides `branchId`, remove the fallback logic.

---

**Status:** Ready to proceed with service layer updates
**Blocker:** None - can start immediately
**Estimated Effort:** 2-3 hours for all service updates
