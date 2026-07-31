-- =========================================================================
--  Close the orphan-transaction gap in fiscal-period locking (tz-exact).
--
--  Problem:
--    The closed-fiscal-year guard `reject_post_to_closed_fy` (migration
--    20260528180000) fires only on `journal_entries`. But `transactions`
--    sync BEFORE their journal_entries (FK: journal_entries.transaction_id
--    → transactions.id). So a long-offline device posting into a period
--    that was closed server-side meanwhile uploads the transaction row
--    successfully (no trigger), then its journal_entries are rejected —
--    leaving a server transaction with NO ledger entries (an orphan header).
--
--  Fix:
--    A BEFORE INSERT/UPDATE/DELETE trigger on `transactions` mirroring the
--    journal_entries one, so the pair fails together. The client already
--    parks any closed-period rejection (status='blocked_period') for any
--    table and clears it on reopen (fiscalYearCloseService), so the
--    transaction now gets parked alongside its entries instead of orphaning.
--
--  Date basis — tz-EXACT:
--    Both triggers must gate on the SAME date or they can split at a
--    fiscal-period boundary (transaction accepted / entries rejected, or
--    vice-versa) — reintroducing an orphan. journal_entries gate on the
--    client-computed LOCAL `posted_date` (= getLocalDateString(created_at)).
--    So this migration ADDS `transactions.posted_date` (a date), which the
--    client now populates with the identical value, and the trigger gates on
--    it. For rows that predate the client change (or the few direct writers
--    that don't set it), the trigger COALESCEs to `created_at::date` so a
--    NULL posted_date can never slip a post past the guard.
--
--  DEPLOYMENT ORDER (hard requirement):
--    Apply this migration BEFORE shipping the client build that writes
--    `posted_date` — the sync upload sends the column, and Supabase would
--    reject the whole transaction upsert if the column didn't yet exist.
--    (Same prerequisite pattern as the correction-status column,
--    20260606130000.) The column is nullable + backfilled, so an OLDER
--    client that doesn't send it keeps working via the COALESCE fallback.
--
--  Idempotent + reversible (rollback block at the end).
-- =========================================================================

BEGIN;

-- 1. Client-populated local business date (mirrors journal_entries.posted_date).
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS posted_date date;

-- 2. Backfill existing rows so the trigger has a value to gate on. No
--    production data yet; created_at::date is the best available basis for
--    historical rows (their journal_entries already carry the exact date).
UPDATE public.transactions
  SET posted_date = created_at::date
  WHERE posted_date IS NULL;

-- 3. Trigger: reject posts/edits/deletes dated inside a closed period.
CREATE OR REPLACE FUNCTION public.reject_txn_post_to_closed_fy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  -- Prefer the client-computed local posted_date (byte-identical to the
  -- transaction's journal_entries). Fall back to created_at::date for rows
  -- written before posted_date existed, so a NULL can never bypass the guard.
  v_check_date date := COALESCE(
    NEW.posted_date, OLD.posted_date,
    NEW.created_at::date, OLD.created_at::date
  );
  v_store_id   uuid := COALESCE(NEW.store_id, OLD.store_id);
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.fiscal_periods
    WHERE store_id = v_store_id
      AND is_closed = true
      AND v_check_date BETWEEN start_date AND end_date
  ) THEN
    RAISE EXCEPTION 'Cannot post to closed fiscal year (date=%, store=%)',
      v_check_date, v_store_id
      USING ERRCODE = 'restrict_violation',
            HINT    = 'Call reopen_fiscal_year() before posting adjustments.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS transactions_reject_closed_fy ON public.transactions;
CREATE TRIGGER transactions_reject_closed_fy
  BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_txn_post_to_closed_fy();

COMMENT ON FUNCTION public.reject_txn_post_to_closed_fy() IS
  'BEFORE trigger on transactions that rejects any insert/update/delete whose '
  'posted_date (client local date, mirroring journal_entries; created_at::date '
  'fallback) falls inside a closed fiscal_periods range for the same store. '
  'Mirrors reject_post_to_closed_fy() on journal_entries so a transaction and '
  'its ledger entries fail together on the identical date (no orphan header, '
  'no boundary split). Use reopen_fiscal_year() to lift the restriction.';

COMMIT;

-- =========================================================================
--  ROLLBACK (manual)
-- =========================================================================
-- BEGIN;
--   DROP TRIGGER IF EXISTS transactions_reject_closed_fy ON public.transactions;
--   DROP FUNCTION IF EXISTS public.reject_txn_post_to_closed_fy();
--   ALTER TABLE public.transactions DROP COLUMN IF EXISTS posted_date;
-- COMMIT;
