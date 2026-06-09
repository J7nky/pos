-- 008-multi-currency follow-up: relax the legacy scalar `currency` CHECK guards.
--
-- The base schema created `transactions_currency_check` (and the sibling
-- *_currency_check guards on other money tables) as a hard-coded
-- `currency IN ('USD','LBP')` enumeration, dating from before the app supported
-- a per-store, self-serve set of accepted currencies. `CurrencyCode` now spans
-- ~20 ISO codes (USD, LBP, GBP, EUR, SAR, AED, EGP, JOD, SYP, TRY, …), so a
-- store transacting in anything other than USD/LBP produces rows that pass
-- locally (IndexedDB is the source of truth) but are rejected on upload with
-- Postgres error 23514:
--
--   new row for relation "transactions" violates check constraint
--   "transactions_currency_check"
--
-- The sync layer treats that 400 as unrecoverable and discards the row — which
-- is how editing a non-USD/LBP payment loses its reversal + correction rows.
--
-- Fix: drop the enumerated constraint and replace it with a format guard that
-- accepts any 3-letter uppercase ISO-style code. This decouples the database
-- from the application's evolving currency list (no per-currency constraint
-- edits) while still rejecting empty / lowercase / garbage values. The loop is
-- idempotent and only touches tables that actually carry a scalar `currency`
-- column, so it is safe to re-run and safe for tables that were already
-- generalized to JSONB amount maps (journal_entries, balance_snapshots).

DO $$
DECLARE
  tbl text;
  has_currency boolean;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'transactions',
    'bills',
    'inventory_items',
    'inventory_bills'
  ] LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = tbl
        AND column_name = 'currency'
    ) INTO has_currency;

    IF has_currency THEN
      EXECUTE format(
        'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
        tbl, tbl || '_currency_check'
      );
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (currency IS NULL OR currency ~ ''^[A-Z]{3}$'')',
        tbl, tbl || '_currency_check'
      );
    END IF;
  END LOOP;
END $$;
