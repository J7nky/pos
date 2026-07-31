-- =========================================================================
--  Server-side ledger tamper-resistance: journal_entries financial columns
--  are immutable once posted.
--
--  Rationale:
--    journal_entries are the source of truth for all balances. Corrections
--    NEVER edit a posted entry — they INSERT a reversing entry plus a new
--    one (accountBalanceService / transactionService / billOperations all
--    push new rows). So a posted entry's financial identity — its per-currency
--    `amounts` and its `account_code` — must never change. audit_logs already
--    has an immutability trigger; journal_entries had none, so a malicious or
--    buggy client could UPDATE a synced entry's amounts and silently rewrite
--    history (balances are derived from these rows).
--
--  Scope (deliberately narrow — verified safe):
--    Blocks UPDATEs that change `amounts` or `account_code`. It intentionally
--    ALLOWS the only legitimate journal_entries updates in the codebase, all
--    of which touch linkage/metadata, never the money:
--      - bill_id backfill (receivedItemsJournalService, inventoryPurchaseService,
--        billOperations),
--      - entry_type / reversal_of_journal_entry_id linkage (accountBalanceService),
--      - posted_date / fiscal_period repair (salaryAccrualService legacy fix),
--      - _synced and other sync metadata.
--    A blanket "no UPDATE" rule would break those, so we guard only the core.
--
--  Notes:
--    - A re-sync of a linkage/metadata edit upserts the full row with UNCHANGED
--      amounts, so `IS DISTINCT FROM` is false and the update passes.
--    - A future server migration that must legitimately rewrite amounts should
--      wrap itself in `ALTER TABLE public.journal_entries DISABLE TRIGGER
--      journal_entries_financial_immutability; ... ENABLE TRIGGER ...`.
--    - Validate against the live schema before applying: assumes
--      journal_entries has `amounts jsonb` and `account_code text`.
--
--  Idempotent + reversible (rollback block at the end).
-- =========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.reject_journal_entry_financial_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.amounts IS DISTINCT FROM OLD.amounts
     OR NEW.account_code IS DISTINCT FROM OLD.account_code THEN
    RAISE EXCEPTION
      'journal_entries financial fields are immutable (id=%): amounts / account_code cannot change on a posted entry',
      OLD.id
      USING ERRCODE = 'restrict_violation',
            HINT    = 'Reverse the entry with a new correcting entry instead of editing it in place.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journal_entries_financial_immutability ON public.journal_entries;
CREATE TRIGGER journal_entries_financial_immutability
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_journal_entry_financial_mutation();

COMMENT ON FUNCTION public.reject_journal_entry_financial_mutation() IS
  'BEFORE UPDATE trigger on journal_entries that rejects any change to amounts '
  'or account_code (the double-entry core). Linkage/metadata updates (bill_id, '
  'entry_type, posted_date, fiscal_period, reversal linkage, _synced) are '
  'allowed. Corrections must reverse+repost, never edit a posted entry.';

COMMIT;

-- =========================================================================
--  ROLLBACK (manual)
-- =========================================================================
-- BEGIN;
--   DROP TRIGGER IF EXISTS journal_entries_financial_immutability ON public.journal_entries;
--   DROP FUNCTION IF EXISTS public.reject_journal_entry_financial_mutation();
-- COMMIT;
