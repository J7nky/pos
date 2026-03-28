/**
 * useErrorHandler
 *
 * Centralized UI hook for surfacing errors as user-visible notifications.
 * Replaces console.error() calls in all page and component catch blocks.
 *
 * Usage:
 *   const { handleError } = useErrorHandler();
 *   try { ... } catch (e) { handleError(e); }
 *
 * Contract: specs/007-error-handling-validation/contracts/error-handling-contract.md §3
 */

import { useCallback } from 'react';
import { useErrorNotificationContext } from '../contexts/ErrorNotificationContext';
import { toAppError } from '../services/businessValidationService';
import type { AppError, AppErrorCode, ErrorNotification } from '../types/errors';

export interface UseErrorHandlerReturn {
  /**
   * Surface an error to the user via the centralized notification channel.
   * Accepts a typed AppError or any unknown thrown value.
   * Never throws.
   */
  handleError: (error: AppError | unknown, fallbackCode?: AppErrorCode) => void;

  /** Active notifications. Primarily for ErrorToastContainer; pages only need handleError. */
  notifications: ReadonlyArray<ErrorNotification>;

  /** Dismiss a single notification by ID. */
  dismiss: (id: string) => void;

  /** Dismiss all active notifications. */
  dismissAll: () => void;
}

export function useErrorHandler(): UseErrorHandlerReturn {
  const { push, dismiss, dismissAll, notifications } = useErrorNotificationContext();

  const handleError = useCallback(
    (thrown: AppError | unknown, fallbackCode?: AppErrorCode) => {
      try {
        const appError = toAppError(thrown, fallbackCode);
        push(appError);
        // Log developer details to console (never shown in UI)
        if (appError.details !== undefined) {
          console.error(`[${appError.code}]`, appError.details);
        }
      } catch {
        // Last-resort: if even toAppError somehow fails, don't crash the app
        console.error('useErrorHandler: failed to process error', thrown);
      }
    },
    [push],
  );

  return { handleError, notifications, dismiss, dismissAll };
}
