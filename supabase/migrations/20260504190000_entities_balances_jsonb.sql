-- 018-currency-dehardcode (Layer 7)
-- Add self-describing JSONB balance maps to `entities`. There are no
-- scalar `lb_balance`/`usd_balance`/`advance_*`/`*_max_balance` columns
-- on the Supabase side — those values are derived from journal entries
-- and only cached in the local Dexie copy. So this migration only adds
-- the JSONB columns; the backfill happens client-side in the Dexie
-- upgrade hook (apps/store-app/src/lib/dbSchema.ts: upgradeV61).
--
-- Shapes:
--   balances:         { "<CurrencyCode>": <balance>, ... }
--   advance_balances: { "<CurrencyCode>": <advance>, ... }
--   max_balances:     { "<CurrencyCode>": <max>, ... }

ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS balances JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS advance_balances JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS max_balances JSONB NOT NULL DEFAULT '{}'::jsonb;
