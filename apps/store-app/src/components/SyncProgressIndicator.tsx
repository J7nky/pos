import { useOfflineData } from '../contexts/OfflineDataContext';
import { useI18n } from '../i18n';
import { Loader2 } from 'lucide-react';

/**
 * Subtle bar while Tier 2/3 hydration runs after cold start (incremental sync redesign).
 * Also surfaces Plan C/D archive hydration progress when archives are being
 * streamed in alongside the paged tail sync.
 */
export function SyncProgressIndicator() {
  const { syncSession } = useOfflineData();
  const { t } = useI18n();

  if (!syncSession?.isColdStart) return null;
  if (!syncSession.tier1Complete) return null;

  const tiersDone = syncSession.tier2Complete && syncSession.tier3Complete;
  const archive = syncSession.archiveHydration;
  const archiveRunning = archive?.state === 'running';
  if (tiersDone && !archiveRunning) return null;

  // Compose a short message — tiers first (already i18n'd), then the archive
  // sub-status when it's live. Keeps the strip to a single line in most cases.
  const archiveDetail =
    archiveRunning && archive?.currentFy
      ? archive.currentTable
        ? ` · archive ${archive.currentFy}/${archive.currentTable}`
        : ` · archive ${archive.currentFy}`
      : archiveRunning
        ? ' · archive hydration'
        : '';

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[60] pointer-events-none flex justify-center pb-2"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-md bg-slate-800/90 text-slate-100 px-3 py-2 text-xs shadow-lg max-w-md mx-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
        <span>
          {tiersDone ? t('sync.backgroundHydration') : t('sync.backgroundHydration')}
          {archiveDetail}
        </span>
      </div>
    </div>
  );
}
