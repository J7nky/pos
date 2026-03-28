# SYNC_TABLES coverage matrix (parity baseline)

Source of table list: [sync-tables.json](./sync-tables.json) (must match `SYNC_TABLES` in `src/services/syncService.ts`).

| table | scenarioId(s) | Notes |
| --- | --- | --- |
| stores | upload_dependency_order, download_remote_to_local, deletion_detection, concurrent_sync_reentry, event_driven_reconciliation | |
| branches | upload_dependency_order, download_remote_to_local, deletion_detection, concurrent_sync_reentry, event_driven_reconciliation | |
| products | download_remote_to_local, deletion_detection, event_driven_reconciliation, dual_path_sync_vs_eventstream, chaos_out_of_order_events, chaos_duplicate_events, chaos_dropped_then_recovered | dual_path + chaos assert sync download ≡ event fetch under adversarial delivery |
| users | GAP | Not exercised in minimal parity suite; add scenario when touching RBAC sync |
| cash_drawer_accounts | GAP | |
| chart_of_accounts | GAP | |
| entities | delete_propagation, payment_affects_balance | delete_propagation: deletion detection removes entity; payment_affects_balance: entity lands via sync download |
| inventory_bills | inventory_adjustment_chain | Sync download + inventory_received event; dual-path on inventory_items quantity |
| inventory_items | inventory_adjustment_chain | Dual-path (sync download vs inventory_received event); quantity invariant checked |
| transactions | sale_cascade, payment_affects_balance | Landed via sync download in both scenarios |
| bills | sale_cascade | Sync download + sale_posted event cascade; bill+line_item dual-path equality |
| journal_entries | sale_cascade, payment_affects_balance | Double-entry invariant (debit == credit per transaction_id) enforced by assertInvariants |
| balance_snapshots | GAP | |
| bill_line_items | sale_cascade | sale_posted event cascade fetches bill_line_items; orphan + total invariants checked |
| bill_audit_logs | GAP | |
| cash_drawer_sessions | GAP | |
| missed_products | GAP | |
| reminders | GAP | |
| role_permissions | GAP | |
| user_permissions | GAP | |

**GAP** rows require a follow-up scenario or an approved indirect justification before `parity:coverage-matrix` is switched to fail-on-gap.

## Phase 1 pressure scenarios added (2026-03-27)

| scenarioId | file | invariants |
| --- | --- | --- |
| sale_cascade | paritySync.scenarios.test.ts | bill total ≈ sum(line_items); no orphans; debit==credit |
| payment_affects_balance | paritySync.scenarios.test.ts | debit==credit per transaction_id |
| inventory_adjustment_chain | paritySync.scenarios.test.ts | quantity equality sync vs event |
| delete_propagation | paritySync.scenarios.test.ts | entity removed by deletion detection |
| chaos_out_of_order_events | paritySync.chaos.test.ts | final state == sync arm after OOO delivery |
| chaos_duplicate_events | paritySync.chaos.test.ts | idempotent: 2× event == 1× event |
| chaos_dropped_then_recovered | paritySync.chaos.test.ts | recovery event converges to sync arm |
