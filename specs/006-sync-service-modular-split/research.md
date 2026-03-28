# Research: Modular sync service split

## 1. Extraction order (risk vs dependency)

| Order | Module | Rationale |
|-------|--------|-----------|
| 1 | `syncConfig.ts` | Zero runtime behavior; moves `SYNC_CONFIG`, `SYNC_TABLES`, `SYNC_DEPENDENCIES`, `SyncTable`/`SyncResult` types; unblocks other files. |
| 2 | `syncUpload.ts` | Highest business risk (upload-then-emit, batching, cash-drawer preflight). Isolate early while tests are fresh. |
| 3 | `syncDownload.ts` | Large but mostly deterministic table loops; depends on config + shared helpers. |
| 4 | `syncDeletionDetection.ts` | Uses `SYNC_CONFIG` pagination/hash; touches `deletionStateCache` — move with class or inject cache. |

**Decision**: Follow 1→2→3→4. Run `parity:gate` after each major step or at minimum after each PR-sized chunk.

## 2. Orchestrator vs pure functions

**Decision**: Keep **`SyncService` as a class** in `syncService.ts` holding instance state (`isRunning`, `deletionStateCache`, `lastDeletionCheck`, last sync timestamps, etc.). New modules export **functions** that receive `this`-bound context or explicit parameters (`SyncServiceContext`) so behavior matches the current private-method closures.

**Alternatives considered**:
- **All-static modules**: Rejected — too much state to thread without a large refactor risk.
- **New class per module**: Rejected — unnecessary duplication of `SyncService` lifecycle.

## 3. Shared “context” type

**Decision**: Introduce a narrow internal type (e.g. `SyncServiceContext`) or pass `SyncService` instance into module functions with `// eslint-disable-next-line` only where needed for circular typing—prefer **explicit parameter lists** for pure helpers (table name, store id, batch) to ease unit tests.

## 4. ESLint `no-explicit-any`

**Decision**: Extend `eslint.config.js` `files` glob from `src/services/syncService.ts` to include `syncUpload.ts`, `syncDownload.ts`, `syncDeletionDetection.ts` (and `syncConfig.ts` if it stays `any`-free) so the project does not reintroduce file-level `eslint-disable` for dynamic Supabase/Dexie access.

## 5. Testing strategy

**Decision**: **Parity gate is authoritative** (`pnpm run parity:gate`). Preserve or extend unit tests under `src/services/__tests__/` for isolated helpers if extracted. **Do not** duplicate full sync in unit tests without mocks—parity suite already covers integration behavior.

## 6. Public API stability

**Decision**: Keep **`export const syncService`**, **`syncWithSupabase`**, **`getLastSyncedAt` / `setLastSyncedAt`**, **`SYNC_TABLES`**, **`SyncResult`** from `syncService.ts` (re-export from `syncConfig` where types/constants move). Avoid breaking `import { syncService } from '../../src/services/syncService'` in parity tests and context.

## 7. Upload-then-emit (CG-03)

**Decision**: All `eventEmissionService` calls remain **physically inside** the upload module’s code paths that run **after** Supabase confirms the batch. No emit from download or deletion modules.
