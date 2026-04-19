/**
 * syncOrchestrator — the single entry point the app uses for sync + event concerns.
 *
 * The underlying services each expose a disjoint surface:
 *   - syncService              — triggers uploads/downloads/deletion detection against Supabase
 *   - eventEmissionService     — writes events to branch_event_log after upload (internal to syncUpload)
 *   - eventStreamService       — realtime subscription + version catch-up on the client
 *
 * The orchestrator simply re-exports these singletons under one import path so that
 * `OfflineDataContext` and its lifecycle hooks do not depend on the three modules
 * directly. If any of these concerns need to grow a shared queue, retry policy,
 * or cross-service coordination, that logic belongs in this file.
 *
 * See `ARCHITECTURE_RULES.md` → "Dependency Graph" for the surrounding diagram.
 */

export { syncService, syncWithSupabase, getLastSyncedAt, setLastSyncedAt, SYNC_TABLES } from './syncService';
export type { SyncResult } from './syncService';
export { eventEmissionService } from './eventEmissionService';
export { eventStreamService } from './eventStreamService';

import { syncService } from './syncService';
import { eventEmissionService } from './eventEmissionService';
import { eventStreamService } from './eventStreamService';

/**
 * Grouped reference for callers that want the whole surface in one object rather
 * than three named imports. Prefer the named imports above in most places; this
 * is useful for tests that want to stub the whole orchestrator at once.
 */
export const syncOrchestrator = {
  sync: syncService,
  events: eventEmissionService,
  stream: eventStreamService,
} as const;
