-- Country & accepted currencies on stores (Phase 2 multi-currency schema widening)
-- See specs/014-country-currency-schema/data-model.md Entity 1

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'LB';

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS accepted_currencies TEXT[] NOT NULL DEFAULT ARRAY['LBP', 'USD']::TEXT[];

-- Back-fill accepted_currencies from preferred_currency (R2); only rows still at schema default
UPDATE public.stores
SET accepted_currencies = CASE
  WHEN preferred_currency = 'USD' THEN ARRAY['USD']::TEXT[]
  ELSE ARRAY[preferred_currency::TEXT, 'USD']::TEXT[]
END
WHERE accepted_currencies = ARRAY['LBP', 'USD']::TEXT[];
