# Contract: `financialStatementService.getBalanceSheet`

**Type**: In-process TypeScript function contract (no HTTP/RPC surface — Souq POS computes the Balance Sheet entirely client-side, per CG-05).
**Module**: `apps/store-app/src/services/financialStatementService.ts`
**Caller**: `apps/store-app/src/hooks/useBalanceSheet.ts` (which is in turn consumed by `apps/store-app/src/components/reports/BalanceSheet.tsx`).
**Visibility**: `export`. Also exported on the existing `financialStatementService` namespace object.

---

## Signature

```ts
export async function getBalanceSheet(
  filters: BalanceSheetFilters,
): Promise<BalanceSheetReport>;

// Plus on the namespace:
export const financialStatementService = {
  getTrialBalance,
  getBalanceSheet,
};
```

`BalanceSheetFilters` and `BalanceSheetReport` are defined in `data-model.md`. Repeating the input shape inline:

```ts
interface BalanceSheetFilters {
  storeId: string;
  branchId?: string;                // omit for "All branches" consolidated view
  asOfDate: string;                 // YYYY-MM-DD or full ISO
  comparisons?: string[];           // 0..N comparison as-of dates
  presentationMode?: 'USD' | 'LBP' | 'dual';   // default 'dual'
  presentationCurrency?: CurrencyCode;          // required if presentationMode != 'dual'
  hideZeroBalanceAccounts?: boolean;            // default true
  postedOnly?: boolean;                         // default true
}
```

---

## Preconditions (caller must satisfy)

- `storeId` is a non-empty string. The function does **not** validate it against a list of stores; it trusts the caller.
- If `branchId` is provided, it is the user's currently-selected branch (or one their RBAC grant allows; gating happens above the service).
- `asOfDate` parses via the existing `startOfDayIso` / `endOfDayIso` helpers (date-only or full ISO).
- `comparisons[*]` parses the same way.
- If `presentationMode !== 'dual'`, `presentationCurrency` MUST be provided. The service throws `Error('presentationCurrency required when presentationMode is not "dual"')` otherwise.

The service does NOT enforce RBAC — that is a UI-layer responsibility (`pages/Reports.tsx` gates on the existing financial-reports operation; FR-019/19a). Calling `getBalanceSheet` with `branchId` undefined from a branch-scoped role is a programming error, not a security boundary the service is responsible for.

## Postconditions (service guarantees)

1. **Determinism (same inputs → same output)** for any fixed snapshot of journal entries and chart of accounts. No randomness, no Date.now in numeric output. `generatedAt` is the only field that varies — and it varies only across distinct invocations.
2. **No writes**. The service never writes to Dexie or Supabase. It does not mutate input arrays.
3. **Each `BalanceSheetColumn.isBalanced === true`** when the underlying GL is balanced for that as-of date in every currency. When it is not, `isBalanced === false` AND `variance` is populated AND a `gl_unbalanced` warning is appended.
4. **Each column is balanced after FX adjustment** in `presentationCurrency` regardless of whether `isBalanced` is true. The `unrealizedFxTranslation` line absorbs the residual; the column's grand totals satisfy Assets = Liabilities + Equity to the smallest currency unit (per FR-016/16a, SC-002).
5. **Soft-deleted entries are excluded** (`_deleted === true`) regardless of as-of date.
6. **Posted-only is honored** (`postedOnly` defaults to true, like `getTrialBalance`).
7. **Inter-branch elimination** runs only when `branchId` is undefined. When it runs, entries sharing a `transfer_group_id` whose net per-currency sum is within `BALANCE_EPSILON` are dropped from aggregation. Groups that don't net to zero are retained AND emit a `missing_transfer_group_id` warning (with the offending entry IDs).
8. **Current Year Earnings line** is always emitted as a synthetic line under `equity` for the as-of date when revenue/expense activity exists in the current open fiscal year (FY = calendar year today; future Period Close work will refine this).
9. **Output sort order**: `lines` ordered by section enum order then `account_code` lexicographic. `subtotals` in fixed display order. `columns[0]` is always the primary as-of date; comparisons follow in input order.
10. **Warnings array** is the only side-channel the service uses to communicate non-fatal problems. The service does not throw for: out-of-balance GL, missing FX rate, missing transfer marker, account reclassification, unmapped sub-classification. It DOES throw for programmer errors: invalid filters, unparseable dates, network failure during FX rate lookup if rate isn't cached locally.

## Error contract

| Condition | Behavior |
|-----------|----------|
| Missing `presentationCurrency` when mode != 'dual' | Throws `Error('presentationCurrency required when presentationMode is not "dual"')`. |
| Unparseable `asOfDate` or `comparisons[i]` | Throws `Error('Invalid date: <value>')`. |
| FX rate missing for a required date in non-dual mode | Does NOT throw. Appends `{ type: 'fx_rate_missing', date, currency }` to `warnings`. The column's `presentationBalance` for affected lines is omitted (left undefined); UI must surface the warning per FR-017. |
| Out-of-balance GL in any column | Does NOT throw. `isBalanced=false`, `variance` populated, warning appended. |
| Account row with `account_type` not in {asset, liability, equity, revenue, expense} | Defensive: treated as 'asset' for inclusion safety, warning appended (`unmapped_subclassification`). |
| Storage I/O error | Bubbles up — caller's `useBalanceSheet` hook is responsible for surfacing as `error` state. |

## Performance contract

- Input volume budget: up to 100,000 journal entries scanned, ~200 chart-of-accounts entries.
- Wall-clock budget: ≤ 3 seconds (SC-001) on a typical store device for a single column. With one comparison column, ≤ 4.5 seconds; with two, ≤ 6 seconds. (Each comparison column adds at most one extra `O(N)` pass.)
- Memory budget: O(N + A) where N = journal entries in scope, A = chart-of-accounts entries.

## Re-entrancy / concurrency

- Pure function over a Dexie snapshot. Re-entrant.
- Two simultaneous calls (e.g. user clicks "Regenerate" twice) both succeed and return independent reports.
- The function does NOT take a lock on Dexie. If `journal_entries` changes mid-aggregation (e.g. a sync arrives), the result reflects an unspecified mix; callers should treat each report as an instantaneous snapshot and re-fetch on user action.

## Versioning

- The contract is versioned alongside the schema: any change to `BalanceSheetReport` is a breaking change because the UI consumes it directly.
- The `BalanceSheetWarning` union is intentionally extensible — adding new tagged variants is non-breaking for consumers that handle the union exhaustively only via `default` UI fallback. Every warning variant added later MUST also be added to the i18n keys under `reports.balanceSheet.warnings.*`.

## Test obligations (CG-12)

The Vitest suite at `apps/store-app/src/services/__tests__/financialStatementService.balanceSheet.test.ts` MUST cover at minimum the 10 cases enumerated in `research.md` R15. Each test seeds Dexie with the minimal fixture needed and asserts on `BalanceSheetReport` shape and totals. The service must build cleanly with `pnpm lint` and `pnpm build:store`.
