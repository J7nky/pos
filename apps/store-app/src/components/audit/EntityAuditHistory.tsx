/**
 * <EntityAuditHistory> — a reusable, role-scoped change-history panel for one
 * record. Drop it into any detail view (bill, customer, product, …); it queries
 * `getEntityAuditLogs(entityType, entityId)`, which applies the same role
 * visibility ceiling as the audit timeline page.
 */

import { useEffect, useState } from 'react';
import { ChevronRight, History } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useOfflineData } from '../../contexts/OfflineDataContext';
import type { AuditLogWithUser } from '../../contexts/offlineData';
import { AuditChanges } from './AuditChanges';

export const AUDIT_ACTION_BADGE: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  void: 'bg-red-100 text-red-800',
  reactivate: 'bg-green-100 text-green-800',
  archive: 'bg-gray-100 text-gray-700',
  unarchive: 'bg-gray-100 text-gray-700',
  open: 'bg-emerald-100 text-emerald-800',
  close: 'bg-amber-100 text-amber-800',
  login: 'bg-indigo-100 text-indigo-800',
  logout: 'bg-slate-100 text-slate-700',
};

interface EntityAuditHistoryProps {
  entityType: string;
  entityId: string;
  /** Optional heading override; defaults to the localized "Change history". */
  title?: string;
  className?: string;
}

export function EntityAuditHistory({ entityType, entityId, title, className }: EntityAuditHistoryProps) {
  const { t, language } = useI18n();
  const isRTL = language === 'ar';
  const { getEntityAuditLogs } = useOfflineData();
  const [logs, setLogs] = useState<AuditLogWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getEntityAuditLogs(entityType, entityId)
      .then((rows) => {
        if (!cancelled) setLogs(rows);
      })
      .catch((err) => {
        console.error('Failed to load entity audit history:', err);
        if (!cancelled) setLogs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, getEntityAuditLogs]);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString(isRTL ? 'ar' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className={className} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center mb-3">
        <History className="w-4 h-4 mr-2 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">{title ?? t('auditLog.history.title')}</h3>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">{t('auditLog.history.loading')}</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-gray-400">{t('auditLog.history.none')}</p>
      ) : (
        <ol className="space-y-3 border-s-2 border-gray-100 ps-4">
          {logs.map((log) => {
            const isOpen = expanded.has(log.id);
            const summary = log.change_reason
              ? log.change_reason
              : log.changes?.length
                ? t('auditLog.changeCount', { count: log.changes.length })
                : '—';
            return (
              <li key={log.id} className="relative">
                <span className="absolute -start-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-gray-300" />
                <button
                  type="button"
                  onClick={() => toggle(log.id)}
                  className="flex items-center flex-wrap gap-2 text-start w-full"
                >
                  <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''} ${isRTL ? 'rotate-180' : ''}`} />
                  <span
                    className={`px-2 py-0.5 text-xs rounded font-medium ${
                      AUDIT_ACTION_BADGE[log.action] ?? 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {t(`auditLog.actions.${log.action}`)}
                  </span>
                  <span className="text-sm font-medium text-gray-800">{log.changed_by_name}</span>
                  <span className="text-xs text-gray-400">· {formatTime(log.created_at)}</span>
                </button>
                {isOpen ? (
                  <div className="mt-1 ps-5">
                    <AuditChanges changes={log.changes} reason={log.change_reason} />
                  </div>
                ) : (
                  <p className="mt-1 ps-5 text-sm text-gray-500 truncate">{summary}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
