// =========================================================================
//  Edge Function: export_fiscal_year_archive (Plan C, Phase C3)
//
//  Invocation:
//    POST /functions/v1/export_fiscal_year_archive
//    Authorization: Bearer <user JWT>
//    body: { store_id: uuid, fy_label: string }
//
//  Preconditions:
//    - fiscal_periods row exists and is_closed = true. Call
//      close_fiscal_year() first.
//    - Caller is authenticated and has access to store_id (super_admin or
//      store member).
//
//  What it does:
//    For each of the 7 archived tables, queries rows whose date column
//    falls inside the FY range, encodes as NDJSON, gzips, uploads to
//    Supabase Storage at archives/{store_id}/{table}/fy_{label}.ndjson.gz,
//    captures sha256 + row count. After all tables succeed:
//      - Writes/refreshes archives/{store_id}/manifest.json.
//      - Updates fiscal_periods.archive_url / archive_sha256 /
//        archive_row_counts (the URL points at the per-FY directory; per-
//        file URLs are minted on demand by get_archive_url RPC, C5).
//
//  Not-yet-streaming caveat:
//    v1 accumulates each table's gzipped bytes in memory then uploads as a
//    single Blob. Acceptable for current data sizes (no production data
//    yet); for very large FYs, swap to multipart-resumable uploads.
// =========================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// CORS headers — the function is called from the store-app SPA running on
// localhost during development and from the Electron renderer in production.
// Browsers send an OPTIONS preflight for POST with the Authorization header,
// so the function must respond to OPTIONS and stamp every response with
// the right CORS headers.
//
// Why echo the Origin instead of `*`:
//   Some clients (or service workers) fetch with `credentials: 'include'`.
//   In that mode, browsers reject `Access-Control-Allow-Origin: *` and
//   demand a specific origin echoed back PLUS `Access-Control-Allow-
//   Credentials: true`. Echoing covers both the credentialed and
//   credential-less cases.
function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(
  req: Request,
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeadersFor(req),
      ...(init.headers ?? {}),
    },
  });
}

interface ArchiveTableSpec {
  table: string;
  /**
   * Date column used for FY range filtering. `null` means the table has
   * no business-date column and must be filtered via a join.
   */
  dateCol: string | null;
  /** For join-filtered tables: parent table whose row ids gate this one. */
  parent?: { table: string; key: string };
}

const ARCHIVE_TABLES: ArchiveTableSpec[] = [
  { table: 'journal_entries',  dateCol: 'posted_date' },
  { table: 'balance_snapshots', dateCol: 'snapshot_date' },
  { table: 'bills',             dateCol: 'bill_date' },
  // bill_line_items has no business-date column — gate by parent bill_id.
  { table: 'bill_line_items',   dateCol: null, parent: { table: 'bills', key: 'bill_id' } },
  // transactions has no business-date column; use created_at (per C1 decision).
  { table: 'transactions',      dateCol: 'created_at' },
  { table: 'inventory_bills',   dateCol: 'received_at' },
  // inventory_items has no business-date column on the Supabase side
  // (received_at lives only in the local Dexie schema). Use created_at,
  // matching how transactions are partitioned above.
  { table: 'inventory_items',   dateCol: 'created_at' },
];

const PAGE_SIZE = 5_000;

interface ExportRequest {
  store_id: string;
  fy_label: string;
}

interface TableArchiveResult {
  path: string;
  row_count: number;
  byte_size_gz: number;
  sha256: string;
}

interface ManifestFy {
  fy_label: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  tables: Record<string, TableArchiveResult>;
  generated_at: string;
}

interface Manifest {
  manifest_version: number;
  store_id: string;
  generated_at: string;
  fiscal_years: ManifestFy[];
  current_fy?: string;
}

Deno.serve(async (req: Request) => {
  // CORS preflight — browsers send this before any cross-origin POST with
  // custom headers like Authorization. Must return 204 + CORS headers.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeadersFor(req) });
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'POST required' }, { status: 405 });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse(req, { error: 'Missing bearer token' }, { status: 401 });
  }

  let body: ExportRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON body' }, { status: 400 });
  }

  const { store_id, fy_label } = body;
  if (!store_id || !fy_label) {
    return jsonResponse(req, { error: 'store_id and fy_label required' }, { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Auth client — verifies caller identity and role.
  const authClient = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userResult, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userResult.user) {
    return jsonResponse(req, { error: 'Unauthorized' }, { status: 401 });
  }

  // Service-role client — bypasses RLS for the bulk export work.
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Authorize: caller must belong to the store or be super_admin.
  const { data: callerRow, error: callerErr } = await admin
    .from('users')
    .select('id, role, store_id')
    .eq('id', userResult.user.id)
    .single();
  if (callerErr || !callerRow) {
    return jsonResponse(req, { error: 'Caller profile not found' }, { status: 403 });
  }
  if (callerRow.role !== 'super_admin' && callerRow.store_id !== store_id) {
    return jsonResponse(req, { error: 'Forbidden for this store' }, { status: 403 });
  }

  // Load + validate the fiscal_periods row.
  const { data: period, error: periodErr } = await admin
    .from('fiscal_periods')
    .select('id, fy_label, start_date, end_date, is_closed')
    .eq('store_id', store_id)
    .eq('fy_label', fy_label)
    .single();
  if (periodErr || !period) {
    return jsonResponse(req, { error: 'Fiscal period not found' }, { status: 404 });
  }
  if (!period.is_closed) {
    return jsonResponse(
      req,
      { error: 'Fiscal period must be closed before export' },
      { status: 409 },
    );
  }

  const startedAt = Date.now();
  const tableResults: Record<string, TableArchiveResult> = {};

  try {
    // 1. Pre-compute the bill_id set for bill_line_items (gates the join-filtered
    //    archive). Done once so the per-table loop stays uniform.
    const billIds = await fetchBillIdsForFy(
      admin,
      store_id,
      period.start_date,
      period.end_date,
    );

    for (const spec of ARCHIVE_TABLES) {
      const result = await exportTable(admin, {
        storeId: store_id,
        fyLabel: fy_label,
        startDate: period.start_date,
        endDate: period.end_date,
        spec,
        billIds,
      });
      tableResults[spec.table] = result;
    }

    // 2. Update / write the manifest.
    const manifest = await loadOrInitManifest(admin, store_id);
    const fyEntry: ManifestFy = {
      fy_label,
      start_date: period.start_date,
      end_date: period.end_date,
      is_closed: true,
      tables: tableResults,
      generated_at: new Date().toISOString(),
    };
    const existingIdx = manifest.fiscal_years.findIndex((f) => f.fy_label === fy_label);
    if (existingIdx >= 0) {
      manifest.fiscal_years[existingIdx] = fyEntry;
    } else {
      manifest.fiscal_years.push(fyEntry);
    }
    manifest.fiscal_years.sort((a, b) => a.start_date.localeCompare(b.start_date));
    manifest.generated_at = new Date().toISOString();
    const manifestSha = await writeManifest(admin, store_id, manifest);

    // 3. Update fiscal_periods. archive_url points at the per-FY directory;
    //    per-file signed URLs come from get_archive_url (C5). archive_row_counts
    //    carries the full per-table metadata (path, row_count, byte_size_gz,
    //    sha256) — the manifest RPC (C4) reconstructs the manifest from it,
    //    so fiscal_periods stays the source of truth. archive_sha256 holds the
    //    sha of manifest.json itself for tamper-detection on the whole manifest.
    const { error: updateErr } = await admin
      .from('fiscal_periods')
      .update({
        archive_url: `archives/${store_id}/`,
        archive_sha256: manifestSha,
        archive_row_counts: tableResults,
      })
      .eq('id', period.id);
    if (updateErr) throw updateErr;

    return jsonResponse(req, {
      store_id,
      fy_label,
      elapsed_ms: Date.now() - startedAt,
      manifest_sha256: manifestSha,
      tables: tableResults,
    });
  } catch (err) {
    // Surface the real error to both the caller and the function logs.
    // Supabase client errors are plain objects ({message, code, details,
    // hint}) — `String(err)` on those gives "[object Object]" which hides
    // the cause. Capture every useful field we can find.
    const detail =
      err instanceof Error
        ? { message: err.message, stack: err.stack, name: err.name }
        : typeof err === 'object' && err !== null
          ? (err as Record<string, unknown>)
          : { message: String(err) };
    console.error('export_fiscal_year_archive failed:', detail);
    return jsonResponse(
      req,
      { error: 'Archive export failed', detail },
      { status: 500 },
    );
  }
});

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

async function fetchBillIdsForFy(
  admin: ReturnType<typeof createClient>,
  storeId: string,
  startDate: string,
  endDate: string,
): Promise<string[]> {
  const ids: string[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await admin
      .from('bills')
      .select('id')
      .eq('store_id', storeId)
      .gte('bill_date', startDate)
      .lte('bill_date', endDate)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data as Array<{ id: string }>) ids.push(row.id);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return ids;
}

async function exportTable(
  admin: ReturnType<typeof createClient>,
  args: {
    storeId: string;
    fyLabel: string;
    startDate: string;
    endDate: string;
    spec: ArchiveTableSpec;
    billIds: string[];
  },
): Promise<TableArchiveResult> {
  const { storeId, fyLabel, startDate, endDate, spec, billIds } = args;

  // Concatenate NDJSON bytes (one row per line, terminated by \n).
  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();
  let rowCount = 0;

  if (spec.parent) {
    // Join-filtered: fetch in batches of bill_ids (Postgres `IN` list has a
    // practical limit; 500 ids per query keeps URLs small).
    const ID_BATCH = 500;
    for (let i = 0; i < billIds.length; i += ID_BATCH) {
      const slice = billIds.slice(i, i + ID_BATCH);
      let from = 0;
      while (true) {
        const { data, error } = await admin
          .from(spec.table)
          .select('*')
          .eq('store_id', storeId)
          .in(spec.parent.key, slice)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const row of data) {
          chunks.push(encoder.encode(JSON.stringify(row) + '\n'));
          rowCount += 1;
        }
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }
  } else {
    // Date-filtered: paged keyset on dateCol + id is safer for large tables,
    // but offset/limit at 5k pages is fine for our scale.
    let from = 0;
    while (true) {
      let q = admin
        .from(spec.table)
        .select('*')
        .eq('store_id', storeId)
        .order(spec.dateCol!, { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (spec.dateCol === 'created_at') {
        // created_at is a timestamptz — compare against day boundaries.
        q = q.gte(spec.dateCol, `${startDate}T00:00:00Z`)
             .lte(spec.dateCol, `${endDate}T23:59:59.999Z`);
      } else {
        q = q.gte(spec.dateCol!, startDate).lte(spec.dateCol!, endDate);
      }

      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const row of data) {
        chunks.push(encoder.encode(JSON.stringify(row) + '\n'));
        rowCount += 1;
      }
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  // Concatenate, gzip, sha256, upload.
  const ndjson = concatChunks(chunks);
  const gzipped = await gzipBytes(ndjson);
  const sha256 = await sha256Hex(gzipped);

  const path = `${storeId}/${spec.table}/fy_${sanitizeLabel(fyLabel)}.ndjson.gz`;
  const { error: uploadErr } = await admin.storage
    .from('archives')
    .upload(path, gzipped, {
      contentType: 'application/gzip',
      upsert: true,
    });
  if (uploadErr) throw uploadErr;

  return {
    path,
    row_count: rowCount,
    byte_size_gz: gzipped.byteLength,
    sha256,
  };
}

async function loadOrInitManifest(
  admin: ReturnType<typeof createClient>,
  storeId: string,
): Promise<Manifest> {
  const { data, error } = await admin.storage
    .from('archives')
    .download(`${storeId}/manifest.json`);
  if (error || !data) {
    return {
      manifest_version: 1,
      store_id: storeId,
      generated_at: new Date().toISOString(),
      fiscal_years: [],
    };
  }
  const text = await data.text();
  try {
    return JSON.parse(text) as Manifest;
  } catch {
    return {
      manifest_version: 1,
      store_id: storeId,
      generated_at: new Date().toISOString(),
      fiscal_years: [],
    };
  }
}

async function writeManifest(
  admin: ReturnType<typeof createClient>,
  storeId: string,
  manifest: Manifest,
): Promise<string> {
  const body = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  const { error } = await admin.storage
    .from('archives')
    .upload(`${storeId}/manifest.json`, body, {
      contentType: 'application/json',
      upsert: true,
    });
  if (error) throw error;
  return await sha256Hex(body);
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

async function gzipBytes(input: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(input).body!.pipeThrough(
    new CompressionStream('gzip'),
  );
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function sha256Hex(input: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * fy_label may contain spaces ("FY 2024") or slashes ("2024/25"). Keep the
 * Storage path filesystem-safe: replace anything outside [A-Za-z0-9_-] with _.
 */
function sanitizeLabel(label: string): string {
  return label.replace(/[^A-Za-z0-9_-]+/g, '_');
}
