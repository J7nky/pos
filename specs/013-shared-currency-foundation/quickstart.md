# Quickstart — Shared Currency & Country Foundation

This phase adds pure types and constants. There is no user-visible behavior to demo. The quickstart below shows how downstream phases will consume the new surface and how to extend it.

---

## 1. Install / build

Phase 1 adds no new dependencies. After checking out the branch:

```bash
pnpm install                      # no new lockfile entries expected
pnpm --filter @pos-platform/shared build
pnpm build:store                  # must pass with zero new type errors
pnpm build:admin                  # must pass with zero new type errors
pnpm --filter @pos-platform/shared test    # runs the new currency-country test
```

Expected: all four commands exit 0.

---

## 2. Consuming the new exports (what later phases will look like)

### 2.1 Phase 2 — Widen `StoreCore` (preview, not in this phase)

```ts
// packages/shared/src/types/supabase-core.ts — a Phase 2 change, shown here for orientation
import type { CurrencyCode } from './currency';

export interface StoreCore {
  id: string;
  name: string;
  country: string;
  preferred_currency: CurrencyCode;          // was: 'USD' | 'LBP'
  accepted_currencies: CurrencyCode[];
  // ...
}
```

### 2.2 Phase 4 — Admin StoreForm country change handler (preview)

```tsx
import { COUNTRY_MAP, getDefaultCurrenciesForCountry } from '@pos-platform/shared';

function onCountryChange(code: string) {
  const cfg = COUNTRY_MAP[code];
  setFormData({
    country: code,
    preferred_currency: cfg?.localCurrency ?? 'USD',
    accepted_currencies: getDefaultCurrenciesForCountry(code),
    exchange_rate: '',
  });
}
```

### 2.3 Phase 3 — `CurrencyService.format` (preview)

```ts
import { CURRENCY_META, type CurrencyCode } from '@pos-platform/shared';

function format(amount: number, code: CurrencyCode): string {
  const meta = CURRENCY_META[code];
  return new Intl.NumberFormat(meta.locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  }).format(amount);
}
```

---

## 3. Extending the lists later

### Adding a new currency (e.g. `INR`)

1. Add `| 'INR'` to the `CurrencyCode` union in `packages/shared/src/types/currency.ts`.
2. TypeScript will immediately error on `CURRENCY_META` — add the entry:
   ```ts
   INR: { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 2, locale: 'en-IN' },
   ```
3. Optionally add country `IN`:
   ```ts
   { code: 'IN', name: 'India', localCurrency: 'INR', defaultCurrencies: ['INR', 'USD'] },
   ```
4. `pnpm --filter @pos-platform/shared build` — should pass.
5. `pnpm --filter @pos-platform/shared test` — existing tests pass; add a case to the test if desired.

The exhaustiveness check on `Record<CurrencyCode, CurrencyMeta>` guarantees step 2 cannot be skipped.

### Adding a new country

Single-line addition to `COUNTRY_CONFIGS`. `COUNTRY_MAP` is derived automatically.

---

## 4. Verifying backward compatibility

Existing code still uses `'USD' | 'LBP'` literal unions in dozens of files. Phase 1 must not break any of them. Manual check:

```bash
# Sanity: the project still type-checks everywhere
pnpm -r build
```

If the build passes, every existing `'USD' | 'LBP'` usage remains valid because both codes are members of the new `CurrencyCode` union. Phase 2 will do the actual migration of those call sites.

---

## 5. What Phase 1 does **not** give you

- No `format()` / `convert()` — Phase 3.
- No `country` column on `stores` — Phase 2.
- No admin form changes — Phase 4.
- No POS sell-flow enforcement — Phase 7.
- No accounting-column generalization — Phase 11.
- No live exchange rates — Phase 10.

Trying to consume any of these in Phase 1 means the wrong phase is being worked on.

---

## Validation log

- 2026-04-21: `pnpm --filter @pos-platform/shared build`, `pnpm --filter @pos-platform/shared test`, `pnpm -r build`, `pnpm build:store`, and `pnpm build:admin` all completed with exit code 0. `pnpm lint` from repo root failed here because the `eslint` script was not resolved on PATH for `admin-app` (use `pnpm exec eslint` from each app directory if needed). Workspace adds `vitest` under `packages/shared` so `pnpm-lock.yaml` gains entries for shared tests. `CurrencyCode` grep: definitions only under `packages/shared/src/types/currency.ts` plus barrel re-export in `index.ts` (no competing aliases in `apps/` or `packages/`).
