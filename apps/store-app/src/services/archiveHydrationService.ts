// =========================================================================
//  Archive Hydration Service (Plan C, Phase C6)
//
//  Streams per-FY, per-table NDJSON.gz archives from Supabase Storage into
//  Dexie. The matching server-side pieces are:
//    - C3: export Edge Function (writes the archives)
//    - C4: get_archive_manifest RPC (lists what's available)
//    - C5: get_archive_path RPC (returns Storage path + per-file metadata)
//
//  Architecture in one paragraph: each closed fiscal year has an immutable
//  set of `.ndjson.gz` files in `archives/{store_id}/{table}/fy_*.ndjson.gz`.
//  This service walks the manifest, finds FYs the local Dexie doesn't have
//  yet, and for each one fetches the signed URL, decompresses the stream,
//  splits into JSON rows, and bulk-puts them into the matching Dexie table.
//  The FY's `fiscal_periods` Dexie row is stamped with `archive_hydrated_at`
//  once all its tables succeed. Idempotent — bulk-put with primary key.
//
//  Streaming strategy:
//    - Fetch the gzipped archive as a single ArrayBuffer (sha256 must run
//      over the entire blob, and crypto.subtle.digest is not streaming).
//    - Pipe through DecompressionStream('gzip') into a TextDecoderStream,
//      then split by '\n' on the fly so we never materialise the full
//      uncompressed string.
//    - Flush JSON rows into Dexie in batches of 1000 with a microtask
//      yield between batches so the UI thread can breathe.
//
//  Cancellation: AbortSignal propagates to fetch() and to the inter-batch
//  yield loop.
// =========================================================================

import { getDB } from '../lib/db';
import { supabase } from '../lib/supabase';
import type { ArchiveTableMeta, FiscalYearPeriod } from '../types';
import type { SyncTable } from './syncConfig';

const BATCH_SIZE = 1000;
const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes; matches architecture doc §5.5.

/** Top-level manifest shape returned by `get_archive_manifest` RPC (C4). */
export interface ArchiveManifest {
  manifest_version: number;
  store_id: string;
  generated_at: string;
  fiscal_years: ManifestFiscalYear[];
  current_fy?: string | null;
}

export interface ManifestFiscalYear {
  fy_label: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  tables: Record<string, ArchiveTableMeta>;
  manifest_sha256?: string | null;
  closed_at?: string | null;
}

export type HydrationEventType =
  | 'manifest_loaded'
  | 'fy_started'
  | 'table_started'
  | 'table_completed'
  | 'fy_completed'
  | 'sha_mismatch'
  | 'skip_local_already_hydrated';

export interface HydrationEvent {
  type: HydrationEventType;
  fy_label?: string;
  table?: string;
  rows_loaded?: number;
  expected_sha256?: string;
  observed_sha256?: string;
  detail?: string;
}

export interface HydrateOptions {
  storeId: string;
  signal?: AbortSignal;
  onProgress?: (event: HydrationEvent) => void;
  /**
   * Override which FYs to hydrate. Default: every closed FY in the manifest
   * that does not have a local `archive_hydrated_at` timestamp.
   */
  fyLabels?: string[];
}

export interface FyHydrationResult {
  fy_label: string;
  tables: Record<string, { rows_loaded: number; sha_matched: boolean }>;
  hydrated_at: string;
}

export interface HydrationResult {
  store_id: string;
  fiscal_years: FyHydrationResult[];
  skipped: string[];
  elapsed_ms: number;
}

class ArchiveHydrationService {
  /**
   * Fetch the manifest, diff against local fiscal_periods, and hydrate
   * any closed FY that hasn't been downloaded yet.
   */
  async hydrateAllMissingArchives(opts: HydrateOptions): Promise<HydrationResult> {
    const startedAt = Date.now();
    const manifest = await this.fetchManifest(opts.storeId);
    opts.onProgress?.({ type: 'manifest_loaded', detail: `${manifest.fiscal_years.length} FY(s) in manifest` });

    const wanted = opts.fyLabels
      ? new Set(opts.fyLabels)
      : null;

    const localPeriods = await getDB()
      .fiscal_periods
      .where('store_id')
      .equals(opts.storeId)
      .toArray();
    const hydratedLocally = new Set(
      localPeriods
        .filter((p: FiscalYearPeriod) => !!p.archive_hydrated_at)
        .map((p: FiscalYearPeriod) => p.fy_label),
    );

    const completed: FyHydrationResult[] = [];
    const skipped: string[] = [];

    // Newest closed FY first — that's the one most likely to be queried.
    const orderedFys = [...manifest.fiscal_years]
      .filter((fy) => fy.is_closed && (!wanted || wanted.has(fy.fy_label)))
      .sort((a, b) => b.start_date.localeCompare(a.start_date));

    for (const fy of orderedFys) {
      if (opts.signal?.aborted) break;

      if (hydratedLocally.has(fy.fy_label)) {
        opts.onProgress?.({ type: 'skip_local_already_hydrated', fy_label: fy.fy_label });
        skipped.push(fy.fy_label);
        continue;
      }

      const result = await this.hydrateFiscalYear({
        storeId: opts.storeId,
        fy,
        signal: opts.signal,
        onProgress: opts.onProgress,
      });
      completed.push(result);
    }

    return {
      store_id: opts.storeId,
      fiscal_years: completed,
      skipped,
      elapsed_ms: Date.now() - startedAt,
    };
  }

  /**
   * Hydrate a single FY. Per-table failures bubble up — caller decides
   * whether to retry or skip. The local fiscal_periods row is stamped
   * `archive_hydrated_at` only when every table in the FY's manifest has
   * a matching entry in `archive_hydrated_tables`; individual table
   * completions are written immediately (Plan D / D1 durable checkpoint)
   * so a mid-FY interrupt resumes by skipping already-done tables.
   */
  async hydrateFiscalYear(args: {
    storeId: string;
    fy: ManifestFiscalYear;
    signal?: AbortSignal;
    onProgress?: (event: HydrationEvent) => void;
  }): Promise<FyHydrationResult> {
    const { storeId, fy, signal, onProgress } = args;
    onProgress?.({ type: 'fy_started', fy_label: fy.fy_label });

    // Look up (or stub) the local fiscal_periods row up front so the
    // per-table stamping loop can persist progress as it goes.
    const candidates = await getDB().fiscal_periods
      .where('store_id')
      .equals(storeId)
      .toArray();
    let localRow = candidates.find((p: FiscalYearPeriod) => p.fy_label === fy.fy_label);
    if (!localRow) {
      const nowIso = new Date().toISOString();
      const stubId = crypto.randomUUID();
      await getDB().fiscal_periods.put({
        id: stubId,
        store_id: storeId,
        fy_label: fy.fy_label,
        start_date: fy.start_date,
        end_date: fy.end_date,
        is_closed: true,
        closed_at: fy.closed_at ?? null,
        closed_by: null,
        archive_url: null,
        archive_sha256: fy.manifest_sha256 ?? null,
        archive_row_counts: fy.tables,
        archive_hydrated_at: null,
        archive_hydrated_tables: {},
        created_at: nowIso,
        updated_at: nowIso,
        _synced: false,
      });
      localRow = (await getDB().fiscal_periods.get(stubId)) as FiscalYearPeriod | undefined;
    }
    const hydratedTables: Record<string, string> = {
      ...(localRow?.archive_hydrated_tables ?? {}),
    };

    const tableResults: FyHydrationResult['tables'] = {};
    for (const [tableName, meta] of Object.entries(fy.tables)) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      // D1: skip tables already checkpoint-recorded as hydrated. The .ndjson.gz
      // bulkPut is idempotent so re-running is correct but wasteful — skip is
      // the perf win.
      if (hydratedTables[tableName]) {
        tableResults[tableName] = { rows_loaded: 0, sha_matched: true };
        onProgress?.({
          type: 'table_completed',
          fy_label: fy.fy_label,
          table: tableName,
          rows_loaded: 0,
          detail: 'resumed: table already local',
        });
        continue;
      }

      onProgress?.({ type: 'table_started', fy_label: fy.fy_label, table: tableName });

      const { rowsLoaded, shaMatched } = await this.hydrateTable({
        storeId,
        fyLabel: fy.fy_label,
        tableName,
        meta,
        signal,
      });

      tableResults[tableName] = { rows_loaded: rowsLoaded, sha_matched: shaMatched };
      hydratedTables[tableName] = new Date().toISOString();
      if (localRow) {
        await getDB().fiscal_periods.update(localRow.id, {
          archive_hydrated_tables: { ...hydratedTables },
        });
      }
      onProgress?.({
        type: shaMatched ? 'table_completed' : 'sha_mismatch',
        fy_label: fy.fy_label,
        table: tableName,
        rows_loaded: rowsLoaded,
        expected_sha256: meta.sha256,
      });
    }

    // Stamp FY-complete only if every manifest table has a checkpoint.
    const allTables = Object.keys(fy.tables);
    const allDone = allTables.every((t) => !!hydratedTables[t]);
    const hydratedAt = new Date().toISOString();
    if (localRow && allDone) {
      await getDB().fiscal_periods.update(localRow.id, {
        archive_hydrated_at: hydratedAt,
      });
    } else if (!localRow) {
      // Defensive: should not happen since we stubbed above, but keep the
      // legacy create-with-stamp path so we never lose a partial result.
      await getDB().fiscal_periods.put({
        id: crypto.randomUUID(),
        store_id: storeId,
        fy_label: fy.fy_label,
        start_date: fy.start_date,
        end_date: fy.end_date,
        is_closed: true,
        closed_at: fy.closed_at ?? null,
        closed_by: null,
        archive_url: null,
        archive_sha256: fy.manifest_sha256 ?? null,
        archive_row_counts: fy.tables,
        archive_hydrated_at: allDone ? hydratedAt : null,
        archive_hydrated_tables: hydratedTables,
        created_at: hydratedAt,
        updated_at: hydratedAt,
        _synced: false,
      });
    }

    onProgress?.({ type: 'fy_completed', fy_label: fy.fy_label });
    return { fy_label: fy.fy_label, tables: tableResults, hydrated_at: hydratedAt };
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private async fetchManifest(storeId: string): Promise<ArchiveManifest> {
    const { data, error } = await supabase.rpc('get_archive_manifest', {
      p_store_id: storeId,
    });
    if (error) throw new Error(`Manifest fetch failed: ${error.message}`);
    return data as ArchiveManifest;
  }

  private async hydrateTable(args: {
    storeId: string;
    fyLabel: string;
    tableName: string;
    meta: ArchiveTableMeta;
    signal?: AbortSignal;
  }): Promise<{ rowsLoaded: number; shaMatched: boolean }> {
    const { storeId, fyLabel, tableName, meta, signal } = args;

    // Mint a fresh signed URL via the SDK. The bucket is private; RLS
    // enforces store-scoped access.
    const { data: signed, error: signErr } = await supabase.storage
      .from('archives')
      .createSignedUrl(meta.path, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed?.signedUrl) {
      throw new Error(`Signed URL mint failed for ${meta.path}: ${signErr?.message}`);
    }

    // Fetch as ArrayBuffer so we can run sha256 over the whole gzipped blob
    // before decompressing. crypto.subtle.digest doesn't stream.
    const response = await fetch(signed.signedUrl, { signal });
    if (!response.ok) {
      throw new Error(`Fetch ${meta.path} failed: ${response.status}`);
    }
    const gzipped = new Uint8Array(await response.arrayBuffer());

    const observedSha = await sha256Hex(gzipped);
    const shaMatched = observedSha === meta.sha256;
    if (!shaMatched) {
      // Surface but keep going — the caller decides whether to discard.
      // We still bulk-put because partial data is better than nothing for
      // a statement read, but we flag it so the UI can warn.
      console.warn(
        `[archiveHydration] sha mismatch ${meta.path} expected=${meta.sha256} observed=${observedSha}`,
      );
    }

    // Decompress + line-split + JSON.parse + batched bulkPut.
    const rowsLoaded = await streamRowsIntoDexie(
      gzipped,
      tableName,
      signal,
    );

    void fyLabel; // currently informational; reserved for per-FY checkpointing.
    return { rowsLoaded, shaMatched };
  }
}

// -------------------------------------------------------------------------
// Stream pipeline helpers
// -------------------------------------------------------------------------

async function streamRowsIntoDexie(
  gzipped: Uint8Array,
  tableName: string,
  signal?: AbortSignal,
): Promise<number> {
  const decompressedStream = new Response(gzipped).body!
    .pipeThrough(new DecompressionStream('gzip'))
    .pipeThrough(new TextDecoderStream());

  const reader = decompressedStream.getReader();
  const dexieTable = (getDB() as unknown as Record<string, { bulkPut: (rows: unknown[]) => Promise<unknown> }>)[tableName];
  if (!dexieTable) {
    throw new Error(`No Dexie table named "${tableName}" — archive references unknown table`);
  }

  let leftover = '';
  const batch: unknown[] = [];
  let total = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    await dexieTable.bulkPut(batch.map((row) => ({
      ...row as Record<string, unknown>,
      _synced: true,
      _lastSyncedAt: new Date().toISOString(),
    })));
    total += batch.length;
    batch.length = 0;
    // Yield to the main thread between batches so the UI stays responsive.
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = leftover + value;
    const lines = chunk.split('\n');
    leftover = lines.pop() ?? '';
    for (const line of lines) {
      if (!line) continue;
      batch.push(JSON.parse(line));
      if (batch.length >= BATCH_SIZE) {
        await flush();
      }
    }
  }
  if (leftover.trim()) {
    batch.push(JSON.parse(leftover));
  }
  await flush();
  return total;
}

async function sha256Hex(input: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const archiveHydrationService = new ArchiveHydrationService();

// Re-export the SyncTable type for callers that want to type-narrow
// which Dexie tables can be hydrated from an archive.
export type ArchiveTable = SyncTable;
