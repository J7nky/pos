-- 018-balance-sheet foundational schema changes
-- Idempotent migration: safe to re-run.

ALTER TABLE IF EXISTS public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS sub_classification text NULL;

ALTER TABLE IF EXISTS public.journal_entries
  ADD COLUMN IF NOT EXISTS transfer_group_id text NULL;

CREATE INDEX IF NOT EXISTS idx_je_transfer_group_id
  ON public.journal_entries (transfer_group_id)
  WHERE transfer_group_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chart_of_accounts_sub_classification_check'
  ) THEN
    ALTER TABLE public.chart_of_accounts
      ADD CONSTRAINT chart_of_accounts_sub_classification_check
      CHECK (
        (
          account_type = 'asset'
          AND sub_classification IN ('current_asset', 'non_current_asset')
        )
        OR (
          account_type = 'liability'
          AND sub_classification IN ('current_liability', 'non_current_liability')
        )
        OR (
          account_type = 'equity'
          AND sub_classification IN ('equity')
        )
        OR (
          account_type IN ('asset', 'liability', 'equity')
          AND sub_classification IS NULL
        )
        OR (
          account_type IN ('revenue', 'expense')
          AND sub_classification IS NULL
        )
      );
  END IF;
END $$;

UPDATE public.chart_of_accounts
SET sub_classification = CASE
  WHEN account_type = 'asset' THEN
    CASE
      WHEN left(account_code, 1) = '1'
           AND coalesce(nullif(substring(account_code FROM 2 FOR 3), ''), '000') < '500'
        THEN 'current_asset'
      WHEN left(account_code, 1) = '1' THEN 'non_current_asset'
      ELSE NULL
    END
  WHEN account_type = 'liability' THEN
    CASE
      WHEN left(account_code, 1) = '2'
           AND coalesce(nullif(substring(account_code FROM 2 FOR 3), ''), '000') < '500'
        THEN 'current_liability'
      WHEN left(account_code, 1) = '2' THEN 'non_current_liability'
      ELSE NULL
    END
  WHEN account_type = 'equity' THEN
    CASE
      WHEN left(account_code, 1) = '3' THEN 'equity'
      ELSE NULL
    END
  ELSE NULL
END
WHERE sub_classification IS NULL;
