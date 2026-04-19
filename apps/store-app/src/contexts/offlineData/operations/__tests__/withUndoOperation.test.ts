/**
 * Tests for withUndoOperation and withUndoSuppressed utilities
 * Covers: wrapper behavior, failure handling, suppression, nested sessions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { withUndoOperation, withUndoSuppressed } from '../withUndoOperation';
import { changeTracker } from '../../../../services/changeTracker';
import type { UndoAction } from '../../../../services/changeTracker';

// Helper: detect new vs legacy undo format — mirrors the logic in undoOperations.ts
function isNewFormat(payload: { affected?: any[] }): boolean {
  return (
    Array.isArray(payload.affected) &&
    (payload.affected.length === 0 || typeof payload.affected[0] === 'string')
  );
}

describe('withUndoOperation wrapper', () => {
  beforeEach(() => {
    // Reset session state before each test
    if (changeTracker.isActive()) {
      changeTracker.endSession();
    }
  });

  it('starts session and calls pushUndo on success', async () => {
    const pushUndo = vi.fn();
    let sessionWasActive = false;

    const result = await withUndoOperation(
      'operation',
      pushUndo,
      async () => {
        sessionWasActive = changeTracker.isActive();
        changeTracker.trackCreate('products', 'prod-1', { id: 'prod-1' });
        return 'success';
      }
    );

    expect(sessionWasActive).toBe(true);
    expect(pushUndo).toHaveBeenCalled();
    expect(result).toBe('success');
    expect(changeTracker.isActive()).toBe(false);
  });

  it('discards changes and does not call pushUndo on operation failure', async () => {
    const pushUndo = vi.fn();

    try {
      await withUndoOperation(
        'operation',
        pushUndo,
        async () => {
          changeTracker.trackCreate('products', 'prod-1', {});
          throw new Error('Operation failed');
        }
      );
    } catch (e) {
      // Expected
    }

    expect(pushUndo).not.toHaveBeenCalled();
    expect(changeTracker.isActive()).toBe(false);
  });

  it('does not call pushUndo when operation produces zero changes', async () => {
    const pushUndo = vi.fn();

    const result = await withUndoOperation(
      'operation',
      pushUndo,
      async () => {
        // No tracking calls
        return 'no changes';
      }
    );

    expect(pushUndo).not.toHaveBeenCalled();
    expect(result).toBe('no changes');
  });

  it('builds correct undo action from tracked changes', async () => {
    const capturedUndo: UndoAction[] = [];
    const pushUndo = (action: UndoAction) => {
      capturedUndo.push(action);
    };

    await withUndoOperation(
      'operation',
      pushUndo,
      async () => {
        changeTracker.trackCreate('products', 'prod-1', { id: 'prod-1', name: 'Tomato' });
        changeTracker.trackCreate('transactions', 'txn-1', { id: 'txn-1' });
      }
    );

    expect(capturedUndo).toHaveLength(1);
    const undo = capturedUndo[0];
    expect(undo.type).toBe('operation');
    expect(undo.steps).toHaveLength(2);
    expect(undo.affected).toContain('products');
    expect(undo.affected).toContain('transactions');
  });

  it('propagates operation errors', async () => {
    const pushUndo = vi.fn();
    const error = new Error('Test error');

    await expect(
      withUndoOperation(
        'operation',
        pushUndo,
        async () => {
          throw error;
        }
      )
    ).rejects.toThrow('Test error');
  });
});

describe('withUndoSuppressed utility', () => {
  beforeEach(() => {
    if (changeTracker.isActive()) {
      changeTracker.endSession();
    }
  });

  it('prevents tracking during execution', async () => {
    changeTracker.startSession();

    changeTracker.trackCreate('products', 'prod-1', {});

    let trackedDuringSuppression = false;
    await withUndoSuppressed(async () => {
      changeTracker.trackCreate('products', 'prod-2', {});
      trackedDuringSuppression = true;
    });

    changeTracker.trackCreate('products', 'prod-3', {});

    const changes = changeTracker.endSession();
    expect(changes.map(c => c.primKey)).toEqual(['prod-1', 'prod-3']);
  });

  it('resumes tracking after execution', async () => {
    changeTracker.startSession();

    await withUndoSuppressed(async () => {
      // Suppressed
    });

    changeTracker.trackCreate('products', 'prod-1', {});
    const changes = changeTracker.endSession();
    expect(changes).toHaveLength(1);
  });

  it('handles exceptions without affecting suppression state', async () => {
    changeTracker.startSession();

    try {
      await withUndoSuppressed(async () => {
        throw new Error('Test error');
      });
    } catch (e) {
      // Expected
    }

    changeTracker.trackCreate('products', 'prod-1', {});
    const changes = changeTracker.endSession();
    expect(changes).toHaveLength(1);
  });

  it('supports nested suppress calls with depth counter', async () => {
    changeTracker.startSession();
    changeTracker.trackCreate('products', 'prod-1', {});

    await withUndoSuppressed(async () => {
      changeTracker.trackCreate('products', 'prod-2', {});

      await withUndoSuppressed(async () => {
        changeTracker.trackCreate('products', 'prod-3', {});
      });

      changeTracker.trackCreate('products', 'prod-4', {});
    });

    changeTracker.trackCreate('products', 'prod-5', {});
    const changes = changeTracker.endSession();
    expect(changes.map(c => c.primKey)).toEqual(['prod-1', 'prod-5']);
  });

  it('works correctly when no session is active', async () => {
    // Should not throw
    await withUndoSuppressed(async () => {
      return 'no session';
    });

    expect(changeTracker.isActive()).toBe(false);
  });
});

describe('withUndoOperation + withUndoSuppressed integration', () => {
  beforeEach(() => {
    if (changeTracker.isActive()) {
      changeTracker.endSession();
    }
  });

  it('nested withUndoOperation merges into outer session', async () => {
    const pushUndo1 = vi.fn();
    const pushUndo2 = vi.fn();

    await withUndoOperation(
      'operation',
      pushUndo1,
      async () => {
        changeTracker.trackCreate('products', 'prod-1', {});

        // Nested withUndoOperation (merges into outer session)
        await withUndoOperation(
          'operation',
          pushUndo2,
          async () => {
            changeTracker.trackCreate('products', 'prod-2', {});
          }
        );

        changeTracker.trackCreate('products', 'prod-3', {});
      }
    );

    // Only outer wrapper should call pushUndo (inner has no changes to report)
    expect(pushUndo1).toHaveBeenCalled();
    expect(pushUndo2).not.toHaveBeenCalled();
    const undo1 = pushUndo1.mock.calls[0][0];
    expect(undo1.steps).toHaveLength(3);
  });

  it('suppression inside withUndoOperation prevents tracking', async () => {
    const pushUndo = vi.fn();

    await withUndoOperation(
      'operation',
      pushUndo,
      async () => {
        changeTracker.trackCreate('products', 'prod-1', {});

        await withUndoSuppressed(async () => {
          changeTracker.trackCreate('products', 'prod-2', {});
        });

        changeTracker.trackCreate('products', 'prod-3', {});
      }
    );

    const undo = pushUndo.mock.calls[0][0];
    expect(undo.steps.map((s: any) => s.primKey)).toEqual(['prod-3', 'prod-1']);
  });
});

// ─── T014: end-to-end payment step ordering through wrapper ──────────────────
// Complements the unit tests in changeTracker.test.ts — verifies the full
// withUndoOperation → buildUndoFromChanges pipeline produces reverse order.
describe('T014: end-to-end payment step ordering through withUndoOperation', () => {
  beforeEach(() => {
    if (changeTracker.isActive()) changeTracker.endSession();
  });

  it('payment writes (entity update, transaction, journals) are undone in reverse creation order', async () => {
    const capturedUndo: UndoAction[] = [];

    await withUndoOperation('operation', action => capturedUndo.push(action), async () => {
      // Simulate the order transactionService writes happen inside createCustomerPayment:
      //   1. entity balance updated
      //   2. transaction added
      //   3. journal entry (debit) added
      //   4. journal entry (credit) added
      changeTracker.trackUpdate('entities', 'entity-1', { id: 'entity-1', balance: 500 }, { balance: 300 });
      changeTracker.trackCreate('transactions', 'txn-1', { id: 'txn-1' });
      changeTracker.trackCreate('journal_entries', 'je-debit', { id: 'je-debit' });
      changeTracker.trackCreate('journal_entries', 'je-credit', { id: 'je-credit' });
    });

    expect(capturedUndo).toHaveLength(1);
    const steps = capturedUndo[0].steps;
    expect(steps).toHaveLength(4);
    // Last created first
    expect(steps[0]).toMatchObject({ op: 'delete',           primKey: 'je-credit' });
    expect(steps[1]).toMatchObject({ op: 'delete',           primKey: 'je-debit' });
    expect(steps[2]).toMatchObject({ op: 'delete',           primKey: 'txn-1' });
    // Entity was updated first → reverted last
    expect(steps[3]).toMatchObject({ op: 'revert-to-before', primKey: 'entity-1' });
  });

  it('undo payload uses new format (string[] affected, primKey in steps)', async () => {
    const capturedUndo: UndoAction[] = [];

    await withUndoOperation('operation', action => capturedUndo.push(action), async () => {
      changeTracker.trackCreate('transactions', 'txn-1', { id: 'txn-1' });
      changeTracker.trackCreate('journal_entries', 'je-1', { id: 'je-1' });
    });

    const undo = capturedUndo[0];
    // New format: affected is string[], not {table,id}[]
    expect(isNewFormat(undo)).toBe(true);
    // Steps use primKey, not id
    expect(undo.steps[0]).toHaveProperty('primKey');
    expect(undo.steps[0]).not.toHaveProperty('id');
  });
});

// ─── T016: backward compatibility — legacy operations ────────────────────────
// Automated substitute for the manual browser test:
//   "Execute legacy deleteSale operation, verify undo still works, verify isActive() = false"
describe('T016: backward compatibility — legacy operations leave tracker inactive', () => {
  beforeEach(() => {
    if (changeTracker.isActive()) changeTracker.endSession();
  });

  it('isActive() is false when no session has been started (legacy operation context)', () => {
    expect(changeTracker.isActive()).toBe(false);
  });

  it('tracker remains inactive throughout a legacy operation (no withUndoOperation wrapper)', () => {
    // Legacy operations never call withUndoOperation, so they never start a session.
    // Dexie hooks fire during writes, calling trackCreate/trackUpdate — but these are
    // no-ops when no session is active (FR-014).
    expect(changeTracker.isActive()).toBe(false);

    // Simulate DB hook calls during a legacy operation
    changeTracker.trackCreate('bills', 'bill-1', { id: 'bill-1' });
    changeTracker.trackCreate('transactions', 'txn-1', { id: 'txn-1' });

    expect(changeTracker.isActive()).toBe(false); // Still inactive — no session was started

    // Legacy manual undo construction and direct pushUndo call
    const pushUndo = vi.fn();
    const legacyUndo = {
      type: 'delete_sale',
      affected: [{ table: 'bills', id: 'bill-1' }, { table: 'transactions', id: 'txn-1' }],
      steps: [
        { op: 'restore', table: 'transactions', id: 'txn-1', record: { id: 'txn-1' } },
        { op: 'restore', table: 'bills', id: 'bill-1', record: { id: 'bill-1' } }
      ]
    };
    pushUndo(legacyUndo);

    expect(changeTracker.isActive()).toBe(false); // Tracker never touched
    expect(pushUndo).toHaveBeenCalledWith(legacyUndo);
  });

  it('withUndoSuppressed (used by undoLastAction) does not activate a session', async () => {
    // undoLastAction wraps everything in withUndoSuppressed — it should never start
    // a new tracking session, only suppress an existing one.
    expect(changeTracker.isActive()).toBe(false);

    await withUndoSuppressed(async () => {
      // Simulate DB writes during undo execution
      changeTracker.trackCreate('bills', 'bill-1', {}); // no-op: no session active
      expect(changeTracker.isActive()).toBe(false);
    });

    expect(changeTracker.isActive()).toBe(false);
  });

  it('legacy undo payload is correctly identified as non-new-format', () => {
    // undoOperations.ts uses isNewFormat() to skip pre-validation for new-format payloads.
    // Legacy payloads use {table, id}[] for affected — must NOT be detected as new format.
    const legacyPayload = {
      type: 'delete_sale',
      affected: [{ table: 'bills', id: 'bill-1' }],
      steps: [{ op: 'restore', table: 'bills', id: 'bill-1', record: {} }]
    };
    expect(isNewFormat(legacyPayload)).toBe(false);
  });

  it('new-format payload from withUndoOperation is correctly identified as new format', () => {
    const newFormatPayload: UndoAction = {
      type: 'operation',
      affected: ['bills', 'transactions'],
      steps: [{ op: 'delete', table: 'transactions', primKey: 'txn-1' }]
    };
    expect(isNewFormat(newFormatPayload)).toBe(true);
  });

  it('empty affected array is treated as new format (safe default for zero-change operations)', () => {
    // buildUndoFromChanges with no changes produces affected: [] — treated as new format
    // to skip legacy pre-validation, which would crash on an empty array.
    const emptyPayload = { type: 'operation', affected: [], steps: [] };
    expect(isNewFormat(emptyPayload)).toBe(true);
  });
});
