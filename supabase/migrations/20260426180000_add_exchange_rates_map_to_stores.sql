-- Phase 10 (008-multi-currency-country, Task 17a)
-- Add a JSONB map of CurrencyCode → rate-vs-USD on stores so that a store
-- accepting more than one non-USD currency (e.g. LBP + EUR) can carry a
-- rate per currency, not just the legacy scalar `exchange_rate` (which
-- only describes the primary local currency).
--
-- The legacy scalar `exchange_rate` column is kept and continues to mirror
-- the rate of the store's `preferred_currency` so existing reads keep
-- working until 009-live-rates / a follow-up generalization migration.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS exchange_rates JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Back-fill from the existing scalar exchange_rate for legacy rows that
-- have not yet had their map populated. USD itself is implicitly 1 and
-- is intentionally omitted from the map.
UPDATE public.stores
SET exchange_rates = jsonb_build_object(preferred_currency::text, exchange_rate)
WHERE preferred_currency <> 'USD'
  AND exchange_rate IS NOT NULL
  AND exchange_rate > 0
  AND (exchange_rates IS NULL OR exchange_rates = '{}'::jsonb);
