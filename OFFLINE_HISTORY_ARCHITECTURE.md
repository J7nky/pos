# Offline History Architecture

> Design doc for unbounded historical data access in an offline-first POS.
> Covers: fiscal years, balance snapshots, fiscal-year-partitioned bulk archives, and progressive backfill.
> Related: `EVENT_DRIVEN_SYNC_ARCHITECTURE.md`, `JOURNAL_BASED_BALANCE_REVIEW.md`, `ATOMIC_TRANSACTIONS_NEW_ARCHITECTURE.md`.

---

## 1. Problem Statement

A device must be able to:

1. Open instantly after install, even though `journal_entries` may contain **1M+ rows**.
2. Generate an account statement for **any historical date range** — including periods years in the past — **while offline**.
3. Survive being offline for **days, months, or years** and catch up reasonably on reconnect.
4. Render a statement that matches the existing UX: opening balance (رصيد ما قبل) + every line item with running balance, just like the Softwave reference screenshot.

The current paged sync (`syncService.downloadTablePaged`, 500 rows/page) takes ~2,000 round trips to seed 1M journal entries. That is unacceptable for cold start and re-sync after a long gap.

---

## 2. Goals & Non-Goals

### Goals
- Initial install hydrates raw `journal_entries` (and statement-supporting tables) in **2 HTTP requests per closed fiscal year**, not thousands.
- Account statements work offline for **every fiscal year that has been downloaded** — no aggregate fakes.
- Closed fiscal years are **immutable archives** generated once and never re-exported.
- Opening balance at any date is a **single Dexie lookup** (snapshot), not a journal scan.
- Reconnect-after-long-gap uses the same archive mechanism as fresh install.

### Non-Goals
- We are **not** pre-rendering or summarizing statements server-side.
- We are **not** dropping line-item granularity for any period the user has downloaded.
- We are **not** changing the existing event-driven sync path for high-frequency tables (`bills`, `transactions`, `inventory_items`). Those continue via `branch_event_log`.

---

## 3. Mental Model

```
Time →
   ──────────────────────────────────────────────────────────────────────
   FY 2022 (closed)   FY 2023 (closed)   FY 2024 (closed)   FY 2025 (open)
   ──────────────────────────────────────────────────────────────────────
   archive file        archive file        archive file       paged sync
   immutable           immutable           immutable          live tail
   downloaded once     downloaded once     downloaded once    incremental
                                                              version cursor

   ↑ snapshot          ↑ snapshot          ↑ snapshot         ↑ snapshot
     at FY-end           at FY-end           at FY-end          rolling daily
     (anchor)            (anchor)            (anchor)
```

Three classes of data:

| Class | Mechanism | Mutability |
|---|---|---|
| Closed fiscal year history | FY-partitioned archive file | Immutable after year-end close |
| Current fiscal year | Paged sync via version cursor | Live |
| Balance snapshots | Server-generated, replicated via paged sync + archive | Daily rolling + FY-close anchors |

A statement is always:

```
opening_balance_at(start_date - 1)          ← snapshot lookup
+ raw journal entries WHERE entry_date BETWEEN start_date AND end_date
+ running balance computed during render
```

If raw entries for the range are local → statement renders fully offline.
If not → user is told they need to reconnect; no fake aggregates.

---

## 4. The Four Mechanisms

### 4.1 Fiscal Year (foundation)

- Store-level config: `fiscal_year_start_month` (1–12), `fiscal_year_start_day` (1–31). Default `(1, 1)`.
- Year-end closing is an explicit admin action that:
  - Generates a **guaranteed** `balance_snapshots` row for every account on FY-end (even zero-balance), marked `is_closing: true`.
  - Triggers generation of the immutable FY archive file.
  - Optionally marks the period closed in a `fiscal_periods` table to lock posting later.

### 4.2 Balance Snapshots (correctness)

Existing infrastructure (`snapshotService`, `balance_snapshots` table) extended with reliability guarantees:

- **Server-driven generation** via scheduled job — single source of truth, no client divergence.
- **Invalidation on past-dated edits** — editing a journal entry dated `D` marks all snapshots with `snapshot_date >= D` for that account as `stale`; nightly job recomputes them.
- **`getHistoricalBalance(date)` invariants** — strictly-before logic preserved; never returns same-day snapshot.
- **FY-close snapshots are anchors** — never garbage-collected, exist for every account.
- **Replicated via paged sync (Tier 1)** AND embedded in FY archives.

### 4.3 Fiscal-Year-Partitioned Bulk Archive

Replaces "one giant nightly archive" with one immutable file per closed fiscal year:

```
archives/{store_id}/
    manifest.json
    journal_entries/
        fy_2022.ndjson.gz    ← written once at FY 2022 close
        fy_2023.ndjson.gz
        fy_2024.ndjson.gz
    balance_snapshots/
        fy_2022.ndjson.gz
        ...
    inventory_bills/
        fy_2022.ndjson.gz
        ...
    [other archived tables follow same pattern]
```

**Current fiscal year is never archived** — it's live, served by paged sync.

### 4.4 Progressive Backfill

For devices that didn't download every FY (e.g., partial download, opted-out years, GC'd archives):
- After Tier 1 ready, a background controller downloads missing FY archives newest → oldest.
- Pausable / resumable; respects `AbortController` for store switches.
- UI shows "History available from FY YYYY".

---

## 5. Detailed Designs

### 5.1 Fiscal Year — Schema & API

**Supabase schema additions:**

```sql
ALTER TABLE stores
  ADD COLUMN fiscal_year_start_month smallint NOT NULL DEFAULT 1
    CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  ADD COLUMN fiscal_year_start_day smallint NOT NULL DEFAULT 1
    CHECK (fiscal_year_start_day BETWEEN 1 AND 31);

CREATE TABLE fiscal_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  fy_label text NOT NULL,             -- e.g. "FY 2024" or "2024-25"
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_closed boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  closed_by uuid REFERENCES users(id),
  archive_url text,                   -- populated when archive is generated
  archive_sha256 text,
  archive_row_counts jsonb,           -- {"journal_entries": 123456, ...}
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, fy_label)
);
```

**Dexie schema bump** (apps/store-app/src/lib/db.ts) — adds `fiscal_periods` store + new columns on `stores`.

**Service module:** `fiscalYearService.ts`

```ts
export interface FiscalYear { label: string; start: Date; end: Date; }

export function getCurrentFiscalYear(date: Date, store: Store): FiscalYear;
export function getFiscalYearForDate(date: Date, store: Store): FiscalYear;
export function getFiscalYearStart(year: number, store: Store): Date;
export function getFiscalYearRange(year: number, store: Store): FiscalYear;
export function getAllFiscalYears(store: Store, earliestDate: Date): FiscalYear[];
export function isFiscalYearClosed(fy: FiscalYear, periods: FiscalPeriod[]): boolean;
```

### 5.2 Balance Snapshots — Generation Pipeline

**Server-driven** (recommended). Scheduled Postgres job or Edge Function runs nightly:

```
FOR each (store_id, account_code, entity_id) with activity:
    target_date = yesterday (in store's timezone)
    IF balance_snapshots row exists for target_date: continue
    prior = SELECT * FROM balance_snapshots
        WHERE … AND snapshot_date < target_date
        ORDER BY snapshot_date DESC LIMIT 1
    delta = SUM(journal_entries
        WHERE entry_date > prior.snapshot_date AND entry_date <= target_date)
    INSERT balance_snapshots (..., balances = prior + delta, is_closing = false)
```

**Invalidation** — trigger on `journal_entries` insert/update/delete:

```sql
CREATE FUNCTION invalidate_downstream_snapshots() RETURNS trigger AS $$
BEGIN
  UPDATE balance_snapshots
    SET stale = true
    WHERE store_id = NEW.store_id
      AND account_code = NEW.account_code
      AND (entity_id = NEW.entity_id OR (entity_id IS NULL AND NEW.entity_id IS NULL))
      AND snapshot_date >= NEW.entry_date;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Nightly job recomputes `stale = true` snapshots.

**FY-close snapshots:** generated synchronously during the close action; never marked stale; never deleted.

**Schema additions to `balance_snapshots`:**
- `stale boolean NOT NULL DEFAULT false`
- `is_closing boolean NOT NULL DEFAULT false`

### 5.3 FY-Partitioned Archives — Server Side

**Trigger:** year-end close action (admin UI in store-app or admin-app).

**Steps:**
1. Generate FY-end closing snapshots for all accounts (synchronous, transactional).
2. Stream-export tables filtered by FY date range to NDJSON:
   ```sql
   SELECT * FROM journal_entries
     WHERE store_id = ?
       AND entry_date BETWEEN fy.start_date AND fy.end_date
     ORDER BY entry_date, id;
   ```
3. Gzip stream; upload to `archives/{store_id}/{table}/fy_{label}.ndjson.gz`.
4. Compute sha256 during upload.
5. Insert/update `fiscal_periods` row with `archive_url`, `archive_sha256`, `archive_row_counts`, `is_closed=true`, `closed_at=now()`.
6. Update `archives/{store_id}/manifest.json` (atomic write).
7. Emit a `branch_event_log` event of type `fiscal_year_closed` so connected clients learn immediately.

**Tables archived per FY** (locked C1, 2026-05-28):

| Table | FY filter column | Notes |
|---|---|---|
| `journal_entries` | `posted_date` | Statement line items — primary archive payload |
| `balance_snapshots` | `snapshot_date` | Daily rows + FY-close anchor (`is_closing=true`) |
| `bills` | `bill_date` | POS sale receipts — referenced by statement description |
| `bill_line_items` | join via `bills.bill_date` | Sale line items (no own business-date column) |
| `transactions` | `created_at` | Payment / cash transaction references (no business-date column on Transaction interface) |
| `inventory_bills` | `received_at` | Supplier purchase bills — statement description source |
| `inventory_items` | `received_at` | Inventory batch lookups (joined via bill batch_id) |

**Tables NOT archived per-FY** (current-state suffices via Tier 1 paged sync):

`entities`, `chart_of_accounts`, `products`, `units_of_measure`, `product_categories`, `stores`, `branches`, `users`, `cash_drawer_accounts`, `role_permissions`, `user_permissions`. These tables are bounded in size, mutate slowly, and the statement renderer joins them by ID — soft-delete (already the codebase pattern) is what preserves cross-FY ID resolvability. Hard-deleting a product would break a historical line-item display; treat this as a project invariant rather than something archives compensate for.

### 5.4 FY-Partitioned Archives — Manifest Format

```json
{
  "manifest_version": 1,
  "store_id": "uuid",
  "generated_at": "2026-05-24T03:00:00Z",
  "schema_version": 54,
  "fiscal_years": [
    {
      "fy_label": "FY 2022",
      "start_date": "2022-01-01",
      "end_date": "2022-12-31",
      "is_closed": true,
      "tables": {
        "journal_entries": {
          "path": "journal_entries/fy_2022.ndjson.gz",
          "row_count": 142_000,
          "byte_size_gz": 9_400_000,
          "sha256": "abc..."
        },
        "balance_snapshots": { … },
        …
      }
    },
    …
  ],
  "current_fy": "FY 2025"
}
```

Signed URLs are returned per-archive by an RPC `get_archive_url(store_id, fy_label, table)`, not embedded in the manifest (avoids long-expiry URLs).

### 5.5 FY-Partitioned Archives — Client Consumption

**Trigger conditions:**

```ts
shouldHydrateArchive(fy) =
  !hydration_complete                                    // fresh install
  || !localFiscalPeriods.has(fy.label)                   // missing FY
  || user_action === 'rebuild_local_cache'
```

**Flow per FY:**

1. RPC → fetch manifest (or use cached if < 1h old).
2. For each closed FY not yet local:
   1. Verify `manifest.schema_version === db.verno`. Skip & warn on mismatch.
   2. For each archived table:
      1. RPC → `get_archive_url(store_id, fy_label, table)` → signed URL (5-min expiry).
      2. Stream-fetch the `.ndjson.gz`.
      3. Pipe through `DecompressionStream('gzip')` → newline-split → JSON.parse.
      4. `db.{table}.bulkPut(batch)` in chunks of 1,000 rows.
      5. `yieldToMain()` between batches.
      6. Verify sha256 after full stream consumed.
   3. Mark FY locally as hydrated (insert into local `fiscal_periods`).
3. After all closed FYs are local → resume paged sync for current FY (live tail).

**Order of FYs:** newest closed FY first (most likely to be requested by user), then progressively older.

### 5.6 Progressive Backfill Controller

Distinct from FY archive hydration — handles cases where the user installed with partial archive coverage and now wants more.

- Background task, started after Tier 1 ready.
- Walks `manifest.fiscal_years` in reverse chronological order.
- For each FY not local: downloads via the same flow as 5.5.
- Persists progress per-FY in `sync_metadata` (resumable).
- UI: small indicator in sync status panel — "History: FY 2020 → present (downloading FY 2019…)".

### 5.7 Statement Renderer

```ts
async function renderAccountStatement(accountCode, entityId, fromDate, toDate) {
  const opening = await snapshotService.getHistoricalBalance({
    accountCode, entityId, asOf: subDays(fromDate, 1),
  });

  const entries = await db.journal_entries
    .where('[entity_id+account_code]').equals([entityId, accountCode])
    .filter(e => e.entry_date >= fromDate && e.entry_date <= toDate)
    .sortBy('entry_date');

  const missingFYs = detectMissingFiscalYears(fromDate, toDate, entries);
  if (missingFYs.length > 0 && !isOnline()) {
    return { error: 'OFFLINE_MISSING_HISTORY', missingFYs };
  }

  // attach description / reference data from inventory_bills / transactions / bills
  const enriched = await enrichEntries(entries);

  return computeRunningBalance(opening, enriched);
}
```

Statements never fall back to aggregates. Either complete line items, or an honest "reconnect to load" message.

---

## 6. Implementation Plans

### Plan A — Fiscal Year (foundation, smallest) — ✅ shipped

| Phase | Description | Status |
|---|---|---|
| A1 | Supabase migration `20260526120000_fiscal_year_periods.sql`: stores.fiscal_year_start_month/day + fiscal_periods table + RLS | ✅ |
| A2 | Dexie v65 → v66: `fiscal_periods` store + Store columns + upgradeV66 backfill | ✅ |
| A3 | `fiscalYearService.ts` + 22 unit tests (Jan/Apr/Jul starts, Feb 29 clamp, DST-safe arithmetic) | ✅ |
| A4 | Settings UI "Fiscal Year" section under Business Settings tab (admin-only) with live FY preview | ✅ |
| A5 | `fiscal_periods` wired into SYNC_TABLES, Tier 1, and SYNC_DEPENDENCIES (depends on `stores`) | ✅ |
| A6 | `AccountStatementModal` defaults `start` to current FY start (replaces hardcoded Jan 1) | ✅ |
| A7 | (Deferred) Year-end close action UI — lands with Plan C |

**Dependencies:** none. Can ship standalone.

**Acceptance:**
- Stores have configurable FY start.
- Statement date picker opens at correct FY start.
- `fiscalYearService.getCurrentFiscalYear(new Date())` matches expectations across edge cases (FY starts on 1/1, 4/1, 7/1; today is on FY boundary).

### Plan B — Balance Snapshots Correctness — ✅ shipped

Hybrid offline-first model: server is canonical, client scheduler stays as a fallback for long-offline devices. `source` column ('server' / 'client' / 'closing') with precedence closing > server > client.

| Phase | Description | Status |
|---|---|---|
| B1 | Audit current state | ✅ |
| B2 | Migration `20260526130000_balance_snapshots_stale_source.sql` — added `stale`, `is_closing`, `source` + CHECK constraints + partial indexes. Dexie v66 → v67 backfill (`upgradeV67`). | ✅ |
| B4 | Trigger `20260526140000_journal_entries_snapshot_invalidation.sql` — marks downstream snapshots stale on past-dated insert/update/delete. Closing anchors never touched. | ✅ |
| B6 | `snapshotService.getHistoricalBalance` skips stale rows in both exact and most-recent-before lookups. Multi-currency zero-balance check fixed (was USD/LBP-only). `cleanupOldSnapshots` preserves closing anchors. Client snapshots created with `source='client'`, `_synced: true`. `syncUpload` filters out `source='client'` rows. | ✅ |
| B8 | `balance_snapshots` deliberately kept in Tier 2 (not Tier 1 as originally drafted) — existing stores carry hundreds of pages of snapshots that would otherwise block fresh-device boot. Client scheduler + journal-scan fallback cover the gap until Tier 2 catches up. | ✅ |
| B3 | Migration `20260526150000_server_snapshot_generator.sql` — `generate_daily_snapshots(store_id, date)` per-store generator + `generate_daily_snapshots_for_all_stores(date)` wrapper. Multi-currency native, idempotent, preserves closing anchors. Scheduled via pg_cron (config left to Supabase dashboard). | ✅ |
| B5 | Migration `20260526160000_stale_snapshot_recompute.sql` — `recompute_stale_snapshots(store_id?)` clears stale flag by re-running B3 generator per (store, distinct stale date). | ✅ |
| B7 | Migration `20260526170000_backfill_historical_snapshots.sql` — `backfill_balance_snapshots(store_id)` + all-stores wrapper. Iterates distinct posted_date values. | ✅ |

**Deferred:** client-side invalidation hook on journal_entries Dexie writes. Server trigger handles canonical case; long-offline devices get eventually-consistent correction on reconnect. Add later if a real workflow demands it.

**Acceptance:**
- For any (account, entity, date), `getHistoricalBalance` returns balance matching a fresh journal sum, within 1 row.
- Editing a past entry causes the next `getHistoricalBalance` call to reflect the new value (after stale-recompute pass).
- 100% of accounts with activity have a snapshot for every day since first activity (or are explicitly skip-listed for zero balance).

### Plan C — FY-Partitioned Bulk Archive

| Phase | Description | Status |
|---|---|---|
| C1 | Archived-table list locked in §5.3: 7 date-bound tables archived per-FY, 11 reference/config tables continue via Tier 1 paged sync. Hard-delete of reference tables (`products`, `entities`, `chart_of_accounts`) is treated as a project invariant — soft-delete is the codebase pattern. | ✅ |
| C2 | `close_fiscal_year()` + `reopen_fiscal_year()` + posting-rejection trigger shipped in `20260528180000_fiscal_year_close_action.sql`. Atomically writes closing-anchor snapshots; `journal_entries_reject_closed_fy` blocks writes into closed periods. | ✅ |
| C3 | Edge Function `supabase/functions/export_fiscal_year_archive/index.ts` + private `archives` storage bucket (`20260528190000_archives_storage_bucket.sql`). Streams 7 archived tables to NDJSON.gz, uploads to `archives/{store_id}/{table}/fy_{label}.ndjson.gz`, computes sha256, refreshes `manifest.json` and `fiscal_periods.archive_*` columns. Admin UI invokes after a successful `close_fiscal_year()`. | ✅ |
| C4 | RPC `get_archive_manifest(store_id)` shipped in `20260528200000_archive_manifest_rpc.sql`. Derives manifest from `fiscal_periods.archive_row_counts` (table is source of truth); SECURITY INVOKER honors existing RLS. | ✅ |
| C5 | RPC `get_archive_path(store_id, fy_label, table)` shipped in `20260528210000_archive_url_rpc.sql`. Returns path + metadata; client mints the 5-min signed URL via `supabase.storage.from('archives').createSignedUrl(path, 300)`. Postgres can't natively sign URLs and bucket RLS already gates access, so the mint stays on the client. | ✅ |
| C6 | `archiveHydrationService.ts` shipped. Fetches manifest via C4 RPC, diffs against local `fiscal_periods.archive_hydrated_at`, mints signed URL per file via SDK, fetches gzipped blob, sha256-verifies, then pipes `DecompressionStream('gzip')` → `TextDecoderStream` → line split → JSON.parse → batched `bulkPut(1000)` with inter-batch yields. `FiscalYearPeriod.archive_row_counts` typed as `Record<string, ArchiveTableMeta>`; new local-only `archive_hydrated_at` field tracks per-FY hydration state. | ✅ |
| C7 | Wired into `useOfflineInitialization`: after Tier 1 completes, archive hydration runs concurrently with Tier 2/3 paged sync inside the existing `Promise.allSettled` block; shares the cold-start `AbortController`. Archives cover closed FYs; paged sync covers the live tail. Bulk-put primary-key reconciliation keeps any overlap idempotent. | ✅ |
| C8 | Wired into `useOfflineSyncLifecycle.handleConnectionRestored`: after the regular sync path runs, `hydrateAllMissingArchives` is invoked in the background. Same diff against `archive_hydrated_at` means a device that was offline through an FY close pulls the new archive on reconnect; a device that was already current short-circuits. | ✅ |
| C9 | `OfflineSyncSessionState.archiveHydration: ArchiveHydrationStatus` field added; cold-start path in `useOfflineInitialization` translates `onProgress` events into UI state (current FY/table, rows loaded, sha mismatches, elapsed ms, fail message). Warm-start / reconnect paths log to console only — the syncSession state isn't visible there. | ✅ |
| C10 | **Retention policy: keep all closed-FY archives forever.** Per-store storage cost is bounded by activity (one FY of `journal_entries` gzips to single-digit MB at the data sizes this product targets). No cleanup job ships in v1; if cost ever becomes a constraint, delete by `fiscal_periods` row → `archive_url` prefix in the `archives` bucket. The `is_closed` flag must remain `true` so clients don't re-archive on demand. | ✅ |

**Dependencies:** Plan A (fiscal_periods table) and Plan B (FY-close snapshots are part of close action).

**Acceptance:**
- Fresh install of a store with 3 closed FYs ends up with full local history within seconds (vs. minutes of paged sync).
- Statement for any closed FY renders fully offline.
- Re-installing on a device produces byte-identical local data (idempotent).

### Plan D — Progressive Backfill — ✅ shipped

| Phase | Description | Status |
|---|---|---|
| D1 | Per-table durable checkpointing: new `FiscalYearPeriod.archive_hydrated_tables` (local-only `Record<table, ISO>`); `archiveHydrationService.hydrateFiscalYear` writes a checkpoint after each table and skips tables that already carry one. A mid-FY interrupt resumes by re-running only the unfinished tables. `archive_hydrated_at` is stamped only when every manifest table has a checkpoint. | ✅ |
| D2 | Sync_metadata-based progress folded into D1 — `fiscal_periods.archive_hydrated_tables` is the source of truth; no parallel `sync_metadata.archive_backfill_progress` row needed. | ✅ |
| D3 | AbortController already threaded through `hydrateAllMissingArchives` (FY loop), `hydrateFiscalYear` (table loop), and `streamRowsIntoDexie` (chunk loop). Store switch creates a new cold-start controller; D1 checkpoints make any partial work survive the abort. | ✅ |
| D4 | `OfflineDataContext.archiveCoverage: ArchiveCoverageStatus` and `triggerArchiveBackfill(opts?)` exposed for UI surfaces (history coverage indicator + manual "Download older FYs" button). Coverage is recomputed from local `fiscal_periods` after each trigger run. UI component is left to a follow-up; the API is in place. | ✅ |

**Dependencies:** Plan C (depends on the archive flow being functional).

**Acceptance:**
- A device installed with only the newest FY can fill in older FYs without user action while online; survives going offline mid-backfill.

---

## 7. Sequencing & Critical Path

```
       ┌─ Plan A (Fiscal Year) ─────┐
       │                            │
       │                            ▼
       │           Plan B (Snapshots) ──┐
       │                                │
       │                                ▼
       └──────────────────────► Plan C (Archive) ──► Plan D (Backfill)
```

**Recommended build order:**

1. **Plan A** — small, unblocks everything, immediately useful (statement defaults).
2. **Plan B** — make snapshots trustworthy before they become sync anchors.
3. **Plan C** — the big payoff: full offline history.
4. **Plan D** — convenience layer for partial-coverage devices.

Each plan ships independently. A and B can develop in parallel after A1–A2 land.

---

## 8. Open Decisions

Locked in:
- FY-partitioned, immutable archives (one file per closed FY per table).
- Current FY never archived — paged sync only.
- Statements never use aggregate fallbacks — line items or honest "reconnect" message.
- Server-driven snapshot generation.

To decide during implementation:

1. **Archive compression:** gzip (works in browser natively) vs. zstd (~30% smaller, needs wasm decoder). Start with gzip.
2. **Archive table list:** finalize which tables join into a statement description column — `inventory_bill_items`? `bill_items`? Verify by tracing the statement query.
3. **FY-close snapshot scope:** all chart-of-accounts entries vs. only entities-with-activity. Default: all, for completeness.
4. **Archive retention:** ✅ locked C10 (2026-05-28) — keep all closed FYs forever. Per-store storage cost is bounded by activity and stays in the single-digit-MB range per FY at our target scale. Cleanup, if ever needed, is a manual delete-by-prefix in the `archives` bucket plus clearing the `archive_*` columns on the matching `fiscal_periods` row.
5. **Backfill default behavior:** auto-download all FYs, or only on user opt-in for very old years. Default: auto-download all unless storage pressure indicates otherwise.
6. **Multi-currency:** archives must carry `balances` JSONB / amounts JSONB (already current in journal_entries post-V62) — confirm during C1.
7. **Fiscal year migration tool:** existing stores default to (1, 1). Provide a one-time UI to change it before first FY close.
8. **Year-end close reversibility:** what happens if a closed FY needs adjusting entries (legal correction)? Define a "reopen FY" admin action with audit trail.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Archive file generated under one schema, consumed under another | `manifest.schema_version` check; client refuses incompatible archives |
| Snapshot generation falls behind, statements show wrong opening balance | Coverage report + alerting; fallback to journal-derived calc |
| Past-dated edit not invalidating snapshots | DB trigger (not application code); covered by integration test |
| Long-offline device fails to catch up | Archive download is bounded; paged tail sync only needs to cover days since last archive |
| Browser memory blowout on large archive | Stream-process (DecompressionStream + line-by-line parse); never load full archive into a Buffer |
| Signed URL expires mid-download | Refresh URL on error, retry once |
| Race between FY close and concurrent posting | FY close runs in a transaction that locks the date range; reject posts to closed FY |

---

## 10. References

- `EVENT_DRIVEN_SYNC_ARCHITECTURE.md` — current sync model
- `JOURNAL_BASED_BALANCE_REVIEW.md` — balance-from-journal architecture
- `ATOMIC_TRANSACTIONS_NEW_ARCHITECTURE.md` — transaction posting rules
- `ARCHITECTURE_RULES.md` — data access layer rules
- `apps/store-app/src/services/syncService.ts` — paged sync engine (downloadTablePaged)
- `apps/store-app/src/services/syncConfig.ts` — tier definitions
- `apps/store-app/src/services/snapshotService.ts` — current snapshot logic
- `apps/store-app/src/services/entityBalanceService.ts` — three-phase batch algorithm (S250)
