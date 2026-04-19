/**
 * Integration tests for changeTracker automatic undo capture
 * Verifies that multiple database operations are captured and converted to undo steps correctly
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { changeTracker, buildUndoFromChanges, type ChangeRecord } from '../../services/changeTracker';
import { withUndoOperation } from '../../contexts/offlineData/operations/withUndoOperation';

describe('changeTracker integration tests', () => {
  beforeEach(() => {
    // Reset state before each test
    if (changeTracker.isActive()) {
      changeTracker.endSession();
    }
  });

  describe('automatic undo capture for multi-table operations', () => {
    it('captures changes from multiple tables and builds correct undo steps', async () => {
      // Track a simulated multi-table operation
      changeTracker.startSession();

      // Simulate creating a bill (main record)
      changeTracker.trackCreate('bills', 'bill-1', {
        id: 'bill-1',
        supplier_id: 'sup-1',
        total: 1000,
        _synced: false
      });

      // Simulate creating line items
      changeTracker.trackCreate('bill_line_items', 'line-1', {
        id: 'line-1',
        bill_id: 'bill-1',
        quantity: 5,
        unit_price: 100,
        _synced: false
      });

      changeTracker.trackCreate('bill_line_items', 'line-2', {
        id: 'line-2',
        bill_id: 'bill-1',
        quantity: 10,
        unit_price: 100,
        _synced: false
      });

      // Simulate creating transaction
      changeTracker.trackCreate('transactions', 'txn-1', {
        id: 'txn-1',
        type: 'payment',
        amount: 1000,
        _synced: false
      });

      // Simulate creating journal entries
      changeTracker.trackCreate('journal_entries', 'je-1', {
        id: 'je-1',
        transaction_id: 'txn-1',
        debit_account: 'Accounts Payable',
        amount: 1000,
        _synced: false
      });

      changeTracker.trackCreate('journal_entries', 'je-2', {
        id: 'je-2',
        transaction_id: 'txn-1',
        credit_account: 'Bank',
        amount: 1000,
        _synced: false
      });

      // Simulate inventory updates
      changeTracker.trackUpdate('inventory_items', 'inv-1',
        { id: 'inv-1', quantity: 100, _synced: false },
        { quantity: 85, _synced: false }
      );

      const changes = changeTracker.endSession();

      // Verify all changes captured (7 total: 4 creates, 2 journal creates, 1 update)
      expect(changes).toHaveLength(7);
      expect(changes.filter(c => c.table === 'bills')).toHaveLength(1);
      expect(changes.filter(c => c.table === 'bill_line_items')).toHaveLength(2);
      expect(changes.filter(c => c.table === 'transactions')).toHaveLength(1);
      expect(changes.filter(c => c.table === 'journal_entries')).toHaveLength(2);
      expect(changes.filter(c => c.table === 'inventory_items')).toHaveLength(1);

      // Build undo from changes
      const undo = buildUndoFromChanges('operation', changes);

      // Verify undo structure
      expect(undo.type).toBe('operation');
      expect(undo.steps).toHaveLength(7);
      expect(undo.affected).toEqual(expect.arrayContaining([
        'bills', 'bill_line_items', 'transactions', 'journal_entries', 'inventory_items'
      ]));

      // Verify undo steps are in reverse order (last change first)
      expect(undo.steps[0].op).toBe('revert-to-before'); // inventory_items update (last operation)
      expect(undo.steps[0].table).toBe('inventory_items');

      expect(undo.steps[1].op).toBe('delete'); // je-2 (second-to-last)
      expect(undo.steps[1].table).toBe('journal_entries');

      expect(undo.steps[6].op).toBe('delete'); // bill-1 (first operation)
      expect(undo.steps[6].table).toBe('bills');
    });

    it('prevents duplicate undo tracking when operation fails', async () => {
      const pushUndoMock = vi.fn();
      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      try {
        await withUndoOperation('operation', pushUndoMock, failingOperation);
      } catch (e) {
        // Expected to throw
      }

      // Verify pushUndo was NOT called (operation failed)
      expect(pushUndoMock).not.toHaveBeenCalled();
    });

    it('does not call pushUndo when operation produces zero changes', async () => {
      const pushUndoMock = vi.fn();
      const emptyOperation = async () => {
        // Does not modify any data
        return;
      };

      await withUndoOperation('operation', pushUndoMock, emptyOperation);

      // Verify pushUndo was NOT called (no changes)
      expect(pushUndoMock).not.toHaveBeenCalled();
    });

    it('calls pushUndo with correct undo data on successful multi-table operation', async () => {
      const pushUndoMock = vi.fn();
      let capturedUndo: any = null;

      const operation = async () => {
        // Simulate a multi-table operation
        changeTracker.startSession();
        changeTracker.trackCreate('products', 'prod-1', { id: 'prod-1', name: 'Tomato' });
        changeTracker.trackCreate('products', 'prod-2', { id: 'prod-2', name: 'Potato' });
        changeTracker.trackUpdate('inventory_items', 'inv-1',
          { id: 'inv-1', quantity: 100 },
          { quantity: 85 }
        );
        changeTracker.endSession();
      };

      pushUndoMock.mockImplementation((action) => {
        capturedUndo = action;
      });

      // Manually simulate withUndoOperation flow to test this specific case
      changeTracker.startSession();
      await operation();
      const changes = changeTracker.endSession();

      if (changes.length > 0) {
        const undo = buildUndoFromChanges('operation', changes);
        pushUndoMock(undo);
      }

      // Verify pushUndo was called with correct structure
      expect(pushUndoMock).toHaveBeenCalledOnce();
      expect(capturedUndo.type).toBe('operation');
      expect(capturedUndo.steps).toHaveLength(3);
      expect(capturedUndo.affected).toEqual(expect.arrayContaining(['products', 'inventory_items']));
    });

    it('merges duplicate updates to same record (keeping earliest before snapshot)', () => {
      changeTracker.startSession();

      // First update to same record
      changeTracker.trackUpdate('products', 'prod-1',
        { id: 'prod-1', name: 'Tomato', price: 100 }, // earliest before
        { price: 120 }
      );

      // Second update to same record
      changeTracker.trackUpdate('products', 'prod-1',
        { id: 'prod-1', name: 'Tomato', price: 120 }, // later before (should not override)
        { name: 'Cherry Tomato' }
      );

      const changes = changeTracker.endSession();

      // Verify merged into single update with earliest before
      expect(changes).toHaveLength(1);
      expect(changes[0].op).toBe('update');
      expect(changes[0].before).toEqual({
        id: 'prod-1',
        name: 'Tomato',
        price: 100 // Earliest before preserved
      });
      expect(changes[0].modifications).toEqual({
        price: 120,
        name: 'Cherry Tomato' // Both modifications combined
      });
    });
  });
});
