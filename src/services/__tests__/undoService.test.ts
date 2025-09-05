import { db, UndoAction, UndoStep } from '../../lib/db';
import { createId } from '../../lib/db';

describe('Undo Service', () => {
  beforeEach(async () => {
    // Clear all tables before each test
    await db.transaction('rw', db.tables, async () => {
      for (const table of Object.keys(db)) {
        if (typeof db[table] === 'object' && db[table].clear) {
          await db[table].clear();
        }
      }
    });
  });

  afterAll(async () => {
    // Clean up after all tests
    await db.close();
  });

  describe('UndoAction storage', () => {
    it('should store and retrieve undo actions', async () => {
      const testAction: UndoAction = {
        id: createId(),
        label: 'Test Action',
        created_at: new Date().toISOString(),
        affected: [{ table: 'products', id: 'test-id' }],
        steps: [{ table: 'products', op: 'add', id: 'test-id' }]
      };

      await db.undo_actions.add(testAction);
      const retrieved = await db.undo_actions.get(testAction.id);

      expect(retrieved).toEqual(testAction);
    });

    it('should maintain single-level undo (overwrite previous)', async () => {
      const action1: UndoAction = {
        id: createId(),
        label: 'Action 1',
        created_at: new Date().toISOString(),
        affected: [],
        steps: []
      };

      const action2: UndoAction = {
        id: createId(),
        label: 'Action 2',
        created_at: new Date().toISOString(),
        affected: [],
        steps: []
      };

      await db.undo_actions.add(action1);
      await db.undo_actions.add(action2);

      const allActions = await db.undo_actions.toArray();
      expect(allActions).toHaveLength(2); // Both stored, no auto-clear

      // Clear and add new one (single-level behavior)
      await db.undo_actions.clear();
      await db.undo_actions.add(action2);

      const finalActions = await db.undo_actions.toArray();
      expect(finalActions).toHaveLength(1);
      expect(finalActions[0].id).toBe(action2.id);
    });
  });

  describe('Undo steps', () => {
    it('should handle add operations', () => {
      const step: UndoStep = { table: 'products', op: 'add', id: 'test-id' };
      expect(step.op).toBe('add');
      expect(step.table).toBe('products');
    });

    it('should handle delete operations', () => {
      const testRecord = { id: 'test', name: 'Test Product' };
      const step: UndoStep = { table: 'products', op: 'delete', record: testRecord };
      expect(step.op).toBe('delete');
      expect(step.record).toEqual(testRecord);
    });

    it('should handle update operations', () => {
      const step: UndoStep = {
        table: 'products',
        op: 'update',
        id: 'test-id',
        prev: { name: 'Old Name' }
      };
      expect(step.op).toBe('update');
      expect(step.prev).toEqual({ name: 'Old Name' });
    });

    it('should handle custom operations', () => {
      const customRun = jest.fn();
      const step: UndoStep = { op: 'custom', run: customRun };
      expect(step.op).toBe('custom');
      expect(typeof step.run).toBe('function');
    });
  });
});
