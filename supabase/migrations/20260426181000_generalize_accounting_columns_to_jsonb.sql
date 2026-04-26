-- Phase 11a (008-multi-currency-country, Tasks 16a + 16b)
-- Replace the hard-coded USD/LBP scalar columns on journal_entries and
-- balance_snapshots with self-describing JSONB maps keyed by CurrencyCode.
-- The deprecated columns are kept during the dual-write transition so
-- existing read paths keep working; Phase 11d will drop them once
-- staging has confirmed every read path consumes the JSONB map.
--
-- journal_entries.amounts shape:
--   { "<CurrencyCode>": { "debit": <number>, "credit": <number> }, ... }
--   e.g. { "AED": { "debit": 500, "credit": 0 }, "USD": { "debit": 0, "credit": 136.6 } }
--
-- balance_snapshots.balances shape:
--   { "<CurrencyCode>": <balance>, ... }
--   e.g. { "AED": 12500, "USD": 3402.7 }

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS amounts JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Back-fill the amounts map from the existing scalar columns. Only rows
-- that still carry the schema default ('{}') are touched, so re-running
-- the migration is a no-op for already-migrated rows.
UPDATE public.journal_entries
SET amounts = (
  CASE WHEN debit_usd <> 0 OR credit_usd <> 0
       THEN jsonb_build_object('USD', jsonb_build_object('debit', debit_usd, 'credit', credit_usd))
       ELSE '{}'::jsonb END
  ||
  CASE WHEN debit_lbp <> 0 OR credit_lbp <> 0
       THEN jsonb_build_object('LBP', jsonb_build_object('debit', debit_lbp, 'credit', credit_lbp))
       ELSE '{}'::jsonb END
)
WHERE amounts = '{}'::jsonb;

ALTER TABLE public.balance_snapshots
  ADD COLUMN IF NOT EXISTS balances JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.balance_snapshots
SET balances = (
  CASE WHEN balance_usd <> 0
       THEN jsonb_build_object('USD', balance_usd)
       ELSE '{}'::jsonb END
  ||
  CASE WHEN balance_lbp <> 0
       THEN jsonb_build_object('LBP', balance_lbp)
       ELSE '{}'::jsonb END
)
WHERE balances = '{}'::jsonb;
