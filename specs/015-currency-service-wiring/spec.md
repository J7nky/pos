# Feature Specification: Currency Service & Context Wiring

**Feature Branch**: `015-currency-service-wiring`
**Created**: 2026-04-21
**Status**: Draft
**Input**: User description: "start collecting the requirements for @specs/008-multi-currency-country/TASKS.md 3. CurrencyService refactor, 4 — Admin form wiring and 5 — Store-app context surface phases"

## Clarifications

### Session 2026-04-21

- Q: When the admin changes the country after having manually edited `accepted_currencies`, what should the form do? → A: Preserve manual additions; only swap local currency + clear the exchange-rate field. Prior country's defaults are not stripped if they were kept, extra ticks stay.
- Q: What should happen when the admin edits an existing store and tries to remove a currency that has live data (inventory items, transactions, open bills) in it? → A: Hard-block submission. The form queries Supabase for usage counts of each removed currency and rejects the save with an error listing the counts; admin must first reconcile the data before removing the currency.
- Q: How should consumers of the offline-data context observe currency-state changes (e.g. after a sync pulls new `accepted_currencies`)? → A: Reactive React state — `acceptedCurrencies` and `preferredCurrency` live in the context's React state; `loadFromStore` triggers a state update and all subscribing components re-render automatically. `formatAmount` is a stable callback that reads the current state.
- Q: Should the service's `updateExchangeRate(storeId, rate)` method be implemented in this feature, given that its only caller would be the Phase 12 store-app self-service settings UI? → A: Drop it from this feature. No in-feature consumer exists; the admin-app updates rates through its own Supabase write path, and Phase 12 will add the method when the settings UI lands.

## Overview

This feature wires the multi-currency foundation (spec 013) and the country/accepted-currencies schema (spec 014) into the three live surfaces that read and write currency information: the store-app's CurrencyService, the admin-app's store onboarding form, and the store-app's data context. Before this feature, those three surfaces still treat `USD` and `LBP` as the only possible currencies and carry a single hardcoded exchange rate default (`89500`). After this feature, every one of those surfaces is country-aware, driven by the shared `CurrencyCode` union and `COUNTRY_CONFIGS` map, and can represent any ISO-4217 currency the shared package supports.

This corresponds to Phases 3 (Task 7), 4 (Tasks 8 + 9), and 5 (Task 10) of `specs/008-multi-currency-country/TASKS.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Super-admin onboards a store in a non-Lebanon country (Priority: P1)

A super-admin opens the admin app's "Create Store" form and needs to register a new store located in the UAE. Today the form only exposes a two-option currency dropdown (`USD` / `LBP`) and ships with a pre-filled `89500` exchange rate that is meaningless outside Lebanon. After this feature, the super-admin picks the country from a searchable list, the form auto-populates the local currency (`AED`), the default accepted currencies (`['AED', 'USD']`), and clears the exchange rate so the admin is forced to enter the current AED/USD rate. The admin can optionally add more currencies (e.g. `EUR`) before saving.

**Why this priority**: This is the blocking gap for every new non-Lebanese tenant. Without it, the platform cannot be sold to any customer outside Lebanon because the onboarding form won't let the admin represent the store's country or currency correctly.

**Independent Test**: Create a new store from the admin app using country "UAE". Verify Supabase receives `country='AE'`, `preferred_currency='AED'`, `accepted_currencies=['AED','USD']`, and a non-null `exchange_rate` that matches whatever the admin typed (no `89500` leakage).

**Acceptance Scenarios**:

1. **Given** the admin opens the Create Store form, **When** they pick country "Lebanon" from the country selector, **Then** `preferred_currency` auto-fills to `LBP`, `accepted_currencies` auto-fills to `['LBP','USD']`, and the exchange rate input is empty and required.
2. **Given** the admin opens the Create Store form, **When** they pick country "United States", **Then** `preferred_currency` auto-fills to `USD`, `accepted_currencies` auto-fills to `['USD']`, and the exchange rate input is hidden or disabled (USD stores have no local FX rate).
3. **Given** the admin has selected country "Lebanon" and the form has auto-filled `['LBP','USD']`, **When** they also tick `EUR` in the accepted-currencies multi-select, **Then** the saved store row has `accepted_currencies=['LBP','USD','EUR']` and `preferred_currency` remains `LBP`.
4. **Given** the admin has selected a non-USD country, **When** they try to submit the form with an empty or zero exchange rate, **Then** submission is blocked with a validation error that explains rate is required for non-USD stores.
5. **Given** an existing store, **When** the admin opens the Edit Store form, **Then** the country, preferred currency, accepted currencies, and exchange rate from the saved row are pre-populated correctly and editable.

---

### User Story 2 — Cashier sees currency amounts formatted in their store's locale (Priority: P1)

A cashier working at a Lebanese store expects amounts rendered in Arabic locale with the `ل.ل` symbol and no decimals. A cashier at a Saudi store expects `﷼` with two decimals in `ar-SA` locale. Before this feature, the store-app hardcodes two currency configs (USD, LBP with rate `89500`) and cannot format anything else. After this feature, any component that consumes the offline-data context can call `formatAmount(amount, currency)` and get a locale-correct string for every currency in the shared registry.

**Why this priority**: The cashier-facing UI is worthless if the numbers display wrong for non-Lebanese stores. This is how Phase 3 delivers visible value once Phase 4 has onboarded the store.

**Independent Test**: In a store configured with `preferred_currency='SAR'`, render any price-displaying component and assert the output uses the `ar-SA` locale, the riyal symbol, and two decimal places — without restarting the app after the store was loaded.

**Acceptance Scenarios**:

1. **Given** the current store has `preferred_currency='LBP'`, **When** a component calls `formatAmount(1500000, 'LBP')`, **Then** the result is rendered in `ar-LB` locale with the Lebanese-pound symbol and no decimals.
2. **Given** the current store has `preferred_currency='USD'`, **When** a component calls `formatAmount(10.5, 'USD')`, **Then** the result is `$10.50` (or equivalent `en-US` formatting).
3. **Given** the current store has `accepted_currencies=['AED','USD']`, **When** a component reads `acceptedCurrencies` from the context, **Then** it receives `['AED','USD']` in the same order as stored (preferred first).
4. **Given** a component needs the UI symbol for the current preferred currency, **When** it asks the service or context for metadata about that code, **Then** it gets back the correct display symbol, decimal count, and locale hint without needing to import any hardcoded table.

---

### User Story 3 — Any component converts between accepted currencies (Priority: P2)

A POS screen shows an inventory item priced in `LBP` but the cashier is settling a bill in `USD`. The store-app needs to convert the price between any two currencies the store accepts, using USD as the pivot rate. Before this feature, the service only converts in the USD↔LBP direction at the single hardcoded rate. After this feature, any caller can ask to convert between any two `CurrencyCode` values the current store accepts, and the service raises a descriptive error when the necessary rate is not loaded.

**Why this priority**: Conversion correctness is what makes the POS sell-flow (Phase 7) possible. Shipping Phase 3 without it would force every downstream phase to re-invent conversion.

**Independent Test**: With a store configured `preferred_currency='LBP'`, `exchange_rate=89500`, call `convert(100, 'USD', 'LBP')` → expect `8950000`; call `convert(8950000, 'LBP', 'USD')` → expect `100`; call `convert(100, 'USD', 'USD')` → expect `100` (identity).

**Acceptance Scenarios**:

1. **Given** a loaded Lebanese store, **When** a caller converts `100 USD → LBP`, **Then** the result equals `100 * exchange_rate`.
2. **Given** a loaded Lebanese store, **When** a caller asks to convert to a currency the store does not accept (e.g. `EUR`), **Then** the service throws a descriptive error naming the missing rate rather than returning a silent fallback.
3. **Given** a loaded store, **When** a caller converts an amount from a currency to itself, **Then** the amount is returned unchanged with no rate lookup.

---

### User Story 4 — Currency state stays consistent across the app lifecycle (Priority: P2)

The offline-first architecture means the store-app boots from IndexedDB first and reconciles with Supabase later. Currency state (accepted currencies, preferred currency, rate) must be initialized from the local store row on boot, re-loaded after each sync cycle, and immediately visible through the context to every component. Before this feature, the service reads from a stale global at import time. After this feature, the context drives a deterministic `loadFromStore` on boot and after sync, and all consumers observe the refreshed values.

**Why this priority**: Without this, a freshly synced rate or a newly added currency would require an app restart to take effect — unacceptable for a kiosk-mode POS.

**Independent Test**: Change `accepted_currencies` on the remote store row, trigger a sync, then confirm that components consuming the context observe the new list without restarting the app.

**Acceptance Scenarios**:

1. **Given** the app boots with a Lebanese store in IndexedDB, **When** the offline-data context initializes, **Then** `acceptedCurrencies`, `preferredCurrency`, and `formatAmount` reflect the Lebanese store's values before the first UI render.
2. **Given** the admin adds `EUR` to the store's accepted currencies remotely, **When** the next sync cycle completes, **Then** the context's `acceptedCurrencies` updates to include `EUR` without a restart.
3. **Given** a legacy IndexedDB row that pre-dates country/accepted_currencies population, **When** the app boots, **Then** the context falls back to safe defaults (currencies derived from `preferred_currency`, country defaulted to `LB` if `preferred_currency='LBP'` else empty) without crashing.

---

### Edge Cases

- **Unknown country code on an existing store row** (e.g. synced row has `country=''` or a code not in `COUNTRY_CONFIGS`): the admin form must still load and let the admin pick a country; the store-app context must still expose the stored `accepted_currencies` directly rather than re-deriving from the unknown country.
- **Store row missing `accepted_currencies`** (legacy data): the service derives the list from `preferred_currency` — `['USD']` if USD-only, else `[preferred_currency, 'USD']`.
- **Admin picks a country, changes their mind, picks a different one**: the form re-auto-populates the fields, discarding the previous country's defaults, unless the admin has manually edited `accepted_currencies` since the first pick (in which case it prompts or keeps the manual overrides — see clarifications).
- **Admin removes the store's preferred currency from `accepted_currencies`**: submission is blocked with a validation message; preferred currency must always be a member of the accepted set.
- **Admin removes USD from `accepted_currencies`**: submission is blocked because USD is the pivot currency; every store must accept USD.
- **Admin removes a currency from an existing store that has inventory_items, transactions, or open bills in that currency**: submission is hard-blocked with an error listing per-currency usage counts (see FR-014a). The admin must reconcile or migrate the data before the currency can be removed.
- **Exchange rate entered as `0` or negative** for a non-USD store: validation rejects it.
- **Service asked to convert before `loadFromStore` has run**: throws an explicit "CurrencyService not initialized" error rather than using a stale default.
- **Store is USD-only (US, or any store with `preferred_currency='USD'`)**: the rate input is hidden/disabled and the service's internal rate map has only `{USD: 1}`.

## Requirements *(mandatory)*

### Functional Requirements

#### Phase 3 — CurrencyService refactor (Task 7)

- **FR-001**: The store-app's currency service MUST maintain, for the currently loaded store, the store's preferred currency, accepted-currency list, and a map of exchange rates keyed by `CurrencyCode` with `USD=1` always present.
- **FR-002**: The service MUST expose a `loadFromStore(storeId)` operation that reads the local store row and populates preferred currency, accepted currencies, and rates. Calling `loadFromStore` again replaces the previous state.
- **FR-003**: The service MUST expose a `convert(amount, from, to)` operation that converts using USD as the pivot. Same-currency conversions return the input unchanged. Missing rates raise a descriptive error naming the missing currency.
- **FR-004**: The service MUST expose a `format(amount, currency)` operation that uses the shared `CURRENCY_META` registry to render amounts in the correct locale with the correct decimal count and symbol.
- **FR-005**: The service MUST expose `getMeta(currency)`, `getAcceptedCurrencies()`, `getPreferredCurrency()`, and `getExchangeRate()` for read access. `getExchangeRate()` is a backward-compatibility shim returning the rate for the local (non-USD) currency.
- **FR-007**: The service MUST remove the legacy methods `getSupportedCurrencies`, `safeConvertForDatabase`, `formatCurrencyWithSymbol`, and `getConvertedAmount`. All existing call sites MUST be updated to use the replacements above.
- **FR-008**: All removals in FR-007 MUST be verified by a zero-reference search — no store-app source file may import or call the removed methods after this feature lands.

#### Phase 4 — Admin form wiring (Tasks 8 + 9)

- **FR-009**: The admin-app's store create/edit form MUST render a country selector populated alphabetically from the shared `COUNTRY_CONFIGS` registry, searchable by name or ISO code.
- **FR-010**: Selecting or changing the country MUST auto-populate `preferred_currency` to the new country's local currency and clear the exchange-rate field. For `accepted_currencies` the form MUST merge the new country's `defaultCurrencies` into the existing list rather than overwriting it: (a) on first country pick the list becomes exactly `defaultCurrencies`; (b) on a subsequent country change, any currencies the admin ticked manually remain, the new country's `localCurrency` is added if not already present, and USD remains present. Previous country defaults that were never manually un-ticked also remain.
- **FR-011**: The form MUST render a preferred-currency dropdown whose options are driven by the shared `CURRENCY_META` registry, not a hardcoded two-item list.
- **FR-012**: The form MUST render an accepted-currencies multi-select (checkbox list or equivalent) whose options are driven by `CURRENCY_META`. The admin MUST be able to tick/untick currencies beyond the country defaults.
- **FR-013**: The form MUST NOT pre-fill the exchange rate with any hardcoded value. Helper text MUST clarify "Rate of 1 USD expressed in [preferred_currency]" dynamically.
- **FR-014**: Form validation MUST require: non-empty country; at least one entry in `accepted_currencies`; preferred currency present in `accepted_currencies`; USD present in `accepted_currencies`; positive `exchange_rate` when `preferred_currency !== 'USD'`.
- **FR-014a**: On the EDIT path, for every currency being removed from an existing store's `accepted_currencies`, the form MUST query Supabase for live usage counts in the store's `inventory_items`, `transactions`, and `bills` (open/unsettled) tables filtered by that currency. If any count is non-zero, submission MUST be hard-blocked with an error message listing each affected currency and its counts, instructing the admin to reconcile the data first. This check runs pre-persist; the remove is not applied locally until all removed currencies pass the zero-usage check.
- **FR-015**: On submit, the form MUST send `country` and `accepted_currencies` alongside the other store fields to the store-creation / store-update service.
- **FR-016**: The admin-app's `Store`, `CreateStoreInput`, and `UpdateStoreInput` type contracts MUST include `country` and `accepted_currencies`. The admin-app's store service MUST persist both on insert and update, and return both on select, mapping Supabase rows to the `Store` type.

#### Phase 5 — Store-app context surface (Task 10)

- **FR-017**: The store-app's central offline-data context MUST call `currencyService.loadFromStore(currentStoreId)` on boot (after Dexie is ready) and after every successful sync cycle that touches the `stores` table.
- **FR-018**: The context MUST expose, for UI consumers, `acceptedCurrencies: CurrencyCode[]`, `preferredCurrency: CurrencyCode`, and `formatAmount(amount, currency): string`. UI components MUST be able to obtain these without importing the currency service directly.
- **FR-018a**: `acceptedCurrencies` and `preferredCurrency` MUST be held in the context's React state so that consumers re-render automatically whenever `loadFromStore` updates them. `formatAmount` MUST be exposed as a stable callback (reference-stable across renders when the underlying store hasn't changed) that reads the current state. Consumers MUST NOT need to subscribe to any additional event bus or call refresh hooks to see an updated value after a sync cycle completes.
- **FR-019**: The context's `acceptedCurrencies` value MUST reflect the actual saved store row — no hardcoded list.
- **FR-020**: Legacy store rows missing `accepted_currencies` MUST resolve to a safe fallback (`['USD']` when preferred currency is USD, else `[preferred_currency, 'USD']`) rather than blocking the UI.

### Non-Functional Requirements

- **NFR-001**: The store-app must build with zero TypeScript errors after this feature. No new `any` types introduced.
- **NFR-002**: All three surfaces (service, admin form, context) must behave identically whether the app is online or offline, reading from local store state.
- **NFR-003**: Existing Lebanese stores in production must continue operating identically (same rate, same currencies, same locale rendering) — this feature is strictly additive for them.

### Out of Scope

- **Transaction/bill enforcement** (Phase 7, Task 12) — not part of this feature; the service refactor only makes the enforcement possible.
- **Inventory currency enforcement** (Phase 6, Task 11).
- **Sync-upload currency validation** (Phase 8, Task 13).
- **Live rate fetching** — rates remain manually entered (`TODO(010-live-rates)`).
- **Per-currency rate map** (`exchange_rates` JSONB, Phase 10, Tasks 17a–17e) — this feature keeps the single scalar `exchange_rate` for the preferred currency. Multi-rate comes later.
- **Store-app self-service currency management** (Phase 12, Task 18) — admin-app only for now. In particular, the service's `updateExchangeRate(storeId, rate)` write method is NOT implemented in this feature; it lands with Phase 12 when its first caller (the settings UI) ships.
- **Dual-ledger journal column generalization** (Phase 11, Task 16).

### Key Entities

- **Currency state (per store, runtime)**: `preferredCurrency: CurrencyCode`, `acceptedCurrencies: CurrencyCode[]`, `rates: { [code: CurrencyCode]: number }` with USD=1 always present.
- **Country config (shared constant)**: consumed read-only from `COUNTRY_CONFIGS` / `COUNTRY_MAP`; supplies default currency wiring when the admin picks a country.
- **Currency meta (shared constant)**: consumed read-only from `CURRENCY_META`; supplies locale, symbol, and decimal count for formatting.
- **Store row (admin-app + store-app Dexie)**: gains `country` and `accepted_currencies` as first-class fields used by both surfaces.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A super-admin can onboard a store in any country listed in `COUNTRY_CONFIGS` in under two minutes, with zero manual currency-code typing, and the saved record has correct `country`, `preferred_currency`, `accepted_currencies`, and a non-hardcoded `exchange_rate`.
- **SC-002**: Loading the store-app against a non-Lebanese store (e.g. UAE/AED) renders 100% of currency-displaying components with the correct symbol, locale, and decimals — verified by visual inspection of the home, bills, and inventory screens plus at least one automated format-string snapshot test per currency.
- **SC-003**: Zero occurrences of the hardcoded `89500` literal remain in admin-app source (excluding migrations and committed test fixtures).
- **SC-004**: Zero occurrences of the currency literal union `'USD' | 'LBP'` remain in the store-app's currency service source or the admin-app's store form source.
- **SC-005**: `convert()`, `format()`, and `loadFromStore()` behaviour is covered by unit tests in `packages/shared` and/or `apps/store-app` with all happy-path and error cases from the acceptance scenarios above passing.
- **SC-006**: An existing Lebanese store that upgrades to this release observes no change in rendered amounts, no change in rate calculations, and no change in the UI — validated by parity run against the current snapshot.
- **SC-007**: The admin form refuses to submit any store whose preferred currency is missing from `accepted_currencies`, missing USD, or has a non-positive rate for a non-USD preferred currency — each condition produces a user-readable validation message.

## Assumptions

- When the admin changes the country, the form preserves manual additions and prior ticks (see FR-010 merge rule) — only the preferred currency is swapped and the rate field is cleared. This keeps corrective country re-picks non-destructive for admins who have already curated the currency list.
- "Preferred currency must be in `accepted_currencies`" and "USD must be in `accepted_currencies`" are enforced in both the admin form and any settings screen that may touch these fields in the future. The current feature enforces them at the admin form.
- The single scalar `exchange_rate` column continues to represent the store's preferred (non-USD) currency's rate against USD. Stores that later need multi-rate support are deferred to Phase 10.
- The store-app's currency service is a singleton whose lifetime matches the app session; a new store switch triggers a fresh `loadFromStore`.
- The context's `formatAmount` helper is a thin pass-through to the service's `format` — no per-render memoization logic is required for this feature (Intl.NumberFormat cost is negligible at the UI scale of a POS screen). Reference stability is still provided via `useCallback` so that React's equality checks in child components do not cause spurious re-renders.

## Dependencies

- **Spec 013 — Shared Currency Foundation** (merged/complete): provides `CurrencyCode`, `CURRENCY_META`, formatting primitives.
- **Spec 014 — Country & Multi-Currency Schema Widening** (in progress on this branch's parent): provides `country` and `accepted_currencies` columns on `stores` in Supabase and Dexie, `COUNTRY_CONFIGS`, and the widened `StoreCore` / store-app `Database` types. This feature cannot ship before 014 is merged.
- Any store-app component that currently imports `currencyService` directly for formatting will be migrated to the context helper; a codebase grep at plan-time will identify all call sites.
