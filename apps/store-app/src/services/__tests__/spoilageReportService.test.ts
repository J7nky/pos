/**
 * spoilageReportService tests (spec 019, US5 — CG-12).
 * Period filtering, by-reason/by-product/by-bill aggregation, reversed-loss
 * exclusion, commission separation, and the SC-005 "report total = Σ records"
 * reconciliation. Reasons are shrinkage and spoiled only — there is no
 * separate "lost" reason.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Seed rows mirror production parity fixtures */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, any>;
let rows: Row[] = [];

vi.mock('../../lib/db', () => ({
  getDB: () => ({
    inventory_loss_events: {
      where: (field: string) => ({
        equals: (value: any) => ({
          toArray: async () =>
            rows.filter(r =>
              field === 'store_id' ? r.store_id === value : false
            ),
        }),
      }),
    },
  }),
}));

import { getSpoilageReport } from '../spoilageReportService';

function loss(overrides: Row): Row {
  return {
    id: `l-${Math.random().toString(36).slice(2, 8)}`,
    store_id: 'store-1',
    branch_id: 'branch-1',
    inventory_item_id: 'lot-1',
    product_id: 'prod-1',
    batch_id: 'bill-1',
    reason: 'spoiled',
    source: 'manual',
    quantity: 1,
    weight: null,
    unit_cost: 5,
    currency: 'USD',
    loss_value: 5,
    is_commission: false,
    transaction_id: 'txn-1',
    status: 'active',
    reversal_of_id: null,
    reversed_by_id: null,
    created_by: 'user-1',
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    _deleted: false,
    ...overrides,
  };
}

beforeEach(() => {
  rows = [];
});

describe('getSpoilageReport', () => {
  it('aggregates by reason / product / bill and reconciles the total (SC-005/SC-008)', async () => {
    rows = [
      loss({ reason: 'spoiled', loss_value: 15, quantity: 3, product_id: 'prod-1', batch_id: 'bill-1' }),
      loss({ reason: 'spoiled', loss_value: 10, quantity: 2, product_id: 'prod-2', batch_id: 'bill-1' }),
      loss({ reason: 'shrinkage', source: 'auto_close', loss_value: 8, quantity: 0, weight: 4, product_id: 'prod-1', batch_id: 'bill-2' }),
    ];
    const report = await getSpoilageReport({ storeId: 'store-1', from: '2026-07-01', to: '2026-07-01' });

    expect(report.totals.totalValue).toBe(33);
    expect(report.totals.byReason.spoiled.value).toBe(25); // 15 + 10
    expect(report.totals.byReason.shrinkage.value).toBe(8);
    expect(report.totals.byReason.shrinkage.weight).toBe(4);

    // SC-005: report total equals the sum of the underlying records.
    const sum = report.events.reduce((s, e) => s + e.loss_value, 0);
    expect(report.totals.totalValue + report.totals.commissionValue).toBe(sum);

    // Breakdowns.
    expect(report.byProduct.find(r => r.key === 'prod-1')?.value).toBe(23);
    expect(report.byProduct.find(r => r.key === 'prod-2')?.value).toBe(10);
    expect(report.byBill.find(r => r.key === 'bill-1')?.value).toBe(25);
    expect(report.byBill.find(r => r.key === 'bill-2')?.value).toBe(8);
  });

  it('filters by period using local dates', async () => {
    rows = [
      loss({ created_at: '2026-06-30T10:00:00Z', loss_value: 100 }),
      loss({ created_at: '2026-07-01T10:00:00Z', loss_value: 5 }),
      loss({ created_at: '2026-07-02T10:00:00Z', loss_value: 100 }),
    ];
    const report = await getSpoilageReport({ storeId: 'store-1', from: '2026-07-01', to: '2026-07-01' });
    expect(report.totals.totalValue).toBe(5);
    expect(report.events).toHaveLength(1);
  });

  it('excludes reversed originals and reversal rows (net real losses only)', async () => {
    rows = [
      loss({ id: 'orig', status: 'reversed', reversed_by_id: 'rev', loss_value: 40 }),
      loss({ id: 'rev', reversal_of_id: 'orig', loss_value: 40 }),
      loss({ id: 'keep', loss_value: 7 }),
    ];
    const report = await getSpoilageReport({ storeId: 'store-1', from: '2026-07-01', to: '2026-07-01' });
    expect(report.totals.totalValue).toBe(7);
    expect(report.events.map(e => e.id)).toEqual(['keep']);
  });

  it('separates commission memo losses from owned expense totals (SC-006)', async () => {
    rows = [
      loss({ loss_value: 12 }),
      loss({ is_commission: true, transaction_id: null, loss_value: 30, product_id: 'prod-3' }),
    ];
    const report = await getSpoilageReport({ storeId: 'store-1', from: '2026-07-01', to: '2026-07-01' });
    expect(report.totals.totalValue).toBe(12);
    expect(report.totals.commissionValue).toBe(30);
    // Commission value never inflates the product's owned-loss value…
    expect(report.byProduct.find(r => r.key === 'prod-3')?.value).toBe(0);
    // …but the event still appears in count/quantity for visibility.
    expect(report.byProduct.find(r => r.key === 'prod-3')?.count).toBe(1);
  });

  it('excludes soft-deleted rows', async () => {
    rows = [loss({ _deleted: true, loss_value: 99 }), loss({ loss_value: 3 })];
    const report = await getSpoilageReport({ storeId: 'store-1', from: '2026-07-01', to: '2026-07-01' });
    expect(report.totals.totalValue).toBe(3);
  });
});
