# Feature Specification: Shared Currency & Country Foundation (Phase 1 of Multi-Currency)

**Feature Branch**: `013-shared-currency-foundation`
**Created**: 2026-04-21
**Status**: Draft
**Input**: User description: "start collecting the requirements for @specs/008-multi-currency-country/TASKS.md first phase"

## Context

This feature delivers **Phase 1** of the larger multi-currency / country-aware store initiative tracked in `specs/008-multi-currency-country/TASKS.md`. Phase 1 is intentionally narrow: it establishes the **canonical shared vocabulary** (supported currencies and their country-to-currency defaults) that every later phase — schema changes, service refactors, admin form work, POS sell-flow enforcement — will consume.

Phase 1 corresponds to Tasks 1 and 2 of the parent plan. It introduces **no runtime behavior change** in either the store-app or the admin-app: no database migrations, no UI changes, no sync path changes. Both apps must continue to compile and behave identically after this phase ships.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Platform has a single source of truth for supported currencies (Priority: P1)

The platform currently hard-codes the pair `'USD' | 'LBP'` in roughly a dozen places across the shared package and the store-app. Adding any third currency today requires hunting down and changing every one of those literals, and it's easy to miss one. After Phase 1, there is one canonical list of supported currency codes (with human-readable name, symbol, decimal places, and locale for each) exported from `@pos-platform/shared`. All later phases replace their two-currency unions with imports from that list.

**Why this priority**: Every subsequent phase (schema, service, admin form, POS, accounting) depends on this type existing. Without it, later work has no stable contract to target and each app would invent its own incompatible currency enum.

**Independent Test**: After Phase 1 ships, both apps build cleanly and a type-check run from the repo root passes. The shared package exports a `CurrencyCode` union and a `CURRENCY_META` registry; every existing `'USD' | 'LBP'` literal in the codebase remains a valid subtype of `CurrencyCode` (so nothing is newly broken). No other phase can consume it until Phase 2 widens the schema types to use it.

**Acceptance Scenarios**:

1. **Given** a developer wants to reference "the list of currencies the platform supports", **When** they open `@pos-platform/shared`, **Then** they find one exported `CurrencyCode` union and one `CURRENCY_META` registry keyed by that union, with no competing duplicate definition anywhere else in the repo.
2. **Given** an existing file uses `'USD' | 'LBP'` as a column type, **When** Phase 1 is merged, **Then** that file still compiles because both `'USD'` and `'LBP'` are valid members of the new `CurrencyCode` union.
3. **Given** a developer queries the metadata for a currency (e.g. `CURRENCY_META['LBP']`), **When** the lookup runs, **Then** they receive the currency's display name, symbol, decimal count, and locale hint — sufficient to format an amount without hard-coding per-currency logic elsewhere.

---

### User Story 2 — Platform knows which currencies a country should use by default (Priority: P1)

When a store is created in a given country, the system should know which local currency that country uses and which currencies should be enabled out of the box (always including USD as a pivot). Today this logic does not exist — creation flows hard-code `LBP` + `USD`. After Phase 1, a lookup function in `@pos-platform/shared` answers "given country code X, what are the default accepted currencies?" with a deterministic result. This function is purely informational in Phase 1 — nothing calls it yet — but it is the contract Phase 4 (admin form) and Phase 8 (store creation) will consume.

**Why this priority**: The admin-form work in Phase 4 is blocked without this lookup. Bundling the country map into Phase 1 means Phase 4 can start in parallel with Phases 2/3/5 (per the phase-parallelism diagram in the parent plan).

**Independent Test**: Import `getDefaultCurrenciesForCountry` from the shared package and call it with known country codes. The results match the expected mapping (Lebanon → `['LBP', 'USD']`, United States → `['USD']`, unknown code → `['USD']`).

**Acceptance Scenarios**:

1. **Given** the shared package exports `getDefaultCurrenciesForCountry`, **When** called with `'LB'`, **Then** it returns `['LBP', 'USD']`.
2. **Given** the same function, **When** called with `'US'`, **Then** it returns `['USD']` (no duplicate USD entry even though USD is always included by policy).
3. **Given** the same function, **When** called with an unrecognized ISO 3166-1 alpha-2 code (e.g. `'ZZ'`), **Then** it returns `['USD']` as a safe fallback, without throwing.
4. **Given** a developer wants the full country list for a UI selector, **When** they import `COUNTRY_CONFIGS`, **Then** they receive an array where every entry's `localCurrency` is a valid `CurrencyCode` and every entry's `defaultCurrencies` contains `'USD'`.

---

### Edge Cases

- **Country whose local currency is USD** (e.g. United States): `defaultCurrencies` is `['USD']`, not `['USD', 'USD']`. Deduplication happens at map-definition time.
- **Unknown country code** passed to `getDefaultCurrenciesForCountry`: returns `['USD']` rather than throwing or returning an empty array, so callers never have to guard against a null result.
- **Currency code referenced in `COUNTRY_CONFIGS` that is not in `CurrencyCode`**: must be impossible — TypeScript rejects the file at compile time because `localCurrency` is typed as `CurrencyCode`. A checklist/test asserts every entry type-checks.
- **Legacy consumers**: every existing `'USD' | 'LBP'` literal elsewhere in the codebase remains valid after Phase 1, because both codes stay in the new `CurrencyCode` union. Phase 1 does **not** migrate those call sites.
- **Extending the list later**: adding a new currency is a one-line addition to `CurrencyCode`, a corresponding entry in `CURRENCY_META`, and (optionally) an entry in `COUNTRY_CONFIGS`. TypeScript's exhaustiveness check on `Record<CurrencyCode, CurrencyMeta>` forces the meta entry to exist.

## Requirements *(mandatory)*

### Functional Requirements

**Currency vocabulary**

- **FR-001**: The shared package MUST export a single `CurrencyCode` union type whose members are the ISO 4217 codes listed in the parent plan (`USD`, `LBP`, `EUR`, `GBP`, `SAR`, `AED`, `EGP`, `JOD`, `SYP`, `IQD`, `TRY`, `MAD`, `TND`, `DZD`, `LYD`, `SDG`, `YER`, `KWD`, `BHD`, `QAR`, `OMR`).
- **FR-002**: The shared package MUST export a `CURRENCY_META` registry typed as `Record<CurrencyCode, CurrencyMeta>`, where every variant of `CurrencyCode` has an entry. The registry's exhaustiveness MUST be enforced at compile time.
- **FR-003**: Each `CurrencyMeta` entry MUST carry: `code` (the `CurrencyCode`), `name` (English display name), `symbol` (display symbol), `decimals` (number of decimal places — e.g. 0 for LBP, 2 for USD, 3 for Gulf dinars), and `locale` (BCP 47 locale hint for `Intl.NumberFormat`).
- **FR-004**: The shared package MUST NOT include any runtime logic beyond pure constants and the one helper function in FR-008. In particular, no formatting, conversion, or I/O code belongs in Phase 1.

**Country vocabulary**

- **FR-005**: The shared package MUST export a `CountryConfig` interface containing: ISO 3166-1 alpha-2 `code`, display `name`, `localCurrency` (of type `CurrencyCode`), and `defaultCurrencies` (a `CurrencyCode[]` that always contains `'USD'`).
- **FR-006**: The shared package MUST export a `COUNTRY_CONFIGS` array covering, at minimum, every country listed in the parent plan's country table (Lebanon, United States, United Kingdom, Germany, France, Saudi Arabia, UAE, Egypt, Jordan, Syria, Iraq, Turkey, Morocco, Tunisia, Algeria, Libya, Sudan, Yemen, Kuwait, Bahrain, Qatar, Oman).
- **FR-007**: The shared package MUST export a keyed-lookup helper `COUNTRY_MAP` (`Record<string, CountryConfig>`) derived from `COUNTRY_CONFIGS` so callers can do O(1) lookup by country code.
- **FR-008**: The shared package MUST export a function `getDefaultCurrenciesForCountry(countryCode: string): CurrencyCode[]` that returns `COUNTRY_MAP[countryCode].defaultCurrencies` for known codes and `['USD']` for unknown codes. It MUST NOT throw.
- **FR-009**: For every entry in `COUNTRY_CONFIGS`, `defaultCurrencies` MUST contain `'USD'`, and MUST NOT contain `'USD'` twice when the country's local currency already is `USD`.

**Export surface & backward compatibility**

- **FR-010**: All new symbols (`CurrencyCode`, `CurrencyMeta`, `CURRENCY_META`, `CountryConfig`, `COUNTRY_CONFIGS`, `COUNTRY_MAP`, `getDefaultCurrenciesForCountry`) MUST be re-exported from `packages/shared/src/types/index.ts` so consumers import them from the package root.
- **FR-011**: Phase 1 MUST NOT modify, rename, or remove any existing export from the shared package. Every existing import in store-app and admin-app MUST keep resolving to the same symbol.
- **FR-012**: The existing `'USD' | 'LBP'` literal unions scattered across the shared package and both apps MUST remain valid after Phase 1. Phase 1 MUST NOT migrate those call sites — migrations happen in Phases 2+.

**Validation**

- **FR-013**: `pnpm --filter @pos-platform/shared build` MUST pass with zero type errors.
- **FR-014**: `pnpm build:store` and `pnpm build:admin` MUST both pass with zero new type errors after Phase 1 is merged.
- **FR-015**: A test (unit or type-level) MUST assert that `getDefaultCurrenciesForCountry` returns `['LBP','USD']` for `'LB'`, `['USD']` for `'US'`, and `['USD']` for `'ZZ'` (unknown code).

### Key Entities

- **CurrencyCode**: The canonical set of ISO 4217 currency codes the platform supports. Pure type — no runtime representation beyond being the union of string literals.
- **CurrencyMeta**: Per-currency display metadata (name, symbol, decimals, locale) that any UI formatting or accounting render path can consume without embedding currency-specific knowledge.
- **CountryConfig**: The ISO 3166-1 alpha-2 identity of a country plus its primary local currency and the default set of currencies a store in that country should operate in. Always includes USD as the platform pivot currency.
- **CURRENCY_META**: Exhaustive mapping from `CurrencyCode` to `CurrencyMeta`. Compile-time enforcement via `Record<CurrencyCode, CurrencyMeta>` guarantees no currency is added to the union without its metadata.
- **COUNTRY_MAP**: O(1) lookup from country code to `CountryConfig`, derived from `COUNTRY_CONFIGS`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After merge, exactly **one** definition of `CurrencyCode` exists in the repository (in the shared package) — a repo-wide search for the identifier finds only its declaration and re-exports, with zero competing definitions.
- **SC-002**: Building the shared package, store-app, and admin-app from a clean install produces **zero** new type errors attributable to Phase 1.
- **SC-003**: Every country entry in `COUNTRY_CONFIGS` satisfies the invariant `defaultCurrencies.includes('USD') === true`, verified by a test that iterates over the array.
- **SC-004**: Adding a **new** currency to `CurrencyCode` (hypothetical 22nd entry) without adding a corresponding `CURRENCY_META` entry produces a compile-time error in the shared package — proving exhaustiveness is enforced.
- **SC-005**: A developer starting Phase 2 (schema widening) can import `CurrencyCode` from `@pos-platform/shared` and replace a `'USD' | 'LBP'` union in `supabase-core.ts` **without** touching the shared package further — Phase 1's surface is sufficient to unblock Phase 2.
- **SC-006**: `getDefaultCurrenciesForCountry` returns in under 1ms for any input on a cold call (it is an O(1) object lookup with a fallback) — a sanity invariant that rules out accidental I/O in the shared layer.

## Assumptions

- The ISO 4217 currency list from the parent plan (21 codes) is the correct starting set. Any additions later are one-line extensions and don't require re-specifying Phase 1.
- The ISO 3166-1 alpha-2 country list from the parent plan (22 countries) covers the near-term onboarding surface. Extending it later is additive.
- `USD` is always part of `defaultCurrencies` by platform policy (it is the accounting pivot). This is not a user-configurable decision at Phase 1; stores that truly never touch USD can still have it in their accepted list without consequence, because no code yet consumes these defaults.
- `CURRENCY_META.decimals` uses ISO 4217 standard values (e.g. 0 for LBP/SYP/IQD/YER, 2 for USD/EUR, 3 for JOD/KWD/BHD/OMR/TND/LYD). These are conventional and do not need clarification.
- Locale hints in `CURRENCY_META` are best-effort — they inform `Intl.NumberFormat` but are not contractually tied to UI locale selection. Later phases decide the actual UI locale.
- Out of scope in Phase 1: the dual-ledger accounting columns (`debit_usd`, `credit_usd`, etc.) flagged as out-of-scope in the parent plan — they are handled in Phase 11.

## Dependencies

- None. Phase 1 is a leaf node in the phase dependency graph from the parent plan. It does not require any prior phase or any external coordination.

## Out of Scope (Explicit)

- **No database migrations.** The `country` column and `accepted_currencies` array on `stores` are Phase 2.
- **No Dexie schema bumps.** Phase 2 bumps Dexie.
- **No service refactors.** The `CurrencyService` rewrite is Phase 3.
- **No UI changes.** Admin `StoreForm` work is Phase 4; store-app context surfacing is Phase 5.
- **No call-site migrations.** Existing `'USD' | 'LBP'` usages stay as-is. Later phases replace them.
- **No runtime formatting or conversion logic** in the shared package — only types and constants.
- **No exchange-rate data** — rates are Phase 10.
