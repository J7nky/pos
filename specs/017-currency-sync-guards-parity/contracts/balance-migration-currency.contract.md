# Contract: Admin Balance-Migration Currency Resolution

**Module**: `apps/admin-app/src/services/balanceMigrationService.ts`
**Feature**: 017-currency-sync-guards-parity, Stories US3 + US4

This contract specifies the resolution rules for the currency used by the admin opening-balance migration, plus the documentation invariant on the subscription billing literal.

---

## §1. Currency resolution helper

A new private helper colocated in the file:

```ts
private async resolveMigrationCurrency(
  session: MigrationSession,
  override: CurrencyCode | undefined
): Promise<CurrencyCode>;
```

**Resolution order**:

1. If `override` is a valid `CurrencyCode`, return it.
2. Else if `session.preferredCurrency` is already cached, return it.
3. Else fetch the store row via `storeService.getStoreById(session.storeId)`. If the row's `preferred_currency` is a valid `CurrencyCode`, cache it on `session.preferredCurrency` and return it.
4. Else throw `Error('balanceMigrationService: no currency available — store ${session.storeId} has no preferred_currency and no override was supplied')`.

**Behavioural invariants**:

- The helper MUST NOT default to any literal currency under any condition.
- The helper MUST NOT swallow the store-fetch error; if Supabase returns an error, propagate it (the admin needs to know they have a connectivity problem, not silently use LBP).
- A successfully resolved currency is cached on the session. A failed resolution does not cache anything — the next call retries.

## §2. Public method signature changes

The public methods that today declare `currency: 'USD' | 'LBP'` MUST retype to `currency?: CurrencyCode` (optional, since the resolver fills the gap):

```ts
// Before
async executeMigration(
  sessionId: string,
  validRows: ExcelRow[],
  options: { useBulk?: boolean; currency?: 'USD' | 'LBP' } = {}
): Promise<ImportResult>

// After
async executeMigration(
  sessionId: string,
  validRows: ExcelRow[],
  options: { useBulk?: boolean; currency?: CurrencyCode } = {}
): Promise<ImportResult>
```

The same change applies to:
- `executeBulkMigration(session, rows, currency, userId)` — `currency: CurrencyCode`
- `migrateOpeningBalance(session, row, currency, userId)` — `currency: CurrencyCode`
- The `MigrationRPCResult.currency` field, if it is currently typed as `'USD' | 'LBP'` — retype to `CurrencyCode`.

After this feature, the literal union `'USD' | 'LBP'` MUST NOT appear anywhere in `balanceMigrationService.ts`.

## §3. Wiring inside `executeMigration`

```ts
const resolvedCurrency = await this.resolveMigrationCurrency(session, options.currency);
// resolvedCurrency is now guaranteed to be a CurrencyCode; pass it to all downstream calls.
```

The previous line that destructures `{ useBulk = false, currency = 'LBP' } = options` MUST be replaced with `{ useBulk = false } = options;` followed by the resolver call. The `'LBP'` default is removed entirely (FR-018).

## §4. RPC payload preservation

The body of every RPC call (`p_currency: currency` etc.) is preserved exactly as before — only the *source* of the value changes. The migrate_opening_balance / migrate_opening_balances_bulk RPC contracts are unchanged by this feature.

## §5. Behavioural test surface

The contract is testable via Vitest at `apps/admin-app/src/services/__tests__/balanceMigrationService.test.ts` covering:

1. **Store default path**: session for a store with `preferred_currency='AED'`, no override → every migrated row uses `'AED'`. The Supabase RPC stub receives `p_currency: 'AED'`.
2. **Override path**: same session, explicit `currency: 'USD'` in options → every migrated row uses `'USD'`. The override beats the cached store value.
3. **Throw path**: session for a store with no `preferred_currency` (null in the fetched row), no override → `executeMigration` rejects with the descriptive error from §1.4. No partial migration occurs (the throw happens before any RPC call).
4. **Caching**: across multiple rows in the same session, the store row is fetched at most once. Achieved by stubbing `storeService.getStoreById` and asserting call count ≤ 1.
5. **Type signature**: a TypeScript-level test (or compile-only assertion via `expectTypeOf`) confirming the public method's `currency` parameter is `CurrencyCode | undefined`, not the legacy literal union.

## §6. Subscription service comment invariant

In `apps/admin-app/src/services/subscriptionService.ts`, the line at ~117 reading `currency: 'USD',` MUST be preceded (within 3 lines, on its own preceding line(s)) by an inline comment containing all of:

- the word "subscription" or "subscriptions"
- the phrase "always USD" or "USD" + "intentional" / "global"
- a reference to either spec 008 Task 15 or feature 017

Example acceptable comment (non-prescriptive — content invariant only):

```ts
// Subscriptions are billed in USD globally regardless of the store's local currency.
// This literal is intentional; see spec 008 Task 15 / feature 017.
currency: 'USD',
```

A repository grep that locates the literal `currency: 'USD'` in this file MUST find a comment matching the above invariants in the 3 preceding lines.

## §7. Forbidden patterns

In `balanceMigrationService.ts` after this feature lands:

- No literal `'LBP'` or `'USD'` strings used as currency defaults in production code paths.
- No `'USD' | 'LBP'` literal type unions anywhere in the file.
- No silent fallback to any currency code when neither override nor store-default is available.

A repository grep MUST return zero hits for `'USD' \| 'LBP'`, `currency = 'LBP'`, `currency = 'USD'`, `currency || 'USD'`, `currency || 'LBP'` outside of comments and test fixtures.
