# Feature Specification: Inventory Multi-Currency Pricing & POS Sell-Flow Currency Enforcement

**Feature Branch**: `016-inventory-pos-currency`
**Created**: 2026-04-21
**Status**: Draft
**Input**: User description: "specify the requirements for @specs/008-multi-currency-country/TASKS.md, only 'Phase 6 — Inventory multi-currency' (Tasks 11a, 11b, 11c) and 'Phase 7 — POS sell flow enforcement' (Tasks 12a–12e)"

## Overview

This feature wires the multi-currency foundation (specs 013–015) into the two hottest write paths in the store-app: **receiving inventory** and **selling through the POS**. Before this feature, inventory items can be created without a currency (the field is optional), the POS silently falls back to `'USD'` when a caller forgets to pass a currency, and the sync layer falls back to `'LBP'` when the store row is missing. After this feature, every inventory item carries a known currency from the store's accepted set, every bill has exactly one settlement currency, every line item on a bill is stored in the bill's currency (converted at the moment of sale from the item's own currency), and none of the silent fallbacks remain.

This corresponds to **Phase 6 (Task 11, sub-tasks 11a/11b/11c)** and **Phase 7 (Task 12, sub-tasks 12a–12e)** of `specs/008-multi-currency-country/TASKS.md`. Phase 7 is the highest-risk phase in the rollout — it is the one that sits in the live cashier flow — and per the rollout plan it ships behind a parity run.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Cashier settles a bill in one currency, with items priced in mixed currencies (Priority: P1)

A cashier at a Lebanese store starts a new bill. The customer wants to pay in USD. The cashier picks `USD` as the bill's settlement currency from a dropdown that only offers currencies the store accepts (`['LBP','USD']`). The cashier then scans two products: one priced in LBP in inventory, one priced in USD. The POS silently converts the LBP-priced item into USD at the store's current rate and stores it on the bill line in USD; the USD-priced item passes through unchanged. Every line item on this bill is denominated in USD; the bill total is in USD. If the cashier had chosen LBP as the settlement currency instead, the USD-priced item would have been converted to LBP and the LBP-priced item would have passed through.

**Why this priority**: This is the single most important behaviour the feature delivers. Without it, the POS either (a) crashes when it meets an inventory item whose currency no longer matches a hardcoded assumption, (b) silently mis-records the bill currency via the `|| 'USD'` fallback, or (c) creates bills whose line items disagree on currency — which breaks totals, reports, and the ledger. The entire multi-currency program exists to enable this user story.

**Independent Test**: In a Lebanese store with `exchange_rate=89500`, create a bill with settlement currency `USD`. Add an inventory item priced `1,500,000 LBP` and an inventory item priced `$10`. The bill's line items must be stored as `~16.76 USD` and `10.00 USD` respectively; the bill total must be `~26.76 USD`; and the bill's `currency` column must be `USD`.

**Acceptance Scenarios**:

1. **Given** a cashier opens a new bill on a store with `accepted_currencies=['LBP','USD']`, **When** they open the settlement-currency picker, **Then** they see exactly `LBP` and `USD` and the default selection is the store's `preferred_currency`.
2. **Given** a bill with settlement currency `USD` and an inventory item priced in `LBP`, **When** the cashier adds the item to the cart, **Then** the stored line-item unit price is the LBP price converted to USD using the current rate, and the line item's currency is `USD`.
3. **Given** a bill with settlement currency `USD` and an inventory item priced in `USD`, **When** the cashier adds the item to the cart, **Then** the stored line-item unit price equals the inventory item's `selling_price` with no conversion arithmetic applied, and the line item's currency is `USD`.
4. **Given** a bill is ready to be saved, **When** the bill is persisted, **Then** `bills.currency` equals the cashier-selected settlement currency and every `bill_line_items` row carries a `unit_price` denominated in that same currency.
5. **Given** the settlement currency is not present in `store.accepted_currencies`, **When** the cashier attempts to open or submit the bill, **Then** the bill is rejected with a user-readable error naming the offending currency.

---

### User Story 2 — Inventory manager adds stock priced in any accepted currency (Priority: P1)

An inventory manager receives a shipment of goods the supplier invoiced in USD. On the "Add Inventory" form, the manager enters the selling price and picks `USD` from a currency dropdown. Before this feature, the form shipped with a hardcoded two-option dropdown and a TypeScript type that allowed `currency` to be undefined. After this feature, the dropdown options come from the store's `acceptedCurrencies`, default to the store's `preferredCurrency`, and the field is required. The saved row always has a known, validated currency that is in the store's accepted set.

**Why this priority**: Inventory creation is the upstream precondition of the sell flow. If inventory rows can slip through with `currency=null`, Phase 7's enforcement has nothing to trust. Both stories ship together.

**Independent Test**: In a store with `accepted_currencies=['LBP','USD']`, open the Add Inventory form. Confirm the currency selector offers `LBP` and `USD` only; default is `preferred_currency`. Save an item with `currency='USD'`, `selling_price=12.50`. Verify the Dexie row has `currency='USD'`, `selling_price=12.50`, and no conversion has been applied.

**Acceptance Scenarios**:

1. **Given** a store with `accepted_currencies=['LBP','USD']`, **When** the inventory manager opens the Add Inventory form, **Then** the currency selector lists exactly `LBP` and `USD` and defaults to the store's `preferred_currency`.
2. **Given** the manager has picked a currency on the form, **When** the price input is focused, **Then** the currency symbol (per `CURRENCY_META[code].symbol`) is visually adjacent to the price input.
3. **Given** the manager saves an inventory item, **When** the row is written, **Then** `currency` is set to the selected value and is guaranteed non-null.
4. **Given** a programmatic caller (e.g. an import script, sync handler, or RPC) attempts to insert an inventory item whose `currency` is missing or is not a member of the store's `accepted_currencies`, **When** the insert is attempted, **Then** the write is rejected before hitting Dexie with a descriptive error naming the invalid value and the store's accepted list.
5. **Given** an item was previously saved with a currency that is now no longer in `accepted_currencies` (e.g. admin removed it), **When** the inventory list loads, **Then** the item continues to display without crashing, labelled with its historical currency.

---

### User Story 3 — Cashier cannot silently create bills with an invalid currency (Priority: P1)

A programmer (or a future code change) calls the transaction data layer without passing an explicit currency. Before this feature, the layer coerced the value with `|| 'USD'` and silently recorded the transaction as USD — which, in a non-USD store, produced incorrect ledger entries. After this feature, the data layer throws a descriptive error if the currency is missing or not in the store's accepted currencies, and no transaction row is written.

**Why this priority**: This is the loudest defect class the feature eliminates. A bill persisted with the wrong currency pollutes every downstream report and balance; detecting it at write time is an order of magnitude cheaper than reconciling it later.

**Independent Test**: In a Lebanese store (accepted `['LBP','USD']`), call the transaction data layer with an undefined `currency` field → expect a descriptive throw. Call it with `'EUR'` → expect a descriptive throw naming `EUR` and listing `['LBP','USD']`. Call it with `'USD'` → expect success.

**Acceptance Scenarios**:

1. **Given** a caller invokes the transaction data layer with `currency=undefined`, **When** the call is dispatched, **Then** no row is written and a descriptive error is thrown that names the missing field.
2. **Given** a caller invokes the transaction data layer with a currency not in `store.accepted_currencies`, **When** the call is dispatched, **Then** no row is written and a descriptive error is thrown naming the offending value and the accepted list.
3. **Given** a caller invokes the transaction data layer with a valid accepted currency, **When** the call is dispatched, **Then** the row is written with that currency, with no coercion, fallback, or default substitution anywhere in the code path.

---

### User Story 4 — Sync never invents a currency when the store row is missing (Priority: P2)

During sync, the downloader or the "ensure store exists" bootstrap may find that the local store row is absent. Before this feature, `syncDownload` defaulted to `'LBP'` and `ensureStoreExists` seeded `'USD'` as hardcoded defaults, either of which silently corrupts the local view of reality in a store that operates in neither. After this feature, neither path guesses: if the store row is absent, the sync layer either seeds real values read from the downloaded Supabase row (the normal case for `ensureStoreExists`) or logs a warning and skips currency-dependent operations for that cycle (the abnormal `syncDownload` edge case).

**Why this priority**: This is data-integrity housekeeping. The defect is real but infrequently hit in practice; once hit, it is hard to diagnose because the symptom is "ledger came out wrong" weeks later. Shipping it together with the P1s is cheap and removes the last known silent-fallback in the currency code path.

**Independent Test**: (a) With the local `stores` table empty, trigger `syncDownload` → confirm no currency-dependent operation runs and a warning is logged with enough context to identify the missing store. (b) Trigger `ensureStoreExists` against a Supabase row for a UAE store (`country='AE'`, `preferred_currency='AED'`, `accepted_currencies=['AED','USD']`) → confirm the local Dexie row is seeded with those exact values and no `'USD'` literal was substituted.

**Acceptance Scenarios**:

1. **Given** the local `stores` table is empty and a sync-download cycle runs, **When** the downloader reaches code that previously read `store?.preferred_currency || 'LBP'`, **Then** it logs a structured warning containing the expected store id and skips the currency-dependent operation rather than defaulting.
2. **Given** `ensureStoreExists` is called with a Supabase store row that includes `country` and `accepted_currencies`, **When** the local Dexie row is seeded, **Then** `country`, `preferred_currency`, and `accepted_currencies` on the seeded row equal the Supabase values exactly, and no hardcoded `'USD'` or `'LBP'` appears in the write path.

---

### Edge Cases

- **Item priced in a currency that the store no longer accepts** (historical data — admin removed `EUR` after items already existed in EUR): the item remains viewable in inventory, but selling it requires the POS to convert `EUR → billCurrency` using the service's rate map; if no EUR rate is loaded, the POS surfaces the service's descriptive conversion error to the cashier (e.g. "Cannot add item: no exchange rate available for EUR → USD") and refuses to add the line rather than defaulting.
- **Bill in flight when this feature ships** (local unsettled bills written prior to enforcement, may have the `|| 'USD'` fallback baked into their `currency` field): these bills remain valid, are settled with their existing `currency`, and are not re-labelled. Enforcement applies only to bills created **after** the upgrade.
- **Legacy inventory items with `currency=null`** (written before 11a made the field required): on read, the inventory UI shows them with a visual "missing currency" marker and blocks selling them through the POS until the operator edits the item and picks a currency. No silent default is applied.
- **Cashier switches settlement currency mid-bill after line items are already added**: mid-bill currency changes are blocked once at least one line item exists on the bill. The cashier must void the bill and start a new one to change its currency. This keeps the per-line-item conversion deterministic and auditable.
- **Conversion math produces non-representable fractions** (e.g. `1,500,000 LBP → USD` at rate `89,500` = `16.759776…`): the converted `unit_price` stored on the line is rounded to the **bill currency's** `CURRENCY_META.decimals` (2 for USD, 0 for LBP, 3 for JOD etc.) using banker's rounding. The bill's total is computed from the rounded line totals, not recomputed from source prices.
- **POS sell flow runs while `currencyService` has not been initialized** (race on first boot): the bill UI is disabled until `loadFromStore` resolves; attempting to open a bill before the service is initialized shows a loading state rather than failing.
- **Receipt/reprint of a bill after the underlying inventory item's currency or price changed**: the bill always renders from its own stored line items (bill currency + stored converted unit prices), not from the current inventory state. The bill is immutable post-settlement.

## Requirements *(mandatory)*

### Functional Requirements

#### Phase 6 — Inventory multi-currency (Task 11)

- **FR-001**: The `inventory_items.currency` field MUST be a required `CurrencyCode` on the store-app TypeScript `Row`, `Insert`, and `Update` contracts. No optional-currency path remains.
- **FR-002**: Every insert into `inventory_items` (from any caller — UI form, import tool, sync handler, RPC) MUST pass through a guard that verifies the provided `currency` is a member of the current store's `accepted_currencies`. If it is not, the insert MUST be rejected with a descriptive error naming the offending currency and the store's accepted list; no row is written.
- **FR-003**: The `selling_price` on an inventory item MUST be stored in the item's own `currency`. Insert-time currency conversion MUST NOT be performed; the price is recorded as typed.
- **FR-004**: The inventory create/edit form MUST render a currency selector whose options are the store's `acceptedCurrencies` (read from the offline-data context), with the default selection being the store's `preferredCurrency`. The legacy hardcoded `'USD' | 'LBP'` dropdown MUST be removed.
- **FR-005**: The inventory create/edit form's price input MUST display the currency symbol adjacent to the input field, sourced from `CURRENCY_META[selectedCurrency].symbol`. The displayed symbol MUST update when the selected currency changes.
- **FR-006**: The inventory list / detail views MUST continue to load and render items that have pre-existing `LBP` or `USD` currencies without error (backward compatibility for rows predating this feature).
- **FR-007**: Legacy inventory rows with `currency=null` (pre-Task-11a) MUST render in the inventory list with a visual "missing currency" indicator and MUST be blocked from being added to a bill until the operator edits the item and picks a valid currency.

#### Phase 7 — POS sell flow enforcement (Task 12)

- **FR-008**: Every `bills` row MUST carry a `currency` column typed as `CurrencyCode` on the store-app TypeScript `Row`, `Insert`, and `Update` contracts. The column MUST be populated on every bill insert.
- **FR-009**: At the start of a POS transaction, the cashier MUST be offered a settlement-currency picker whose options are the store's `acceptedCurrencies`, defaulting to the store's `preferredCurrency`. The picker's selection is the bill's `currency`.
- **FR-010**: A bill whose `currency` is not in the store's current `accepted_currencies` MUST be rejected at creation time with a user-readable error naming the offending currency.
- **FR-011**: When a product is added to a bill's cart, the system MUST resolve the line-item `unit_price` as follows: if the inventory item's `currency` equals the bill's `currency`, the line's `unit_price` is the item's `selling_price` unchanged; otherwise the line's `unit_price` is `currencyService.convert(selling_price, item.currency, bill.currency)` rounded to the bill currency's `CURRENCY_META.decimals`.
- **FR-012**: Every `bill_line_items` row on a given bill MUST share the same currency as the bill. The stored `unit_price` is always in the bill's currency — the item's source price and currency are not stored on the line.
- **FR-013**: The bill's total MUST be computed by summing the **rounded** line totals (`unit_price * quantity`), not by recomputing from source-currency prices.
- **FR-014**: If `currencyService.convert` raises (missing rate for either the source or target currency), the POS MUST surface the error to the cashier and refuse to add the line item; no partial or defaulted line is persisted.
- **FR-015**: The transaction data layer (the store-app code path that writes `transactions` / bills for the POS) MUST require the caller to supply a `currency` and MUST validate it is in the store's `acceptedCurrencies`. Missing or non-accepted values MUST throw a descriptive error. The legacy `|| 'USD'` fallback MUST be removed.
- **FR-016**: `syncDownload` MUST NOT substitute a hardcoded currency literal (`'LBP'`, `'USD'`, or any other) when the local store row is absent. When the store row is absent, it MUST log a structured warning containing at minimum the expected `store_id` and the name of the operation being skipped, and MUST skip the currency-dependent operation for that cycle.
- **FR-017**: `syncService.ensureStoreExists` MUST seed the new local store row's `country`, `preferred_currency`, and `accepted_currencies` from the downloaded Supabase row. Hardcoded `preferred_currency: 'USD'` (or any other currency literal) as a fallback MUST be removed; if the Supabase row is missing any of these fields, the seed MUST either error loudly or populate from the shared country-defaults helper (`getDefaultCurrenciesForCountry`) — it MUST NOT invent a preferred currency unilaterally.
- **FR-018**: After this feature, no occurrence of `|| 'USD'` or `|| 'LBP'` as a currency fallback remains in the selling / transaction / sync code path (verified by repository grep at completion time).

#### Cross-cutting behavioural guarantees

- **FR-019**: Mid-bill settlement-currency changes MUST be blocked once at least one line item exists on the bill. The cashier is prompted to void and restart the bill to change its currency.
- **FR-020**: All reprints / re-reads of a settled bill MUST render exclusively from the bill's own stored `currency` and line `unit_price`s. The inventory item's current state at read time MUST NOT be re-consulted for pricing.
- **FR-021**: Rounding on conversion MUST use the **target (bill) currency's** `CURRENCY_META.decimals`, using banker's rounding (IEEE 754 round-half-to-even), applied to each line's `unit_price` before storage.

### Non-Functional Requirements

- **NFR-001**: The store-app MUST build with zero TypeScript errors after this feature. No new `any` types; `currency` is `CurrencyCode` everywhere it appears in the inventory and bill paths.
- **NFR-002**: All currency validation described in FR-002, FR-010, and FR-015 MUST execute offline (reading only from local Dexie) — no network round-trip to Supabase is required to validate a currency on insert.
- **NFR-003**: For existing Lebanese stores (preferred=LBP, accepted=`['LBP','USD']`, rate `89500`), the cashier-visible behaviour MUST be indistinguishable from today's — same symbols, same totals, same decimals — validated via the sync-parity golden run.
- **NFR-004**: Adding one line item to a bill MUST not exceed 16 ms of conversion + validation overhead at the 95th percentile on the reference hardware the POS is deployed on (Electron kiosks). This is a regression guard; the current baseline is effectively zero.

### Out of Scope

- **Storing source price / source currency on a bill line for audit traceability** — the feature explicitly stores only the converted `unit_price` in the bill currency, per Task 12b. Retro-audit of source prices is not a goal of this feature; if later required, it would be a follow-on schema change.
- **Sync-upload guard for invalid inventory currency** (Task 13, Phase 8) — rejection of bad rows during upload to Supabase. This feature rejects at write time on the local path; the upload-side guard is Phase 8's job.
- **Balance / subscription service cleanup** (Task 15) — admin-app `balanceMigrationService` and `subscriptionService` tweaks are Phase 8.
- **Parity test fixture expansion** (Task 14) — updating test fixtures to include `country` and `accepted_currencies` and adding a non-Lebanon parity case are Phase 9 work.
- **Per-currency exchange rates map** (`exchange_rates` JSONB, Phase 10) — this feature still uses the single scalar `exchange_rate` for the preferred currency. If the store has a third accepted currency with no configured rate, conversion throws (per FR-014); that's the acceptable failure mode until Phase 10 lands.
- **Dual-ledger accounting column generalization** (Task 16, Phase 11) — journal entries' `debit_usd` / `credit_usd` / `debit_lbp` / `credit_lbp` columns are unchanged by this feature. Journal writes continue to use the existing USD/LBP-specific columns; the POS bill simply has a known `currency` whose handling on the ledger side stays as it is today.
- **Store-app self-service currency management** (Task 18, Phase 12) — no settings UI for adding/removing accepted currencies from within the store-app. Admin-only for now.
- **Back-filling `currency` on pre-existing `null`-currency inventory rows** via a migration — rows are left as-is and rendered with a "missing currency" marker (FR-007); the operator fixes them by editing. A mass back-fill tool is deferred.

### Key Entities

- **Inventory item**: gains a required `currency: CurrencyCode` (previously optional). `selling_price` is denominated in this currency and stored as typed; no server-side conversion.
- **Bill** (a.k.a. POS sale header): gains/tightens `currency: CurrencyCode` as its single settlement currency. Every line attached to this bill shares this currency.
- **Bill line item**: carries `unit_price` in the bill's `currency`. When added from inventory, the price is either pass-through (same currency) or converted via the currency service (different currency), rounded to the bill currency's decimal count.
- **Currency service** (consumed, not modified here): provides `convert`, `format`, `getAcceptedCurrencies`, `getPreferredCurrency`, `getMeta`. Built by spec 015.
- **Offline-data context** (consumed, not modified here): provides `acceptedCurrencies`, `preferredCurrency`, `formatAmount`. Built by spec 015.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 % of newly created inventory items in the store-app have a non-null `currency` that is a member of their store's `accepted_currencies`, verified via a repository-wide integration run (exercising the UI form, the import path, and any programmatic inserts).
- **SC-002**: 100 % of newly created bills have `bills.currency` populated and equal to the cashier-selected settlement currency; 100 % of their `bill_line_items` share that same currency. Verified via a synthetic scenario that creates ten bills in a mixed-currency store and inspects every written row.
- **SC-003**: A mixed-currency bill (at least one LBP-priced item and one USD-priced item) with settlement currency `USD` stores every line's `unit_price` in USD, rounds to two decimals, and produces a total whose difference from the naïvely recomputed total is within one rounding increment of the bill currency.
- **SC-004**: Zero occurrences of the pattern `|| 'USD'` and `|| 'LBP'` remain in store-app source files under `apps/store-app/src/contexts/offlineData/`, `apps/store-app/src/services/syncDownload.ts`, and `apps/store-app/src/services/syncService.ts`. Verified by repository grep.
- **SC-005**: Attempting to create an inventory item or a bill with a currency that is not in the store's `accepted_currencies` produces a user-readable error message naming the offending currency and the accepted list — localized to the three supported UI languages (English, Arabic, French) wherever the error is surfaced to the user.
- **SC-006**: Existing Lebanese stores observe no change in cashier-visible behaviour: same rendered symbols, same totals to the cent, same receipts — validated by running the sync-parity golden snapshot against a pre-feature and post-feature bill set.
- **SC-007**: With the local `stores` table empty, a sync-download cycle completes without writing any row whose currency was invented by a fallback, and emits at least one structured warning log identifying the missing store.
- **SC-008**: A cashier can complete a full mixed-currency bill (settlement pick → add two items in different source currencies → settle) in under 45 seconds on reference hardware, with no regressions versus the current single-currency baseline time for an equivalent two-line bill.

## Assumptions

- The store-app's currency service (spec 015) is initialized via `loadFromStore` before any POS screen or inventory form renders usable UI. This feature's guards assume `getAcceptedCurrencies()` returns a non-empty list by the time they run; the boot sequence that guarantees this is spec 015's responsibility.
- The `bills` table already has a `currency` column in Supabase and Dexie (per spec 014's schema widening), and the TypeScript contracts simply need the `CurrencyCode` tightening described in FR-008. If any of these storage-layer columns are missing, a schema patch is in-feature scope and is listed in the plan's pre-reqs.
- `bill_line_items` stores `unit_price` but not a per-line `currency` column — the line's currency is implicit in the parent bill. This matches today's schema; no new column is added.
- Rounding for non-USD target currencies (e.g. LBP with 0 decimals, JOD with 3) uses the bill currency's `CURRENCY_META.decimals`. Banker's rounding is chosen over half-up to minimize cumulative bias across many line items.
- The "blocked mid-bill currency change" behaviour (FR-019) is preferred over silent re-conversion to keep line totals reproducible and auditable. A future UX improvement could allow re-conversion with a confirmation; that is not in scope.
- Legacy inventory rows with `currency=null` are expected to be rare (only stores upgrading from pre-Phase-6 data). They are handled by UI marking and sell-blocking rather than by a mass back-fill — operator intervention is the canonical remediation.
- Bills that exist locally and unsettled at upgrade time are grandfathered: their `currency` field stays whatever the pre-feature fallback wrote, and they settle under that currency. Only bills **created** after the upgrade go through the new enforcement.

## Dependencies

- **Spec 013 — Shared Currency Foundation** (merged): provides `CurrencyCode`, `CURRENCY_META`, and `getDefaultCurrenciesForCountry`.
- **Spec 014 — Country & Multi-Currency Schema Widening** (must be merged before this feature ships): provides `country` and `accepted_currencies` columns on `stores` in both Supabase and Dexie, and the widened `StoreCore` / store-app `Database` types including the `CurrencyCode` tightening on `inventory_items.currency` and `bills.currency`.
- **Spec 015 — Currency Service & Context Wiring** (must be merged before this feature ships): provides `currencyService.convert/format/loadFromStore` and the offline-data context's `acceptedCurrencies`, `preferredCurrency`, `formatAmount` helpers. This feature's UI components consume those helpers directly; FR-004, FR-005, and FR-011 cannot be implemented without them.
- **Internal ordering**: per the rollout graph in `specs/008-multi-currency-country/TASKS.md`, Phase 6 (this feature's Task 11 half) must merge before Phase 7 (this feature's Task 12 half). Within this single release, both phases ship together; the internal implementation ordering is reflected in the plan.
