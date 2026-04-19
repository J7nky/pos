# Architecture Rules - Quick Reference

## 🚨 **MANDATORY RULES**

### **Data Access Pattern:**
```
UI → OfflineDataContext → db.ts + syncService → Supabase
```

### **❌ UI must NOT import:**
- `supabase` (e.g. `lib/supabase` or any Supabase client)
- `db` (e.g. `lib/db`, `getDB()`, or any direct IndexedDB access)
- `repositories` (any repository layer that wraps db/supabase)

### **✅ UI may ONLY import from:**
- **hooks** (e.g. `useOfflineData`, `useCurrency`, `useSupabaseAuth`)
- **services** (business logic that does not expose db/supabase to callers)
- **contexts** (e.g. `OfflineDataContext`, `SupabaseAuthContext`)

*(Services and contexts may use `db` and `supabase` internally; syncService and auth may use Supabase.)*

---

## 🔧 **Quick Fixes**

### **If you see this in UI (pages/components/layouts):**
```typescript
// ❌ WRONG — UI must not import these
import { getDB } from '../lib/db';
import { supabase } from '../lib/supabase';
import { someRepository } from '../repositories/...';
```

### **Use only hooks, services, contexts:**
```typescript
// ✅ CORRECT
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useCurrency } from '../hooks/useCurrency';
const { products, addProduct, updateProduct } = useOfflineData();
```

---

## 📋 **Code Review Checklist**

- [ ] No `import` of **supabase** in UI (pages/components/layouts)
- [ ] No `import` of **db** (or `getDB`) in UI
- [ ] No `import` of **repositories** in UI
- [ ] UI imports only from **hooks**, **services**, **contexts**
- [ ] Data access goes through `useOfflineData()` or other context/hook APIs

---

## Sync parity merge gate (before modular `syncService` refactor)

**Do not merge** a structural refactor of `syncService` until the parity gate is green on the default branch.

From repository root:

```bash
pnpm --filter ./apps/store-app run parity:gate
```

**Failure modes:** any Vitest failure in the parity config; golden mismatch; `parity:check-registry` (unknown volatile keys); `parity:check-dexie-mode` (mixed Dexie usage); `parity:coverage-matrix` warnings/errors per script policy.

Details: [DEVELOPER_RULES.md](DEVELOPER_RULES.md) (Sync parity baseline) and [apps/store-app/tests/sync-parity/VALID_TEST_RULES.md](apps/store-app/tests/sync-parity/VALID_TEST_RULES.md).

---

## 🗺️ **Dependency Graph (store-app)**

The store-app has a layered data/sync stack. Read top-down: each layer only depends on layers below it. Nothing below may import from layers above.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ UI (pages / components / layouts)                                        │
│   — may import: hooks, services that do NOT expose db/supabase,          │
│                 contexts (OfflineDataContext, SupabaseAuthContext, …)    │
│   — may NOT import: db, supabase, repositories, syncService,             │
│                     eventStreamService                                   │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────┐
│ OfflineDataContext (composer) + domain data layers + orchestration hooks │
│   — owns store/branch state, entity arrays, sync counters, refreshData   │
│   — wires crudHelperService.setLifecycleHost (the single consumer)       │
│   — depends on: crudHelperService, syncService, eventStreamService,      │
│                 eventEmissionHelper, domain services                     │
└───────────────┬────────────────────────┬──────────────┬─────────────────┘
                │                        │              │
┌───────────────▼─────────┐  ┌───────────▼──────┐  ┌────▼────────────────┐
│ crudHelperService        │  │ syncService       │  │ eventStreamService  │
│   (singleton, DI host)   │  │   (orchestrator)  │  │   (realtime sub)    │
│   — CRUD → db            │  │   uses:           │  │   uses:             │
│   — calls host callbacks │  │     syncUpload    │  │     supabase        │
│     for refresh/sync     │  │     syncDownload  │  │     db              │
│                          │  │     syncDeletionDetection                  │
│                          │  │     db / supabase / eventEmissionService   │
└─────────────┬────────────┘  └────────┬──────────┘  └──────┬──────────────┘
              │                        │                    │
              │                        │                    │
┌─────────────▼────────────────────────▼────────────────────▼──────────────┐
│ db (IndexedDB / Dexie v4)        supabase (PostgreSQL client)            │
│   — source of truth locally         — source of truth remotely            │
│   — offline reads/writes            — auth, sync RPCs, branch_event_log   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Allowed Supabase users

| User | Reason |
|---|---|
| `syncService` (+ `syncUpload`, `syncDownload`, `syncDeletionDetection`) | Uploads, downloads, deletion detection |
| `SupabaseAuthContext` / `services/supabaseService` | Auth / session |
| `eventEmissionService` | Emits to `branch_event_log` after upload |
| `eventStreamService` | Realtime subscription + version catch-up |
| `employeeService` | Admin-API operations via `supabaseAdmin` |
| `qrCodeService`, `downloadOptimizationService`, `universalChangeDetectionService`, `publicStatementService` | Narrow, justified Supabase uses |

No other module in `src/` should import `supabase` directly. ESLint's `no-restricted-imports` rule enforces this for `pages/`, `components/`, `layouts/`.

### Sync + event facade status

The sync/event stack is internally layered (`syncService` orchestrates `syncUpload` / `syncDownload` / `syncDeletionDetection`; `eventEmissionService` writes events; `eventStreamService` consumes them). `OfflineDataContext` depends on the three top-level services directly for now; a single `SyncOrchestrator` facade that wraps all three is a candidate future refactor if the dependency surface expands further.

### Multi-tab behavior

**Contract:** multi-tab is **best-effort, not strongly consistent.** Two tabs of the store-app open to the same store/branch are each independent processes:

- Each tab opens its own Dexie connection to the same IndexedDB database. IndexedDB *does* serialize writes across tabs at the storage layer, so data is not corrupted, but React state, caches, and in-flight sync state are **per-tab**.
- Each tab has its own `eventStreamService` subscription and its own `syncService` `isRunning` guard. Two tabs may sync concurrently; Supabase handles the write-side conflict (last-write-wins on updates), and each tab independently receives realtime events.
- Cached balance values (1s TTL), debounced sync timers, and context state are not shared across tabs. A tab that just committed a write will see its own fresh balance before its sibling does.

**What this means in practice:**

- Safe: one user working in two tabs (e.g. reports tab + POS tab). Data eventually converges; both tabs see the same IndexedDB rows after their next refresh/event cycle.
- Risky: two users on the same device entering conflicting writes in separate tabs. Same as two devices — the second write wins and the first user will not see an in-tab warning.

**If stronger guarantees are needed** (single-writer semantics, live cross-tab state), the path would be a shared worker or BroadcastChannel-based leader election, with one "owning" tab running sync + eventStream and the others reading a shared state. That is not implemented today and not planned unless a real multi-tab workflow emerges.

---

## 🎯 **Why This Matters**

- **Offline-first**: Works without internet
- **Single Source of Truth**: Consistent data state
- **Automatic Sync**: Changes sync to cloud automatically
- **Performance**: Cached data, optimized re-renders
- **Error Handling**: Centralized error management
