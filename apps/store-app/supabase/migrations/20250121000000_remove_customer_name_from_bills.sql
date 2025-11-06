-- Remove customer_name column from bills table
-- This column was removed from the application but still exists in the database

-- Drop the customer_name column from bills table
ALTER TABLE bills DROP COLUMN IF EXISTS customer_name;

-- Update the search_bills function to remove customer_name references
CREATE OR REPLACE FUNCTION search_bills(
  p_store_id uuid,
  p_search_term text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_payment_status text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  bill_number text,
  total_amount numeric,
  payment_status text,
  bill_date timestamp with time zone,
  customer_id uuid,
  customer_name text,
  notes text
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.bill_number,
    b.total_amount,
    b.payment_status,
    b.bill_date,
    b.customer_id,
    COALESCE(c.name, 'Walk-in Customer') as customer_name,
    b.notes
  FROM bills b
  LEFT JOIN customers c ON b.customer_id = c.id
  WHERE b.store_id = p_store_id
    AND (p_status IS NULL OR b.status = p_status)
    AND (p_payment_status IS NULL OR b.payment_status = p_payment_status)
    AND (p_start_date IS NULL OR b.bill_date::date >= p_start_date)
    AND (p_end_date IS NULL OR b.bill_date::date <= p_end_date)
    AND (p_search_term IS NULL OR (
      b.bill_number ILIKE '%' || p_search_term || '%' OR
      c.name ILIKE '%' || p_search_term || '%' OR
      b.notes ILIKE '%' || p_search_term || '%'
    ))
  ORDER BY b.bill_date DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Update the create_bill_with_line_items function to remove customer_name
CREATE OR REPLACE FUNCTION create_bill_with_line_items(
  bill_data jsonb,
  line_items_data jsonb[]
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  new_bill_id uuid;
  line_item jsonb;
BEGIN
  -- Insert the bill
  INSERT INTO bills (
    id,
    store_id,
    bill_number,
    customer_id,
    subtotal,
    total_amount,
    payment_method,
    payment_status,
    amount_paid,
    amount_due,
    bill_date,
    notes,
    status,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    COALESCE((bill_data->>'id')::uuid, gen_random_uuid()),
    (bill_data->>'store_id')::uuid,
    bill_data->>'bill_number',
    CASE WHEN bill_data->>'customer_id' IS NOT NULL THEN (bill_data->>'customer_id')::uuid ELSE NULL END,
    COALESCE((bill_data->>'subtotal')::numeric, 0),
    COALESCE((bill_data->>'total_amount')::numeric, 0),
    (bill_data->>'payment_method')::text::payment_method_enum,
    (bill_data->>'payment_status')::text::payment_status_enum,
    COALESCE((bill_data->>'amount_paid')::numeric, 0),
    COALESCE((bill_data->>'amount_due')::numeric, 0),
    COALESCE((bill_data->>'bill_date')::timestamp with time zone, NOW()),
    bill_data->>'notes',
    COALESCE((bill_data->>'status')::text::bill_status_enum, 'active'),
    (bill_data->>'created_by')::uuid,
    COALESCE((bill_data->>'created_at')::timestamp with time zone, NOW()),
    COALESCE((bill_data->>'updated_at')::timestamp with time zone, NOW())
  ) RETURNING id INTO new_bill_id;

  -- Insert line items
  FOREACH line_item IN ARRAY line_items_data
  LOOP
    INSERT INTO bill_line_items (
      id,
      store_id,
      bill_id,
      inventory_item_id,
      product_id,
      supplier_id,
      quantity,
      unit_price,
      line_total,
      received_value,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      COALESCE((line_item->>'id')::uuid, gen_random_uuid()),
      (line_item->>'store_id')::uuid,
      new_bill_id,
      (line_item->>'inventory_item_id')::uuid,
      (line_item->>'product_id')::uuid,
      (line_item->>'supplier_id')::uuid,
      (line_item->>'quantity')::numeric,
      (line_item->>'unit_price')::numeric,
      (line_item->>'line_total')::numeric,
      (line_item->>'received_value')::numeric,
      (line_item->>'created_by')::uuid,
      COALESCE((line_item->>'created_at')::timestamp with time zone, NOW()),
      COALESCE((line_item->>'updated_at')::timestamp with time zone, NOW())
    );
  END LOOP;

  RETURN new_bill_id;
END;
$$;
