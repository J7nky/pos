/**
 * "Did this row list actually change?" check used to skip no-op `hydrate()`
 * setStates in the offline data layers.
 *
 * `refreshData()` re-reads every table and calls each layer's `hydrate()` after
 * every sync AND after every CRUD op. Without a guard, each `setState` installs a
 * brand-new array reference even when the rows are identical — re-rendering every
 * page and recomputing every dependent `useMemo`. Wrapping each setter as
 * `setX(prev => sameRowList(prev, next) ? prev : next)` lets React bail out
 * (returning the previous reference is a no-op), so unchanged tables cost nothing.
 *
 * Comparison is order-sensitive (both arrays come from the same Dexie
 * primary-key-ordered reads) and uses a per-row signature over the fields every
 * write path is guaranteed to bump: `id` (insert/remove), `updated_at` (edits),
 * `_deleted` (soft delete), and the sync metadata `_synced` / `_lastSyncedAt`.
 *
 * Conservative by design: anything uncertain returns `false` (treat as changed),
 * so a real change is never hidden — only genuinely-identical lists are skipped.
 */
export function sameRowList(
  prev: readonly any[] | null | undefined,
  next: readonly any[] | null | undefined,
): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (a === b) continue;
    if (!a || !b) return false;
    if (
      a.id !== b.id ||
      a.updated_at !== b.updated_at ||
      a._deleted !== b._deleted ||
      a._synced !== b._synced ||
      a._lastSyncedAt !== b._lastSyncedAt
    ) {
      return false;
    }
  }
  return true;
}
