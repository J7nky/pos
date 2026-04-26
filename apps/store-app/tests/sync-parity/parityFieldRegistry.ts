/**
 * Volatile fields normalized before golden comparison (plan D.2).
 * Only these keys may be stripped at top level of row objects inside snapshots.
 *
 * Feature 017 / Phase 2: `country` and `accepted_currencies` on `stores` are **not**
 * volatile — they are compared in goldens as-is. The normalizer only rewrites
 * `PARITY_VOLATILE_ROW_KEYS` and ISO timestamps; it does not strip store geography fields.
 */
export const PARITY_STORES_PARITY_FIELDS = ['country', 'accepted_currencies'] as const;

export const PARITY_VOLATILE_ROW_KEYS = new Set([
  'created_at',
  'updated_at',
  '_lastSyncedAt',
  'opened_at',
  'closed_at',
]);
