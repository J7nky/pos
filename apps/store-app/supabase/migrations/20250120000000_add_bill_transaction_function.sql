-- Add RPC function for creating bills with line items in a single transaction
-- This prevents the "PrematureCommitError" by ensuring atomicity

CREATE OR REPLACE FUNCTION create_bill_with_line_items(
  bill_data jsonb,
  line_items_data jsonb[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_bill_id uuid;
  new_bill jsonb;
  line_item jsonb;
BEGIN
  -- Start transaction
  BEGIN
    -- Insert the bill first
    INSERT INTO bills (
      store_id,
      bill_number,
      customer_id,
      customer_name,
      subtotal,
      total_amount,
      payment_method,
      payment_status,
      amount_paid,
      amount_due,
      bill_date,
      notes,
      status,
      created_by
    ) VALUES (
      (bill_data->>'store_id')::uuid,
      bill_data->>'bill_number',
      CASE WHEN bill_data->>'customer_id' IS NOT NULL THEN (bill_data->>'customer_id')::uuid ELSE NULL END,
      bill_data->>'customer_name',
      COALESCE((bill_data->>'subtotal')::numeric, 0),
      COALESCE((bill_data->>'total_amount')::numeric, 0),
      bill_data->>'payment_method',
      bill_data->>'payment_status',
      COALESCE((bill_data->>'amount_paid')::numeric, 0),
      COALESCE((bill_data->>'amount_due')::numeric, 0),
      COALESCE((bill_data->>'bill_date')::timestamptz, now()),
      bill_data->>'notes',
      COALESCE(bill_data->>'status', 'active'),
      (bill_data->>'created_by')::uuid
    )
    RETURNING id INTO new_bill_id;

    -- Insert line items
    IF line_items_data IS NOT NULL AND array_length(line_items_data, 1) > 0 THEN
      FOR i IN 1..array_length(line_items_data, 1) LOOP
        line_item := line_items_data[i];
        
        INSERT INTO bill_line_items (
          store_id,
          bill_id,
          product_id,
          product_name,
          supplier_id,
          supplier_name,
          inventory_item_id,
          quantity,
          unit_price,
          line_total,
          weight,
          notes,
          line_order
        ) VALUES (
          (line_item->>'store_id')::uuid,
          new_bill_id,
          (line_item->>'product_id')::uuid,
          line_item->>'product_name',
          (line_item->>'supplier_id')::uuid,
          line_item->>'supplier_name',
          CASE WHEN line_item->>'inventory_item_id' IS NOT NULL THEN (line_item->>'inventory_item_id')::uuid ELSE NULL END,
          (line_item->>'quantity')::numeric,
          (line_item->>'unit_price')::numeric,
          (line_item->>'line_total')::numeric,
          CASE WHEN line_item->>'weight' IS NOT NULL THEN (line_item->>'weight')::numeric ELSE NULL END,
          line_item->>'notes',
          COALESCE((line_item->>'line_order')::integer, i)
        );
      END LOOP;
    END IF;

    -- Get the created bill with all its data
    SELECT to_jsonb(b.*) INTO new_bill
    FROM bills b
    WHERE b.id = new_bill_id;

    -- Return the created bill
    RETURN new_bill;

  EXCEPTION
    WHEN OTHERS THEN
      -- Rollback transaction on any error
      RAISE EXCEPTION 'Failed to create bill: %', SQLERRM;
  END;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_bill_with_line_items TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION create_bill_with_line_items IS 'Creates a bill with line items in a single atomic transaction to prevent PrematureCommitError';

