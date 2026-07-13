# Contracts: Inventory Loss & Shrinkage

Internal interface contracts (this is an offline-first app, so the "interfaces" are the operation module, the `OfflineDataContext` surface, and the touched services — not HTTP endpoints). Signatures follow the existing dependency-injected operation pattern (`operations/paymentOperations.ts`).

---

## 1. Operation module — `contexts/offlineData/operations/lossOperations.ts` (NEW)

```ts
export interface LossOperationDeps {
  storeId: string;
  currentBranchId: string | null;
  userProfileId: string | null;
  inventory: InventoryItem[];
  inventoryBills: inventory_bills[];
  refreshData: (scope?: RefreshScope) => Promise<void>;
  upsertTransactions: (rows: any[]) => void;
  updateUnsyncedCount: (optimisticDelta?: number) => Promise<void>;
  debouncedSync: () => void;
  i18n: { en: any; ar: any; fr: any };
  language?: string;
}

export interface RecordLossParams {
  inventoryItemId: string;              // the specific lot
  reason: 'lost' | 'spoiled';           // manual reasons only (shrinkage is auto)
  quantity: number;                     // units; MUST be > 0 and <= lot on-hand quantity
  notes?: string;
}

export interface RecordLossResult {
  success: boolean;
  lossEventId?: string;
  transactionId?: string;               // absent for commission lots
  error?: string;
}

/** Manual loss (Story 2). Validates RBAC + quantity, decrements lot quantity
 *  (and weight_remaining by nominal_unit_weight for weight lots), posts owned
 *  journal via transactionService or memo-only for commission, writes the
 *  loss event, audits, and triggers sync. Per-lot only — never FIFO. */
export function recordInventoryLoss(deps: LossOperationDeps, params: RecordLossParams): Promise<RecordLossResult>;

export interface ReverseLossParams { lossEventId: string; }

/** Reversal (Story 4). Restores quantity/weight, posts reversing transaction
 *  for owned losses, sets status='reversed' + lineage. Rejects double reversal. */
export function reverseInventoryLoss(deps: LossOperationDeps, params: ReverseLossParams): Promise<RecordLossResult>;
```

---

## 2. Bill-close reconciliation — extends the existing close flow (`pages/Accounting.tsx handleCloseReceivedBill`)

```ts
/** Computed and shown in the close modal BEFORE the operator confirms (FR-007). */
export interface LotCloseReconciliation {
  inventoryItemId: string;
  productName: MultilingualString;
  weightTracked: boolean;
  receivedQuantity: number;
  soldQuantity: number;
  alreadyRecordedLossUnits: number;
  unaccountedUnits: number;             // received - sold - recorded; MUST be 0 to close (FR-011)
  residualShrinkageWeight: number | null;   // weight lots only (FR-005)
  estimatedShrinkageValue: number | null;
}

export interface CloseClassification {
  inventoryItemId: string;
  lostUnits: number;
  spoiledUnits: number;                 // lostUnits + spoiledUnits MUST equal unaccountedUnits
}

/** Guard invoked by the close flow. Throws/blocks if any lot has
 *  unaccountedUnits > 0 and no matching classification (FR-011/FR-012).
 *  On confirm: records manual-style loss events for classified units, then
 *  for each weight-tracked lot auto-records the residual-weight shrinkage
 *  event (source='auto_close'), owned→journal / commission→memo. */
export function reconcileAndCloseLosses(
  deps: LossOperationDeps,
  billId: string,
  classifications: CloseClassification[]
): Promise<{ success: boolean; lossEventIds: string[]; error?: string }>;
```

---

## 3. `OfflineDataContext` surface additions (`offlineDataContextContract.ts`)

```ts
interface OfflineDataContextType {
  // ...existing...
  lossEvents: InventoryLossEvent[];                                   // hydrated data array
  recordInventoryLoss: (p: RecordLossParams) => Promise<RecordLossResult>;
  reverseInventoryLoss: (p: ReverseLossParams) => Promise<RecordLossResult>;
  getLotCloseReconciliation: (billId: string) => LotCloseReconciliation[];
  reconcileAndCloseLosses: (billId: string, c: CloseClassification[]) => Promise<{ success: boolean; lossEventIds: string[]; error?: string }>;
}
```
Delegates bind `deps` via `useRef` + `useCallback` (payment pattern). A `useLossDataLayer` hook hydrates `lossEvents` and exposes `refreshData(['losses', ...])`; add `'losses'` to `RefreshDomain`.

---

## 4. Service additions

```ts
// services/eventEmissionService.ts — called BY syncService after upload (CG-03)
emitInventoryLossPosted(storeId: string, branchId: string, entityId: string,
  userId?: string, metadata?: { reason?: string; loss_value?: number; commission?: boolean }): Promise<void>;

// utils/accountMapping.ts
accountMapping[TRANSACTION_CATEGORIES.INVENTORY_LOSS]: AccountMapping; // 5950 / 1300

// constants/transactionCategories.ts
TRANSACTION_CATEGORIES.INVENTORY_LOSS = 'Inventory Loss / Shrinkage';
CATEGORY_TO_TYPE_MAP[INVENTORY_LOSS] = TRANSACTION_TYPES.EXPENSE;
```

---

## 5. POS sale contract change (enforcement)

For a lot where `weight_tracked === true`, the sale line contract becomes:
- `weight` is **required** (`> 0`) — reject the sale line otherwise (FR-002).
- On commit, decrement the specific lot's `quantity` **and** `weight_remaining` (FR-004); update visible remaining.
For `weight_tracked === false`: unchanged (quantity only), no weight input (FR-003).

---

## 6. Reporting contract (`services/reportingService.ts` or a new `lossReportService.ts`)

```ts
export interface LossReportQuery { from: string; to: string; branchId?: string; }
export interface LossReportRow {
  reason: 'shrinkage' | 'lost' | 'spoiled';
  productId: string;
  billId: string | null;
  totalValue: number;
  totalQuantity: number;
  totalWeight: number;
}
/** Computed entirely client-side from IndexedDB (CG-05). Period bucketing via
 *  getLocalDateString (CG-11). */
export function getLossReport(q: LossReportQuery): Promise<LossReportRow[]>;
```
