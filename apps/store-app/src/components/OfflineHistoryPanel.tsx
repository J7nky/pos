import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, RefreshCw, Loader2, CheckCircle2, AlertTriangle, History, WifiOff } from 'lucide-react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

/**
 * Plan D / D4 UI surface — coverage display + manual "Download archived
 * history" button. Reads `archiveCoverage` for the local state and
 * `syncSession.archiveHydration` for the in-progress state, both populated
 * by the C7 cold-start path and the D4 manual trigger.
 *
 * Lives inside Settings → Business → Fiscal Year section; admin-only.
 */
export function OfflineHistoryPanel() {
  const { storeId, archiveCoverage, triggerArchiveBackfill, syncSession } = useOfflineData();
  const { isOnline } = useNetworkStatus();

  // Trigger one coverage compute on mount per store so the UI has something
  // to render before the user hits the button. The trigger is a no-op when
  // every FY is already local.
  const bootstrappedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!storeId || bootstrappedFor.current === storeId) return;
    bootstrappedFor.current = storeId;
    void triggerArchiveBackfill();
  }, [storeId, triggerArchiveBackfill]);

  const [isManualRun, setIsManualRun] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const onTrigger = useCallback(async () => {
    if (isManualRun) return;
    setIsManualRun(true);
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      await triggerArchiveBackfill({ signal: ctl.signal });
    } finally {
      setIsManualRun(false);
      abortRef.current = null;
    }
  }, [isManualRun, triggerArchiveBackfill]);

  const onCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const archiveStatus = syncSession?.archiveHydration ?? null;
  const isRunning = isManualRun || archiveStatus?.state === 'running';

  const summary = useMemo(() => {
    if (!archiveCoverage) return null;
    const { localFyLabels, partialFyLabels, earliestLocalFy, latestLocalFy } = archiveCoverage;
    return { localFyLabels, partialFyLabels, earliestLocalFy, latestLocalFy };
  }, [archiveCoverage]);

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center mb-4">
        <Archive className="w-6 h-6 text-gray-600 mr-3" />
        <h2 className="text-xl font-semibold text-gray-900">Offline History Archives</h2>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Closed fiscal years are exported to immutable archives so account
        statements work offline for any past period. Use this panel if you
        need to manually re-download missing archives — the app already does
        this automatically on cold start and after reconnecting.
      </p>

      {/* Coverage summary */}
      <div className="p-4 border border-gray-200 rounded-lg mb-4">
        <div className="flex items-center gap-2 mb-2">
          <History className="w-4 h-4 text-gray-500" />
          <h3 className="font-medium text-gray-900">Local coverage</h3>
        </div>
        {!summary ? (
          <p className="text-sm text-gray-500">Loading coverage…</p>
        ) : summary.localFyLabels.length === 0 && summary.partialFyLabels.length === 0 ? (
          <p className="text-sm text-gray-500">
            No closed fiscal year archives have been downloaded yet. Closed FYs
            will appear here once you run the year-end close action and the
            export job finishes on the server.
          </p>
        ) : (
          <>
            {summary.localFyLabels.length > 0 && (
              <p className="text-sm text-gray-700">
                <span className="font-medium">Fully local:</span>{' '}
                {summary.earliestLocalFy && summary.latestLocalFy ? (
                  summary.earliestLocalFy === summary.latestLocalFy
                    ? summary.latestLocalFy
                    : `${summary.earliestLocalFy} → ${summary.latestLocalFy}`
                ) : (
                  summary.localFyLabels.join(', ')
                )}
              </p>
            )}
            {summary.partialFyLabels.length > 0 && (
              <p className="text-sm text-amber-700 mt-1 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Partially downloaded: {summary.partialFyLabels.join(', ')}
              </p>
            )}
            {archiveCoverage?.currentFyLabel && (
              <p className="text-xs text-gray-500 mt-2">
                Current (open) fiscal year:{' '}
                <span className="font-medium text-gray-700">
                  {archiveCoverage.currentFyLabel}
                </span>{' '}
                — served by live sync, not archives.
              </p>
            )}
          </>
        )}
      </div>

      {/* In-progress strip */}
      {isRunning && archiveStatus && (
        <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg mb-4 flex items-start gap-3">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900">
              Downloading archives…
            </p>
            <p className="text-xs text-blue-800 mt-1">
              {archiveStatus.currentFy ? `Fiscal year: ${archiveStatus.currentFy}` : 'Preparing…'}
              {archiveStatus.currentTable && ` · table: ${archiveStatus.currentTable}`}
            </p>
            <p className="text-xs text-blue-700 mt-1">
              {archiveStatus.rowsLoaded.toLocaleString()} rows loaded ·{' '}
              {archiveStatus.loadedFyLabels.length} FY done ·{' '}
              {archiveStatus.skippedFyLabels.length} skipped
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-xs text-blue-700 hover:text-blue-900 underline shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Last-run summary */}
      {!isRunning && archiveStatus?.state === 'completed' && (
        <div className="p-3 border border-green-200 bg-green-50 rounded-lg mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          <p className="text-sm text-green-800">
            Last run downloaded {archiveStatus.loadedFyLabels.length} FY ·{' '}
            {archiveStatus.rowsLoaded.toLocaleString()} rows in{' '}
            {archiveStatus.elapsedMs ? `${(archiveStatus.elapsedMs / 1000).toFixed(1)}s` : '—'}.
            {archiveStatus.shaMismatches.length > 0 && (
              <span className="text-amber-700">
                {' '}
                ⚠ {archiveStatus.shaMismatches.length} sha mismatch(es) — see console.
              </span>
            )}
          </p>
        </div>
      )}

      {!isRunning && archiveStatus?.state === 'failed' && (
        <div className="p-3 border border-red-200 bg-red-50 rounded-lg mb-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            Last archive run failed.
            {archiveStatus.errorMessage && (
              <div className="text-xs mt-1 text-red-700">{archiveStatus.errorMessage}</div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={onTrigger}
          disabled={isRunning || !storeId || !isOnline}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
        >
          {isRunning ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          {isRunning ? 'Syncing…' : 'Sync'}
        </button>
        {isOnline ? (
          <p className="text-xs text-gray-500">
            Skips FYs already fully local · resumes partial FYs at the table level.
          </p>
        ) : (
          <p className="text-xs text-amber-700 flex items-center gap-1">
            <WifiOff className="w-3.5 h-3.5" />
            Offline — connect to sync archived history.
          </p>
        )}
      </div>
    </div>
  );
}
