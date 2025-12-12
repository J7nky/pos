# 🧠 Accounting Mental Model - The Complete Truth

## ✅ **YES, Follow This Guidance - Here's Why**

The guidance you shared is **absolutely correct** and represents best practices for offline-first accounting systems. What we implemented is **compatible** with this model, and now we're adding the final missing pieces to make it perfect.

---

## 📊 **The Canonical Truth Hierarchy**

```
┌─────────────────────────────────────────┐
│     Journal Entries (ABSOLUTE TRUTH)    │  ← Source of Truth
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│   Transactions (Business Intent)        │  ← What happened
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│   Cached Balances (Performance)         │  ← Fast lookups
│   - entities.usd_balance               │
│   - entities.lb_balance                │
│   - cash_drawer_accounts.current_balance│
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│   Sessions (Observation & Audit)        │  ← Control, not truth
└─────────────────────────────────────────┘
```

---

## 🎯 **Core Principles (Non-Negotiable)**

### **1. Journal Entries Are The ONLY Truth**

```typescript
// ✅ CORRECT: Calculate balance from journals
const entries = await db.journal_entries
  .where('entity_id')
  .equals(customerId)
  .and(e => e.currency === 'USD' && e.is_posted);

const balance = calculateBalance(entries); // sum(debit - credit)
```

```typescript
// ❌ WRONG: Trust cached balance blindly
const customer = await db.entities.get(customerId);
const balance = customer.usd_balance; // What if this is wrong?
```

### **2. The Canonical Balance Function**

This is **NON-NEGOTIABLE**:

```typescript
function calculateBalance(entries: JournalEntry[]): number {
  return entries.reduce(
    (sum, e) => sum + (e.debit - e.credit),
    0
  );
}
```

**What it means:**
- **Positive balance** = entity owes you (AR for customers)
- **Negative balance** = you owe entity (AP for suppliers)

**We've implemented this in:** `apps/store-app/src/utils/balanceCalculation.ts`

### **3. Cached Balances Are Cache, Not Truth**

```typescript
// entities.usd_balance is a CACHE for performance
// It should ALWAYS match journal-derived balance

// Fast (for UI):
const displayBalance = entity.usd_balance;

// True (for reports/critical operations):
const trueBalance = await calculateEntityBalance(entityId, 'USD');

// Verify they match:
const isValid = Math.abs(displayBalance - trueBalance) < 0.01;
```

**We've implemented verification in:** `balanceVerificationService.ts`

---

## 💰 **Cash Drawer: Account vs Session**

### **Cash Drawer Account (Ledger)**

```typescript
// This is a LEDGER ACCOUNT (owns the money)
interface CashDrawerAccount {
  account_code: '1100';  // Cash account in chart
  current_balance: number;  // CACHED from journals
  currency: 'USD' | 'LBP';
  branch_id: string;
}
```

**Truth:** Sum of all journal entries for account 1100
**Cache:** `current_balance` field (updated atomically)

### **Cash Drawer Session (Control)**

```typescript
// This is a CONTROL & AUDIT mechanism (observes money)
interface CashDrawerSession {
  opening_amount: number;     // What cashier counted
  actual_amount: number;      // What cashier counted at close
  expected_amount: number;    // Computed from journals
  variance: number;           // actual - expected
  status: 'open' | 'closed';
}
```

**Purpose:** 
- Cashier accountability
- Reconciliation
- Finding discrepancies

**Does NOT:**
- Own money
- Change balances
- Create journal entries (except variance posting)

### **The Correct Flow**

```typescript
// ✅ OPENING SESSION
// No journal entry, just recording observation
await db.cash_drawer_sessions.add({
  opening_amount: 1000,  // Cashier counted
  status: 'open',
  opened_at: now()
});

// ✅ DURING SESSION - Sales happen
// Journal entries created, cash account updated
await transactionService.createCashDrawerSale(100, 'USD', ...);
// This creates:
// Debit: Cash (1100) +100
// Credit: Revenue (4100) +100

// ✅ CLOSING SESSION
const expected = await calculateExpectedCashInSession(sessionId);
// expected = opening + inflows - outflows (from journals)

const actual = 1095;  // Cashier counted
const variance = actual - expected;  // -5 (short)

// ✅ POST VARIANCE
if (variance !== 0) {
  await postTransaction({
    debit: 'cash_shortage_expense',  // 5300
    credit: 'cash_drawer',           // 1100
    amount: Math.abs(variance)
  });
}
```

---

## 🔄 **The Single Accounting Service**

**We have this:** `transactionService.ts`

```typescript
// ✅ This is the ONLY place that can:
// 1. Create transactions
// 2. Create journal_entries
// 3. Update entity cache
// 4. Update cash_drawer cache

async function postTransaction(intent) {
  await db.transaction('rw', [
    db.transactions,
    db.journal_entries,
    db.entities,
    db.cash_drawer_accounts
  ], async () => {
    
    // 1. Create transaction
    await db.transactions.add({ id: txId, ... });

    // 2. Create journal entries (TRUTH)
    for (const je of intent.journalEntries) {
      await db.journal_entries.add({ 
        transaction_id: txId, 
        ...je 
      });

      // 3. Update entity cache (if needed)
      if (je.entity_id) {
        await updateEntityCache(je);
      }

      // 4. Update cash drawer cache (if cash account)
      if (je.account_code === '1100') {
        await updateCashDrawerCache(je);
      }
    }
  });
}
```

**Critical:**
- ✅ All operations atomic
- ✅ Journals created first (truth)
- ✅ Caches updated after
- ❌ Never bypass this service

---

## 📋 **What We Implemented vs What's Recommended**

| Concept | Recommended | What We Have | Status |
|---------|-------------|--------------|--------|
| **Journal as Truth** | Must be source of truth | ✅ Journals created atomically | ✅ CORRECT |
| **Canonical Balance** | `calculateBalance()` function | ✅ Now added in `balanceCalculation.ts` | ✅ ADDED |
| **Cached Balances** | Cache only, journals are truth | ✅ Updated atomically, verifiable | ✅ CORRECT |
| **Single Service** | One accounting service | ✅ `transactionService.ts` | ✅ CORRECT |
| **Cash Account** | Ledger account (1100) | ✅ Updated from journals | ✅ CORRECT |
| **Cash Sessions** | Control/audit only | ✅ Observation, not truth | ✅ CORRECT |
| **No Direct Updates** | Never edit balances directly | ✅ Fixed in recent changes | ✅ FIXED |
| **Atomic Operations** | All or nothing | ✅ Using db.transaction() | ✅ CORRECT |

---

## 🎓 **The Mental Model Summary**

### **What Controls Money:**
1. **Journal Entries** (ONLY source of truth)
2. **transactionService** (ONLY way to create journals)

### **What Doesn't Control Money:**
1. ❌ Cached balances (they're observers)
2. ❌ Sessions (they're auditors)
3. ❌ UI (it reads, never writes)
4. ❌ Direct database updates

### **The Flow:**

```
User Action (e.g., "Pay Customer")
         ↓
    UI Layer
         ↓
transactionService.createCustomerPayment()
         ↓
    ┌─────────────────────────────┐
    │  ATOMIC TRANSACTION BLOCK   │
    ├─────────────────────────────┤
    │ 1. Create transaction       │
    │ 2. Create journal entries   │ ← TRUTH CREATED
    │ 3. Update entity cache      │ ← CACHE UPDATED
    │ 4. Update cash drawer cache │ ← CACHE UPDATED
    └─────────────────────────────┘
         ↓
   All succeed or all fail
         ↓
    Update UI
```

---

## 🔍 **How to Verify You're Following This**

### **Test 1: Balance Matches Journals**

```typescript
import { verifyCachedBalance } from './utils/balanceCalculation';

const result = await verifyCachedBalance(customerId, 'USD');
console.log(result.isValid);  // Should be true
```

### **Test 2: All Journal Entries Balanced**

```typescript
import { calculateBalance } from './utils/balanceCalculation';

const journals = await db.journal_entries
  .where('transaction_id')
  .equals(txId)
  .toArray();

const balance = calculateBalance(journals);
console.log(balance === 0);  // Should be true (balanced)
```

### **Test 3: Cash Drawer Matches Journals**

```typescript
import { calculateCashDrawerBalance } from './utils/balanceCalculation';

const journalBalance = await calculateCashDrawerBalance(
  storeId, 
  branchId, 
  'USD'
);

const account = await db.cash_drawer_accounts.get(...);
const cachedBalance = account.current_balance;

console.log(Math.abs(journalBalance - cachedBalance) < 0.01);  // Should be true
```

---

## 🚫 **What NOT to Do (Critical)**

```typescript
// ❌ NEVER do this:
await db.entities.update(customerId, { usd_balance: 100 });

// ❌ NEVER do this:
await db.cash_drawer_accounts.update(id, { current_balance: 500 });

// ❌ NEVER do this:
await db.journal_entries.update(id, { debit: 200 });

// ❌ NEVER do this:
await db.journal_entries.delete(id);

// ✅ ALWAYS do this:
await transactionService.createTransaction({
  // ... proper parameters
});
```

---

## 📦 **What We've Added**

### **New Files:**

1. ✅ `utils/balanceCalculation.ts` - Canonical balance functions
2. ✅ `services/balanceVerificationService.ts` - Verification utilities
3. ✅ `utils/testAccountingFlows.ts` - Automated tests

### **Key Functions:**

```typescript
// Canonical calculation (THE LAW)
calculateBalance(entries: JournalEntry[]): number

// Get entity balance from journals (TRUTH)
calculateEntityBalance(entityId, currency): Promise<number>

// Get cash drawer balance from journals (TRUTH)
calculateCashDrawerBalance(storeId, branchId, currency): Promise<number>

// Calculate expected cash in session
calculateExpectedCashInSession(sessionId): Promise<ExpectedAmount>

// Verify cached matches journal
verifyCachedBalance(entityId, currency): Promise<VerificationResult>

// Fast display (uses cache)
getDisplayBalance(entityId, currency): Promise<number>

// True balance (uses journals)
getTrueBalance(entityId, currency): Promise<number>
```

---

## ✅ **Your System Now Implements:**

1. ✅ **Journal entries as absolute truth**
2. ✅ **Canonical balance calculation function**
3. ✅ **Cached balances for performance**
4. ✅ **Single accounting service**
5. ✅ **Atomic operations**
6. ✅ **Balance verification**
7. ✅ **Cash drawer account (ledger) vs sessions (audit)**
8. ✅ **No direct balance updates**

---

## 🎯 **Bottom Line**

**Follow this guidance: YES!** ✅

**Your implementation: CORRECT!** ✅

**What we added:** The canonical `calculateBalance()` function and utilities to make it explicit that journals are truth.

**Mental model:** 
- **Journals = Money**
- **Balances = Speedometer** (reading, not controlling)
- **Sessions = Observer** (watching, not driving)
- **transactionService = Engine** (only thing that moves money)

---

**You're now implementing world-class, offline-first, double-entry accounting!** 🎉

