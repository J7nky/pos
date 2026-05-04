# Phase 1 Data Model — Balance Sheet (018-balance-sheet)

**Date**: 2026-05-04
**Sources**: `spec.md` (Functional Requirements + Key Entities), `research.md` R2/R3/R4/R6/R10/R11.

This document is the canonical reference for every data shape that lands in code under this feature: persisted database fields, in-memory result types, helper enums, and the rules that bind them. UI props are intentionally not modeled here — they live in `contracts/balance-sheet-service.md`.

---

## Persisted schema changes

### `chart_of_accounts.sub_classification` (NEW, nullable text)

| Property | Value |
|----------|-------|
| Storage | Supabase `public.chart_of_accounts` (column added by SQL migration); Dexie `chart_of_accounts` (column added by Dexie version 55). |
| Nullable | Yes — null on revenue/expense rows by design; null on asset/liability/equity rows that the migration could not seed (flagged for manual review per FR-002b). |
| Allowed values | `'current_asset' \| 'non_current_asset' \| 'current_liability' \| 'non_current_liability' \| 'equity'`. (No `'revenue'`/`'expense'` — those are Income Statement, not Balance Sheet.) |
| Index | None on Dexie or Postgres — low cardinality, only filtered alongside `account_type`. |
| Validation rule | If `account_type='asset'` then `sub_classification IN ('current_asset','non_current_asset',NULL)`. If `account_type='liability'` then `sub_classification IN ('current_liability','non_current_liability',NULL)`. If `account_type='equity'` then `sub_classification IN ('equity',NULL)`. If `account_type IN ('revenue','expense')` then `sub_classification` MUST be `NULL`. Enforced as a CHECK constraint in Postgres; enforced as a TypeScript discriminated union in `accounting.ts`. |
| Migration seed (run once, idempotent) | `account_code` first character: `'1'` → `'current_asset'` if next 3 chars < `'500'` else `'non_current_asset'`; `'2'` → `'current_liability'` if next 3 chars < `'500'` else `'non_current_liability'`; `'3'` → `'equity'`; everything else → `NULL` and surface in a "Manual Review" admin notice. |
| Mutation | Editable by admins via the existing chart-of-accounts admin UI (extension to be added). Edits go through the existing context update path; audit-logged. |

### `journal_entries.transfer_group_id` (NEW, nullable text)

| Property | Value |
|----------|-------|
| Storage | Supabase `public.journal_entries` (column added by SQL migration); Dexie `journal_entries` (column added by Dexie version 55). |
| Nullable | Yes — null on every entry that is not part of an inter-branch transfer. Also null on every existing entry until the inter-branch-transfer feature ships and starts populating it. |
| Allowed values | A UUID-shaped string, identical across every leg of the same logical transfer. Convention: store the parent transfer document's id verbatim. |
| Index | Dexie compound index `[store_id+transfer_group_id]` (sparse — null skipped). Postgres partial index `idx_je_transfer_group_id ON journal_entries(transfer_group_id) WHERE transfer_group_id IS NOT NULL`. |
| Validation rule | Either null, or matches `^[0-9a-fA-F-]{20,}$`. Not enforced by DB CHECK; enforced when inter-branch-transfer feature populates it. |
| Mutation | Set once at JE creation by the (future) inter-branch-transfer service. Immutable after that, like the rest of the JE row (per CG-08). |
| Sync | Carried through the standard JE upload/download path. No special event needed. |

### Dexie version bump

| Property | Value |
|----------|-------|
| From | Version 54 |
| To | Version 55 |
| Stores changed | `chart_of_accounts` (no index change, schema flexible since Dexie reflects existence at row level) and `journal_entries` (compound index `[store_id+transfer_group_id]` added). |
| Upgrade callback | No row-level rewrite needed. Version bump only declares the new index so that `.where('[store_id+transfer_group_id]')` queries can run. |
| Risk | Low — Dexie tolerates missing/null fields on existing rows. The new index is sparse-effective (rows with `transfer_group_id === undefined` simply don't appear in the index). |

---

## TypeScript surface

### Discriminated `account_type` + `sub_classification`

Defined in `apps/store-app/src/types/accounting.ts`. Replaces the existing `account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'` literal with the same union, and adds a sibling `sub_classification` field as below.

```ts
export type AssetSubClassification = 'current_asset' | 'non_current_asset';
export type LiabilitySubClassification = 'current_liability' | 'non_current_liability';
export type EquitySubClassification = 'equity';

export type AccountSubClassification =
  | AssetSubClassification
  | LiabilitySubClassification
  | EquitySubClassification;

// Existing ChartOfAccounts gains:
//   sub_classification: AccountSubClassification | null;
// Plus the validation rule above.
```

The `JournalEntry` interface gains:

```ts
export interface JournalEntry {
  // ...existing fields...
  transfer_group_id?: string | null;
}
```

(Optional + nullable rather than required + nullable to match other late-added fields like `bill_id`.)

---

## In-memory result types

These live in `financialStatementService.ts` as new exported types alongside the existing `TrialBalanceReport` family. They reuse `CurrencyTotals` and `CurrencyCode` from the existing service.

```ts
export type BalanceSheetSection = 'current_asset' | 'non_current_asset'
  | 'current_liability' | 'non_current_liability'
  | 'equity';

export type PresentationMode = 'USD' | 'LBP' | 'dual';

export interface BalanceSheetFilters {
  storeId: string;
  /** When omitted, "All branches" consolidated view (eliminates inter-branch transfers). */
  branchId?: string;
  /** Inclusive — calendar date or full ISO datetime. */
  asOfDate: string;
  /** Zero or more comparison as-of dates rendered as side-by-side columns. */
  comparisons?: string[];
  /** Defaults to 'dual'. */
  presentationMode?: PresentationMode;
  /** Required when `presentationMode !== 'dual'` to know the consolidation target. */
  presentationCurrency?: CurrencyCode;
  /** Hide accounts with zero balance in EVERY column. Default true (hide). */
  hideZeroBalanceAccounts?: boolean;
  /** Default true — only sum entries flagged is_posted. */
  postedOnly?: boolean;
}

export interface BalanceSheetLine {
  account_code: string;
  account_name: string;
  account_type: 'asset' | 'liability' | 'equity';
  sub_classification: AccountSubClassification;
  /** Per-column native-currency balance, signed by normal-balance rule. */
  balanceByColumn: Array<{
    columnId: string;          // 'primary' | 'comparison-0' | 'comparison-1' | …
    asOfDate: string;
    nativeBalance: CurrencyTotals;
    /** Present only when presentationMode != 'dual'. */
    presentationBalance?: number;
  }>;
}

export interface BalanceSheetSubtotal {
  section: BalanceSheetSection;
  /** Sum across all member lines, per column. Same shape as BalanceSheetLine.balanceByColumn. */
  totalByColumn: BalanceSheetLine['balanceByColumn'];
}

export interface BalanceSheetColumn {
  columnId: string;
  asOfDate: string;
  /** Computed at render: residual that makes Assets = Liabilities + Equity in this column. */
  unrealizedFxTranslation: {
    nativeBalance: CurrencyTotals;
    presentationBalance?: number;
  };
  /** Indicates Assets = Liabilities + Equity (within BALANCE_EPSILON in every currency). */
  isBalanced: boolean;
  /** Variance amount when not balanced. */
  variance?: CurrencyTotals;
  /** Sum of revenue minus sum of expense entries up to asOfDate within current open fiscal year. */
  currentYearEarnings: {
    nativeBalance: CurrencyTotals;
    presentationBalance?: number;
  };
}

export interface BalanceSheetReport {
  filters: BalanceSheetFilters;
  /** All asset/liability/equity lines, ordered by section then account_code. */
  lines: BalanceSheetLine[];
  /** Subtotals in deterministic display order: current_asset, non_current_asset, current_liability, non_current_liability, equity. */
  subtotals: BalanceSheetSubtotal[];
  /** Per-column metadata (FX adjustment, balanced flag, etc). */
  columns: BalanceSheetColumn[];
  /** Currencies that appeared anywhere in any column. */
  currencies: CurrencyCode[];
  /** Warnings to display to the user (e.g., reclassified accounts, missing transfer_group_id, missing FX rate). */
  warnings: BalanceSheetWarning[];
  generatedAt: string;
}

export type BalanceSheetWarning =
  | { type: 'gl_unbalanced'; columnId: string; variance: CurrencyTotals }
  | { type: 'fx_rate_missing'; date: string; currency: CurrencyCode }
  | { type: 'missing_transfer_group_id'; entryIds: string[] }
  | { type: 'reclassified_account'; account_code: string; from: string; to: string }
  | { type: 'unmapped_subclassification'; account_code: string };
```

### Lifecycle notes

- `BalanceSheetReport` is **never persisted**. Each call to `getBalanceSheet()` returns a fresh object (FR-026).
- `columns[*].columnId` is stable per render — used as React keys, never reused across renders.
- `lines[*]` ordering is deterministic: section enum order, then `account_code` lexicographic.
- `warnings[*]` is appended-only as the service walks the data. UI may filter/dedupe.

---

## Relationships & cardinality

```
ChartOfAccounts (1) ──< owns >── (N) JournalEntry
ChartOfAccounts.sub_classification ──> defines ──> BalanceSheetLine.sub_classification
ChartOfAccounts.account_type ──> filters ──> { asset, liability, equity } only
JournalEntry.transfer_group_id ──> groups ──> elimination set
JournalEntry.amounts (Phase 11 JSONB) ──> aggregates into ──> BalanceSheetLine.balanceByColumn
ExchangeRate (existing store) ──> translates ──> CurrencyTotals → presentationBalance
BalanceSheetColumn.unrealizedFxTranslation ──> derived from ──> Σ(presentationBalance) residual
```

No new persistent relationships are introduced. The two new fields are isolated columns with no foreign keys.

---

## State transitions

This feature is **read-only**. There are no domain state transitions to model.

The two new persisted fields have a trivial lifecycle:
- `sub_classification`: `null` → seeded value (one-time migration) → optionally edited by admin (audit-logged).
- `transfer_group_id`: `null` → set once at JE creation by the future inter-branch-transfer service → never mutated.

---

## Validation rules summary

| Rule | Where enforced |
|------|----------------|
| `sub_classification` value matches `account_type` partition | Postgres CHECK + TypeScript union |
| `sub_classification` is `NULL` for revenue/expense | Same |
| `transfer_group_id` is null or matches UUID-ish regex | Application code (no DB CHECK) |
| `getBalanceSheet({ presentationMode: 'USD'/'LBP' })` requires `presentationCurrency` | TypeScript + runtime guard |
| Comparison dates are not after `asOfDate + 1 year` (sanity) | Service runtime guard, returns warning rather than throwing |
| `BalanceSheetColumn.isBalanced` is computed; never accepted as input | Service-internal |
| `BalanceSheetReport` is never serialized to disk | Architectural |
