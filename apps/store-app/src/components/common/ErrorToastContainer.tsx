/**
 * ErrorToastContainer
 *
 * Renders active error notifications from useErrorHandler state.
 * Lives inside Layout.tsx so it benefits from the I18nProvider for
 * translated message resolution.
 *
 * Visual variants by ErrorCategory:
 *   validation    → amber border + warning icon
 *   system        → blue border + info icon
 *   unrecoverable → red border + alert icon (persistent — no auto-dismiss)
 */

import React, { useEffect } from 'react';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { useI18n } from '../../i18n';
import type { ErrorNotification } from '../../types/errors';

// Auto-dismiss delays (ms). Unrecoverable errors are never auto-dismissed.
const AUTO_DISMISS_MS: Record<string, number | null> = {
  validation: 6000,
  system: 8000,
  unrecoverable: null,
};

interface ToastProps {
  notification: ErrorNotification;
  onDismiss: (id: string) => void;
}

function Toast({ notification, onDismiss }: ToastProps) {
  const { t } = useI18n();
  const { error } = notification;

  // Resolve i18n message; fall back to the English message stored on the error
  let message: string;
  try {
    const translated = t(error.messageKey);
    message = translated !== error.messageKey ? translated : error.message;
  } catch {
    message = error.message;
  }

  // Auto-dismiss
  useEffect(() => {
    const delay = AUTO_DISMISS_MS[error.category];
    if (delay === null) return;
    const timer = setTimeout(() => onDismiss(notification.id), delay);
    return () => clearTimeout(timer);
  }, [notification.id, error.category, onDismiss]);

  const styles: Record<string, string> = {
    validation:
      'border-amber-400 bg-amber-50 text-amber-900',
    system:
      'border-blue-400 bg-blue-50 text-blue-900',
    unrecoverable:
      'border-red-500 bg-red-50 text-red-900',
  };

  const icons: Record<string, React.ReactNode> = {
    validation: (
      <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
    system: (
      <svg className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    unrecoverable: (
      <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-md text-sm max-w-sm w-full ${styles[error.category] ?? styles.system}`}
    >
      {icons[error.category] ?? icons.system}
      <p className="flex-1 leading-snug">{message}</p>
      <button
        onClick={() => onDismiss(notification.id)}
        aria-label="Dismiss"
        className="ml-2 shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function ErrorToastContainer() {
  const { notifications, dismiss } = useErrorHandler();

  if (notifications.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 end-4 z-50 flex flex-col gap-2 items-end"
    >
      {notifications.map(n => (
        <Toast key={n.id} notification={n} onDismiss={dismiss} />
      ))}
    </div>
  );
}
