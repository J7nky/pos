# Phase 0 Research — Country & Multi-Currency Schema Widening

**Feature**: 014-country-currency-schema
**Date**: 2026-04-21

This phase has no `NEEDS CLARIFICATION` markers. The research below documents the design choices for the back-fill semantics, the Dexie upgrade strategy, and the contract surface expansion — each captured so a reviewer (or a downstream `/speckit.tasks` invocation) understands *why* the chosen approach was selected over plausible alternatives.

---

## R1 — Default `country` for legacy rows: `'LB'`

**Decision**: Both the SQL migration and the Dexie upgrade default `country` to `'LB'` (Lebanon) for any row that does not have it set.

**Rationale**: The platform was developed for and is currently deployed entirely in Lebanon (the historical default `preferred_currency` is `LBP`, every existing store is in Lebanon). `'LB'` is the only choice that is correct for 100% of current production rows. Any other default (empty string, `NULL`, `'XX'`) requires a follow-up data fix.

**Alternatives considered**:

- **Empty string `''`** — rejected: forces every downstream consumer to handle "unknown country" as a special case before the first real multi-country store ever exists.
- **`NULL`** — rejected: `accepted_currencies` is `NOT NULL`; making `country` nullable creates an asymmetric, harder-to-validate row shape. Phase 4's admin StoreForm validation would also need a nullable handler that is otherwise unreachable.
- **Derive from `preferred_currency` using a code map** — rejected: only `LBP → LB` and `USD → US` are unambiguous, and even those collapse for stores that were seeded `USD` purely to avoid the LBP exchange-rate field. Hard-coding `'LB'` is more honest about the historical deployment than pretending to derive it.

---

## R2 — Default `accepted_currencies` for legacy rows: derived from `preferred_currency`

**Decision**: Back-fill `accepted_currencies` per row:

| `preferred_currency` | `accepted_currencies` after back-fill |
|---|---|
| `'USD'` | `['USD']` |
| anything else | `[preferred_currency, 'USD']` |

**Rationale**: This matches the de-facto runtime today — every Lebanon store accepts both LBP (its local currency) and USD (the dual-currency norm in Lebanon), and a hypothetical USD-only store has no need for a second currency. The rule mirrors `getDefaultCurrenciesForCountry` from Phase 1 in spirit, but uses the row's own `preferred_currency` as the authority rather than its (newly back-filled) `country`, so the back-fill is tautologically correct: it cannot disagree with the data the row already carries.

**Alternatives considered**:

- **Use `getDefaultCurrenciesForCountry(country)`** — rejected for the back-fill step because `country` itself is being back-filled in the same migration; using it as the authority would couple two back-fills together and require ordering guarantees. Using `preferred_currency` (which is already populated on every row) is unambiguous.
- **Always `['LBP', 'USD']`** — rejected: would silently add LBP to USD-only stores, breaking Phase 6's "currency must be in `accepted_currencies`" guard for any future USD-only store that retroactively had LBP added.

---

## R3 — Idempotency strategy for the SQL migration

**Decision**: The migration is fully idempotent through three layers:

1. `ADD COLUMN IF NOT EXISTS` — re-running on an already-migrated table is a no-op.
2. The back-fill `UPDATE` is guarded by `WHERE accepted_currencies = ARRAY['LBP','USD']` — only rows still holding the column default are touched, so re-running cannot overwrite a manually-curated value.
3. No `DROP` or `ALTER COLUMN` — the migration is purely additive.

**Rationale**: Supabase migration runners may be re-invoked (CI replay, manual `supabase db reset`, partial-failure retry). The constitution's "backward-compatible schema migrations" gate requires that re-running produces the same end state.

**Alternatives considered**:

- **Mark migration applied via a side-table flag** — rejected: redundant with Supabase's built-in migration ledger.
- **Use a `DO $$ ... $$` block for back-fill conditional** — rejected: the column-default `WHERE` clause is more declarative and self-documenting.

---

## R4 — Dexie version bump strategy: v54 → v55

**Decision**: A single Dexie version bump to **v55** that:

- Updates the `stores` index string to add `country` (scalar, indexable) — but **not** `accepted_currencies` in the index, since Dexie v4 does not support array-typed indexes via the simple comma-string form.
- Persists `accepted_currencies` on the row payload itself (no index needed; it is read whole-row, never range-queried).
- Runs an `.upgrade(tx)` callback that iterates `stores` and `inventory_items` and back-fills the same way the SQL migration does.

**Rationale**: Dexie's schema model requires a version increment for any change to an index string, even if the row payload could carry the new fields without one. Bumping to v55 keeps the index in sync with the type and lets us run a `tx.table('stores').toCollection().modify(...)` back-fill that is identical in semantics to the SQL `UPDATE`. The `inventory_items.currency` back-fill uses the parent store's `preferred_currency` as the default — this matches the expectation that an existing item without an explicit currency was created when the store was single-currency.

**Alternatives considered**:

- **Bump to two versions (v55 for stores, v56 for inventory_items)** — rejected: both back-fills are independent and read-only against the other table; combining them in one upgrade keeps the migration narrative tight and avoids a second user-visible upgrade prompt.
- **Skip index for `country`, store on row only** — rejected: future filtering of stores by country (Phase 4 admin search, Phase 12 onboarding flows) benefits from the index. Cost is one extra B-tree entry per row.
- **Use Dexie `compound index ['country+preferred_currency']` for future query patterns** — rejected: speculative; YAGNI. Add when a real query needs it.

---

## R5 — Sync parity: do not mark every row dirty after upgrade

**Decision**: The Dexie `.upgrade()` callback writes back-filled values via `Collection.modify((row) => { ... })`, which **does not** flip `_synced` to `false` automatically. Existing rows whose back-filled local values match what the next sync-down will produce remain `_synced = true`.

**Rationale**: The sync engine treats `_synced = false` as "needs upload to Supabase." If the upgrade flipped every store and every inventory item to dirty, the next sync would re-upload thousands of rows that did not change in any meaningful way — burning bandwidth, producing useless `branch_event_log` entries, and risking write conflicts with concurrent server-side writes. By writing back-filled values without touching `_synced`, the local row stays canonical-equal to the Supabase row (which the SQL migration is back-filling in parallel). The sync parity gate (`pnpm parity:gate`) verifies this property.

**Alternatives considered**:

- **Mark rows dirty after back-fill, let sync upload them** — rejected: redundant network traffic and a parity-gate regression. The Supabase migration is the source of truth for these columns.
- **Defer the local back-fill to the first sync-down** — rejected: a user who opens the app while offline must still see populated `country` and `accepted_currencies` so subsequent UI surfaces (Phase 4, Phase 5) can rely on them.

---

## R6 — Why `StoreCoreInsert` instead of `Partial<StoreCore>`

**Decision**: Export an explicit `StoreCoreInsert` interface from `@pos-platform/shared` rather than letting callers use `Partial<StoreCore>`.

**Rationale**: An insert payload has different optional-field semantics than a generic partial: `name` is required on insert, server-managed columns (`id`, `created_at`, `updated_at`) are forbidden on insert, and back-fillable columns (`country`, `accepted_currencies`, `preferred_currency`, `exchange_rate`, `preferred_language`) are optional. `Partial<StoreCore>` would make `name` optional and `id` writeable, both of which are wrong. A purpose-built `StoreCoreInsert` makes the contract self-describing for Phase 4's admin StoreForm and any future seeder.

**Alternatives considered**:

- **`Omit<StoreCore, 'id' | 'created_at' | 'updated_at'>` then `Partial` over the rest** — rejected: produces an unreadable type that obscures which fields are actually required at insert time.
- **Skip the insert type entirely; let callers pass `unknown`** — rejected: defeats the purpose of having shared cross-app contracts.

---

## R7 — Why widen `Transaction.currency` now (not in Phase 7)

**Decision**: Migrate the `Transaction.currency` field from `'USD' | 'LBP'` to `CurrencyCode` in **this phase** (FR-014), even though Phase 7 is the one that actually starts writing transactions in non-Lebanon currencies.

**Rationale**: The shared `Transaction` interface in `packages/shared/src/types/index.ts` is the source-of-truth contract that both apps import. If we leave it narrow, Phase 7 cannot write a transaction with `currency: 'AED'` without first re-doing the type widening — at which point it will discover dozens of consuming sites that need updating, all of which are easier to update *now* under a no-behavior-change phase than later under a behavior-change phase. The widened type still accepts every existing value (`'USD'` and `'LBP'` remain `CurrencyCode` members), so this widening is purely additive at the type level.

**Alternatives considered**:

- **Leave `Transaction.currency` narrow until Phase 7** — rejected: Phase 7 already carries the highest blast radius (POS sell flow); piling type-widening on top would make its diff harder to review and revert. Better to land the type-only sweep here, in the no-behavior-change phase whose explicit purpose is exactly that.

---

## R8 — Admin app delta in this phase

**Decision**: Touch zero admin-app source files in Phase 2.

**Rationale**: The admin-app reads `StoreCore` through `@pos-platform/shared`. Widening `StoreCore` is a strictly additive change at the type level (new optional-on-insert, required-on-row fields with defaults from the DB), so the admin-app continues to compile against the widened type without any of its own files being edited. The country selector, accepted-currencies multi-select, and the removal of the hardcoded `89500` exchange-rate default all belong to Phase 4 and would compromise this phase's "5-minute review" success criterion (SC-006) if folded in here.

**Alternatives considered**:

- **Add a TODO comment in `StoreForm.tsx` flagging the upcoming Phase 4 work** — rejected: comment churn for no functional benefit. Phase 4's spec is the appropriate breadcrumb.

---

## Summary

All design questions resolved. Phase 1 can proceed.
