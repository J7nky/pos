/**
 * Error Notification Context
 *
 * Provides a centralized, React-tree-wide channel for surfacing errors as
 * user-visible notifications. Consumed via useErrorHandler().
 *
 * Contract: specs/007-error-handling-validation/contracts/error-handling-contract.md §4
 */

import React, { createContext, useContext, useCallback, useState } from 'react';
import type { AppError, ErrorNotification } from '../types/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ErrorNotificationContextValue {
  notifications: ErrorNotification[];
  push: (error: AppError) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ErrorNotificationContext = createContext<ErrorNotificationContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const MAX_NOTIFICATIONS = 5;

let _notifCounter = 0;
function nextId(): string {
  _notifCounter += 1;
  return `err-${Date.now()}-${_notifCounter}`;
}

export function ErrorNotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<ErrorNotification[]>([]);

  const push = useCallback((error: AppError) => {
    setNotifications(prev => {
      const notif: ErrorNotification = {
        id: nextId(),
        error,
        timestamp: Date.now(),
        dismissed: false,
      };
      const updated = [...prev, notif];
      // Auto-dismiss oldest when over the limit
      if (updated.length > MAX_NOTIFICATIONS) {
        return updated.slice(updated.length - MAX_NOTIFICATIONS);
      }
      return updated;
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <ErrorNotificationContext.Provider value={{ notifications, push, dismiss, dismissAll }}>
      {children}
    </ErrorNotificationContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Internal hook (used by useErrorHandler)
// ---------------------------------------------------------------------------

export function useErrorNotificationContext(): ErrorNotificationContextValue {
  const ctx = useContext(ErrorNotificationContext);
  if (!ctx) {
    throw new Error('useErrorNotificationContext must be used within ErrorNotificationProvider');
  }
  return ctx;
}
