import type { CurrencyCode } from '@pos-platform/shared';

/**
 * Maps a CurrencyCode to the legacy per-currency column names that pre-date
 * the JSONB `balances`/`advance_balances` map (Layer 7 schema migration).
 *
 * Used by UI components that still read/write the legacy columns so the
 * rendered fields/cards/columns can be filtered by `acceptedCurrencies`
 * without changing data shape. After Layer 7 lands, callers should switch
 * to the JSONB map directly and this util can be retired.
 */
export type EntityBalanceFieldKeys = {
  initial: 'usd_balance' | 'lb_balance';
  advance: 'advance_usd_balance' | 'advance_lb_balance';
  max: 'usd_max_balance' | 'lb_max_balance';
};

export const CURRENCY_LEGACY_FIELD_MAP: Partial<Record<CurrencyCode, EntityBalanceFieldKeys>> = {
  USD: { initial: 'usd_balance', advance: 'advance_usd_balance', max: 'usd_max_balance' },
  LBP: { initial: 'lb_balance', advance: 'advance_lb_balance', max: 'lb_max_balance' },
};

/**
 * Read a balance from an entity-shaped record by currency code. Prefers
 * the post-migration JSONB map (`balances`/`advance_balances`/`max_balances`)
 * and falls back to the legacy scalar columns when the map is empty or
 * missing the code, so this helper works on both pre- and post-Layer-7
 * data.
 */
export function getLegacyBalance(
  entity: Record<string, unknown> | null | undefined,
  code: CurrencyCode,
  kind: 'initial' | 'advance' | 'max' = 'initial'
): number {
  if (!entity) return 0;
  const mapField = kind === 'initial' ? 'balances' : kind === 'advance' ? 'advance_balances' : 'max_balances';
  const map = entity[mapField] as Partial<Record<CurrencyCode, number>> | undefined;
  if (map && typeof map[code] === 'number') return map[code] as number;

  const fields = CURRENCY_LEGACY_FIELD_MAP[code];
  if (!fields) return 0;
  const raw = entity[fields[kind]];
  return typeof raw === 'number' ? raw : 0;
}
