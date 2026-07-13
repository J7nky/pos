-- =============================================================================
-- Migration: inventory_loss_shrinkage
-- Spec: 019-inventory-loss-shrinkage
-- Description: Lot-scoped inventory loss ledger for the three loss types of the
--              per-bill produce market:
--                shrinkage — automatic weight loss recognized at bill close
--                            (weight-tracked lots; dehydration etc.)
--                lost      — manual write-off of missing counted units
--                spoiled   — manual write-off of wasted/expired counted units
--
--              Owned-lot losses post Dr 5950 (Inventory Loss / Shrinkage) /
--              Cr 1300 (Inventory) via transactionService (transaction_id set).
--              Commission-lot losses are memo-only (transaction_id NULL) — the
--              loss belongs to the consignor; COGS=0 model posts no 1300 asset.
--
--              Also extends inventory_items with the per-lot tracking-mode
--              columns: weight_tracked (immutable, set at receiving),
--              weight_remaining (live on-hand weight), nominal_unit_weight
--              (received weight ÷ received units — attributes a proportional
--              weight to whole-unit losses so unit losses and residual weight
--              shrinkage never double-count).
--
--              Reversal model mirrors transactions (20260606130000): a reversal
--              inserts a linked row and flips the original to status='reversed'.
--              Rows are therefore NOT append-only (status/reversed_by_id mutate
--              once); no immutability trigger.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. inventory_items: per-lot tracking-mode columns (additive, idempotent)
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS weight_tracked      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weight_remaining    NUMERIC,
  ADD COLUMN IF NOT EXISTS nominal_unit_weight NUMERIC;

-- Backfill live weight for existing lots (test data only — see
-- project_no_production_data_yet): remaining starts at the frozen received
-- weight; nominal per-unit weight derives where both inputs exist.
UPDATE public.inventory_items
SET weight_remaining = weight
WHERE weight_remaining IS NULL AND weight IS NOT NULL;

UPDATE public.inventory_items
SET nominal_unit_weight = weight / NULLIF(received_quantity, 0)
WHERE nominal_unit_weight IS NULL
  AND weight IS NOT NULL
  AND received_quantity IS NOT NULL
  AND received_quantity > 0;

-- ---------------------------------------------------------------------------
-- 2. inventory_loss_events table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_loss_events (
  id                 UUID        NOT NULL DEFAULT gen_random_uuid(),
  store_id           UUID        NOT NULL,
  branch_id          UUID        NOT NULL,
  -- The specific lot (per-supplier-bill stock line) the loss belongs to.
  inventory_item_id  UUID        NOT NULL,
  -- Denormalized for reporting (by-product / by-bill breakdowns).
  product_id         UUID        NOT NULL,
  batch_id           UUID,
  reason             TEXT        NOT NULL
                     CHECK (reason IN ('shrinkage', 'lost', 'spoiled')),
  source             TEXT        NOT NULL
                     CHECK (source IN ('auto_close', 'manual')),
  -- Units lost (0 for pure residual-weight shrinkage).
  quantity           NUMERIC     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  -- Weight lost: residual weight (shrinkage) or units × nominal_unit_weight
  -- (unit loss on a weight-tracked lot). NULL for quantity-only lots.
  weight             NUMERIC     CHECK (weight IS NULL OR weight >= 0),
  -- Cost-basis snapshot at time of loss (per-weight for weight-tracked lots,
  -- per-unit otherwise) — later price edits never rewrite loss history.
  unit_cost          NUMERIC     NOT NULL DEFAULT 0,
  currency           TEXT        NOT NULL,
  loss_value         NUMERIC     NOT NULL DEFAULT 0 CHECK (loss_value >= 0),
  -- Commission lots: memo-only (transaction_id stays NULL, no journal entry).
  is_commission      BOOLEAN     NOT NULL DEFAULT false,
  transaction_id     TEXT,
  -- Lifecycle (mirrors transactions correction lineage).
  status             TEXT        NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'reversed')),
  reversal_of_id     UUID,
  reversed_by_id     UUID,
  notes              TEXT,
  created_by         UUID        NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Sync metadata (CG-09; convention of all synced tables in this project).
  _synced            BOOLEAN     DEFAULT true,
  _deleted           BOOLEAN     DEFAULT false,

  CONSTRAINT inventory_loss_events_pkey PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- 3. Indexes (mirror the Dexie read patterns)
-- ---------------------------------------------------------------------------
-- Branch-scoped hydration + report period scans.
CREATE INDEX IF NOT EXISTS idx_loss_events_store_branch
  ON public.inventory_loss_events (store_id, branch_id, created_at DESC);

-- Per-lot history ("losses on this lot") and close-time reconciliation.
CREATE INDEX IF NOT EXISTS idx_loss_events_item
  ON public.inventory_loss_events (inventory_item_id);

-- Per-bill reconciliation and by-supplier reporting.
CREATE INDEX IF NOT EXISTS idx_loss_events_batch
  ON public.inventory_loss_events (batch_id);

-- ---------------------------------------------------------------------------
-- 4. Row Level Security (store-scoped, same convention as audit_logs et al.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_loss_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loss_events_select_own_store" ON public.inventory_loss_events;
CREATE POLICY "loss_events_select_own_store" ON public.inventory_loss_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (u.store_id = inventory_loss_events.store_id OR u.role = 'super_admin')
    )
  );

DROP POLICY IF EXISTS "loss_events_insert_own_store" ON public.inventory_loss_events;
CREATE POLICY "loss_events_insert_own_store" ON public.inventory_loss_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (u.store_id = inventory_loss_events.store_id OR u.role = 'super_admin')
    )
  );

-- Updates are limited in practice to the reversal flip (status/reversed_by_id/
-- updated_at) authored by the offline client; RLS scopes them to the store.
DROP POLICY IF EXISTS "loss_events_update_own_store" ON public.inventory_loss_events;
CREATE POLICY "loss_events_update_own_store" ON public.inventory_loss_events
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (u.store_id = inventory_loss_events.store_id OR u.role = 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (u.store_id = inventory_loss_events.store_id OR u.role = 'super_admin')
    )
  );

-- No DELETE policy: losses are reversed, never deleted (soft-delete via
-- _deleted flag syncs as an UPDATE and is covered by the update policy).

-- ---------------------------------------------------------------------------
-- 5. Seed account 5950 (Inventory Loss / Shrinkage) for existing stores
-- ---------------------------------------------------------------------------
-- New stores receive 5950 from DEFAULT_CHART_OF_ACCOUNTS at store creation;
-- this idempotently backfills every store that already has a chart.
-- NOTE: chart_of_accounts does NOT carry the usual sync-metadata columns
-- (_synced/_deleted) or updated_at that types/database.ts claims — the live
-- table is narrower than the repo's types (discovered via two failed INSERT
-- attempts on this migration: 42703 on updated_at, then on _synced). This
-- table is small reference data seeded once via an external, uncommitted
-- Supabase RPC (create_default_chart_of_accounts — see
-- chart_of_accounts_rpc_gap memory), not a _synced/_deleted-tracked table
-- like the event-driven tables. Only write columns confirmed to exist:
-- id, store_id, account_code, account_name, account_type, requires_entity,
-- is_active, created_at (matches the shape of DEFAULT_CHART_OF_ACCOUNTS in
-- constants/chartOfAccounts.ts). Do not reintroduce updated_at/_synced/
-- _deleted here without first confirming against the live schema.
INSERT INTO public.chart_of_accounts
  (id, store_id, account_code, account_name, account_type, requires_entity, is_active, created_at)
SELECT
  gen_random_uuid(),
  s.store_id,
  '5950',
  'Inventory Loss / Shrinkage',
  'expense',
  false,
  true,
  now()
FROM (SELECT DISTINCT store_id FROM public.chart_of_accounts) s
WHERE NOT EXISTS (
  SELECT 1 FROM public.chart_of_accounts c
  WHERE c.store_id = s.store_id AND c.account_code = '5950'
);
