# Parity gate — valid test definition

A test file is part of the **merge gate** only if all hold:

1. **Real sync path**: It invokes `SyncService` (exported `syncService`) or `eventStreamService.parityBaselineProcessEvent`, and asserts structured snapshot output.
2. **Observable assertions**: Deep equality against normalized golden JSON under `tests/sync-baseline/*.golden.json` (not count-only / existence-only).
3. **Determinism**: Same seed data and mocks produce identical normalized payloads.

Tests that do not meet (1)–(3) must be deleted or moved to `src/services/__tests__/legacy/` (excluded from default `vitest` via `vite.config.ts`).

The default `vitest` run (`pnpm run test:run`) **does not** include `tests/sync-parity/**`; that folder is only run via `pnpm run test:parity` (IndexedDB contract mocks).

**Dual-path invariant:** scenario `dual_path_sync_vs_eventstream` requires the same `products` snapshot from **SyncService** download and **EventStream** `processEvent`; a mismatch means the event path is wrong relative to sync (see `DUAL_PATH_AND_CONSOLE.md`).

**Gate commands** (from `apps/store-app`):

```bash
pnpm run parity:gate
```

**Golden updates** (requires review per team process):

```bash
UPDATE_PARITY_GOLDENS=1 pnpm run test:parity
```
