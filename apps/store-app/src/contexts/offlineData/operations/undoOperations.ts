/**
 * Undo operations (thinning OfflineDataContext).
 * undoLastAction — generic single-level undo over localStorage-persisted steps.
 */

import { getDB } from '../../../lib/db';

export interface UndoDeps {
  storeId: string | null | undefined;
  refreshData: () => Promise<void>;
  updateUnsyncedCount: () => Promise<void>;
  setCanUndo: (value: boolean) => void;
}

export async function undoLastAction(deps: UndoDeps): Promise<boolean> {
  const { storeId, refreshData, updateUnsyncedCount, setCanUndo } = deps;

  try {
    const undoData = localStorage.getItem('last_undo_action');
    if (!undoData) return false;

    const action = JSON.parse(undoData);

    const tableNameMap: Record<string, string> = {
      suppliers: 'entities',
      customers: 'entities'
    };

    for (const item of action.affected || []) {
      const tableName = tableNameMap[item.table] || item.table;
      const db = getDB() as any;
      if (!db[tableName]) {
        console.warn(`⚠️ Undo action references unknown table: ${item.table} (mapped to: ${tableName})`);
        localStorage.removeItem('last_undo_action');
        setCanUndo(false);
        return false;
      }

      const record = await db[tableName].get(item.id);
      if (!record) {
        localStorage.removeItem('last_undo_action');
        setCanUndo(false);
        return false;
      }
      if (record._synced && item.table !== 'cash_drawer_accounts') {
        localStorage.removeItem('last_undo_action');
        setCanUndo(false);
        return false;
      }
    }

    await getDB().transaction('rw', [...getDB().tables, getDB().pending_syncs], async () => {
      for (const step of action.steps || []) {
        if (step.op === 'delete' && step.id) {
          if (step.table === 'journal_entries' && (step as any).transaction_id) {
            const transactionId = (step as any).transaction_id;
            const journalEntries = await getDB().journal_entries
              .where('transaction_id')
              .equals(transactionId)
              .toArray();

            for (const entry of journalEntries) {
              await getDB().journal_entries.delete(entry.id);
              await getDB().pending_syncs.where('table_name').equals('journal_entries')
                .filter(item => item.record_id === entry.id).delete();
            }
          } else {
            await (getDB() as any)[step.table].delete(step.id);
            await getDB().pending_syncs.where('table_name').equals(step.table)
              .filter(item => item.record_id === step.id).delete();
          }
        } else if (step.op === 'restore' && step.record) {
          await (getDB() as any)[step.table].add(step.record);
        } else if (step.op === 'update' && step.id && step.changes) {
          await (getDB() as any)[step.table].update(step.id, step.changes);
          await getDB().pending_syncs.where('table_name').equals(step.table)
            .filter(item => item.record_id === step.id).delete();
        }
      }

      for (const item of action.affected || []) {
        await getDB().pending_syncs.where('table_name').equals(item.table)
          .filter(pending => pending.record_id === item.id).delete();
      }
    });

    localStorage.removeItem('last_undo_action');
    setCanUndo(false);
    await refreshData();
    await updateUnsyncedCount();

    const hasCashDrawerChanges = action.affected?.some((item: any) =>
      item.table === 'cash_drawer_accounts' ||
      action.steps?.some((step: any) => step.table === 'cash_drawer_accounts')
    );

    if (hasCashDrawerChanges && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cash-drawer-updated', {
        detail: { storeId, event: 'undo_completed' }
      }));
      window.dispatchEvent(new CustomEvent('undo-completed', {
        detail: { storeId, event: 'undo_completed', affectedTables: action.affected?.map((a: any) => a.table) || [] }
      }));
    }

    return true;
  } catch (error) {
    console.error('Undo failed:', error);
    return false;
  }
}
