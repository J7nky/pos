-- =====================================================================
-- Migration: add_inventory_loss_event_entity_type
-- Date: 2026-07-07
--
-- Spec 019 (inventory loss & shrinkage) emits an `inventory_loss_posted`
-- event with entity_type = 'inventory_loss_event'. The live
-- branch_event_log.valid_entity_type CHECK constraint predates that spec
-- and rejects the value, so every loss/reversal upload fails with:
--   new row for relation "branch_event_log" violates check constraint
--   "valid_entity_type"
--
-- The original constraint is not tracked in this repo (live-schema drift).
-- This migration drops and re-creates it with the complete set of entity
-- types the client actually emits to branch_event_log. That set spans TWO
-- files: services/eventEmissionService.ts (named helpers) and direct
-- emitEvent() calls in services/syncUpload.ts. Values like customer/supplier/
-- employee are Entity.entity_type, NOT event types — those emit as 'entity'.
-- Idempotent: safe to re-run.
-- =====================================================================

ALTER TABLE public.branch_event_log
  DROP CONSTRAINT IF EXISTS valid_entity_type;

ALTER TABLE public.branch_event_log
  ADD CONSTRAINT valid_entity_type CHECK (
    entity_type IN (
      'bill',
      'branch',
      'cash_drawer_account',
      'cash_drawer_session',
      'chart_of_account',
      'entity',
      'inventory_bill',
      'inventory_item',
      'inventory_loss_event',
      'journal_entry',
      'product',
      'reminder',
      'role_permissions',
      'store',
      'transaction',
      'user',
      'user_module_access',
      'user_permissions'
    )
  );
