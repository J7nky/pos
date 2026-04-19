/**
 * trackingTestHelper — Test utilities for asserting automatic undo change tracking.
 *
 * Provides captureChanges() which wraps a test operation with a changeTracker session
 * and returns per-table change counts, making it easy to assert that operations
 * correctly write to the expected tables.
 *
 * Usage:
 *   const counts = await captureChanges(async () => {
 *     await someOperation();
 *   });
 *   expect(counts['bills']).toBe(1);
 *   expect(counts['journal_entries']).toBeGreaterThan(0);
 */

import { changeTracker, type ChangeRecord } from '../../services/changeTracker';

export interface ChangeCounts {
  [table: string]: number;
}

export interface CaptureResult {
  counts: ChangeCounts;
  changes: ChangeRecord[];
  tables: string[];
}

/**
 * Wraps an async operation with a changeTracker session and returns per-table change counts.
 * Safe to nest — uses the depth counter so nested calls merge into the outer session.
 */
export async function captureChanges(operationFn: () => Promise<void>): Promise<CaptureResult> {
  changeTracker.startSession();
  try {
    await operationFn();
  } finally {
    // endSession returns [] for nested calls, full changes for the outermost call
  }
  const changes = changeTracker.endSession();

  const counts: ChangeCounts = {};
  for (const change of changes) {
    counts[change.table] = (counts[change.table] ?? 0) + 1;
  }

  return {
    counts,
    changes,
    tables: Object.keys(counts),
  };
}

/**
 * Assert that an operation touched exactly the expected set of tables.
 * Throws an AssertionError (via expect) if any table is missing or unexpected tables appear.
 *
 * Usage:
 *   await assertTablesAffected(async () => { await someOp(); }, ['bills', 'journal_entries']);
 */
export async function assertTablesAffected(
  operationFn: () => Promise<void>,
  expectedTables: string[]
): Promise<CaptureResult> {
  const result = await captureChanges(operationFn);
  const missing = expectedTables.filter(t => !result.tables.includes(t));
  if (missing.length > 0) {
    throw new Error(
      `assertTablesAffected: Expected changes in tables [${expectedTables.join(', ')}] ` +
      `but tables [${missing.join(', ')}] had no changes. ` +
      `Actual tables changed: [${result.tables.join(', ')}]`
    );
  }
  return result;
}
