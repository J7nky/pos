import type { CurrencyCode } from '@pos-platform/shared';

export type CurrencyErrorContext = {
  storeId: string;
  attemptedCurrency?: CurrencyCode;
  acceptedCurrencies?: CurrencyCode[];
  bill_id?: string;
  reason?: string;
};

export class InvalidCurrencyError extends Error {
  readonly payload: CurrencyErrorContext;

  constructor(payload: CurrencyErrorContext) {
    super('InvalidCurrencyError');
    this.name = 'InvalidCurrencyError';
    this.payload = payload;
  }
}

export class LegacyCurrencyMissingError extends Error {
  readonly payload: CurrencyErrorContext;

  constructor(payload: CurrencyErrorContext) {
    super('LegacyCurrencyMissingError');
    this.name = 'LegacyCurrencyMissingError';
    this.payload = payload;
  }
}

export class CurrencyLockError extends Error {
  readonly payload: CurrencyErrorContext;

  constructor(payload: CurrencyErrorContext) {
    super('CurrencyLockError');
    this.name = 'CurrencyLockError';
    this.payload = payload;
  }
}
