# Quickstart — Currency Service & Context Wiring

**Feature**: 015-currency-service-wiring
**Audience**: Developer verifying Phases 3/4/5 end-to-end after implementation.

This guide walks through the five acceptance flows the spec codifies. Run from the repo root unless noted.

## Prerequisites

- Branch `015-currency-service-wiring` checked out.
- Spec 014 (`014-country-currency-schema`) merged — Supabase has `country` + `accepted_currencies` columns on `stores`, and Dexie is at v55.
- Supabase CLI linked; `.env` files populated (see `CLAUDE.md`).
- `pnpm install` complete.

```bash
pnpm --filter @pos-platform/shared build     # rebuild shared package with CurrencyCode/COUNTRY_CONFIGS
pnpm --filter store-app typecheck
pnpm --filter admin-app typecheck            # both should pass before you begin
```

## 1 — Unit test: `CurrencyService`

```bash
pnpm --filter store-app test:run -- currencyService.test.ts
```

All cases from `contracts/currencyService.contract.md § "Unit test checklist"` must pass. If the removed-methods compile check fails, grep to find any lingering references:

```bash
# From repo root — expect zero hits in source (legacy/ directory is ignored)
rg -t ts "safeConvertForDatabase|getSupportedCurrencies|formatCurrencyWithSymbol|getConvertedAmount|refreshExchangeRate" apps/store-app/src \
  --ignore-dir __tests__/legacy
```

## 2 — Admin-app: onboard a UAE store

```bash
pnpm dev:admin
```

Log in as super-admin. Click "Create Store". In the form:

1. Name: `Souq Dubai`.
2. Click **Country**. Type `uae` → "UAE (AE)" should filter in. Select it.
3. Verify:
   - Preferred Currency auto-set to **AED**.
   - Accepted Currencies has **AED** and **USD** ticked (USD is disabled/greyed as required).
   - Exchange Rate input is **empty** and shows helper `Rate of 1 USD expressed in AED`.
4. Enter `3.67` in Exchange Rate.
5. Submit.
6. Open Supabase dashboard → `stores` table → confirm the new row has `country='AE'`, `preferred_currency='AED'`, `accepted_currencies=['AED','USD']`, `exchange_rate=3.67`.

Repeat with:
- **United States** — confirm exchange rate field is **hidden**, saved row has `accepted_currencies=['USD']`.
- **Saudi Arabia** (`SA`) — confirm `preferred_currency='SAR'`, `accepted_currencies=['SAR','USD']`.

## 3 — Admin-app: edit an existing Lebanese store

With the existing Lebanese store (or a freshly-created one with country=LB):

1. Open Edit.
2. Tick **EUR** in Accepted Currencies.
3. Save. Verify Supabase row now has `accepted_currencies=['LBP','USD','EUR']`, `preferred_currency='LBP'` unchanged.
4. Re-open Edit. Untick **LBP**. Try to save. Expect the form to **block** with a message listing inventory/transaction/bill counts for LBP. The row is NOT updated.
5. Untick **EUR** (which has zero usage). Save. Verify `accepted_currencies=['LBP','USD']` persisted.

## 4 — Store-app: locale-correct formatting for a non-Lebanese store

```bash
pnpm dev:store
```

Log into the UAE store you just created. On any screen that displays prices (Home, Sales, Inventory), confirm amounts render with:
- Symbol `د.إ`
- Two decimal places
- `ar-AE` locale layout (RTL where applicable)

On the accounting dashboard, confirm existing `formatCurrencyWithSymbol` and `getConvertedAmount` call sites still work — no regressions from the hook rewrite.

Compare against a Lebanese store: symbol `ل.ل`, zero decimals, `ar-LB` layout. No change from pre-feature behavior.

## 5 — Live sync update without restart

1. Keep the store-app open, logged into the UAE store.
2. In the admin app, edit the UAE store and add **EUR** to Accepted Currencies. Save.
3. In the store-app browser tab, wait for the next sync cycle (or trigger one from the sync status UI).
4. In DevTools React profiler, confirm a re-render with `acceptedCurrencies` now including `'EUR'`. No manual refresh or reload required.

Automated equivalent (if a dedicated test harness exists):

```bash
pnpm --filter store-app test:run -- OfflineDataContext.currency.test.tsx
```

## 6 — Parity gate

```bash
pnpm parity:gate
```

Must pass without golden-snapshot updates. If it fails, investigate — the refactor was expected to be payload-shape-neutral; any diff indicates an accidental behavior change (most likely in `useCurrency` or a direct-class call site).

## 7 — Typecheck, lint, build

```bash
pnpm lint
pnpm --filter store-app build
pnpm --filter admin-app build
```

All three must succeed with zero errors. Lint should flag zero new violations — in particular, no new `no-restricted-imports` violations (CG-02 gate).

## Rollback plan

If any of the above verifications fails after merge:

1. Revert the feature commit(s); no data migrations to undo (spec 014 owns all schema).
2. The shared package needs no revert; all additions are backward-compatible.
3. Downstream `useCurrency` consumers return to their previous behavior automatically because the hook's exported shape is unchanged.
