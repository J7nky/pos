import type { CurrencyCode } from '@pos-platform/shared';
import { CURRENCY_LEGACY_FIELD_MAP } from './currencyFieldMap';

/**
 * Helpers for reading and writing entity balances during the JSONB
 * dual-write transition (Layer 7 schema migration).
 *
 * Reads prefer `entity.balances?.[code]` and fall back to the legacy
 * `usd_balance`/`lb_balance` columns. Writes update both surfaces so
 * old call sites that still poke the scalar columns keep working until
 * Layer 7 fully rolls out and the legacy columns are dropped.
 */

type Kind = 'initial' | 'advance' | 'max';

const JSONB_FIELD: Record<Kind, 'balances' | 'advance_balances' | 'max_balances'> = {
  initial: 'balances',
  advance: 'advance_balances',
  max: 'max_balances',
};

type EntityLike = Record<string, unknown> & {
  balances?: Partial<Record<CurrencyCode, number>>;
  advance_balances?: Partial<Record<CurrencyCode, number>>;
  max_balances?: Partial<Record<CurrencyCode, number>>;
};

export function getEntityBalance(
  entity: EntityLike | null | undefined,
  code: CurrencyCode,
  kind: Kind = 'initial'
): number {
  if (!entity) return 0;
  const map = entity[JSONB_FIELD[kind]] as Partial<Record<CurrencyCode, number>> | undefined;
  if (map && typeof map[code] === 'number') return map[code] as number;

  // Legacy column fallback
  const fields = CURRENCY_LEGACY_FIELD_MAP[code];
  if (!fields) return 0;
  const legacy = entity[fields[kind]];
  return typeof legacy === 'number' ? legacy : 0;
}

/**
 * Returns a shallow patch object that callers can spread into
 * Dexie/Supabase update payloads to dual-write a balance change.
 * The patch includes the JSONB map *and* the legacy scalar so older
 * read paths (and Supabase RLS that may reference the old columns)
 * keep agreeing with the new map.
 */
export function buildEntityBalancePatch(
  entity: EntityLike | null | undefined,
  code: CurrencyCode,
  value: number,
  kind: Kind = 'initial'
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const mapField = JSONB_FIELD[kind];
  const currentMap = (entity?.[mapField] as Partial<Record<CurrencyCode, number>> | undefined) ?? {};
  patch[mapField] = { ...currentMap, [code]: value };

  const fields = CURRENCY_LEGACY_FIELD_MAP[code];
  if (fields) {
    patch[fields[kind]] = value;
  }
  return patch;
}

export function entityHasBalance(
  entity: EntityLike | null | undefined,
  code: CurrencyCode,
  kind: Kind = 'initial'
): boolean {
  return Math.abs(getEntityBalance(entity, code, kind)) > 0;
}
