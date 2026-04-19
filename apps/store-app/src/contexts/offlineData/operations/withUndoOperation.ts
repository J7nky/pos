/**
 * withUndoOperation — Wrapper for automatic undo tracking
 *
 * Provides two utilities:
 *
 * 1. withUndoOperation(type, pushUndo, operation)
 *    - Starts a change tracking session
 *    - Executes the operation
 *    - On success: builds undo from captured changes and calls pushUndo (if changes exist)
 *    - On failure: discards changes and propagates the error
 *
 * 2. withUndoSuppressed(fn)
 *    - Suppresses tracking for the duration of the function
 *    - Used by undoLastAction() to prevent undo-of-undo
 */

import { changeTracker, buildUndoFromChanges, UndoAction } from '../../../services/changeTracker';

/**
 * Wrapper to automatically track changes and build undo data for an operation.
 *
 * @param type - Undo action type (typically 'operation')
 * @param pushUndo - Callback to store the undo action
 * @param operation - The async operation to execute
 * @returns The result of the operation
 * @throws If the operation throws, the error is propagated and undo is discarded
 */
export async function withUndoOperation<T>(
  type: 'operation',
  pushUndo: (action: UndoAction) => void,
  operation: () => Promise<T>
): Promise<T> {
  // Start tracking session
  changeTracker.startSession();

  try {
    // Execute the operation
    const result = await operation();

    // Capture changes and build undo
    const changes = changeTracker.endSession();

    // If there were changes, build and push undo
    if (changes.length > 0) {
      const undoAction = buildUndoFromChanges(type, changes);
      pushUndo(undoAction);
    }

    return result;
  } catch (error) {
    // Discard changes on failure
    changeTracker.endSession();
    throw error;
  }
}

/**
 * Suppress tracking for the duration of a function execution.
 * Used by undoLastAction() to prevent tracking of undo steps themselves.
 *
 * @param fn - The function to execute with suppressed tracking
 * @returns The result of the function
 */
export async function withUndoSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  changeTracker.suppress();
  try {
    return await fn();
  } finally {
    changeTracker.resume();
  }
}
