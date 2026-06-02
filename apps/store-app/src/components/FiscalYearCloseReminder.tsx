import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, X } from 'lucide-react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import {
  getCurrentFiscalYear,
  getFiscalYearByStartYear,
  findFiscalYearPeriod,
} from '../services/fiscalYearService';
import { getDB } from '../lib/db';
import type { FiscalYearPeriod } from '../types';

const DISMISS_PREFIX = 'fyCloseReminderDismissed:';

/**
 * Top-of-app reminder shown when the previous fiscal year has ended but
 * hasn't been closed yet. Quiet rule: the banner is gated on a local
 * fiscal_periods row existing for that prior FY — that means the device
 * has at least seen the row sync down (or it was created locally). For a
 * brand-new device that hasn't synced yet, no banner shows.
 *
 * Dismiss is per-FY-label + per-device: localStorage key
 * `fyCloseReminderDismissed:<label>` survives reload but resets on a new
 * fiscal year crossing.
 */
export function FiscalYearCloseReminder() {
  const { storeId, fiscalYearStartMonth, fiscalYearStartDay } = useOfflineData();
  const [periods, setPeriods] = useState<FiscalYearPeriod[]>([]);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  // Pull local fiscal_periods rows once per store-id change. The banner is
  // a low-frequency surface — no need to subscribe to live changes.
  useEffect(() => {
    if (!storeId) {
      setPeriods([]);
      return;
    }
    void getDB().fiscal_periods
      .where('store_id')
      .equals(storeId)
      .toArray()
      .then((rows) => setPeriods(rows as FiscalYearPeriod[]))
      .catch(() => setPeriods([]));
  }, [storeId]);

  // Compute the previous FY and look up its local row.
  const target = useMemo(() => {
    if (!storeId) return null;
    const cfg = {
      fiscal_year_start_month: fiscalYearStartMonth,
      fiscal_year_start_day: fiscalYearStartDay,
    };
    const current = getCurrentFiscalYear(new Date(), cfg);
    const prev = getFiscalYearByStartYear(current.start_year - 1, cfg);
    const row = findFiscalYearPeriod(prev, periods);
    if (!row) return null;
    if (row.is_closed) return null;
    return { fy: prev, row };
  }, [storeId, fiscalYearStartMonth, fiscalYearStartDay, periods]);

  // Read dismiss flag whenever the target FY changes.
  useEffect(() => {
    if (!target) {
      setDismissedFor(null);
      return;
    }
    const key = DISMISS_PREFIX + target.fy.label;
    setDismissedFor(localStorage.getItem(key) ? target.fy.label : null);
  }, [target]);

  if (!target) return null;
  if (dismissedFor === target.fy.label) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_PREFIX + target.fy.label, new Date().toISOString());
    setDismissedFor(target.fy.label);
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-amber-50 border border-amber-400 text-amber-900 rounded-xl shadow-lg px-5 py-3 max-w-md w-full">
      <Calendar className="w-5 h-5 shrink-0 text-amber-700" aria-hidden />
      <span className="flex-1 text-sm font-medium">
        Fiscal year <span className="font-semibold">{target.fy.label}</span>{' '}
        ended on {target.fy.end_date}. Close it from Settings.
      </span>
      <Link
        to="/settings"
        className="text-xs font-semibold text-amber-700 underline hover:text-amber-900 whitespace-nowrap"
      >
        Go to Settings
      </Link>
      <button
        onClick={dismiss}
        className="text-amber-600 hover:text-amber-900 ml-1"
        aria-label="Dismiss reminder"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
