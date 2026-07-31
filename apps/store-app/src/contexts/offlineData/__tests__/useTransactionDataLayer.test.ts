import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useTransactionDataLayer } from '../useTransactionDataLayer';
import { CurrencyService } from '../../../services/currencyService';
import { InvalidCurrencyError } from '../../../errors/currencyErrors';
import { TRANSACTION_CATEGORIES } from '../../../constants/transactionCategories';
import { getDB } from '../../../lib/db';
import { transactionService } from '../../../services/transactionService';

vi.mock('../../../lib/db', () => ({
  getDB: vi.fn(),
  createId: vi.fn(() => 'test-id'),
}));

vi.mock('../../../services/transactionService', () => ({
  transactionService: { createTransaction: vi.fn() },
}));

vi.mock('../../../services/notificationService', () => ({
  notificationService: { createNotification: vi.fn().mockResolvedValue(undefined) },
}));

function loadLebaneseStore(): void {
  const s = CurrencyService.getInstance() as unknown as {
    isInitialized: boolean;
    acceptedCurrencies: string[];
    preferredCurrency: string;
    rates: Record<string, number>;
  };
  s.isInitialized = true;
  s.acceptedCurrencies = ['LBP', 'USD'];
  s.preferredCurrency = 'LBP';
  s.rates = { USD: 1, LBP: 89500 };
}

interface Api {
  addTransaction: (data: any) => Promise<void>;
}

let api: Api | null = null;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Harness(props: { adapter: any }) {
  const layer = useTransactionDataLayer(props.adapter);
  api = { addTransaction: layer.addTransaction };
  return null;
}

async function render(adapter: any): Promise<void> {
  container = document.createElement('div');
  root = createRoot(container);
  await act(async () => {
    root!.render(React.createElement(Harness, { adapter }));
  });
}

function makeAdapter(storeId: string | null = 'store-1') {
  return {
    storeId,
    currentBranchId: 'branch-1',
    userProfileId: 'user-1',
    pushUndo: vi.fn(),
    resetAutoSyncTimer: vi.fn(),
    refreshData: vi.fn().mockResolvedValue(undefined),
    updateUnsyncedCount: vi.fn().mockResolvedValue(undefined),
    debouncedSync: vi.fn(),
  };
}

describe('useTransactionDataLayer.addTransaction — currency validation (T031, T032)', () => {
  const transactionsAdd = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    loadLebaneseStore();
    vi.mocked(getDB).mockReturnValue({
      transactions: { add: transactionsAdd, update: vi.fn() },
      stores: { get: vi.fn().mockResolvedValue({ preferred_language: 'en' }) },
    } as unknown as ReturnType<typeof getDB>);
    vi.mocked(transactionService.createTransaction).mockResolvedValue({
      transactionId: 'tx-1',
    } as any);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root!.unmount();
      });
      root = null;
    }
    container = null;
    api = null;
  });

  // An unmapped category has no double-entry mapping, so it must be REJECTED —
  // never written directly to the transactions table (the old "direct path"
  // wrote a journal-less, unbalanced transaction). See useTransactionDataLayer
  // A1 fix. Currency validity is irrelevant: the category is rejected first.
  it('rejects an unmapped category (enforces double-entry — no journal-less direct write)', async () => {
    await render(makeAdapter());
    await expect(
      api!.addTransaction({
        amount: 5,
        category: 'unmapped-category',
        currency: 'LBP',
        description: 'test',
      })
    ).rejects.toThrow(/unknown category/i);
    // Must not write a transaction directly, and must not fabricate a valid one.
    expect(transactionsAdd).not.toHaveBeenCalled();
    expect(transactionService.createTransaction).not.toHaveBeenCalled();
  });

  it('rejects an unmapped category regardless of currency (missing or unaccepted)', async () => {
    await render(makeAdapter());
    await expect(
      api!.addTransaction({ amount: 10, category: 'unmapped-category', description: 'test' })
    ).rejects.toThrow(/unknown category/i);
    await expect(
      api!.addTransaction({ amount: 10, category: 'unmapped-category', currency: 'EUR', description: 'test' })
    ).rejects.toThrow(/unknown category/i);
    expect(transactionsAdd).not.toHaveBeenCalled();
  });

  it('forwards supplied currency to transactionService for mapped categories', async () => {
    await render(makeAdapter());
    await api!.addTransaction({
      amount: 5,
      category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT_RECEIVED,
      currency: 'USD',
      description: 'test',
    });
    expect(transactionService.createTransaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(transactionService.createTransaction).mock.calls[0][0].currency).toBe('USD');
  });

  it('throws for missing currency on mapped category path as well', async () => {
    await render(makeAdapter());
    await expect(
      api!.addTransaction({
        amount: 5,
        category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT_RECEIVED,
        description: 'test',
      })
    ).rejects.toBeInstanceOf(InvalidCurrencyError);
    expect(transactionService.createTransaction).not.toHaveBeenCalled();
  });
});

describe('useTransactionDataLayer — regression: no silent currency fallback (T031)', () => {
  it('source does not contain `|| \'USD\'` or `?? \'USD\'` or `|| \'LBP\'` or `?? \'LBP\'`', () => {
    const src = readFileSync(
      resolve(__dirname, '../useTransactionDataLayer.ts'),
      'utf-8'
    );
    expect(src).not.toMatch(/\|\|\s*['"]USD['"]/);
    expect(src).not.toMatch(/\?\?\s*['"]USD['"]/);
    expect(src).not.toMatch(/\|\|\s*['"]LBP['"]/);
    expect(src).not.toMatch(/\?\?\s*['"]LBP['"]/);
  });
});
