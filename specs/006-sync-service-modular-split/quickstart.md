# Quickstart: Verify modular sync refactor

**Prereqs**: Node ≥18, `pnpm` from repo root.

## 1. Store-app parity gate (required before merge)

```bash
cd /home/janky/Desktop/pos-1
pnpm --filter ./apps/store-app run parity:gate
```

This runs:

- `vitest run --config vitest.parity.config.ts`
- `parity:check-registry`
- `parity:check-dexie-mode`
- `parity:coverage-matrix`

## 2. Full unit test run (optional regression)

```bash
pnpm --filter ./apps/store-app run test:run
```

## 3. Docs to read before editing sync code

- [spec.md](../spec.md) — FR/SC and parity baseline  
- [contracts/sync-public-api.md](./contracts/sync-public-api.md) — stable exports  
- `apps/store-app/tests/sync-parity/coverage-matrix.md` — table ↔ scenario coverage  
- `apps/store-app/tests/sync-parity/VALID_TEST_RULES.md` — parity test rules  

## 4. ESLint after split

Ensure `apps/store-app/eslint.config.js` includes new `src/services/sync*.ts` files in the same targeted `@typescript-eslint/no-explicit-any` override as the original `syncService.ts` (see plan).

## 5. Failure triage

1. If parity fails: **diff golden** or scenario output; confirm no intentional `SYNC_TABLES` order change without updating `sync-tables.json`.  
2. If registry fails: `SYNC_TABLES` in code must match `tests/sync-parity/sync-tables.json`.  
3. If upload-then-emit fails: search for `eventEmissionService` outside upload module—violates CG-03.
