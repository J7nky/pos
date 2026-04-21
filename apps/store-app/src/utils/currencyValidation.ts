import type { CurrencyCode } from '@pos-platform/shared';
import { InvalidCurrencyError } from '../errors/currencyErrors';

export type AssertCurrencyCtx = { storeId: string | null | undefined };

export function assertValidCurrency(
  value: unknown,
  acceptedCurrencies: CurrencyCode[],
  ctx: AssertCurrencyCtx
): CurrencyCode {
  const storeId = ctx.storeId ?? '';
  if (value === null || value === undefined) {
    throw new InvalidCurrencyError({
      storeId,
      reason: 'missing',
      acceptedCurrencies: [...acceptedCurrencies],
    });
  }
  if (!acceptedCurrencies.includes(value as CurrencyCode)) {
    throw new InvalidCurrencyError({
      storeId,
      reason: 'not-accepted',
      attemptedCurrency: value as CurrencyCode,
      acceptedCurrencies: [...acceptedCurrencies],
    });
  }
  return value as CurrencyCode;
}
