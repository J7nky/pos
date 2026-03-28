# Dual-path parity (SyncService vs EventStream)

## What runs in production

The app does **not** run two full reconciliation engines in parallel for the same row. In normal use:

- **SyncService** (`syncService.sync`) handles uploads, bulk downloads, deletion detection, and metadata.
- **EventStreamService** subscribes to `branch_event_log` and applies **incremental** row updates when events arrive.

Both paths must **converge on the same IndexedDB shape** for a given remote row. If they diverge, the event-driven path is **incorrect relative to sync**, not an alternate valid outcome.

## What the parity suite checks

Scenario **`dual_path_sync_vs_eventstream`** (see `paritySync.scenarios.test.ts`):

1. Seed the **same** contract-mock server row for `products` and the same local store/branch.
2. **Arm A:** run `syncService.sync` so the product is applied via the **download** pipeline.
3. Reset DB + mock state; seed **identically** again.
4. **Arm B:** run `eventStreamService.parityBaselineProcessEvent` so the product is applied via **fetch + `updateIndexedDB`** (same production pipeline as catch-up).
5. Build a **minimal** snapshot (`buildDualPathParityPayload`): `localSnapshot.products` + `serverSnapshot.products` only, `syncResult: null`, empty `syncMetadata`.
6. Assert **normalized** payloads are **deep-equal**; then assert against `dual_path_sync_vs_eventstream.golden.json`.

If Arm A ≠ Arm B, the test fails **before** the golden check — that is the “new system is wrong” signal.

## Typical console sequence (user action → sync)

When a user action creates unsynced rows, hooks trigger `triggerSync`, `useSyncStateLayer` runs `performSync`, and **SyncService** logs timing and per-table uploads. A representative sequence (timestamps vary):

1. **DB hooks** — new/updated rows get `_synced: false` (`db.ts`).
2. **SyncTrigger** — `triggerSync()` debounced; unsynced count updated; auto-sync timer may be set (e.g. safety delay when multiple rows pending).
3. **Focus / lifecycle** — `useOfflineSyncLifecycle` may schedule auto-sync on window focus.
4. **Sync start** — `useSyncStateLayer`: `[SYNC] Starting AUTO sync`, permission cache invalidation, validation cache.
5. **SyncService** — connectivity check, unsynced counts, **upload** per table (e.g. `inventory_items` → `transactions` → `bills` → `journal_entries` → `bill_line_items` → `bill_audit_logs`), optional **event emission** logs after upload, then **download** passes per `SYNC_TABLES`, then **deletion detection** per table.
6. **Completion** — `performSync` finishes, local data refresh, `Layout` may reload permissions, **AUTO-SYNC** / **FOCUS-SYNC** logs repeat as idle/focus handlers run.

**Event stream** logs (when enabled) appear on a separate cadence: `[EventStream] Starting event stream`, callback after processed events, `refreshData`. Parity does not require matching **log text** — only **structured DB + mock server** equality for the dual-path scenario.

## Related files

- Golden: `tests/sync-baseline/dual_path_sync_vs_eventstream.golden.json`
- Payload helper: `snapshotHelpers.ts` → `buildDualPathParityPayload`
