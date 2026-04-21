# Phase 0 Research: Inventory Multi-Currency & POS Sell-Flow Enforcement

**Feature**: 016-inventory-pos-currency
**Date**: 2026-04-21

## Pre-flight (shared package / runtime APIs — verified 2026-04-21)

`@pos-platform/shared` exports `CurrencyCode`, `CURRENCY_META`, and `getDefaultCurrenciesForCountry` from `packages/shared/src/types/index.ts`. Store-app `currencyService` exposes `convert`, `format`, `getAcceptedCurrencies`, `getPreferredCurrency`, `getMeta`, and `loadFromStore`. `OfflineDataContext` exposes `acceptedCurrencies`, `preferredCurrency`, and `formatAmount` on the context value.

This document records the design decisions that resolve the open questions raised by the spec's Functional Requirements and Edge Cases. Each decision is presented as: **Decision → Rationale → Alternatives considered**.

---

## R1 — Banker's rounding implementation

**Decision**: Add a small helper `roundHalfEven(value: number, decimals: number): number` to `apps/store-app/src/utils/currencyRounding.ts`. Implement it inline with the standard half-to-even algorithm: scale, check the discarded digit and the remainder; if the discarded digit is 5 and the remainder is zero, round to the nearest even unit; otherwise standard round-half-up.

**Rationale**:
- Spec FR-021 mandates half-to-even rounding to minimize cumulative bias across many line items on a single bill.
- `Number.toFixed()` and `Math.round()` both use round-half-away-from-zero (IEEE 754's "round half to nearest, ties to away") for positive numbers — *not* half-to-even. Relying on them would introduce a systematic over-rounding bias.
- The implementation is ~20 lines of code and trivially unit-testable. It lives adjacent to the conversion call site so the policy is visible.
- No existing utility in `@pos-platform/shared` does this; adding one there would be over-reach for a single caller and Phase 11 may want a different policy.

**Alternatives considered**:
- **Pull `big.js` or `decimal.js`**: rejected — heavyweight (20–50 kB gzipped) for one rounding call per line-item. POS bundle size matters on Electron cold starts.
- **Use `Intl.NumberFormat` with `roundingMode: 'halfEven'`**: rejected — this was added in ECMAScript 2023 and is supported in modern Chromium (our Electron runtime) but the arithmetic output is still a **formatted string**, not a `number`. We need the rounded numeric value to store on the row, not a string.
- **Live with `Math.round()` bias**: rejected — on a 20-line bill the cumulative bias can reach a full cent in favour of the store, which will inevitably be detected by a customer and erode trust.

---

## R2 — Eager vs lazy line-item conversion

**Decision**: Convert each cart line eagerly at the moment it is added to the cart. The converted `unit_price` (in bill currency) is what the cashier sees on-screen, what prints on the running total, and what persists to `bill_line_items` on save.

**Rationale**:
- Cashiers rely on the on-screen running total to confirm the customer's amount due. If conversion is deferred to save-time, the on-screen total during the transaction is approximate — the cashier cannot read out an exact "that'll be $12.50" until the bill is already half-saved.
- Rounding is per-line per spec FR-011/FR-021. Deferring to save means the cashier sees an un-rounded float pre-save and a rounded int post-save, inviting bug reports.
- The rate map is already loaded at boot (spec 015's `loadFromStore`), so eager conversion costs one multiplication + one rounding call per line — within the 16 ms NFR-004 budget by three orders of magnitude.

**Alternatives considered**:
- **Lazy conversion at save time**: rejected for the cashier-trust and rounding-consistency reasons above.
- **Hybrid: show unrounded preview, save rounded**: rejected — two numbers for the same line is the worst of both worlds and makes receipts not reproducible from on-screen state.

---

## R3 — Settlement-currency picker placement

**Decision**: The picker is rendered inline at the top of each new POS tab (new bill) in `pages/POS.tsx`. Default selection is the store's `preferredCurrency`. Once **any** line item is added, the picker locks (per spec FR-019) and the cashier must void the bill to change currency.

**Additional rule**: When `acceptedCurrencies.length === 1`, the picker is not rendered at all — the sole accepted currency is deterministically selected. This preserves current UX for USD-only stores (US) and reduces visual noise.

**Rationale**:
- Placing the picker per-tab (per-bill) matches the mental model "each customer is one bill, and each bill settles in one currency." A single global "today's bill currency" setting was considered and rejected because it does not survive the case of two customers in a row paying in different currencies, which is exactly the multi-currency reason the feature exists.
- Locking after the first line keeps the per-line conversion deterministic and the bill auditable — matches FR-019.
- Single-currency stores see zero UX change, which is important for the existing install base (mostly Lebanese stores at rollout time, but single-accepted-currency stores do exist — US stores).

**Alternatives considered**:
- **Global "settlement currency" setting on the POS screen, one per day**: rejected for the mixed-customer case above.
- **Auto-detect currency from first scanned item and lock**: rejected — removes cashier agency and surprises them when an item is priced in a currency the customer isn't paying in.
- **Prompt only when needed (i.e. at first item whose currency differs from `preferredCurrency`)**: rejected — introduces a mid-bill decision point which violates FR-019's "lock after first line" rule.

---

## R4 — Legacy bill grandfathering

**Decision**: No migration is written. Existing local bills (settled or in flight at upgrade time) retain whatever `currency` the pre-feature `|| 'USD'` fallback wrote. Enforcement fires only on **new** bill creation (after upgrade). Reads/reprints of legacy bills continue to work because `bills.currency` has always been populated — just potentially with an inaccurate fallback value.

**Rationale**:
- A migration that "fixes" legacy bill currencies would require re-evaluating each bill against the store's accepted currencies at migration time, which is ambiguous for non-Lebanon stores (was that `'USD'` value correct or a fallback?).
- The known defect the fallback caused is limited: for the entire existing install base (Lebanese stores), the `preferredCurrency` is `LBP` and the fallback wrote `'USD'` when the caller forgot to pass a currency. Any such bill would already have been flagged by the cashier at the time (USD total looks wrong for a LBP-priced cart). The probability of undetected corruption at scale is low.
- Forward-looking: after upgrade, all new bills have their `currency` set deliberately. The defect class is closed going forward.

**Alternatives considered**:
- **Migration that back-fills `bills.currency = preferred_currency` for suspicious rows**: rejected — "suspicious" is undefined; any heuristic risks relabelling a genuinely-USD bill as LBP.
- **Flag legacy bills with a visible "legacy currency" badge in the bill list**: rejected as unnecessary noise for a defect class that has almost certainly already been manually reconciled by cashiers at settlement time.

---

## R5 — Sync-download structured warning channel

**Decision**: Emit the structured warning via `comprehensiveLoggingService` (the project's existing logger, located at `apps/store-app/src/services/comprehensiveLoggingService.ts`). Level `WARN`. Payload: `{ operation: 'syncDownload.<fn>', storeId, reason: 'store-row-absent', action: 'skip' }`. Do **not** use `console.warn` or `console.log`.

**Rationale**:
- The project already centralizes structured logging through `comprehensiveLoggingService`. Using it keeps this warning on the same observability surface as every other operational event and means it will flow into whatever log sink the team configures (today: console + Dexie-backed log buffer; tomorrow: a remote sink).
- The structured payload makes the warning grep-able in the log buffer by the `operation` string, which is the observability convention in the rest of the codebase.
- `console.warn` is disallowed implicitly by the logging discipline in §4.5 / §8.

**Alternatives considered**:
- **`console.warn` only**: rejected per above.
- **Throw instead of warn + skip**: rejected — spec FR-016 explicitly asks for "skip and warn" because a missing store row during sync is an expected boundary condition (e.g. a fresh install that hasn't completed initial hydration yet), not an error to surface to the cashier.
- **Remote log to Supabase**: rejected — creates a sync-in-sync dependency that would loop.

---

## R6 — `ensureStoreExists` absent-field fallback order

**Decision**: When `syncService.ensureStoreExists` finds a downloaded Supabase row is missing `country`, `preferred_currency`, or `accepted_currencies`, the fallback order is: (1) populate from the row's own fields if present; (2) derive `accepted_currencies` from the shared `getDefaultCurrenciesForCountry(country)` helper when only `country` is known; (3) fail loudly via `comprehensiveLoggingService` + throw a descriptive error if no field at all is usable. Hardcoded literals (`'USD'`, `'LBP'`) never appear in the fallback path.

**Rationale**:
- Spec FR-017 explicitly forbids inventing a preferred currency unilaterally, but the method has to return **something** for the local Dexie seed. The shared `getDefaultCurrenciesForCountry` helper encodes exactly the project's canonical country→currencies knowledge, so using it is the one correct fallback.
- Failing loudly when even `country` is absent is better than silently seeding `'USD'` because the symptom ("store has no local data") is cheap to observe and remediate, whereas silent data corruption isn't.

**Alternatives considered**:
- **Hardcode `'USD'` as final fallback after all others fail**: rejected per FR-017.
- **Hardcode `'LBP'` as final fallback**: rejected — this is exactly the defect that initiated this whole feature family.

---

## R7 — Legacy-null-currency inventory row handling

**Decision**: On the Inventory list render, rows with `currency == null` get a visual indicator (a small warning icon next to the price with tooltip `"This item is missing its currency and cannot be sold until you edit it"`). On the POS add-to-cart path, attempting to add such an item throws `LegacyCurrencyMissingError` and surfaces a toast asking the cashier to edit the item first. No silent default is ever applied.

**Rationale**:
- Spec FR-007 mandates UI marking + sell-blocking, not a mass back-fill. This is the user-friendliest implementation: the operator sees the affected rows, edits them opportunistically, and sell-blocking is enforced only on the narrow path where the missing currency actually matters.
- A background back-fill job was considered and rejected in the spec's Assumptions (legacy rows are expected to be rare). Keeping the feature free of batch-migration code simplifies testing.

**Alternatives considered**:
- **Background migration that writes `currency = store.preferred_currency` for null rows**: rejected — the preferred currency at migration time is not necessarily the currency at row-creation time. Risk of silent mis-labelling > cost of operator-driven fix.
- **Block the entire inventory list from loading if any row has null currency**: rejected — throwing a wrench in the primary UI for what is expected to be an edge case is bad UX.

---

## Open questions (none blocking)

All design decisions above are committed. No `NEEDS CLARIFICATION` markers remain. Phase 1 proceeds against these decisions.

---

## Audit log (Feature 016 — Phase 7)

**T040** (2026-04-21): Case-sensitive search for `|| 'USD'`, `|| 'LBP'`, `?? 'USD'`, `?? 'LBP'` in `apps/store-app/src/contexts/offlineData/useTransactionDataLayer.ts`, `apps/store-app/src/services/syncDownload.ts`, and `apps/store-app/src/services/syncService.ts` — **zero hits** (workspace grep).

**T042 / T043 / T044** (2026-04-21): `pnpm --filter @pos-platform/shared build` then `pnpm --filter store-app build` — success; `pnpm --filter store-app test:run` — all tests green; `pnpm parity:gate` — green.

**T041** (2026-04-21): Grep for the type literal `'USD' \| 'LBP'` under `apps/store-app/src/` still reports **many** matches (accounting, journal, `CurrencySwitch`, legacy hooks, etc.). Feature 016 touched receive/edit inventory and POS paths; a repo-wide migration to `CurrencyCode` is a separate follow-up, not completed in this pass.
