/**
 * Tests for changeTracker service
 * Covers: session management, change tracking, duplicate merging, excluded tables, buildUndoFromChanges
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { changeTracker, buildUndoFromChanges, type ChangeRecord, type UndoAction } from '../changeTracker';

describe('changeTracker service', () => {
  beforeEach(() => {
    // Reset state before each test
    if (changeTracker.isActive()) {
      changeTracker.endSession();
    }
  });

  describe('session management', () => {
    it('startSession creates a new session', () => {
      expect(changeTracker.isActive()).toBe(false);
      changeTracker.startSession();
      expect(changeTracker.isActive()).toBe(true);
    });

    it('endSession returns changes and clears session', () => {
      changeTracker.startSession();
      changeTracker.trackCreate('products', 'prod-1', { id: 'prod-1', name: 'Product' });
      const changes = changeTracker.endSession();
      expect(changes).toHaveLength(1);
      expect(changeTracker.isActive()).toBe(false);
    });

    it('double startSession logs warning and merges into outer session', () => {
      const originalWarn = console.warn;
      let warnCalled = false;
      console.warn = () => {
        warnCalled = true;
      };

      changeTracker.startSession();
      changeTracker.trackCreate('products', 'prod-1', { id: 'prod-1' });
      changeTracker.startSession(); // Second call
      expect(warnCalled).toBe(true);
      changeTracker.trackCreate('products', 'prod-2', { id: 'prod-2' });

      // Need to call endSession twice (once for each startSession) to fully close
      const innerChanges = changeTracker.endSession();
      expect(innerChanges).toHaveLength(0); // Inner call returns empty (still in nested session)

      const outerChanges = changeTracker.endSession();
      expect(outerChanges).toHaveLength(2); // Outer call returns all changes
      console.warn = originalWarn;
    });

    it('isActive returns correct state', () => {
      expect(changeTracker.isActive()).toBe(false);
      changeTracker.startSession();
      expect(changeTracker.isActive()).toBe(true);
      changeTracker.endSession();
      expect(changeTracker.isActive()).toBe(false);
    });

    it('endSession returns empty array if no session active', () => {
      const changes = changeTracker.endSession();
      expect(changes).toEqual([]);
    });
  });

  describe('change tracking', () => {
    beforeEach(() => {
      changeTracker.startSession();
    });

    it('trackCreate records create with full snapshot', () => {
      const product = { id: 'prod-1', name: 'Tomato', price: 100, _synced: false };
      changeTracker.trackCreate('products', 'prod-1', product);
      const changes = changeTracker.endSession();

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        op: 'create',
        table: 'products',
        primKey: 'prod-1',
        record: product
      });
    });

    it('trackUpdate records update with before/modifications', () => {
      const before = { id: 'prod-1', name: 'Tomato', price: 100 };
      const modifications = { price: 120 };
      changeTracker.trackUpdate('products', 'prod-1', before, modifications);
      const changes = changeTracker.endSession();

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        op: 'update',
        table: 'products',
        primKey: 'prod-1',
        before: before,
        modifications: modifications
      });
    });

    it('trackUpdate merges duplicate updates keeping earliest before', () => {
      const before = { id: 'prod-1', name: 'Tomato', price: 100 };
      const mods1 = { price: 120 };
      const mods2 = { name: 'Potato' };

      changeTracker.trackUpdate('products', 'prod-1', before, mods1);
      changeTracker.trackUpdate('products', 'prod-1', { price: 120 }, mods2);
      const changes = changeTracker.endSession();

      expect(changes).toHaveLength(1);
      expect(changes[0].op).toBe('update');
      expect(changes[0].before).toEqual(before); // Earliest before
      expect(changes[0].modifications).toEqual({ price: 120, name: 'Potato' }); // Combined
    });

    it('trackDelete records delete with snapshot', () => {
      const product = { id: 'prod-1', name: 'Tomato' };
      changeTracker.trackDelete('products', 'prod-1', product);
      const changes = changeTracker.endSession();

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        op: 'delete',
        table: 'products',
        primKey: 'prod-1',
        record: product
      });
    });

    it('trackDelete handles undefined obj gracefully', () => {
      changeTracker.trackDelete('products', 'prod-1', undefined);
      const changes = changeTracker.endSession();

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        op: 'delete',
        table: 'products',
        primKey: 'prod-1',
        record: undefined
      });
    });

    it('all track methods are no-op when session inactive', () => {
      // Ensure session is inactive (beforeEach should have cleaned up)
      if (changeTracker.isActive()) {
        changeTracker.endSession();
      }

      changeTracker.trackCreate('products', 'prod-1', {});
      changeTracker.trackUpdate('products', 'prod-1', {}, {});
      changeTracker.trackDelete('products', 'prod-1', {});

      // Should not throw; session is not active
      expect(changeTracker.isActive()).toBe(false);
    });

    it('all track methods are no-op when suppressed', () => {
      changeTracker.startSession();
      changeTracker.suppress();

      changeTracker.trackCreate('products', 'prod-1', { id: 'prod-1' });
      changeTracker.trackUpdate('products', 'prod-1', {}, {});
      changeTracker.trackDelete('products', 'prod-1', {});

      const changes = changeTracker.endSession();
      expect(changes).toHaveLength(0);
    });

    it('changes to EXCLUDED_TABLES are silently ignored', () => {
      changeTracker.startSession();

      changeTracker.trackCreate('pending_syncs', 'ps-1', { id: 'ps-1' });
      changeTracker.trackCreate('bill_audit_logs', 'bal-1', { id: 'bal-1' });
      changeTracker.trackCreate('sync_metadata', 'sm-1', { id: 'sm-1' });
      changeTracker.trackCreate('sync_state', 'ss-1', { id: 'ss-1' });

      const changes = changeTracker.endSession();
      expect(changes).toHaveLength(0);
    });
  });

  describe('suppress/resume', () => {
    it('suppress prevents tracking', () => {
      changeTracker.startSession();
      changeTracker.suppress();
      changeTracker.trackCreate('products', 'prod-1', {});
      const changes = changeTracker.endSession();
      expect(changes).toHaveLength(0);
    });

    it('resume resumes tracking', () => {
      changeTracker.startSession();
      changeTracker.trackCreate('products', 'prod-1', {});
      changeTracker.suppress();
      changeTracker.trackCreate('products', 'prod-2', {});
      changeTracker.resume();
      changeTracker.trackCreate('products', 'prod-3', {});

      const changes = changeTracker.endSession();
      expect(changes).toHaveLength(2);
      expect(changes[0].primKey).toBe('prod-1');
      expect(changes[1].primKey).toBe('prod-3');
    });

    it('nested suppress/resume works with depth counter', () => {
      changeTracker.startSession();
      changeTracker.trackCreate('products', 'prod-1', {});

      changeTracker.suppress();
      changeTracker.suppress();
      changeTracker.trackCreate('products', 'prod-2', {});
      changeTracker.resume();
      changeTracker.trackCreate('products', 'prod-3', {});
      changeTracker.resume();
      changeTracker.trackCreate('products', 'prod-4', {});

      const changes = changeTracker.endSession();
      expect(changes.map(c => c.primKey)).toEqual(['prod-1', 'prod-4']);
    });
  });

  describe('buildUndoFromChanges', () => {
    it('reverses create to delete', () => {
      const changes: ChangeRecord[] = [
        {
          op: 'create',
          table: 'products',
          primKey: 'prod-1',
          record: { id: 'prod-1', name: 'Tomato' }
        }
      ];

      const undo = buildUndoFromChanges('operation', changes);
      expect(undo.steps).toHaveLength(1);
      expect(undo.steps[0]).toEqual({
        op: 'delete',
        table: 'products',
        primKey: 'prod-1',
        record: { id: 'prod-1', name: 'Tomato' }
      });
    });

    it('reverses update to revert-to-before', () => {
      const changes: ChangeRecord[] = [
        {
          op: 'update',
          table: 'products',
          primKey: 'prod-1',
          before: { id: 'prod-1', price: 100 },
          modifications: { price: 120 }
        }
      ];

      const undo = buildUndoFromChanges('operation', changes);
      expect(undo.steps[0]).toEqual({
        op: 'revert-to-before',
        table: 'products',
        primKey: 'prod-1',
        modifications: { id: 'prod-1', price: 100 }
      });
    });

    it('reverses delete to restore', () => {
      const changes: ChangeRecord[] = [
        {
          op: 'delete',
          table: 'products',
          primKey: 'prod-1',
          record: { id: 'prod-1', name: 'Tomato' }
        }
      ];

      const undo = buildUndoFromChanges('operation', changes);
      expect(undo.steps[0]).toEqual({
        op: 'restore',
        table: 'products',
        primKey: 'prod-1',
        record: { id: 'prod-1', name: 'Tomato' }
      });
    });

    it('produces steps in reverse chronological order', () => {
      const changes: ChangeRecord[] = [
        { op: 'create', table: 'products', primKey: 'prod-1', record: {} },
        { op: 'create', table: 'transactions', primKey: 'txn-1', record: {} },
        { op: 'create', table: 'journal_entries', primKey: 'je-1', record: {} }
      ];

      const undo = buildUndoFromChanges('operation', changes);
      expect(undo.steps.map(s => s.primKey)).toEqual(['je-1', 'txn-1', 'prod-1']);
    });

    it('builds deduplicated affected list', () => {
      const changes: ChangeRecord[] = [
        { op: 'create', table: 'products', primKey: 'prod-1', record: {} },
        { op: 'create', table: 'products', primKey: 'prod-2', record: {} },
        { op: 'create', table: 'transactions', primKey: 'txn-1', record: {} },
        { op: 'delete', table: 'transactions', primKey: 'txn-2', record: {} }
      ];

      const undo = buildUndoFromChanges('operation', changes);
      expect(undo.affected.sort()).toEqual(['products', 'transactions']);
    });

    it('logs warning for delete without record snapshot', () => {
      const warnSpy: any[] = [];
      const originalWarn = console.warn;
      console.warn = (msg: any) => {
        warnSpy.push(msg);
      };

      const changes: ChangeRecord[] = [
        { op: 'delete', table: 'products', primKey: 'prod-1', record: undefined }
      ];

      buildUndoFromChanges('operation', changes);
      expect(warnSpy.some(msg => msg.includes('Delete without record snapshot'))).toBe(true);
      console.warn = originalWarn;
    });

    it('handles empty changes array', () => {
      const undo = buildUndoFromChanges('operation', []);
      expect(undo.steps).toHaveLength(0);
      expect(undo.affected).toHaveLength(0);
    });
  });

  // ─── T014: multi-table payment-style reverse chronological ordering ──────────
  // Automated substitute for the manual browser test:
  //   "Execute multi-table payment, verify undo steps in reverse chronological order"
  describe('T014: payment-style multi-table reverse chronological ordering', () => {
    it('payment steps are in exact reverse creation order (entity update → txn → journals)', () => {
      // Typical payment write order: entity balance first, then transaction, then journal entries
      const changes: ChangeRecord[] = [
        { op: 'update', table: 'entities',       primKey: 'entity-1', before: { id: 'entity-1', balance: 500 }, modifications: { balance: 300 } },
        { op: 'create', table: 'transactions',   primKey: 'txn-1',    record: { id: 'txn-1', amount: 200 } },
        { op: 'create', table: 'journal_entries', primKey: 'je-debit', record: { id: 'je-debit', type: 'debit' } },
        { op: 'create', table: 'journal_entries', primKey: 'je-credit', record: { id: 'je-credit', type: 'credit' } },
      ];

      const undo = buildUndoFromChanges('operation', changes);

      expect(undo.steps).toHaveLength(4);
      // Reverse: last created (je-credit) undone first, first changed (entity) undone last
      expect(undo.steps[0]).toMatchObject({ op: 'delete',          table: 'journal_entries', primKey: 'je-credit' });
      expect(undo.steps[1]).toMatchObject({ op: 'delete',          table: 'journal_entries', primKey: 'je-debit' });
      expect(undo.steps[2]).toMatchObject({ op: 'delete',          table: 'transactions',    primKey: 'txn-1' });
      expect(undo.steps[3]).toMatchObject({ op: 'revert-to-before', table: 'entities',       primKey: 'entity-1' });
    });

    it('entity revert step carries the full before-state as modifications (not just the diff)', () => {
      const entityBefore = { id: 'entity-1', customer_data: { balance_usd: 500 }, _synced: false };
      const changes: ChangeRecord[] = [
        { op: 'update', table: 'entities',     primKey: 'entity-1', before: entityBefore, modifications: { customer_data: { balance_usd: 300 } } },
        { op: 'create', table: 'transactions', primKey: 'txn-1',    record: { id: 'txn-1' } },
      ];

      const undo = buildUndoFromChanges('operation', changes);
      const revertStep = undo.steps.find(s => s.op === 'revert-to-before');
      // modifications must hold the full before-state so the executor can do a complete put
      expect(revertStep?.modifications).toEqual(entityBefore);
    });

    it('affected list contains all touched tables exactly once', () => {
      const changes: ChangeRecord[] = [
        { op: 'update', table: 'entities',        primKey: 'supplier-1', before: {}, modifications: {} },
        { op: 'create', table: 'transactions',    primKey: 'txn-1',      record: {} },
        { op: 'create', table: 'journal_entries', primKey: 'je-1',       record: {} },
        { op: 'create', table: 'journal_entries', primKey: 'je-2',       record: {} },
      ];

      const undo = buildUndoFromChanges('operation', changes);
      // Two journal_entries writes → only one 'journal_entries' in affected
      expect(undo.affected.sort()).toEqual(['entities', 'journal_entries', 'transactions']);
    });

    it('employee payment with new entity creation: entity create reversed after transaction and journals', () => {
      // Employee payment may create entity first if one doesn't exist
      const changes: ChangeRecord[] = [
        { op: 'create', table: 'entities',        primKey: 'emp-1',    record: { id: 'emp-1', entity_type: 'employee' } },
        { op: 'create', table: 'transactions',    primKey: 'txn-1',    record: { id: 'txn-1' } },
        { op: 'create', table: 'journal_entries', primKey: 'je-debit', record: { id: 'je-debit' } },
        { op: 'create', table: 'journal_entries', primKey: 'je-credit', record: { id: 'je-credit' } },
      ];

      const undo = buildUndoFromChanges('operation', changes);
      expect(undo.steps).toHaveLength(4);
      // All creates → all deletes; je-credit (last) is first undo step, emp-1 (first) is last
      expect(undo.steps[0]).toMatchObject({ primKey: 'je-credit' });
      expect(undo.steps[3]).toMatchObject({ primKey: 'emp-1', op: 'delete' });
    });
  });
});
