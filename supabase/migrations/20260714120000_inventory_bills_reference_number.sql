-- =============================================================================
-- Migration: inventory_bills_reference_number
-- Description: Adds an auto-generated, human-readable `reference_number` to
--              received inventory bills (e.g. 'INV-A1B2C3D4'). Assigned by the
--              client at receive time from the batch id, so it lines up with the
--              audit-log reference for the same bill. Displayed in the Recent
--              Receives table and the received-bill sales-logs modal.
--
-- Nullable: bills created before this migration simply leave it NULL and the UI
-- falls back to a dash. No historical backfill (test data only).
-- =============================================================================

ALTER TABLE public.inventory_bills
  ADD COLUMN IF NOT EXISTS reference_number TEXT;

-- Speed up "look up a bill by its reference number" within a store.
CREATE INDEX IF NOT EXISTS idx_inventory_bills_reference_number
  ON public.inventory_bills (store_id, reference_number);
