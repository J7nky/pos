/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic Dexie table names from undo JSON */
/**
 * Undo operations (thinning OfflineDataContext).
 * undoLastAction — generic single-level undo over sessionStorage-persisted steps.
 */

import { getDB } from '../../../lib/db';
import { withUndoSuppressed } from './withUndoOperation';
import { entityBalanceCache } from '../../../services/entityBalanceCache';

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
    // Wrap the entire undo execution with suppression to prevent tracking undo changes themselves
    return await withUndoSuppressed(async () => {
      if (typeof sessionStorage === 'undefined') return false;

      const undoData = sessionStorage.getItem(UNDO_STORAGE_KEY);
      if (!undoData) return false;

      const action = JSON.parse(undoData) as {
        type?: string;
        // Legacy format: {table, id}[] — used by manual pushUndo operations
        // New format: string[] — used by withUndoOperation / buildUndoFromChanges
        affected?: Array<{ table: string; id: string } | string>;
        steps?: Array<{
          op: string;
          table: string;
          // Legacy key field
          id?: string;
          // New format key field (from buildUndoFromChanges)
          primKey?: any;
          changes?: Record<string, unknown>;
          // New format update-undo field (full before-state)
          modifications?: Record<string, unknown>;
          record?: Record<string, unknown>;
          transaction_id?: string;
        }>;
      };
      actionForLog = action;

      // Detect format: new auto-tracking format uses string[] for affected, legacy uses {table,id}[]
      const isNewFormat = Array.isArray(action.affected) &&
        (action.affected.length === 0 || typeof action.affected[0] === 'string');

      // Pre-validation: only run for legacy format (new format has no per-record IDs in affected)
      if (!isNewFormat) {
        const restoreTargetKeys = new Set<string>();
        for (const step of action.steps || []) {
          if (step.op === 'restore' || step.op === 'add') {
            const rid =
              step.id ?? step.primKey ?? (step.record as { id?: string } | undefined)?.id ?? (step.changes as { id?: string } | undefined)?.id;
            if (step.table && rid) {
              restoreTargetKeys.add(`${normalizeUndoTable(step.table)}:${rid}`);
            }
          }
        }

        for (const item of action.affected || []) {
          if (typeof item === 'string') continue; // skip new-format entries mixed in
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
      }

      await getDB().transaction('rw', [...getDB().tables, getDB().pending_syncs], async () => {
        for (const step of action.steps || []) {
          // Support both legacy `id` and new-format `primKey`
          const recordId = step.id ?? step.primKey;

          // Guard: skip steps for tables that don't exist on the DB object
          // (e.g. 'unknown' recorded by old hook code — fixed in db.ts but guard kept for safety)
          if (step.table && !(getDB() as any)[step.table]) {
            console.warn(`⚠️ Undo: skipping step for unknown table '${step.table}'`);
            continue;
          }

          if (step.op === 'delete' && recordId) {
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
              await (getDB() as any)[step.table].delete(recordId);
              await getDB()
                .pending_syncs.where('table_name')
                .equals(step.table)
                .filter(item => item.record_id === recordId)
                .delete();
            }
          } else if (step.op === 'restore' && step.record) {
            await (getDB() as any)[step.table].put({ ...step.record, _synced: false });
            const rid = recordId ?? (step.record as { id?: string }).id;
            if (!rid) {
              console.warn('Undo restore step missing record id');
            } else {
              await getDB()
                .pending_syncs.where('table_name')
                .equals(step.table)
                .filter(p => p.record_id === rid && p.operation === 'delete')
                .delete();
              await getDB().addPendingSync(step.table, rid, 'create', step.record);
            }
          } else if (step.op === 'add' && step.changes) {
            await (getDB() as any)[step.table].add(step.changes);
            const rid = recordId ?? (step.changes as { id?: string }).id;
            if (!rid) {
              console.warn('Undo add step missing record id');
            } else {
              await getDB()
                .pending_syncs.where('table_name')
                .equals(step.table)
                .filter(p => p.record_id === rid && p.operation === 'delete')
                .delete();
              await getDB().addPendingSync(step.table, rid, 'create', step.changes);
            }
          } else if (step.op === 'update' && recordId && step.changes) {
            // Legacy update: partial field changes
            const syncFlag = step.changes._synced !== undefined ? step.changes._synced : false;
            await (getDB() as any)[step.table].update(recordId, { ...step.changes, _synced: syncFlag });
            await getDB()
              .pending_syncs.where('table_name')
              .equals(step.table)
              .filter(p => p.record_id === recordId)
              .delete();
          } else if (step.op === 'revert-to-before' && recordId && step.modifications) {
            // New format: full before-state restore (from buildUndoFromChanges)
            const syncFlag = step.modifications._synced !== undefined ? step.modifications._synced : false;
            await (getDB() as any)[step.table].update(recordId, { ...step.modifications, _synced: syncFlag });
            await getDB()
              .pending_syncs.where('table_name')
              .equals(step.table)
              .filter(p => p.record_id === recordId)
              .delete();
            await getDB().addPendingSync(step.table, recordId, 'update', step.modifications);
          }
        }
      });

      sessionStorage.removeItem(UNDO_STORAGE_KEY);
      setCanUndo(false);
      entityBalanceCache.invalidateAll();
      await refreshData();
      await updateUnsyncedCount();

      const affectedTables: string[] = Array.isArray(action.affected)
        ? action.affected.map((a: any) => (typeof a === 'string' ? a : a.table)).filter(Boolean)
        : [];

      const hasCashDrawerChanges =
        affectedTables.includes('cash_drawer_accounts') ||
        (action.steps || []).some((s: { table?: string }) => s.table === 'cash_drawer_accounts');

      if (typeof window !== 'undefined') {
        if (hasCashDrawerChanges) {
          window.dispatchEvent(
            new CustomEvent('cash-drawer-updated', {
              detail: { storeId, event: 'undo_completed' },
            })
          );
        }
        // Always dispatch undo-completed so listeners (e.g. Accounting page) can
        // refresh balance hooks that rely on snapshot-cached values.
        window.dispatchEvent(
          new CustomEvent('undo-completed', {
            detail: {
              storeId,
              event: 'undo_completed',
              affectedTables,
            },
          })
        );
      }

      return true;
    });
  } catch (error) {
    console.error('Undo failed:', error, {
      type: actionForLog?.type,
      tables: actionForLog?.affected?.map(a => a.table),
    });
    return false;
  }
}
