-- 018-currency-dehardcode (Layer 8 finalization)
-- Drop the deprecated USD/LBP scalar columns from journal_entries and
-- balance_snapshots. The JSONB `amounts` (journal_entries) and `balances`
-- (balance_snapshots) maps are now the only source of per-currency data.
--
-- This migration is destructive but safe in this codebase: there is no
-- production data yet (testing-only), and Phase 11a's earlier migration
-- (20260426181000_generalize_accounting_columns_to_jsonb.sql) already
-- back-filled the JSONB maps from the scalar columns for any rows that
-- might exist.
--
-- NOTE: The `entities` table never carried scalar balance columns on the
-- Supabase side (lb_balance/usd_balance live only in the local Dexie
-- cache, derived from journal entries). The Dexie-side cleanup of those
-- fields happens in upgradeV62 (apps/store-app/src/lib/dbSchema.ts).

ALTER TABLE public.journal_entries
  DROP COLUMN IF EXISTS debit_usd,
  DROP COLUMN IF EXISTS credit_usd,
  DROP COLUMN IF EXISTS debit_lbp,
  DROP COLUMN IF EXISTS credit_lbp;

ALTER TABLE public.balance_snapshots
  DROP COLUMN IF EXISTS balance_usd,
  DROP COLUMN IF EXISTS balance_lbp;
