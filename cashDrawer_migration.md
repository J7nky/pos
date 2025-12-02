Cash Drawer Refactor Roadmap
Aligning cashDrawerUpdateService with unified transactionService

0. Objectives
Single source of truth for all transactions: 
transactionService.createTransaction
 (+ helpers).
Cash drawer logic split cleanly:
Orchestration (locks, sessions, validations, UI events) in cashDrawerUpdateService.
Financial & accounting writes (transactions, balances, journals, cash drawer session amounts) in transactionService.
Remove legacy paths that:
Write directly to db.transactions.
Manually adjust cash_drawer_accounts.current_balance or sessions.
1. Delete updateCashDrawerFor* functions in cashDrawerUpdateService*
Target functions (current names):

updateCashDrawerForTransaction
updateCashDrawerForSale
updateCashDrawerForCustomerPayment
updateCashDrawerForExpense
updateCashDrawerForRefund
1.1 Refactor call sites before deletion
[task] Identify all usages:
updateCashDrawerForSale(...)
updateCashDrawerForCustomerPayment(...)
updateCashDrawerForExpense(...)
updateCashDrawerForRefund(...)
[task] For each usage, replace with a call to a new API that will:
Build a 
TransactionContext
 (with userId, storeId, branchId).
Call transactionService (
createCashDrawerSale
, 
createCustomerPayment
, etc.) instead of 
CashDrawerUpdateService
's old methods.
Still go through 
CashDrawerUpdateService
 for:
Locking
Session/account creation & validation
Insufficient funds checks
UI notifications
Only after all call sites are migrated, delete the old functions.

2. Responsibilities that stay in cashDrawerUpdateService
After refactor, 
CashDrawerUpdateService
 should be a thin but smart orchestrator.

2.1 Keep: 
acquireOperationLock
[keep] 
acquireOperationLock(storeId, operation)
 remains as-is:
Ensures no overlapping cash drawer operations per store.
[usage change] Wrap all public cash-drawer APIs (sale/payment/expense/refund/session open/close) in this lock.
2.2 Keep: 
getOrCreateCashDrawerAccount
[keep] This continues to:
Ensure there is a cash drawer account per (storeId, branchId).
[refine] Make sure it becomes the only place that knows how to:
Locate/create the account.
Initialize current_balance if required (or rely fully on calculated balance).
2.3 Keep: 
getOrCreateCashDrawerSession
 (+ allowAutoSessionOpen)
[keep] Logic to:
Get current active session, or
Auto-open a session if allowAutoSessionOpen is true.
[change] Instead of directly updating balances here:
Use it only to ensure a valid active session exists before transactionService runs.
2.4 Keep: Insufficient funds validation
[keep] This is currently done by computing:
previousBalance from the account
balanceChange based on transaction type
Failing if balanceChange < 0 && |balanceChange| > previousBalance.
[refactor] Move this logic into a helper in 
CashDrawerUpdateService
:
e.g. validateSufficientCash(previousBalance, balanceChange): boolean | error.
[flow] Validate before calling 
transactionService.createTransaction(...)
.
If it fails, do not call transactionService.
2.5 Keep: 
notifyCashDrawerUpdate
[keep] This function dispatches cash-drawer-updated events with:
storeId, newBalance, transactionId, timestamp.
[change] Instead of using internal newBalance from manual calculations:
Read cashDrawerImpact from 
TransactionResult
 (see below).
Or re-query 
getCurrentCashDrawerBalance(...)
 after transaction for a canonical number.
3. transactionService owns all actual transaction & cash-drawer writes
3.1 Use 
createTransaction
 or helpers for all scenarios
For each logical operation:

Cash sale
Use 
transactionService.createCashDrawerSale(...)
.
Customer payment to cash drawer
Use 
transactionService.createCustomerPayment(...)
 with updateCashDrawer: true.
Supplier payment from cash drawer
Use 
transactionService.createSupplierPayment(...)
 with updateCashDrawer: true.
Cash drawer expense
Use 
transactionService.createCashDrawerExpense(...)
.
Refund
Either:
Add createCashDrawerRefund(...) helper, or
Call 
createTransaction
 directly with TRANSACTION_CATEGORIES.CASH_DRAWER_REFUND (or a dedicated category).
3.2 Ensure context has branchId
[task] Everywhere you build a 
TransactionContext
 for cash drawer:
Populate context.branchId (you already started adding branchId to cash drawer flows).
createTransaction
 uses context.branchId to call:
ts
updateCashDrawerAtomic(transaction, context.storeId, context.branchId);
3.3 Remove manual db.transactions.add in 
CashDrawerUpdateService
[task] In 
updateCashDrawerForTransaction
:
Delete the db.transactions.add(...) path (sale/refund/other).
Replace with a call to the appropriate transactionService method.
This enforces the rule “ALL transaction operations MUST go through this service”.
3.4 Use cashDrawerImpact from 
TransactionResult
createTransaction
 already returns:
ts
cashDrawerImpact?: {
  previousBalance: number;
  newBalance: number;
};
[task] In cashDrawerUpdateService, after transactionService call:
Read result.cashDrawerImpact.
If present, pass cashDrawerImpact.newBalance into 
notifyCashDrawerUpdate(...)
.
Optionally fall back to 
getCurrentCashDrawerBalance(...)
 if cashDrawerImpact is missing.
4. Code-cleaning & optimization opportunities
Below are concrete places to clean once the new architecture is in place.

4.1 Remove legacy / duplicate cash-drawer logic
[clean] From 
CashDrawerUpdateService
:
Direct writes to db.transactions.
Direct writes to cash_drawer_accounts.current_balance for transaction effects (only keep reconciliation in 
getCurrentCashDrawerBalance
).
Any manual “sale vs refund vs payment” transaction type/category branching that now belongs to transactionService.
[clean] In transactionService:
Mark 
updateCashDrawerForTransaction(...)
 as unused and remove if no callers remain (it’s deprecated already).
4.2 Normalize reference generation
Currently:
cashDrawerUpdateService uses generateSaleReference, generatePaymentReference, generateExpenseReference, generateRefundReference.
transactionService also generates references internally (
generateReferenceForCategory
).
[task] Strategy:
Prefer transactionService to generate references automatically based on category.
Remove direct reference generation from cashDrawerUpdateService except where you need a specific external reference (e.g. bill number); pass that as metadata instead of duplicating reference logic.
4.3 Remove console debug noise and magic strings
[clean] Delete or downgrade to debug:
console.log("storeId 675443:::");
Any temporary logs like console.log("Branch Id Value: ", branchId) once branch flow is stable.
[task] Keep only:
High-signal logs (errors, important state changes).
Structured logs already present in transactionService.
4.4 Consolidate balance calculations
Today you have:
cashDrawerUpdateService computing balances from cash_drawer_accounts + transactions.
transactionService.updateCashDrawerAtomic
 adjusting cash_drawer_sessions.current_amount.
calculateBalanceFromTransactions
 as the authoritative recomputation.
[direction]
Treat transactions + session opening amount as the true source, with cash_drawer_sessions.current_amount as a cached value.
Keep 
calculateBalanceFromTransactions
 for reconciliation/verification only.
Avoid having separate “manual” balance paths anywhere else.
4.5 Type & metadata alignment
[task] Confirm Transaction.metadata contains any extra cash-drawer info you care about:
e.g. paymentMethod, billNumber, sessionId.
Store these as metadata on the transaction rather than separate ad‑hoc fields in multiple tables/services.
5. Suggested implementation order
Phase 1 – Plumbing
Ensure all cash-flows have branchId available.
Make sure 
TransactionContext
 always has branchId for cash drawer operations.
Phase 2 – Service boundary
Migrate 
updateCashDrawerForSale
, 
updateCashDrawerForCustomerPayment
, 
updateCashDrawerForExpense
, 
updateCashDrawerForRefund
 to call transactionService instead of doing db writes.
Keep orchestration (locks, sessions, validations, notifications) in cashDrawerUpdateService.
Phase 3 – Cleanup
Remove direct db.transactions.add from 
CashDrawerUpdateService
.
Remove 
updateCashDrawerForTransaction
 and all now-unused helper functions.
Remove deprecated 
updateCashDrawerForTransaction
 from transactionService if unused.
Phase 4 – Optimization
Simplify reference handling to use transactionService defaults.
Remove stray debug logs and redundant balance calculations.
Add/adjust tests around:
Insufficient funds rejection.
Session auto-open.
Correct cash-drawer balances and events.
If you want, I can next draft a concrete “target” version of 
updateCashDrawerForSale
 using 
transactionService.createCashDrawerSale
 (with the locking/session/validation preserved) so you have a template to apply to the other flows.