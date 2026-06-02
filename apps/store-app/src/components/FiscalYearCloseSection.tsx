import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Lock, Unlock, WifiOff, Archive } from 'lucide-react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { getDB } from '../lib/db';
import { supabase } from '../lib/supabase';
import type { FiscalYearPeriod } from '../types';

/**
 * Single source of truth for invoking the export Edge Function. Pulled
 * out so both the auto-trigger inside handleClose and the manual
 * "Export archive" button use the same fetch + auth pattern. Throws on
 * non-2xx so the caller can put its own message into `feedback`.
 */
async function runArchiveExport(
  storeId: string,
  fyLabel: string,
): Promise<{ tables: Record<string, { row_count?: number }> }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const resp = await fetch(
    `${supabaseUrl}/functions/v1/export_fiscal_year_archive`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      // Bearer-token auth — no cookies needed. Omit credentials so the
      // server's `Access-Control-Allow-Origin: *` is acceptable to the
      // browser. With `include`, browsers require an echoed-origin + the
      // `Access-Control-Allow-Credentials` header on every response.
      credentials: 'omit',
      body: JSON.stringify({ store_id: storeId, fy_label: fyLabel }),
    },
  );
  const body = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(body?.error ?? `HTTP ${resp.status}`);
  return body as { tables: Record<string, { row_count?: number }> };
}

/**
 * Admin surface that lists every fiscal_periods row for the active store
 * and lets the admin close (or reopen) a period via the server RPC. Mirrors
 * the dispatch logic the reminder banner expects: this is where the admin
 * lands when they click "Go to Settings".
 *
 * Operations:
 *   - Close: `close_fiscal_year(store_id, fy_label)` RPC.
 *   - Reopen: `reopen_fiscal_year(store_id, fy_label)` RPC.
 *   - Export archive (offered after a successful close): POST to
 *     `/functions/v1/export_fiscal_year_archive` with the user's bearer
 *     token so the C3 Edge Function can stream the NDJSON.gz files.
 *
 * Online-only. Offline devices see a disabled-button state with a clear
 * explanation — the close action lives in Postgres + an Edge Function and
 * cannot run locally.
 */
/**
 * Push the server's freshest fiscal_periods rows into local Dexie so
 * components that read coverage from Dexie (OfflineHistoryPanel) see the
 * new `is_closed` / `archive_url` right after a close or reopen, without
 * waiting for the next sync tick. Preserves local-only fields
 * (`archive_hydrated_at`, `archive_hydrated_tables`) by merging.
 */
async function syncFiscalPeriodsToDexie(storeId: string) {
  const { data, error } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('store_id', storeId);
  if (error || !data) return;
  const db = getDB();
  const locals = await db.fiscal_periods.where('store_id').equals(storeId).toArray();
  const localById = new Map(locals.map((r) => [r.id, r]));
  const merged = data.map((server) => {
    const local = localById.get(server.id);
    return {
      ...server,
      archive_hydrated_at: local?.archive_hydrated_at ?? null,
      archive_hydrated_tables: local?.archive_hydrated_tables ?? {},
      _synced: true,
    } as FiscalYearPeriod;
  });
  await db.fiscal_periods.bulkPut(merged);
}

export function FiscalYearCloseSection() {
  const { storeId, triggerArchiveBackfill } = useOfflineData();
  const { isOnline } = useNetworkStatus();
  const [periods, setPeriods] = useState<FiscalYearPeriod[]>([]);
  const [busyFor, setBusyFor] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    fyLabel: string;
    kind: 'success' | 'error';
    message: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (!storeId) {
      setPeriods([]);
      return;
    }
    // Read from Supabase, not Dexie. Close/Reopen are server-only RPCs
    // (this section is disabled offline), so the freshest state lives on
    // the server. Reading Dexie here would show stale `is_closed` until
    // the sync layer pulls the row down.
    const { data, error } = await supabase
      .from('fiscal_periods')
      .select('*')
      .eq('store_id', storeId)
      .order('start_date', { ascending: false });
    if (error) {
      console.error('Failed to load fiscal_periods from server:', error);
      // Fallback to Dexie so the panel still renders something.
      const rows = await getDB().fiscal_periods
        .where('store_id')
        .equals(storeId)
        .toArray();
      rows.sort((a: FiscalYearPeriod, b: FiscalYearPeriod) =>
        b.start_date.localeCompare(a.start_date),
      );
      setPeriods(rows as FiscalYearPeriod[]);
      return;
    }
    setPeriods((data ?? []) as FiscalYearPeriod[]);
  }, [storeId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleClose = useCallback(
    async (fyLabel: string) => {
      if (!storeId) return;
      setBusyFor(fyLabel);
      setFeedback(null);
      try {
        // 1. Close via RPC.
        const { data, error } = await supabase.rpc('close_fiscal_year', {
          p_store_id: storeId,
          p_fy_label: fyLabel,
        });
        if (error) throw error;
        const anchors = (data as { closing_anchors_written?: number } | null)?.closing_anchors_written ?? 0;

        // 2. Chain straight into the archive export Edge Function — the
        // admin wanted one-click close + archive. If the archive step
        // fails (CORS, network, etc.) the close itself still succeeded;
        // we surface the partial-success state so they can retry the
        // archive via the "Export archive" button.
        setFeedback({
          fyLabel,
          kind: 'success',
          message: `Closed. Wrote ${anchors} closing-anchor snapshot(s). Exporting archive…`,
        });
        try {
          const archiveResult = await runArchiveExport(storeId, fyLabel);
          const tables = archiveResult?.tables ?? {};
          const tableCount = Object.keys(tables).length;
          const rowSum = Object.values(tables).reduce<number>(
            (acc, t) => acc + ((t as { row_count?: number })?.row_count ?? 0),
            0,
          );
          setFeedback({
            fyLabel,
            kind: 'success',
            message: `Closed & archived. ${anchors} closing anchor(s); archive holds ${tableCount} table(s), ${rowSum.toLocaleString()} rows.`,
          });
        } catch (archiveErr) {
          setFeedback({
            fyLabel,
            kind: 'error',
            message: `Closed successfully, but archive export failed: ${(archiveErr as Error)?.message ?? 'unknown'}. Click "Export archive" to retry.`,
          });
        }
        await syncFiscalPeriodsToDexie(storeId);
        await refresh();
        // Recompute archive coverage so OfflineHistoryPanel updates without
        // a browser refresh.
        void triggerArchiveBackfill();
      } catch (err) {
        setFeedback({
          fyLabel,
          kind: 'error',
          message: (err as Error)?.message ?? 'Close failed.',
        });
      } finally {
        setBusyFor(null);
      }
    },
    [storeId, refresh, triggerArchiveBackfill],
  );

  const handleReopen = useCallback(
    async (fyLabel: string) => {
      if (!storeId) return;
      if (!window.confirm(`Reopen ${fyLabel}? Closing anchors will be demoted and the archive will be invalidated until you re-close + re-export.`)) {
        return;
      }
      setBusyFor(fyLabel);
      setFeedback(null);
      try {
        const { error } = await supabase.rpc('reopen_fiscal_year', {
          p_store_id: storeId,
          p_fy_label: fyLabel,
        });
        if (error) throw error;
        setFeedback({ fyLabel, kind: 'success', message: 'Reopened.' });
        await syncFiscalPeriodsToDexie(storeId);
        await refresh();
        void triggerArchiveBackfill();
      } catch (err) {
        setFeedback({
          fyLabel,
          kind: 'error',
          message: (err as Error)?.message ?? 'Reopen failed.',
        });
      } finally {
        setBusyFor(null);
      }
    },
    [storeId, refresh, triggerArchiveBackfill],
  );

  if (!storeId) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center mb-4">
        <Lock className="w-6 h-6 text-gray-600 mr-3" />
        <h2 className="text-xl font-semibold text-gray-900">Year-end Close</h2>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Close ended fiscal years to lock posting and trigger the archive
        export. After a close, devices set up later can still generate
        statements for that year by downloading its archive.
      </p>

      {!isOnline && (
        <div className="mb-4 p-3 border border-amber-200 bg-amber-50 rounded-lg flex items-start gap-2">
          <WifiOff className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-900">
            You are offline. Closing a fiscal year runs server-side — reconnect to use this action.
          </p>
        </div>
      )}

      {periods.length === 0 ? (
        <p className="text-sm text-gray-500">No fiscal periods have been recorded for this store yet.</p>
      ) : (
        <div className="space-y-3">
          {periods.map((p) => {
            const isBusy = busyFor === p.fy_label;
            const canClose = !p.is_closed && p.end_date <= new Date().toISOString().slice(0, 10);
            const hasArchive = !!p.archive_url;
            const fb = feedback?.fyLabel === p.fy_label ? feedback : null;
            return (
              <div key={p.id} className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{p.fy_label}</span>
                      {p.is_closed ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-800 border border-green-200 rounded px-2 py-0.5">
                          <CheckCircle2 className="w-3 h-3" />
                          Closed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded px-2 py-0.5">
                          <Unlock className="w-3 h-3" />
                          Open
                        </span>
                      )}
                      {hasArchive && (
                        <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-800 border border-blue-200 rounded px-2 py-0.5">
                          <Archive className="w-3 h-3" />
                          Archive ready
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {p.start_date} → {p.end_date}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!p.is_closed && canClose && (
                      <button
                        onClick={() => handleClose(p.fy_label)}
                        disabled={!isOnline || isBusy}
                        className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1.5"
                      >
                        {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                        Close
                      </button>
                    )}
                    {!p.is_closed && !canClose && (
                      <span className="text-xs text-gray-500 italic">Not yet ended</span>
                    )}
                    {p.is_closed && (
                      <button
                        onClick={() => handleReopen(p.fy_label)}
                        disabled={!isOnline || isBusy}
                        className="text-sm text-gray-600 hover:text-gray-900 underline disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed"
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
                {fb && (
                  <div className={`mt-3 text-xs rounded px-2 py-1.5 ${fb.kind === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {fb.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
