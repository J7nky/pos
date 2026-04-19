/**
 * changeTracker — Automatic change capture system for undo functionality
 *
 * This singleton service intercepts Dexie database hooks to automatically capture
 * all create/update/delete operations during a session. Changes are recorded with
 * full snapshots and are later converted into undo steps by buildUndoFromChanges().
 *
 * Session-based: Changes are only tracked when a session is active (via startSession).
 * Suppression: Can be temporarily suppressed to prevent tracking specific operations (e.g., undo execution).
 * Excluded tables: Sync-critical tables are automatically excluded from tracking.
 *
 * Used by withUndoOperation() wrapper to automatically build undo data without
 * manual per-operation undo construction.
 */

export interface ChangeRecord {
  op: 'create' | 'update' | 'delete';
  table: string;
  primKey: any;
  record?: any; // Full record snapshot for create
  before?: any; // Before state for update
  modifications?: any; // Only changed fields for update
}

export interface Session {
  type: 'operation';
  changes: ChangeRecord[];
  suppressDepth: number; // Tracks nested suppress/resume calls
}

export type UndoStep = {
  op: 'delete' | 'restore' | 'revert-to-before';
  table: string;
  primKey: any;
  record?: any; // For delete (delete the record) or restore (restore to this state)
  modifications?: any; // For revert-to-before (apply these reverts)
};

export type UndoAction = {
  type: 'operation';
  steps: UndoStep[];
  affected: string[];
};

/**
 * Tables that should never be tracked (sync-critical infrastructure)
 */
const EXCLUDED_TABLES = new Set([
  'pending_syncs',
  'bill_audit_logs',
  'sync_metadata',
  'sync_state'
]);

/**
 * Singleton change tracker
 */
class ChangeTracker {
  private session: Session | null = null;
  private sessionDepth = 0;

  /**
   * Start a new tracking session. If a session is already active, logs a warning and merges into the outer session.
   * Supports nesting via depth counter.
   */
  startSession(): void {
    if (this.session === null) {
      this.session = {
        type: 'operation',
        changes: [],
        suppressDepth: 0
      };
      this.sessionDepth = 1;
    } else {
      console.warn('⚠️ changeTracker: startSession called when session already active, merging into outer session');
      this.sessionDepth++;
    }
  }

  /**
   * End the current session and return accumulated changes. Returns empty array if no session active.
   * Only truly closes the session when depth reaches 0.
   */
  endSession(): ChangeRecord[] {
    if (this.session === null) {
      return [];
    }

    this.sessionDepth--;
    if (this.sessionDepth <= 0) {
      const changes = [...this.session.changes];
      this.session = null;
      this.sessionDepth = 0;
      return changes;
    }

    // Still in nested session, return empty (caller should not use this return value)
    return [];
  }

  /**
   * Check if a session is currently active
   */
  isActive(): boolean {
    return this.session !== null;
  }

  /**
   * Suppress tracking (prevents trackCreate/trackUpdate/trackDelete from recording changes).
   * Supports nested suppress/resume via depth counter.
   */
  suppress(): void {
    if (this.session !== null) {
      this.session.suppressDepth++;
    }
  }

  /**
   * Resume tracking (counterpart to suppress).
   */
  resume(): void {
    if (this.session !== null && this.session.suppressDepth > 0) {
      this.session.suppressDepth--;
    }
  }

  /**
   * Record a create operation. Called from db.ts triggerSyncOnUnsynced hook.
   */
  trackCreate(table: string, primKey: any, record: any): void {
    if (!this.session || this.session.suppressDepth > 0) return;
    if (EXCLUDED_TABLES.has(table)) return;

    this.session.changes.push({
      op: 'create',
      table,
      primKey,
      record: { ...record }
    });
  }

  /**
   * Record an update operation. Called from db.ts triggerSyncOnUpdate hook.
   * For duplicate updates to the same (table, primKey), keeps the earliest `before` snapshot.
   */
  trackUpdate(table: string, primKey: any, before: any, modifications: any): void {
    if (!this.session || this.session.suppressDepth > 0) return;
    if (EXCLUDED_TABLES.has(table)) return;

    // Check if we already have an update record for this (table, primKey)
    const existingIndex = this.session.changes.findIndex(
      c => c.op === 'update' && c.table === table && c.primKey === primKey
    );

    if (existingIndex >= 0) {
      // Merge: keep the earliest `before` snapshot, combine modifications
      const existing = this.session.changes[existingIndex];
      existing.modifications = { ...existing.modifications, ...modifications };
      // Don't update `before` — keep the original
    } else {
      this.session.changes.push({
        op: 'update',
        table,
        primKey,
        before: { ...before },
        modifications: { ...modifications }
      });
    }
  }

  /**
   * Record a delete operation. Called from db.ts deleting hook.
   */
  trackDelete(table: string, primKey: any, obj: any | undefined): void {
    if (!this.session || this.session.suppressDepth > 0) return;
    if (EXCLUDED_TABLES.has(table)) return;

    this.session.changes.push({
      op: 'delete',
      table,
      primKey,
      record: obj ? { ...obj } : undefined
    });
  }
}

/**
 * Singleton instance
 */
export const changeTracker = new ChangeTracker();

/**
 * Build undo steps from recorded changes
 *
 * Reverses the logic:
 * - create → delete (undo by deleting the created record)
 * - update → revert-to-before (undo by reverting modifications)
 * - delete → restore (undo by restoring the deleted record)
 *
 * Steps are reversed (last-created-record is first undo step).
 * Logs warning for delete steps with missing record snapshots.
 */
export function buildUndoFromChanges(type: 'operation', changes: ChangeRecord[]): UndoAction {
  const steps: UndoStep[] = [];
  const affectedSet = new Set<string>();

  // Iterate in reverse order (last change first)
  for (let i = changes.length - 1; i >= 0; i--) {
    const change = changes[i];
    affectedSet.add(change.table);

    if (change.op === 'create') {
      // Undo a create by deleting
      steps.push({
        op: 'delete',
        table: change.table,
        primKey: change.primKey,
        record: change.record
      });
    } else if (change.op === 'update') {
      // Undo an update by reverting to before state
      steps.push({
        op: 'revert-to-before',
        table: change.table,
        primKey: change.primKey,
        modifications: change.before
      });
    } else if (change.op === 'delete') {
      // Undo a delete by restoring
      if (!change.record) {
        console.warn(
          `⚠️ [changeTracker] Delete without record snapshot: ${change.table}/${change.primKey}. Restore may fail.`
        );
      }
      steps.push({
        op: 'restore',
        table: change.table,
        primKey: change.primKey,
        record: change.record
      });
    }
  }

  return {
    type,
    steps,
    affected: Array.from(affectedSet)
  };
}
