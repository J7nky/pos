-- =========================================================================
--  Tenant-type default products (follow-up to v64 taxonomy migration)
--
--  Adds `default_products` to `tenant_type_templates` and extends the
--  `seed_store_defaults_from_tenant_type` RPC so that newly-created stores
--  receive a starter set of store-scoped products (NOT global) appropriate
--  to the chosen tenant_type:
--    - produce_market: banana, apple, cucumber, tomato, etc.
--    - supermarket: bread, milk, eggs, etc.
--    - pharmacy: paracetamol, ibuprofen, vitamin C, etc.
--    - electronics: phone, charger, headphones, etc.
--
--  Each seeded product gets `store_id = <new store>`, `is_global = false`,
--  and `category_id` resolved through the previously-seeded categories. The
--  store owner can edit/delete these products freely — changes affect that
--  store only.
--
--  Idempotent: re-running the RPC will skip products whose `(store_id, name)`
--  already exist.
-- =========================================================================

BEGIN;

-- 1. Add column
ALTER TABLE tenant_type_templates
  ADD COLUMN IF NOT EXISTS default_products jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN tenant_type_templates.default_products IS
  'Per-tenant starter SKUs seeded into a newly-created store. Each element: '
  '{ name: { en, ar, fr }, category_code: text, image?: text }. '
  '`category_code` is resolved to category_id via the same-store seeded categories.';

-- 2. Populate default_products for the existing templates


UPDATE tenant_type_templates
SET default_products = $$[
  {"name":{"en":"Water 1.5L","ar":"ماء 1.5 لتر","fr":"Eau 1,5 L"},"category_code":"beverages"},
  {"name":{"en":"Cola 330ml","ar":"كولا 330 مل","fr":"Cola 330 ml"},"category_code":"beverages"},
  {"name":{"en":"Orange Juice 1L","ar":"عصير برتقال 1 لتر","fr":"Jus d'orange 1 L"},"category_code":"beverages"},
  {"name":{"en":"Milk 1L","ar":"حليب 1 لتر","fr":"Lait 1 L"},"category_code":"dairy"},
  {"name":{"en":"Yogurt 500g","ar":"لبن 500 غ","fr":"Yaourt 500 g"},"category_code":"dairy"},
  {"name":{"en":"Cheese 200g","ar":"جبنة 200 غ","fr":"Fromage 200 g"},"category_code":"dairy"},
  {"name":{"en":"Eggs (12)","ar":"بيض (12)","fr":"Œufs (12)"},"category_code":"dairy"},
  {"name":{"en":"Bread","ar":"خبز","fr":"Pain"},"category_code":"bakery"},
  {"name":{"en":"Croissant","ar":"كرواسون","fr":"Croissant"},"category_code":"bakery"},
  {"name":{"en":"Chips","ar":"رقائق بطاطس","fr":"Chips"},"category_code":"snacks"},
  {"name":{"en":"Chocolate Bar","ar":"لوح شوكولاتة","fr":"Barre chocolatée"},"category_code":"snacks"},
  {"name":{"en":"Frozen Pizza","ar":"بيتزا مجمدة","fr":"Pizza surgelée"},"category_code":"frozen"},
  {"name":{"en":"Ice Cream 500ml","ar":"آيس كريم 500 مل","fr":"Glace 500 ml"},"category_code":"frozen"},
  {"name":{"en":"Dish Soap","ar":"صابون أطباق","fr":"Liquide vaisselle"},"category_code":"household"},
  {"name":{"en":"Toilet Paper","ar":"ورق تواليت","fr":"Papier toilette"},"category_code":"household"}
]$$::jsonb
WHERE tenant_type = 'supermarket';

UPDATE tenant_type_templates
SET default_products = $$[
  {"name":{"en":"Paracetamol 500mg","ar":"باراسيتامول 500 ملغ","fr":"Paracétamol 500 mg"},"category_code":"medications"},
  {"name":{"en":"Ibuprofen 400mg","ar":"إيبوبروفين 400 ملغ","fr":"Ibuprofène 400 mg"},"category_code":"medications"},
  {"name":{"en":"Aspirin 100mg","ar":"أسبرين 100 ملغ","fr":"Aspirine 100 mg"},"category_code":"medications"},
  {"name":{"en":"Amoxicillin 500mg","ar":"أموكسيسيلين 500 ملغ","fr":"Amoxicilline 500 mg"},"category_code":"medications"},
  {"name":{"en":"Cough Syrup","ar":"شراب سعال","fr":"Sirop contre la toux"},"category_code":"medications"},
  {"name":{"en":"Vitamin C 1000mg","ar":"فيتامين سي 1000 ملغ","fr":"Vitamine C 1000 mg"},"category_code":"vitamins"},
  {"name":{"en":"Vitamin D3","ar":"فيتامين د3","fr":"Vitamine D3"},"category_code":"vitamins"},
  {"name":{"en":"Multivitamin","ar":"فيتامينات متعددة","fr":"Multivitamines"},"category_code":"vitamins"},
  {"name":{"en":"Toothpaste","ar":"معجون أسنان","fr":"Dentifrice"},"category_code":"personal_care"},
  {"name":{"en":"Shampoo","ar":"شامبو","fr":"Shampooing"},"category_code":"personal_care"},
  {"name":{"en":"Hand Sanitizer","ar":"معقم اليدين","fr":"Gel hydroalcoolique"},"category_code":"personal_care"},
  {"name":{"en":"Baby Formula","ar":"حليب أطفال","fr":"Lait infantile"},"category_code":"baby"},
  {"name":{"en":"Diapers","ar":"حفاضات","fr":"Couches"},"category_code":"baby"},
  {"name":{"en":"Bandages","ar":"ضمادات","fr":"Pansements"},"category_code":"first_aid"},
  {"name":{"en":"Antiseptic Cream","ar":"كريم مطهر","fr":"Crème antiseptique"},"category_code":"first_aid"}
]$$::jsonb
WHERE tenant_type = 'pharmacy';

UPDATE tenant_type_templates
SET default_products = $$[
  {"name":{"en":"Smartphone","ar":"هاتف ذكي","fr":"Smartphone"},"category_code":"phones"},
  {"name":{"en":"Phone Charger","ar":"شاحن هاتف","fr":"Chargeur de téléphone"},"category_code":"accessories"},
  {"name":{"en":"Phone Case","ar":"غطاء هاتف","fr":"Coque de téléphone"},"category_code":"accessories"},
  {"name":{"en":"Headphones","ar":"سماعات","fr":"Écouteurs"},"category_code":"accessories"},
  {"name":{"en":"Laptop","ar":"حاسوب محمول","fr":"Ordinateur portable"},"category_code":"computers"},
  {"name":{"en":"Mouse","ar":"فأرة","fr":"Souris"},"category_code":"computers"},
  {"name":{"en":"Keyboard","ar":"لوحة مفاتيح","fr":"Clavier"},"category_code":"computers"},
  {"name":{"en":"USB Cable","ar":"كابل USB","fr":"Câble USB"},"category_code":"accessories"},
  {"name":{"en":"Microwave","ar":"ميكروويف","fr":"Four à micro-ondes"},"category_code":"home_appliances"},
  {"name":{"en":"Kettle","ar":"غلاية كهربائية","fr":"Bouilloire"},"category_code":"home_appliances"}
]$$::jsonb
WHERE tenant_type = 'electronics';

-- 'general' tenant type intentionally has no seed products.

-- 3. Extend the seed RPC to also insert products
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
  prod jsonb;
  resolved_category_id uuid;
  product_name_en text;
BEGIN
  -- Resolve tenant_type
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
    SELECT * INTO tmpl FROM tenant_type_templates WHERE tenant_type = 'produce_market' AND is_active = true;
    IF NOT FOUND THEN
      RAISE NOTICE 'No tenant_type template found; no defaults seeded for store %', store_uuid;
      RETURN;
    END IF;
  END IF;

  -- (a) Categories
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

  -- (b) Units
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

  -- (c) Default products — store-scoped (is_global = false). Each product's
  --     category_id is resolved via the just-seeded product_categories for
  --     this same store. Skips duplicates by English name to be idempotent.
  FOR prod IN SELECT * FROM jsonb_array_elements(tmpl.default_products)
  LOOP
    SELECT id INTO resolved_category_id
      FROM product_categories
      WHERE store_id = store_uuid AND code = (prod->>'category_code');

    IF resolved_category_id IS NULL THEN
      RAISE NOTICE 'Skipping product (category not found): % in store %', prod->>'category_code', store_uuid;
      CONTINUE;
    END IF;

    product_name_en := prod->'name'->>'en';

    -- Idempotency check: skip if a product with the same English name
    -- already exists in this store. (We compare on the JSONB->en surface
    -- because there is no UNIQUE constraint on `products.name`.)
    IF EXISTS (
      SELECT 1 FROM products
      WHERE store_id = store_uuid
        AND ((name::jsonb)->>'en' = product_name_en
             OR name::text = product_name_en)
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO products (
      store_id,
      name,
      category_id,
      category,
      image,
      is_global,
      created_at,
      updated_at
    ) VALUES (
      store_uuid,
      prod->'name',
      resolved_category_id,
      product_name_en,           -- dual-write legacy text column
      COALESCE(prod->>'image', ''),
      false,
      now(),
      now()
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION seed_store_defaults_from_tenant_type(uuid, text) IS
  'Seeds product_categories + units_of_measure + default starter products '
  'into a new store, scoped to that store only (products have is_global=false). '
  'Called by the admin app immediately after store creation. Idempotent: safe '
  'to retry — skips rows whose (store_id, code) or (store_id, name.en) already exist.';

COMMIT;
