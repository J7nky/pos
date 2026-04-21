# Phase 0 Research — Shared Currency & Country Foundation

All items below had at most low-ambiguity questions. No `NEEDS CLARIFICATION` markers originated from the Technical Context block, so research is scoped to prior-art verification and small choice points.

---

## R-1 — ISO 4217 currency code list

**Decision**: Use the 21 codes enumerated in `specs/008-multi-currency-country/TASKS.md` Task 1 verbatim: `USD, LBP, EUR, GBP, SAR, AED, EGP, JOD, SYP, IQD, TRY, MAD, TND, DZD, LYD, SDG, YER, KWD, BHD, QAR, OMR`.

**Rationale**: The parent plan is the product-team source of truth for near-term expansion markets (MENA + select Western anchors). Adding codes is a one-line extension later and cheap; trimming codes later would require migration. 21 is a small enough surface that `Record<CurrencyCode, CurrencyMeta>` exhaustiveness doesn't become a maintenance burden.

**Alternatives considered**:
- *Full ISO 4217 list (~180 codes)*: Rejected — most entries would have no real users, each row in `CURRENCY_META` requires a human-curated locale/symbol/decimals triple, and the un-used entries would drift (LLM hallucinated locales, for example) with no real-world signal.
- *Minimal 2–3 codes (USD + LBP + AED)*: Rejected — Phase 4 (admin form) needs a real country selector for parity tests with a non-Lebanon store (Task 14 explicitly requires a UAE/AED case).

---

## R-2 — ISO 3166-1 alpha-2 country code list

**Decision**: Use the 22 countries enumerated in parent-plan Task 2 verbatim.

**Rationale**: Mirrors the currency list; covers every `CurrencyCode` member with at least one country plus US/UK/DE/FR as stable Western anchors. `getDefaultCurrenciesForCountry('ZZ')` falling back to `['USD']` absorbs the long tail without a thrown error.

**Alternatives considered**:
- *All ISO 3166-1 countries (~250)*: Rejected — same drift concern as R-1, plus the lookup is O(1) regardless of size so there's no perf win from expansion.

---

## R-3 — Decimal places per currency

**Decision**: Use ISO 4217 standard decimal values:
- `0 decimals`: LBP, SYP, IQD, YER
- `2 decimals`: USD, EUR, GBP, SAR, AED, EGP, TRY, MAD, DZD, SDG, QAR
- `3 decimals`: JOD, KWD, BHD, OMR, TND, LYD

**Rationale**: ISO 4217 is the authoritative standard and what `Intl.NumberFormat` expects when a `minimumFractionDigits` is not supplied. Diverging would guarantee inconsistent display across the app.

**Alternatives considered**:
- *Force everything to 2 decimals*: Rejected — LBP amounts would render as `1500000.00` which is technically wrong and visually noisy.

---

## R-4 — Locale hint per currency

**Decision**: One BCP 47 locale per currency entry (e.g. `ar-LB` for LBP, `en-US` for USD, `fr-MA` for MAD, `tr-TR` for TRY). Use French for Maghreb markets (MA, TN) per existing POS i18n coverage. Use Arabic for all Arabic-speaking markets.

**Rationale**: The locale is a *hint* for `Intl.NumberFormat`, not the authoritative UI locale. CG-10 (multilingual) requires wrapping user-facing text with the multilingual utilities; the locale hint only influences number grouping and symbol position when the hint is actually used.

**Alternatives considered**:
- *Always `en-US`*: Rejected — would lose RTL-aware grouping for ar locales.
- *Drop the locale field entirely*: Rejected — Phase 3 `CurrencyService.format()` needs it, and backfilling later would touch every `CURRENCY_META` entry.

---

## R-5 — Exhaustiveness enforcement pattern

**Decision**: Type `CURRENCY_META` as `Record<CurrencyCode, CurrencyMeta>`. TypeScript will error at compile time if a `CurrencyCode` variant is added without a matching registry entry.

**Rationale**: This is the idiomatic TS pattern for compile-time exhaustiveness over a string-literal union. No runtime check needed.

**Alternatives considered**:
- *`Partial<Record<CurrencyCode, CurrencyMeta>>` + runtime guard*: Rejected — defers the error to runtime, which is worse.
- *Array of entries + helper to validate coverage*: Rejected — adds runtime cost for an invariant the type system can enforce for free.

---

## R-6 — `getDefaultCurrenciesForCountry` fallback behavior

**Decision**: Unknown country codes return `['USD']` (platform pivot). Never throws.

**Rationale**: Callers in Phases 4, 8, 12 are UI/sync paths where a throw would surface as a user-visible error for a configuration gap. Returning a safe default matches the parent-plan's Task 2 acceptance criterion verbatim.

**Alternatives considered**:
- *Return empty array*: Rejected — every caller would have to guard, and an empty accepted-currencies list is meaningless to the POS sell flow.
- *Throw `UnknownCountryError`*: Rejected — pushes error-handling complexity up into UI code with no business benefit.

---

## R-7 — Where to place the test file

**Decision**: `packages/shared/tests/currency-country.test.ts` (a new `tests/` directory at the root of the shared package).

**Rationale**: Vitest is configured from the repo root; a `tests/` directory alongside `src/` is the conventional layout and matches how `apps/store-app/tests/` is organized. Keeps tests out of the compiled `dist/` output.

**Alternatives considered**:
- *Co-located `.test.ts` next to source*: Works too, but the shared package's `tsconfig` would need adjusting to exclude tests from the build, and the project doesn't currently use this convention elsewhere.

---

## R-8 — Backward-compat validation strategy

**Decision**: Do a repo-wide grep of existing `'USD' | 'LBP'` occurrences as part of the test suite — not as a runtime assertion but as a manual pre-merge check documented in `quickstart.md`. The type-system guarantees each literal remains a valid `CurrencyCode` subtype because both codes are in the union; no further automation needed for Phase 1.

**Rationale**: Exhaustive automation would be disproportionate to the scope. Phase 2 is where those unions get migrated, and that phase can own the verification.

**Alternatives considered**:
- *Write a codemod in Phase 1*: Rejected — out of scope. Phase 2 migrates the unions.
