/**
 * Volatile fields normalized before golden comparison (plan D.2).
 * Only these keys may be stripped at top level of row objects inside snapshots.
 */
export const PARITY_VOLATILE_ROW_KEYS = new Set([
  'created_at',
  'updated_at',
  '_lastSyncedAt',
  'opened_at',
  'closed_at',
]);
