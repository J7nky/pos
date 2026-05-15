-- =========================================================================
--  Tenant-scoped global products (follow-up to v64 taxonomy + default-products)
--
--  Problem: legacy `is_global=true` products (banana, apple, cucumber, etc.)
--  were created before tenant types existed. They were shown to every store
--  via `getAvailableProducts`, so an Electronics or Pharmacy store would see
--  produce SKUs after the v64 rollout.
--
--  Fix: add `products.tenant_type` so a global product can be marked as
--  belonging to one specific vertical. The store-app's `getAvailableProducts`
--  now filters globals as:
--      tenant_type IS NULL  →  visible to every store (universal)
--      tenant_type = X      →  visible only to stores where stores.tenant_type = X
--
--  Backfill: every existing global is assumed to be produce_market content
--  (which matches the legacy seed list). Store owners / super-admins can
--  reassign individual globals later via the admin app.
-- =========================================================================

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tenant_type text;

CREATE INDEX IF NOT EXISTS idx_products_tenant_type
  ON products (tenant_type)
  WHERE tenant_type IS NOT NULL;

COMMENT ON COLUMN products.tenant_type IS
  'Optional tenant vertical tag (v64+). Only meaningful for global products '
  '(is_global=true): a global with tenant_type=''pharmacy'' is shown only to '
  'pharmacy stores. NULL means universal — visible to every store. Store-'
  'specific products (is_global=false) ignore this column.';

-- Backfill legacy globals → produce_market. Safe to run repeatedly.
UPDATE products
SET tenant_type = 'produce_market'
WHERE is_global = true
  AND tenant_type IS NULL;

COMMIT;
