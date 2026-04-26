# Contract: Parity Fixture Multi-Currency Coverage

**Module**: `apps/store-app/tests/sync-parity/`
**Feature**: 017-currency-sync-guards-parity, Story US2

This contract specifies the fixture-shape and scenario-coverage requirements for the parity gate after this feature lands.

---

## §1. Fixture-shape invariant

Every store row constructed by any parity test fixture (whether via `db.stores.put({...})` directly or through a helper) MUST include:

```ts
{
  // ... existing fields preserved ...
  country: string,                       // ISO 3166-1 alpha-2; non-empty
  accepted_currencies: CurrencyCode[],   // non-empty; preferred_currency is a member
}
```

A fixture that omits either field is a contract violation. The parity normalizer (`parityNormalizer.ts`) and field registry (`parityFieldRegistry.ts`) MUST recognize both fields so they round-trip through upload/download without being stripped.

## §2. Default values for legacy fixtures

For fixtures that were Lebanese-by-implication before this feature:
- `country = 'LB'` (matches the legacy `preferred_currency: 'LBP'` assumption)
- `accepted_currencies = ['LBP', 'USD']` if `preferred_currency = 'LBP'`
- `accepted_currencies = ['USD']` if `preferred_currency = 'USD'` (existing US-shaped fixtures)

For fixtures that today set `preferred_currency: 'USD'` without country specification, prefer `country = 'LB'`, `accepted_currencies = ['LBP', 'USD']` to preserve the historic semantic (a Lebanese store happens to default to USD), unless the fixture's intent is clearly a US store, in which case `country = 'US'`, `accepted_currencies = ['USD']`. Choose conservatively to minimize golden-snapshot churn.

## §3. New UAE scenario

The parity scenarios test (`paritySync.scenarios.test.ts`) MUST contain at least one scenario named such that the intent is obvious (e.g. `it('round-trips a UAE store with AED inventory and transactions', ...)`) where:

- The fixture store row has `country='AE'`, `preferred_currency='AED'`, `accepted_currencies=['AED','USD']`, `exchange_rate=3.6725` (the AED/USD peg).
- At least one fixture `inventory_items` row is priced in `'AED'` with a non-trivial `selling_price` (suggested: `selling_price=18.50`).
- At least one fixture `transactions` row uses `currency='AED'` with a non-trivial `amount`.
- The scenario performs the same upload-then-snapshot pattern as the existing scenarios.

## §4. Golden snapshot regeneration

After the fixture changes:

1. Run `pnpm parity:gate` in update-snapshots mode (the project's existing flag — confirmed at implementation time from `apps/store-app/scripts/parity-check-*.mjs`).
2. Inspect the diff:
   - Existing scenarios may gain `country` and `accepted_currencies` keys on their store rows. This is expected.
   - The new UAE scenario adds entirely new entries. This is expected.
   - Existing `inventory_items` / `transactions` snapshot entries MUST NOT change. If any do, that is a real regression in the upload pipeline and must be investigated before committing.
3. Commit the regenerated golden in the same change as the fixture additions, with a commit message that names this feature.

## §5. Gate stability

After the fixtures and golden are updated:

- `pnpm parity:gate` MUST exit 0 from a clean checkout.
- The new UAE scenario MUST exercise upload paths that touch the very fields the spec 014 changes added (`country`, `accepted_currencies`) — not just write them, but observe them round-trip back out of the Supabase mock unchanged.
- A hypothetical regression that coerces AED → USD anywhere in the upload pipeline MUST cause the UAE scenario to fail (because the snapshotted `inventory_items.currency` would no longer be `'AED'`).

## §6. Test surface

This contract is enforced by:

- The parity gate itself (the strongest enforcement — failure is loud).
- A static lint-style assertion in the parity scenarios file: a small helper `assertFixtureStoreShape(row)` invoked at the top of each scenario that throws if `country` or `accepted_currencies` is missing or malformed. (Optional — only add if the parity normalizer doesn't already enforce shape; check during implementation.)
- A dedicated assertion within the new UAE scenario that the snapshot's `inventory_items[0].currency` deep-equals `'AED'` (so a future "everything-to-USD" coercion would surface as a clear single-line test failure rather than a noisy snapshot diff).

## §7. Forbidden states

After this feature lands:

- No fixture store row in `apps/store-app/tests/sync-parity/` MUST omit `country` or `accepted_currencies`.
- No fixture row in the suite MUST set `accepted_currencies: []` (empty).
- No fixture row MUST set `preferred_currency` to a value that is not in its own `accepted_currencies` array.
