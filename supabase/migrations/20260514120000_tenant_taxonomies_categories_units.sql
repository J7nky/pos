-- =========================================================================
--  Tenant-typed configurable taxonomies (Souq POS v64)
--  Replaces hardcoded TS literal unions on `products.category` and
--  `inventory_items.unit` with store-scoped, multilingual, admin-templated
--  tables. Mirrors the `chart_of_accounts` pattern.
--
--  Layers added:
--    1. `stores.tenant_type` (text, default 'produce_market')
--    2. `tenant_type_templates` — admin-managed seed templates
--    3. `product_categories` — store-scoped, multilingual, soft-deleted
--    4. `units_of_measure`   — store-scoped, multilingual, soft-deleted
--    5. `products.category_id` (FK) — dual-written with legacy `category` text
--    6. `inventory_items.unit_id` (FK) — dual-written with legacy `unit` text
--    7. RPC `seed_store_defaults_from_tenant_type(store_uuid, tenant_type_code)`
--
--  Backwards compatibility:
--    - Legacy `products.category` and `inventory_items.unit` columns are kept
--      for one release. A backfill step resolves them to FK ids.
--    - The dual-write rule lives in app-side services (see store-app's
--      `taxonomyService.ts`, `AddProductModal.tsx`, etc.).
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. stores.tenant_type
-- -------------------------------------------------------------------------
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS tenant_type text NOT NULL DEFAULT 'produce_market';

CREATE INDEX IF NOT EXISTS idx_stores_tenant_type ON stores (tenant_type);

COMMENT ON COLUMN stores.tenant_type IS
  'Tenant vertical (v64). Drives default categories + units seeded by '
  '`seed_store_defaults_from_tenant_type`. Free-form text so admin can add '
  'new types without DDL — allowed values are enforced application-side.';

-- -------------------------------------------------------------------------
-- 2. tenant_type_templates
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_type_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_type text NOT NULL UNIQUE,
  display_name jsonb NOT NULL,            -- { en, ar, fr }
  default_categories jsonb NOT NULL,      -- [{ code, name, sort_order }]
  default_units jsonb NOT NULL,           -- [{ code, name, system_role, sort_order }]
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_type_templates ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read the templates (used when creating a store).
DROP POLICY IF EXISTS "tenant_type_templates_select" ON tenant_type_templates;
CREATE POLICY "tenant_type_templates_select"
  ON tenant_type_templates FOR SELECT
  TO authenticated
  USING (true);

-- Only super_admin can mutate templates.
DROP POLICY IF EXISTS "tenant_type_templates_write" ON tenant_type_templates;
CREATE POLICY "tenant_type_templates_write"
  ON tenant_type_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'super_admin'
    )
  );

-- -------------------------------------------------------------------------
-- 3. product_categories
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code text NOT NULL,
  name jsonb NOT NULL,                    -- { en, ar, fr }
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean DEFAULT false,
  deleted_at timestamptz,
  CONSTRAINT product_categories_store_code_unique UNIQUE (store_id, code)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_store
  ON product_categories (store_id, is_active);

ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_categories_store_scope" ON product_categories;
CREATE POLICY "product_categories_store_scope"
  ON product_categories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (u.store_id = product_categories.store_id OR u.role = 'super_admin')
    )
  );

-- -------------------------------------------------------------------------
-- 4. units_of_measure
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS units_of_measure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code text NOT NULL,
  name jsonb NOT NULL,
  symbol text,
  system_role text CHECK (system_role IS NULL OR system_role IN ('mass','count','volume','length','pack')),
  conversion_to_base numeric,
  base_unit_code text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean DEFAULT false,
  deleted_at timestamptz,
  CONSTRAINT units_of_measure_store_code_unique UNIQUE (store_id, code)
);

CREATE INDEX IF NOT EXISTS idx_units_of_measure_store
  ON units_of_measure (store_id, is_active);

ALTER TABLE units_of_measure ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "units_of_measure_store_scope" ON units_of_measure;
CREATE POLICY "units_of_measure_store_scope"
  ON units_of_measure FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (u.store_id = units_of_measure.store_id OR u.role = 'super_admin')
    )
  );

-- -------------------------------------------------------------------------
-- 5. FK columns on products / inventory_items
-- -------------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES product_categories(id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products (category_id);

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES units_of_measure(id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_unit_id ON inventory_items (unit_id);

COMMENT ON COLUMN products.category_id IS
  'FK into product_categories (v64). Source of truth. The legacy text column '
  'products.category is dual-written for one release and will be dropped.';

COMMENT ON COLUMN inventory_items.unit_id IS
  'FK into units_of_measure (v64). Source of truth. The legacy text column '
  'inventory_items.unit is dual-written for one release and will be dropped.';

-- -------------------------------------------------------------------------
-- 6. Seed the produce_market template (idempotent)
-- -------------------------------------------------------------------------
INSERT INTO tenant_type_templates (tenant_type, display_name, default_categories, default_units)
VALUES (
  'produce_market',
  '{"en":"Produce Market","ar":"سوق الخضار والفواكه","fr":"Marché de fruits et légumes"}'::jsonb,
  $$[
    {"code":"fruits","name":{"en":"Fruits","ar":"فواكه","fr":"Fruits"},"sort_order":10},
    {"code":"tropical_fruits","name":{"en":"Tropical Fruits","ar":"فواكه استوائية","fr":"Fruits tropicaux"},"sort_order":20},
    {"code":"vegetables","name":{"en":"Vegetables","ar":"خضروات","fr":"Légumes"},"sort_order":30},
    {"code":"herbs","name":{"en":"Herbs/ Leafy","ar":"حشائش","fr":"Herbes"},"sort_order":40},
    {"code":"grains","name":{"en":"Grains","ar":"حبوب","fr":"Céréales"},"sort_order":50},
    {"code":"nuts","name":{"en":"Nuts","ar":"مكسرات","fr":"Noix"},"sort_order":60},
    {"code":"others","name":{"en":"Others","ar":"أخرى","fr":"Autres"},"sort_order":70}
  ]$$::jsonb,
  $$[
    {"code":"kg","name":{"en":"Kilogram","ar":"كيلوغرام","fr":"Kilogramme"},"system_role":"mass","sort_order":10},
    {"code":"piece","name":{"en":"Piece","ar":"قطعة","fr":"Pièce"},"system_role":"count","sort_order":20},
    {"code":"box","name":{"en":"Box","ar":"صندوق","fr":"Boîte"},"system_role":"pack","sort_order":30},
    {"code":"bag","name":{"en":"Bag","ar":"كيس","fr":"Sac"},"system_role":"pack","sort_order":40},
    {"code":"bundle","name":{"en":"Bundle","ar":"حزمة","fr":"Botte"},"system_role":"pack","sort_order":50},
    {"code":"dozen","name":{"en":"Dozen","ar":"دزينة","fr":"Douzaine"},"system_role":"count","sort_order":60}
  ]$$::jsonb
)
ON CONFLICT (tenant_type) DO NOTHING;

-- Seed a starter supermarket + pharmacy + electronics + general templates so
-- the admin app has options on day one. Admins can edit these later.
INSERT INTO tenant_type_templates (tenant_type, display_name, default_categories, default_units)
VALUES
  (
    'supermarket',
    '{"en":"Supermarket","ar":"سوبر ماركت","fr":"Supermarché"}'::jsonb,
    $$[
      {"code":"beverages","name":{"en":"Beverages","ar":"مشروبات","fr":"Boissons"},"sort_order":10},
      {"code":"dairy","name":{"en":"Dairy","ar":"ألبان","fr":"Produits laitiers"},"sort_order":20},
      {"code":"bakery","name":{"en":"Bakery","ar":"مخبوزات","fr":"Boulangerie"},"sort_order":30},
      {"code":"snacks","name":{"en":"Snacks","ar":"وجبات خفيفة","fr":"Collations"},"sort_order":40},
      {"code":"frozen","name":{"en":"Frozen","ar":"مجمدات","fr":"Surgelés"},"sort_order":50},
      {"code":"household","name":{"en":"Household","ar":"أدوات منزلية","fr":"Ménager"},"sort_order":60},
      {"code":"others","name":{"en":"Others","ar":"أخرى","fr":"Autres"},"sort_order":70}
    ]$$::jsonb,
    $$[
      {"code":"piece","name":{"en":"Piece","ar":"قطعة","fr":"Pièce"},"system_role":"count","sort_order":10},
      {"code":"liter","name":{"en":"Liter","ar":"لتر","fr":"Litre"},"system_role":"volume","sort_order":20},
      {"code":"kg","name":{"en":"Kilogram","ar":"كيلوغرام","fr":"Kilogramme"},"system_role":"mass","sort_order":30},
      {"code":"box","name":{"en":"Box","ar":"صندوق","fr":"Boîte"},"system_role":"pack","sort_order":40},
      {"code":"pack","name":{"en":"Pack","ar":"عبوة","fr":"Paquet"},"system_role":"pack","sort_order":50}
    ]$$::jsonb
  ),
  (
    'pharmacy',
    '{"en":"Pharmacy","ar":"صيدلية","fr":"Pharmacie"}'::jsonb,
    $$[
      {"code":"medications","name":{"en":"Medications","ar":"أدوية","fr":"Médicaments"},"sort_order":10},
      {"code":"vitamins","name":{"en":"Vitamins & Supplements","ar":"فيتامينات ومكملات","fr":"Vitamines"},"sort_order":20},
      {"code":"personal_care","name":{"en":"Personal Care","ar":"العناية الشخصية","fr":"Soins personnels"},"sort_order":30},
      {"code":"baby","name":{"en":"Baby Care","ar":"عناية بالطفل","fr":"Bébé"},"sort_order":40},
      {"code":"first_aid","name":{"en":"First Aid","ar":"إسعافات أولية","fr":"Premiers secours"},"sort_order":50},
      {"code":"others","name":{"en":"Others","ar":"أخرى","fr":"Autres"},"sort_order":60}
    ]$$::jsonb,
    $$[
      {"code":"tablet","name":{"en":"Tablet","ar":"قرص","fr":"Comprimé"},"system_role":"count","sort_order":10},
      {"code":"capsule","name":{"en":"Capsule","ar":"كبسولة","fr":"Capsule"},"system_role":"count","sort_order":20},
      {"code":"bottle","name":{"en":"Bottle","ar":"زجاجة","fr":"Bouteille"},"system_role":"pack","sort_order":30},
      {"code":"tube","name":{"en":"Tube","ar":"أنبوب","fr":"Tube"},"system_role":"pack","sort_order":40},
      {"code":"box","name":{"en":"Box","ar":"صندوق","fr":"Boîte"},"system_role":"pack","sort_order":50},
      {"code":"ml","name":{"en":"Milliliter","ar":"ملليلتر","fr":"Millilitre"},"system_role":"volume","sort_order":60}
    ]$$::jsonb
  ),
  (
    'electronics',
    '{"en":"Electronics","ar":"إلكترونيات","fr":"Électronique"}'::jsonb,
    $$[
      {"code":"phones","name":{"en":"Phones","ar":"هواتف","fr":"Téléphones"},"sort_order":10},
      {"code":"computers","name":{"en":"Computers","ar":"حواسيب","fr":"Ordinateurs"},"sort_order":20},
      {"code":"accessories","name":{"en":"Accessories","ar":"ملحقات","fr":"Accessoires"},"sort_order":30},
      {"code":"home_appliances","name":{"en":"Home Appliances","ar":"أجهزة منزلية","fr":"Électroménager"},"sort_order":40},
      {"code":"others","name":{"en":"Others","ar":"أخرى","fr":"Autres"},"sort_order":50}
    ]$$::jsonb,
    $$[
      {"code":"piece","name":{"en":"Piece","ar":"قطعة","fr":"Pièce"},"system_role":"count","sort_order":10},
      {"code":"set","name":{"en":"Set","ar":"طقم","fr":"Ensemble"},"system_role":"pack","sort_order":20},
      {"code":"box","name":{"en":"Box","ar":"صندوق","fr":"Boîte"},"system_role":"pack","sort_order":30}
    ]$$::jsonb
  ),
  (
    'general',
    '{"en":"General","ar":"عام","fr":"Général"}'::jsonb,
    $$[
      {"code":"general","name":{"en":"General","ar":"عام","fr":"Général"},"sort_order":10},
      {"code":"others","name":{"en":"Others","ar":"أخرى","fr":"Autres"},"sort_order":20}
    ]$$::jsonb,
    $$[
      {"code":"piece","name":{"en":"Piece","ar":"قطعة","fr":"Pièce"},"system_role":"count","sort_order":10},
      {"code":"kg","name":{"en":"Kilogram","ar":"كيلوغرام","fr":"Kilogramme"},"system_role":"mass","sort_order":20}
    ]$$::jsonb
  )
ON CONFLICT (tenant_type) DO NOTHING;

-- -------------------------------------------------------------------------
-- 7. RPC: seed defaults from a tenant_type template for a single store
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_store_defaults_from_tenant_type(
  store_uuid uuid,
  tenant_type_code text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  resolved_type text;
  tmpl record;
  cat jsonb;
  un jsonb;
BEGIN
  -- Resolve the tenant_type — prefer the passed code, otherwise look it up
  -- from the store row, otherwise fall back to 'produce_market'.
  IF tenant_type_code IS NULL THEN
    SELECT tenant_type INTO resolved_type FROM stores WHERE id = store_uuid;
  ELSE
    resolved_type := tenant_type_code;
  END IF;
  IF resolved_type IS NULL THEN
    resolved_type := 'produce_market';
  END IF;

  SELECT * INTO tmpl FROM tenant_type_templates WHERE tenant_type = resolved_type AND is_active = true;
  IF NOT FOUND THEN
    -- Try produce_market as a final fallback so the store still gets seeded.
    SELECT * INTO tmpl FROM tenant_type_templates WHERE tenant_type = 'produce_market' AND is_active = true;
    IF NOT FOUND THEN
      RAISE NOTICE 'No tenant_type template found; no defaults seeded for store %', store_uuid;
      RETURN;
    END IF;
  END IF;

  -- Insert categories (skip duplicates on (store_id, code)).
  FOR cat IN SELECT * FROM jsonb_array_elements(tmpl.default_categories)
  LOOP
    INSERT INTO product_categories (store_id, code, name, sort_order, is_active, is_system)
    VALUES (
      store_uuid,
      cat->>'code',
      cat->'name',
      COALESCE((cat->>'sort_order')::int, 100),
      true,
      true
    )
    ON CONFLICT (store_id, code) DO NOTHING;
  END LOOP;

  -- Insert units (skip duplicates on (store_id, code)).
  FOR un IN SELECT * FROM jsonb_array_elements(tmpl.default_units)
  LOOP
    INSERT INTO units_of_measure (store_id, code, name, system_role, sort_order, is_active, is_system)
    VALUES (
      store_uuid,
      un->>'code',
      un->'name',
      NULLIF(un->>'system_role', ''),
      COALESCE((un->>'sort_order')::int, 100),
      true,
      true
    )
    ON CONFLICT (store_id, code) DO NOTHING;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION seed_store_defaults_from_tenant_type(uuid, text) IS
  'Idempotently seeds product_categories + units_of_measure for a store from '
  'the tenant_type template. Called by the admin app immediately after '
  'createStore. Safe to retry.';

-- -------------------------------------------------------------------------
-- 8. Backfill existing stores: assign tenant_type and seed defaults
-- -------------------------------------------------------------------------
UPDATE stores SET tenant_type = 'produce_market' WHERE tenant_type IS NULL OR tenant_type = '';

DO $$
DECLARE
  s record;
BEGIN
  FOR s IN SELECT id, tenant_type FROM stores LOOP
    PERFORM seed_store_defaults_from_tenant_type(s.id, s.tenant_type);
  END LOOP;
END;
$$;

-- -------------------------------------------------------------------------
-- 9. Backfill products.category_id and inventory_items.unit_id
-- -------------------------------------------------------------------------
WITH legacy_to_code AS (
  SELECT p.id AS product_id, p.store_id,
    CASE LOWER(TRIM(COALESCE(p.category, 'others')))
      WHEN 'fruits' THEN 'fruits'
      WHEN 'tropical fruits' THEN 'tropical_fruits'
      WHEN 'vegetables' THEN 'vegetables'
      WHEN 'herbs' THEN 'herbs'
      WHEN 'herbs/leafy' THEN 'herbs'
      WHEN 'herbs/ leafy' THEN 'herbs'
      WHEN 'leafy' THEN 'herbs'
      WHEN 'grains' THEN 'grains'
      WHEN 'nuts' THEN 'nuts'
      WHEN 'others' THEN 'others'
      ELSE 'others'
    END AS code
  FROM products p
  WHERE p.category_id IS NULL AND p.store_id IS NOT NULL
)
UPDATE products p
SET category_id = pc.id
FROM legacy_to_code l
JOIN product_categories pc ON pc.store_id = l.store_id AND pc.code = l.code
WHERE p.id = l.product_id;

WITH legacy_units AS (
  SELECT i.id AS inv_id, i.store_id,
    CASE LOWER(TRIM(COALESCE(i.unit, 'piece')))
      WHEN 'kg' THEN 'kg'
      WHEN 'kilogram' THEN 'kg'
      WHEN 'kilogram (kg)' THEN 'kg'
      WHEN 'piece' THEN 'piece'
      WHEN 'pieces' THEN 'piece'
      WHEN 'pc' THEN 'piece'
      WHEN 'box' THEN 'box'
      WHEN 'boxes' THEN 'box'
      WHEN 'bag' THEN 'bag'
      WHEN 'bags' THEN 'bag'
      WHEN 'bundle' THEN 'bundle'
      WHEN 'bundles' THEN 'bundle'
      WHEN 'dozen' THEN 'dozen'
      WHEN 'dozens' THEN 'dozen'
      ELSE 'piece'
    END AS code
  FROM inventory_items i
  WHERE i.unit_id IS NULL AND i.store_id IS NOT NULL
)
UPDATE inventory_items i
SET unit_id = u.id
FROM legacy_units l
JOIN units_of_measure u ON u.store_id = l.store_id AND u.code = l.code
WHERE i.id = l.inv_id;

COMMIT;
