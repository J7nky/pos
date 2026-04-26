import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CurrencyCode } from '@pos-platform/shared';
import { balanceMigrationService } from '../balanceMigrationService';
import type { MigrationSession, ExcelRow } from '../balanceMigrationService';
import * as storeService from '../storeService';

const svc = balanceMigrationService as unknown as {
  resolveMigrationCurrency(
    session: MigrationSession,
    override: CurrencyCode | undefined
  ): Promise<CurrencyCode>;
  executeMigration(
    sessionId: string,
    validRows: ExcelRow[],
    options?: { useBulk?: boolean; currency?: CurrencyCode }
  ): Promise<{ importedCount: number; importedRows: ExcelRow[]; errors: string[] }>;
  migrateOpeningBalance(
    session: MigrationSession,
    row: ExcelRow,
    currency: CurrencyCode,
    userId: string | null
  ): Promise<unknown>;
  executeBulkMigration(
    session: MigrationSession,
    rows: ExcelRow[],
    currency: CurrencyCode,
    userId: string | null
  ): Promise<{ importedRows: ExcelRow[]; errors: string[] }>;
};

function baseSession(overrides: Partial<MigrationSession> = {}): MigrationSession {
  return {
    id: 'sess-1',
    storeId: 'store-1',
    branchId: 'branch-1',
    filename: 'x.xlsx',
    uploadedAt: new Date().toISOString(),
    status: 'importing',
    totalRows: 1,
    validRows: 1,
    importedRows: 0,
    errorRows: 0,
    ...overrides,
  };
}

const sampleRow: ExcelRow = {
  entityName: 'Acme',
  entityType: 'customer',
  debitBalance: 10,
  creditBalance: 0,
};

describe('balanceMigrationService.resolveMigrationCurrency', () => {
  beforeEach(() => {
    vi.spyOn(storeService, 'getStore').mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns explicit override and does not fetch store', async () => {
    const getStore = vi.spyOn(storeService, 'getStore').mockResolvedValue({
      preferred_currency: 'AED',
    } as Awaited<ReturnType<typeof storeService.getStore>>);
    const session = baseSession();
    const c = await svc.resolveMigrationCurrency(session, 'USD');
    expect(c).toBe('USD');
    expect(getStore).not.toHaveBeenCalled();
  });

  it('uses session.preferredCurrency cache without fetch', async () => {
    const getStore = vi.spyOn(storeService, 'getStore');
    const session = baseSession({ preferredCurrency: 'AED' });
    const c = await svc.resolveMigrationCurrency(session, undefined);
    expect(c).toBe('AED');
    expect(getStore).not.toHaveBeenCalled();
  });

  it('fetches store once, caches preferredCurrency, second call uses cache', async () => {
    const getStore = vi
      .spyOn(storeService, 'getStore')
      .mockResolvedValue({ preferred_currency: 'AED' } as Awaited<ReturnType<typeof storeService.getStore>>);
    const session = baseSession();
    const first = await svc.resolveMigrationCurrency(session, undefined);
    const second = await svc.resolveMigrationCurrency(session, undefined);
    expect(first).toBe('AED');
    expect(second).toBe('AED');
    expect(getStore).toHaveBeenCalledTimes(1);
    expect(session.preferredCurrency).toBe('AED');
  });

  it('throws when preferred_currency missing and does not set cache', async () => {
    vi.spyOn(storeService, 'getStore').mockResolvedValue({
      preferred_currency: null,
    } as Awaited<ReturnType<typeof storeService.getStore>>);
    const session = baseSession();
    await expect(svc.resolveMigrationCurrency(session, undefined)).rejects.toThrow(/store-1/);
    await expect(svc.resolveMigrationCurrency(session, undefined)).rejects.toThrow(/preferred_currency/);
    expect(session.preferredCurrency).toBeUndefined();
  });
});

describe('balanceMigrationService.executeMigration — currency to RPC', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('balanceMigrationSessions');
  });

  it('passes p_currency AED for UAE store without override', async () => {
    const session = baseSession({ id: 'm-sess-aed' });
    localStorage.setItem('balanceMigrationSessions', JSON.stringify([session]));
    const { supabase } = await import('../../lib/supabase');
    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({ data: { user: { id: 'u1' } }, error: null } as never);
    vi.spyOn(storeService, 'getStore').mockResolvedValue({
      preferred_currency: 'AED',
    } as Awaited<ReturnType<typeof storeService.getStore>>);
    const rpc = vi.fn().mockResolvedValue({
      data: {
        success: true,
        entity_id: 'e1',
        entity_created: false,
        transaction_id: 't1',
        journal_entry_ids: [],
        amount: 10,
        currency: 'AED',
      },
      error: null,
    });
    vi.spyOn(supabase, 'rpc').mockImplementation(rpc as never);

    await svc.executeMigration('m-sess-aed', [sampleRow], { useBulk: false });

    expect(rpc).toHaveBeenCalled();
    const call = rpc.mock.calls.find((c) => c[0] === 'migrate_opening_balance');
    expect(call?.[1]).toMatchObject({ p_currency: 'AED' });
  });

  it('passes p_currency USD when override set', async () => {
    const session = baseSession({ id: 'm-sess-usd' });
    localStorage.setItem('balanceMigrationSessions', JSON.stringify([session]));
    const { supabase } = await import('../../lib/supabase');
    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({ data: { user: { id: 'u1' } }, error: null } as never);
    vi.spyOn(storeService, 'getStore').mockResolvedValue({
      preferred_currency: 'AED',
    } as Awaited<ReturnType<typeof storeService.getStore>>);
    const rpc = vi.fn().mockResolvedValue({
      data: {
        success: true,
        entity_id: 'e1',
        entity_created: false,
        transaction_id: 't1',
        journal_entry_ids: [],
        amount: 10,
        currency: 'USD',
      },
      error: null,
    });
    vi.spyOn(supabase, 'rpc').mockImplementation(rpc as never);

    await svc.executeMigration('m-sess-usd', [sampleRow], { useBulk: false, currency: 'USD' });

    const call = rpc.mock.calls.find((c) => c[0] === 'migrate_opening_balance');
    expect(call?.[1]).toMatchObject({ p_currency: 'USD' });
  });

  it('does not call RPC when store has no preferred_currency', async () => {
    const session = baseSession({ id: 'm-sess-bad' });
    localStorage.setItem('balanceMigrationSessions', JSON.stringify([session]));
    const { supabase } = await import('../../lib/supabase');
    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({ data: { user: { id: 'u1' } }, error: null } as never);
    vi.spyOn(storeService, 'getStore').mockResolvedValue({
      preferred_currency: null,
    } as Awaited<ReturnType<typeof storeService.getStore>>);
    const rpc = vi.fn();
    vi.spyOn(supabase, 'rpc').mockImplementation(rpc as never);

    await expect(svc.executeMigration('m-sess-bad', [sampleRow], { useBulk: false })).rejects.toThrow(
      /preferred_currency/
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('balanceMigrationService.executeMigration options typing', () => {
  it('currency option is typed as CurrencyCode | undefined (compile-time contract)', () => {
    const opts: { currency?: CurrencyCode } = { currency: 'AED' };
    expect(opts.currency).toBe('AED');
  });
});
