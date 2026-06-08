/**
 * auditService — general-purpose audit trail (spec: audit-logging-service).
 *
 * Writes one immutable `audit_logs` row per state-changing business action,
 * scoped to a store branch. Capture is SEMANTIC, not structural: call sites in
 * the domain data layers invoke `record()` once per business action (alongside
 * the existing `emitEntityEvent`), so a multi-table operation produces a single
 * readable audit row — not one row per table write.
 *
 * Design decisions (see memory: audit_log_design_decisions):
 *   1. One row per action; field deltas live in the `changes[]` array.
 *   2. Notifications are never audited (NON_AUDITED below).
 *   3. Reversals are logged as a business-action summary (caller passes the
 *      summary `changes`, e.g. status active→voided).
 *   4. Retention (4-month prune) is handled out-of-band; not this service's job.
 *
 * Best-effort: an audit failure must NEVER break the business action it
 * describes. Every write is wrapped — `record()` resolves, never rejects.
 *
 * RLS note: the Supabase `audit_logs` insert policy is store-scoped (the caller
 * must belong to the row's store), matching every other synced table — it does
 * NOT require `changed_by = auth.uid()`, so offline-authored rows upload fine.
 * We still require a non-blank actor here because an audit row without a "who"
 * is not worth recording; a missing actor signals there's no active session.
 */

import { getDB, createId } from '../lib/db';
import type { AuditLog, AuditChange, AuditAction } from '../types';

/**
 * Entity types (logical modules) that are deliberately NOT audited — low-value,
 * high-noise. Everything else is audited once a call site opts in. Using an
 * exclude-set (rather than an allow-list) means newly-wired modules are audited
 * by default; only these are dropped even if a call slips through.
 */
const NON_AUDITED = new Set<string>(['notification', 'notification_preferences']);

/** Entity type used for authentication (login/logout) audit rows. */
export const AUTH_ENTITY_TYPE = 'auth';

/**
 * Branch sentinel for auth events recorded before a branch is selected (e.g. an
 * admin, whose users.branch_id is null, signing in). `audit_logs.branch_id` is
 * `UUID NOT NULL` with NO foreign key, so a nil-UUID is a valid, FK-safe value;
 * auth rows are read by-actor and by-store feed, never via the branch index, so
 * the sentinel never surfaces in a real branch's activity.
 */
export const AUTH_EVENT_BRANCH = '00000000-0000-0000-0000-000000000000';

export interface AuditRecordInput {
  /** Store scope. */
  storeId: string | null | undefined;
  /** Acting branch — required; rows without it can't use the branch index. */
  branchId: string | null | undefined;
  /** Actor (who). Must be the logged-in user's id (== Supabase auth.uid()). */
  changedBy: string | null | undefined;
  /** Logical module/domain of the affected row, e.g. 'entity' | 'product' | 'bill'. */
  entityType: string;
  /** Primary key of the affected row. */
  entityId: string;
  action: AuditAction;
  /** Field-level deltas. Omit/empty for create & delete. */
  changes?: AuditChange[];
  /** Optional human context, e.g. 'Customer returned goods'. */
  changeReason?: string | null;
  /** Optional human-readable document reference (bill number, payment ref, …)
   *  for cross-navigation in the audit viewer. */
  reference?: string | null;
}

/** Read a possibly-nested value by dotted path (e.g. 'customer_data.credit_limit'). */
function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

/** Loose equality that treats null/undefined as equal and deep-compares objects. */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

/** System/metadata columns that are never worth auditing as field changes. */
const META_FIELDS = new Set<string>([
  '_synced',
  '_deleted',
  '_lastSyncedAt',
  'updated_at',
  'created_at',
  'id',
  'store_id',
]);

class AuditService {
  /**
   * Build the `changes[]` array for an update by diffing `before` vs `after`
   * across the given dotted field paths. Only changed fields are included;
   * unchanged or identically-nullish fields are skipped.
   */
  diff(before: unknown, after: unknown, paths: string[]): AuditChange[] {
    const changes: AuditChange[] = [];
    for (const path of paths) {
      const oldValue = getByPath(before, path);
      const newValue = getByPath(after, path);
      if (!valuesEqual(oldValue, newValue)) {
        changes.push({ field: path, old: oldValue ?? null, new: newValue ?? null });
      }
    }
    return changes;
  }

  /**
   * Convenience diff for flat CRUD updates: diffs `before` against an `updates`
   * patch, considering only the patch's own defined, non-metadata keys. Avoids
   * maintaining an explicit field-path list when the caller already knows which
   * fields it is updating.
   */
  diffUpdates(before: unknown, updates: Record<string, unknown>): AuditChange[] {
    const paths = Object.keys(updates).filter(
      (k) => updates[k] !== undefined && !META_FIELDS.has(k)
    );
    if (paths.length === 0) return [];
    const after = { ...(before as Record<string, unknown>), ...updates };
    return this.diff(before, after, paths);
  }

  /**
   * Record one audit row. Best-effort: never throws. Returns the new row id, or
   * null if the entry was skipped (excluded type, missing scope/actor, or error).
   */
  async record(input: AuditRecordInput): Promise<string | null> {
    try {
      if (NON_AUDITED.has(input.entityType)) {
        return null;
      }
      if (!input.storeId || !input.branchId || !input.changedBy) {
        console.warn(
          `[audit] Skipping ${input.action} on ${input.entityType}/${input.entityId} — ` +
            `missing ${!input.storeId ? 'storeId ' : ''}${!input.branchId ? 'branchId ' : ''}${!input.changedBy ? 'changedBy' : ''}`.trim()
        );
        return null;
      }

      const row: AuditLog = {
        id: createId(),
        store_id: input.storeId,
        branch_id: input.branchId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        action: input.action,
        changes: input.changes ?? [],
        change_reason: input.changeReason ?? null,
        reference: input.reference ?? null,
        changed_by: input.changedBy,
        created_at: new Date().toISOString(),
        _synced: false,
        _deleted: false,
      };

      await getDB().audit_logs.add(row);
      return row.id;
    } catch (error) {
      // Audit must never break the operation it describes.
      console.error('[audit] Failed to record audit log:', error);
      return null;
    }
  }

  /**
   * Record an authentication event (login / logout) in the audit trail.
   *
   * Auth events differ from business-action audits and are normalised here so
   * call sites stay trivial:
   *   • No field deltas — `changes` is always empty (an action-row with no
   *     before/after, per audit_log_design_decisions).
   *   • Not branch-scoped — a user authenticates before choosing a branch, so we
   *     record their assigned branch when known (cashier/manager), else the
   *     nil-UUID sentinel (admin / unknown). See AUTH_EVENT_BRANCH.
   *
   * `created_at` is stamped from device time inside record(), so it reflects the
   * moment of the auth event (works offline) — not a later sync. Retention is the
   * same 4-month prune as every other audit row. Best-effort: never throws; a
   * missing store/actor is skipped (see record()).
   */
  async recordAuth(input: {
    action: Extract<AuditAction, 'login' | 'logout'>;
    /** Acting user id — also the row's entity_id and changed_by. Must be a UUID. */
    userId: string | null | undefined;
    storeId: string | null | undefined;
    /** Assigned branch when known; falls back to the nil-UUID sentinel. */
    branchId?: string | null;
    reference?: string | null;
  }): Promise<string | null> {
    return this.record({
      storeId: input.storeId,
      branchId: input.branchId || AUTH_EVENT_BRANCH,
      changedBy: input.userId,
      entityType: AUTH_ENTITY_TYPE,
      entityId: input.userId ?? '',
      action: input.action,
      changes: [],
      reference: input.reference ?? null,
    });
  }

  /**
   * Opportunistic local retention prune (decision 4: 4-month, hard-delete, no
   * archive). Hard-deletes already-synced local rows older than the cutoff so
   * offline devices stay bounded; the server prunes the same window via pg_cron,
   * so we only drop rows that have synced (an unsynced old row is kept until it
   * uploads). Best-effort: never throws. Returns the number of rows deleted.
   */
  async pruneLocal(storeId: string, retentionMonths = 4): Promise<number> {
    try {
      if (!storeId) return 0;
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - retentionMonths);
      const cutoffISO = cutoff.toISOString();

      const stale = await getDB()
        .audit_logs.where('[store_id+created_at]')
        .between([storeId, ' '], [storeId, cutoffISO], true, false)
        .filter((r) => r._synced === true)
        .toArray();

      if (stale.length === 0) return 0;
      await getDB().audit_logs.bulkDelete(stale.map((r) => r.id));
      return stale.length;
    } catch (error) {
      console.error('[audit] Local retention prune failed:', error);
      return 0;
    }
  }
}

export const auditService = new AuditService();
