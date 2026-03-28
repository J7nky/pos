import { PARITY_VOLATILE_ROW_KEYS } from './parityFieldRegistry';

const FIXED_TS = 'PARITY_FIXED_TIMESTAMP';

function normalizeValue(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    return FIXED_TS;
  }
  if (Array.isArray(v)) return v.map(normalizeValue);
  if (typeof v === 'object') return normalizeSnapshotObject(v as Record<string, unknown>);
  return v;
}

/** Recursively replace volatile keys and ISO timestamps for stable golden comparison */
export function normalizeSnapshotObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = Object.keys(obj).sort();
  for (const k of keys) {
    const v = obj[k];
    if (PARITY_VOLATILE_ROW_KEYS.has(k)) {
      out[k] = FIXED_TS;
      continue;
    }
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = normalizeSnapshotObject(v as Record<string, unknown>);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? normalizeSnapshotObject(item as Record<string, unknown>)
          : normalizeValue(item)
      );
    } else {
      out[k] = normalizeValue(v);
    }
  }
  return out;
}
