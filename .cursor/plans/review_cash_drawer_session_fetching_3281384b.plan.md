---
name: Review Cash Drawer Session Fetching
overview: Review the current implementation of cash drawer session fetching in Home.tsx to ensure it queries the database directly instead of relying on potentially stale context state, and assess scalability and best practices.
todos:
  - id: review-current-implementation
    content: Review current implementation of getLocalCurrentSession() and loadCashDrawerStatus() to understand data flow and identify issues
    status: pending
  - id: analyze-scalability
    content: "Analyze scalability concerns: context state staleness, race conditions, sync timing, and multiple event listeners"
    status: pending
    dependencies:
      - review-current-implementation
  - id: recommend-changes
    content: Recommend changes to query IndexedDB directly instead of relying on context state, with proper async handling
    status: pending
    dependencies:
      - analyze-scalability
  - id: assess-best-practices
    content: Assess current best practices (debouncing, memoization, refs) and identify areas for improvement
    status: pending
    dependencies:
      - review-current-implementation
---

# Review: Cash Drawer Session Fetching Implementation

## Current Implementation Analysis

### Problem Identified

The `getLocalCurrentSession()` function in `Home.tsx` currently relies on context state (`cashDrawer` from `OfflineDataContext`), which can be stale when:

- App first opens before sync completes
- Context hasn't refreshed after sync
- Multiple components update context state asynchronously

### Current Flow

```143:145:apps/store-app/src/pages/Home.tsx
  const getLocalCurrentSession = useCallback(() => {
    return cashDrawer; // Already available in context
  }, [cashDrawer]);
```

**Issues:**

1. **Redundancy**: `cashDrawerUpdateService.getCurrentCashDrawerBalances()` already queries DB directly (line 298 in `cashDrawerUpdateService.ts`)
2. **Stale Data Risk**: Context state (`cashDrawer`) may not reflect latest IndexedDB state
3. **Race Condition**: Context refresh happens asynchronously after sync completes

### Recommended Solution

**Change `getLocalCurrentSession()` to query database directly:**

```typescript
const getLocalCurrentSession = useCallback(async () => {
  if (!raw.storeId || !raw.currentBranchId) return null;
  const { getDB } = await import('../lib/db');
  return await getDB().getCurrentCashDrawerSession(raw.storeId, raw.currentBranchId);
}, [raw.storeId, raw.currentBranchId]);
```

**Benefits:**

- ✅ Single source of truth (IndexedDB)
- ✅ Always up-to-date data
- ✅ Consistent with `cashDrawerUpdateService` approach
- ✅ Eliminates race conditions

### Architecture Review

#### Data Flow Analysis

```javascript
Supabase → syncService → IndexedDB → cashDrawerUpdateService → UI
                              ↓
                        Context State (stale risk)
```

**Current:** Context state acts as intermediary (can be stale)**Recommended:** Query IndexedDB directly (always fresh)

#### Scalability Assessment

**Current Implementation:**

- ✅ Uses debouncing (500ms) to prevent excessive queries
- ✅ Caches balances in `cashDrawerUpdateService` (5 seconds)
- ✅ Uses refs to prevent unnecessary re-renders
- ⚠️ Relies on context state which can be stale

**Scalability Concerns:**

1. **Context State Dependency**: Multiple components reading/writing to `cashDrawer` state can cause inconsistencies
2. **Sync Timing**: Context refresh happens after sync, but Home page may load before refresh completes
3. **Event Listeners**: Multiple event listeners (`cash-drawer-updated`, `undo-completed`, `data-synced`) trigger refreshes, but context may not be updated yet

#### Best Practices Review

**✅ Good Practices:**

- Uses `useCallback` for memoization
- Implements debouncing for performance
- Uses refs to track previous values and prevent unnecessary updates
- Implements proper cleanup in `useEffect`

**⚠️ Areas for Improvement:**

1. **Direct DB Query**: Should query IndexedDB directly instead of context state
2. **Error Handling**: Should handle DB query errors gracefully
3. **Loading States**: Should handle async DB queries properly

### Implementation Changes Needed

1. **Update `getLocalCurrentSession()`** to query DB directly (make it async)
2. **Update `loadCashDrawerStatus()`** to await the async session query
3. **Remove dependency** on context `cashDrawer` state for session checking
4. **Keep context state** for other purposes (like triggering refreshes) but don't rely on it for data

### Testing Considerations

After changes, verify:

1. ✅ Session appears immediately after sync completes
2. ✅ No race conditions between sync and UI rendering
3. ✅ Performance remains acceptable (DB queries are fast)
4. ✅ Works correctly when offline (IndexedDB is always available)

### Migration Path

1. Change `getLocalCurrentSession()` to async DB query