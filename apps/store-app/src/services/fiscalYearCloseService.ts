/**
 * fiscalYearCloseService — the data/network layer for the year-end close UI.
 *
 * Owns every `supabase` / `getDB` access that the FiscalYearCloseSection and
 * FiscalYearCloseReminder components used to do inline (which violated the
 * "UI must not import supabase/db" rule). Components now call this service.
 *
 * Close / reopen are server-authoritative RPCs (see migration
 * 20260528180000 + the tenant guard in 20260714130000) — they are online-only
 * by design and cannot run offline; callers should gate their UI on
 * connectivity. Unlike the offline-first data layers, this service reads the
 * freshest fiscal_periods state straight from Supabase, then mirrors it into
 * Dexie so components reading coverage from Dexie update without a full sync.
 *
 * Distinct from `fiscalYearService` (pure date math, no I/O) — keep that one
 * dependency-free.
 */

import { supabase } from '../lib/supabase';
import { getDB } from '../lib/db';
import type { FiscalYearPeriod } from '../types';

export interface CloseFiscalYearResult {
  closingAnchorsWritten: number;
}

export interface ArchiveExportResult {
  tables: Record<string, { row_count?: number }>;
}

/**
 * List every fiscal_periods row for a store, newest first. Reads from Supabase
 * (the authoritative source for close state) and falls back to Dexie when
 * offline / on error so the panel still renders.
 */
export async function listFiscalPeriods(storeId: string): Promise<FiscalYearPeriod[]> {
  const { data, error } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('store_id', storeId)
    .order('start_date', { ascending: false });

  if (error) {
    console.error('Failed to load fiscal_periods from server; falling back to Dexie:', error);
    const rows = await getDB().fiscal_periods.where('store_id').equals(storeId).toArray();
    rows.sort((a, b) => b.start_date.localeCompare(a.start_date));
    return rows as FiscalYearPeriod[];
  }
  return (data ?? []) as FiscalYearPeriod[];
}

/** Local (Dexie) fiscal_periods rows for a store — used by the low-frequency reminder banner. */
export async function getLocalFiscalPeriods(storeId: string): Promise<FiscalYearPeriod[]> {
  try {
    const rows = await getDB().fiscal_periods.where('store_id').equals(storeId).toArray();
    return rows as FiscalYearPeriod[];
  } catch {
    return [];
  }
}

/**
 * Push the server's freshest fiscal_periods rows into Dexie, preserving
 * local-only fields (archive_hydrated_*) by merging. Best-effort.
 */
async function syncFiscalPeriodsToDexie(storeId: string): Promise<void> {
  // `fiscal_periods` is not in the generated types/database.ts (remote
  // schema), so the response data is typed `never`. Cast it to the known row
  // shape rather than casting `supabase` to `any`.
  const { data, error } = await supabase.from('fiscal_periods').select('*').eq('store_id', storeId);
  if (error || !data) return;
  const serverRows = data as unknown as FiscalYearPeriod[];
  const db = getDB();
  const locals = await db.fiscal_periods.where('store_id').equals(storeId).toArray();
  const localById = new Map(locals.map((r) => [r.id, r]));
  const merged = serverRows.map((server) => {
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

/** Close a fiscal year via the server RPC, then mirror the new state to Dexie. */
export async function closeFiscalYear(storeId: string, fyLabel: string): Promise<CloseFiscalYearResult> {
  // close_fiscal_year isn't in the generated RPC types — cast the args to
  // `never` (not `any`) so the untyped call type-checks without an `any`.
  const { data, error } = await supabase.rpc('close_fiscal_year' as never, {
    p_store_id: storeId,
    p_fy_label: fyLabel,
  } as never);
  if (error) throw error;
  await syncFiscalPeriodsToDexie(storeId);
  const closingAnchorsWritten =
    (data as { closing_anchors_written?: number } | null)?.closing_anchors_written ?? 0;
  return { closingAnchorsWritten };
}

/**
 * Reopen a fiscal year via the server RPC, mirror to Dexie, and CLEAR any
 * closed-period-parked rows so the next sync re-attempts them (the period is
 * postable again). Returns how many parked rows were released.
 */
export async function reopenFiscalYear(storeId: string, fyLabel: string): Promise<{ blocksCleared: number }> {
  const { error } = await supabase.rpc('reopen_fiscal_year' as never, {
    p_store_id: storeId,
    p_fy_label: fyLabel,
  } as never);
  if (error) throw error;
  await syncFiscalPeriodsToDexie(storeId);
  const blocksCleared = await getDB().clearClosedPeriodBlocks();
  return { blocksCleared };
}

/**
 * Invoke the export_fiscal_year_archive Edge Function for a (closed) FY. Sends
 * the user's bearer token; throws on non-2xx so the caller can surface the
 * partial-success state.
 */
export async function exportFiscalYearArchive(
  storeId: string,
  fyLabel: string,
): Promise<ArchiveExportResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const resp = await fetch(`${supabaseUrl}/functions/v1/export_fiscal_year_archive`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    // Bearer-token auth — no cookies. Omit credentials so the server's
    // `Access-Control-Allow-Origin: *` is acceptable to the browser.
    credentials: 'omit',
    body: JSON.stringify({ store_id: storeId, fy_label: fyLabel }),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(body?.error ?? `HTTP ${resp.status}`);
  return body as ArchiveExportResult;
}

/** Count of rows currently parked by the closed-fiscal-year trigger (for surfacing to the user). */
export async function getClosedPeriodBlockedCount(): Promise<number> {
  return (await getDB().getClosedPeriodBlockedSyncs()).length;
}
