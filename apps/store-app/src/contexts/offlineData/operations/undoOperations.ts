/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic Dexie table names from undo JSON */
/**
 * Undo operations (thinning OfflineDataContext).
 * undoLastAction — generic single-level undo over sessionStorage-persisted steps.
 */

import { getDB } from '../../../lib/db';

export const UNDO_STORAGE_KEY = 'last_undo_action';
export const TABLE_NAME_MAP = { suppliers: 'entities', customers: 'entities' } as const;
export const CASH_DRAWER_EXEMPT_TABLE = 'cash_drawer_accounts';

function normalizeUndoTable(table: string): string {
  return TABLE_NAME_MAP[table as keyof typeof TABLE_NAME_MAP] ?? table;
}

export interface UndoDeps {
  storeId: string | null | undefined;
  refreshData: () => Promise<void>;
  updateUnsyncedCount: () => Promise<void>;
  setCanUndo: (value: boolean) => void;
}

export async function undoLastAction(deps: UndoDeps): Promise<boolean> {
  const { storeId, refreshData, updateUnsyncedCount, setCanUndo } = deps;
  let actionForLog: { type?: string; affected?: Array<{ table: string }> } | null = null;

  try {
    if (typeof sessionStorage === 'undefined') return false;

    const undoData = sessionStorage.getItem(UNDO_STORAGE_KEY);
    if (!undoData) return false;

    const action = JSON.parse(undoData) as {
      type?: string;
      affected?: Array<{ table: string; id: string }>;
      steps?: Array<{
        op: string;
        table: string;
        id?: string;
        changes?: Record<string, unknown>;
        record?: Record<string, unknown>;
        transaction_id?: string;
      }>;
    };
    actionForLog = action;

    const restoreTargetKeys = new Set<string>();
    for (const step of action.steps || []) {
      if (step.op === 'restore' || step.op === 'add') {
        const rid =
          step.id ?? (step.record as { id?: string } | undefined)?.id ?? (step.changes as { id?: string } | undefined)?.id;
        if (step.table && rid) {
          restoreTargetKeys.add(`${normalizeUndoTable(step.table)}:${rid}`);
        }
      }
    }

    for (const item of action.affected || []) {
      const tableName = normalizeUndoTable(item.table);
      const db = getDB() as any;
      if (!db[tableName]) {
        console.warn(`⚠️ Undo action references unknown table: ${item.table} (mapped to: ${tableName})`);
        sessionStorage.removeItem(UNDO_STORAGE_KEY);
        setCanUndo(false);
        return false;
      }

      const itemKey = `${normalizeUndoTable(item.table)}:${item.id}`;
      if (restoreTargetKeys.has(itemKey)) continue;

      const record = await db[tableName].get(item.id);
      if (!record) {
        sessionStorage.removeItem(UNDO_STORAGE_KEY);
        setCanUndo(false);
        return false;
      }
      if (record._synced && item.table !== CASH_DRAWER_EXEMPT_TABLE) {
        sessionStorage.removeItem(UNDO_STORAGE_KEY);
        setCanUndo(false);
        return false;
      }
    }

    await getDB().transaction('rw', [...getDB().tables, getDB().pending_syncs], async () => {
      for (const step of action.steps || []) {
        if (step.op === 'delete' && step.id) {
          if (step.table === 'journal_entries' && (step as { transaction_id?: string }).transaction_id) {
            const transactionId = (step as { transaction_id: string }).transaction_id;
            const journalEntries = await getDB().journal_entries
              .where('transaction_id')
              .equals(transactionId)
              .toArray();

            for (const entry of journalEntries) {
              await getDB().journal_entries.delete(entry.id);
              await getDB().pending_syncs
                .where('table_name')
                .equals('journal_entries')
                .filter(item => item.record_id === entry.id)
                .delete();
            }
          } else {
            await (getDB() as any)[step.table].delete(step.id);
            await getDB()
              .pending_syncs.where('table_name')
              .equals(step.table)
              .filter(item => item.record_id === step.id)
              .delete();
          }
        } else if (step.op === 'restore' && step.record) {
          await (getDB() as any)[step.table].add(step.record);
          const recordId = step.id ?? (step.record as { id?: string }).id;
          if (!recordId) {
            console.warn('Undo restore step missing record id');
          } else {
            await getDB()
              .pending_syncs.where('table_name')
              .equals(step.table)
              .filter(p => p.record_id === recordId && p.operation === 'delete')
              .delete();
            await getDB().addPendingSync(step.table, recordId, 'create', step.record);
          }
        } else if (step.op === 'add' && step.changes) {
          await (getDB() as any)[step.table].add(step.changes);
          const recordId = step.id ?? (step.changes as { id?: string }).id;
          if (!recordId) {
            console.warn('Undo add step missing record id');
          } else {
            await getDB()
              .pending_syncs.where('table_name')
              .equals(step.table)
              .filter(p => p.record_id === recordId && p.operation === 'delete')
              .delete();
            await getDB().addPendingSync(step.table, recordId, 'create', step.changes);
          }
        } else if (step.op === 'update' && step.id && step.changes) {
          // If step.changes explicitly sets _synced, respect it (e.g. restoring a previously-synced record).
          // Otherwise default to _synced: false for backward compatibility.
          const syncFlag = step.changes._synced !== undefined ? step.changes._synced : false;
          await (getDB() as any)[step.table].update(step.id, { ...step.changes, _synced: syncFlag });
          await getDB()
            .pending_syncs.where('table_name')
            .equals(step.table)
            .filter(p => p.record_id === step.id)
            .delete();
        }
      }
    });

    sessionStorage.removeItem(UNDO_STORAGE_KEY);
    setCanUndo(false);
    await refreshData();
    await updateUnsyncedCount();

    const hasCashDrawerChanges = action.affected?.some(
      (item: { table: string }) =>
        item.table === 'cash_drawer_accounts' ||
        action.steps?.some((s: { table?: string }) => s.table === 'cash_drawer_accounts')
    );

    if (hasCashDrawerChanges && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('cash-drawer-updated', {
          detail: { storeId, event: 'undo_completed' },
        })
      );
      window.dispatchEvent(
        new CustomEvent('undo-completed', {
          detail: {
            storeId,
            event: 'undo_completed',
            affectedTables: action.affected?.map((a: { table: string }) => a.table) || [],
          },
        })
      );
    }

    return true;
  } catch (error) {
    console.error('Undo failed:', error, {
      type: actionForLog?.type,
      tables: actionForLog?.affected?.map(a => a.table),
    });
    return false;
  }
}
