/**
 * Unit tests for auditService — the general-purpose audit trail.
 * Mocks the Dexie layer so we can assert the row shape and skip rules without
 * a real IndexedDB.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the db module: deterministic id + a spyable audit_logs.add.
const addSpy = vi.fn().mockResolvedValue(undefined);
vi.mock('../../lib/db', () => ({
  createId: () => 'fixed-audit-id',
  getDB: () => ({ audit_logs: { add: addSpy } }),
}));

import { auditService } from '../auditService';

const BASE = {
  storeId: 'store-1',
  branchId: 'branch-1',
  changedBy: 'user-1',
  entityType: 'entity',
  entityId: 'cust-1',
} as const;

beforeEach(() => {
  addSpy.mockClear();
});

describe('auditService.diff', () => {
  it('captures a changed scalar field with old/new', () => {
    const changes = auditService.diff(
      { name: 'Ahmad', phone: '0300' },
      { name: 'Ahmad', phone: '0311' },
      ['name', 'phone']
    );
    expect(changes).toEqual([{ field: 'phone', old: '0300', new: '0311' }]);
  });

  it('captures a nested dotted path', () => {
    const changes = auditService.diff(
      { customer_data: { credit_limit: 5000 } },
      { customer_data: { credit_limit: 8000 } },
      ['customer_data.credit_limit']
    );
    expect(changes).toEqual([{ field: 'customer_data.credit_limit', old: 5000, new: 8000 }]);
  });

  it('ignores unchanged fields', () => {
    const changes = auditService.diff({ name: 'X' }, { name: 'X' }, ['name']);
    expect(changes).toEqual([]);
  });

  it('treats null and undefined as equal (no false diff)', () => {
    const changes = auditService.diff({ phone: null }, {}, ['phone']);
    expect(changes).toEqual([]);
  });

  it('deep-compares objects and normalizes nullish to null', () => {
    const changes = auditService.diff(
      { max: { LBP: 1 } },
      { max: { LBP: 2 } },
      ['max', 'missing']
    );
    expect(changes).toEqual([{ field: 'max', old: { LBP: 1 }, new: { LBP: 2 } }]);
  });
});

describe('auditService.diffUpdates', () => {
  it('diffs only the patch keys against the before row', () => {
    const before = { name: 'Apple', price: 100, category_id: 'c1' };
    const changes = auditService.diffUpdates(before, { price: 120 });
    expect(changes).toEqual([{ field: 'price', old: 100, new: 120 }]);
  });

  it('ignores metadata/system columns even if present in the patch', () => {
    const before = { name: 'Apple', _synced: true, updated_at: 'a' };
    const changes = auditService.diffUpdates(before, {
      name: 'Apple',
      _synced: false,
      updated_at: 'b',
    });
    expect(changes).toEqual([]);
  });

  it('skips undefined patch values (absent != changed-to-undefined)', () => {
    const before = { name: 'Apple', barcode: '123' };
    const changes = auditService.diffUpdates(before, { name: 'Banana', barcode: undefined });
    expect(changes).toEqual([{ field: 'name', old: 'Apple', new: 'Banana' }]);
  });

  it('returns [] for an empty/all-metadata patch', () => {
    expect(auditService.diffUpdates({ name: 'X' }, {})).toEqual([]);
    expect(auditService.diffUpdates({ name: 'X' }, { _synced: false })).toEqual([]);
  });
});

describe('auditService.record', () => {
  it('writes a well-formed append-only row for a create', async () => {
    const id = await auditService.record({ ...BASE, action: 'create', changeReason: 'Customer created' });

    expect(id).toBe('fixed-audit-id');
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy).toHaveBeenCalledWith({
      id: 'fixed-audit-id',
      store_id: 'store-1',
      branch_id: 'branch-1',
      entity_type: 'entity',
      entity_id: 'cust-1',
      action: 'create',
      changes: [],
      change_reason: 'Customer created',
      reference: null,
      changed_by: 'user-1',
      created_at: expect.any(String),
      _synced: false,
      _deleted: false,
    });
  });

  it('persists the supplied changes[] on an update', async () => {
    await auditService.record({
      ...BASE,
      action: 'update',
      changes: [{ field: 'phone', old: '0300', new: '0311' }],
    });
    expect(addSpy.mock.calls[0][0].changes).toEqual([{ field: 'phone', old: '0300', new: '0311' }]);
  });

  it('skips excluded entity types (notifications) without writing', async () => {
    const id = await auditService.record({ ...BASE, entityType: 'notification', action: 'update' });
    expect(id).toBeNull();
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('skips when the actor (changedBy) is missing — would fail RLS on upload', async () => {
    const id = await auditService.record({ ...BASE, changedBy: undefined, action: 'create' });
    expect(id).toBeNull();
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('never throws — a DB failure resolves to null', async () => {
    addSpy.mockRejectedValueOnce(new Error('db down'));
    const id = await auditService.record({ ...BASE, action: 'create' });
    expect(id).toBeNull();
  });
});
