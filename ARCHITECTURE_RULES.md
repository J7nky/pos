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

## 🎯 **Why This Matters**

- **Offline-first**: Works without internet
- **Single Source of Truth**: Consistent data state
- **Automatic Sync**: Changes sync to cloud automatically
- **Performance**: Cached data, optimized re-renders
- **Error Handling**: Centralized error management
