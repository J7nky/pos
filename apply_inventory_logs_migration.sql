-- Apply Inventory Logs Migration
-- Run this script in your Supabase SQL editor to create the inventory_logs table and related functionality

-- Create inventory_logs table
CREATE TABLE IF NOT EXISTS inventory_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('received', 'sold', 'adjusted', 'transferred', 'damaged', 'expired')),
  quantity_change integer NOT NULL,
  quantity_before integer NOT NULL,
  quantity_after integer NOT NULL,
  unit_price decimal(10,2),
  total_value decimal(10,2),
  currency text NOT NULL CHECK (currency IN ('USD', 'LBP')),
  reference_type text,
  reference_id uuid,
  reference_description text,
  notes text,
  created_by uuid NOT NULL REFERENCES users(id),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Add inventory_log_id column to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS inventory_log_id uuid REFERENCES inventory_logs(id);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_inventory_logs_inventory_item_id ON inventory_logs(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_product_id ON inventory_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_supplier_id ON inventory_logs(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_action ON inventory_logs(action);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_reference_type ON inventory_logs(reference_type);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_reference_id ON inventory_logs(reference_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_created_at ON inventory_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_store_id ON inventory_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_transactions_inventory_log_id ON transactions(inventory_log_id);

-- Enable Row Level Security
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS Policy for inventory_logs
CREATE POLICY "Users can access own store inventory logs" ON inventory_logs
  FOR ALL TO authenticated
  USING (store_id IN (SELECT store_id FROM users WHERE id = auth.uid()));

-- Create function to automatically create inventory logs when inventory items are updated
CREATE OR REPLACE FUNCTION create_inventory_log()
RETURNS TRIGGER AS $$
DECLARE
  action_type text;
  quantity_change integer;
  reference_type text;
  reference_id uuid;
  reference_description text;
BEGIN
  -- Determine action type based on quantity change
  IF TG_OP = 'INSERT' THEN
    action_type := 'received';
    quantity_change := NEW.quantity;
    reference_type := 'inventory_receipt';
    reference_id := NEW.id;
    reference_description := 'Inventory received';
  ELSIF TG_OP = 'UPDATE' THEN
    quantity_change := NEW.quantity - OLD.quantity;
    
    IF quantity_change > 0 THEN
      action_type := 'received';
      reference_type := 'inventory_adjustment';
      reference_description := 'Inventory adjusted (increase)';
    ELSIF quantity_change < 0 THEN
      action_type := 'sold';
      reference_type := 'inventory_adjustment';
      reference_description := 'Inventory adjusted (decrease)';
    ELSE
      -- No quantity change, skip log
      RETURN NEW;
    END IF;
    
    reference_id := NEW.id;
  ELSE
    -- DELETE operation
    action_type := 'adjusted';
    quantity_change := -OLD.quantity;
    reference_type := 'inventory_deletion';
    reference_id := OLD.id;
    reference_description := 'Inventory deleted';
  END IF;

  -- Insert inventory log
  INSERT INTO inventory_logs (
    inventory_item_id,
    product_id,
    supplier_id,
    action,
    quantity_change,
    quantity_before,
    quantity_after,
    unit_price,
    total_value,
    currency,
    reference_type,
    reference_id,
    reference_description,
    created_by,
    store_id
  ) VALUES (
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.product_id, OLD.product_id),
    COALESCE(NEW.supplier_id, OLD.supplier_id),
    action_type,
    quantity_change,
    CASE 
      WHEN TG_OP = 'INSERT' THEN 0
      ELSE OLD.quantity
    END,
    CASE 
      WHEN TG_OP = 'DELETE' THEN 0
      ELSE NEW.quantity
    END,
    COALESCE(NEW.price, OLD.price),
    CASE 
      WHEN COALESCE(NEW.price, OLD.price) IS NOT NULL 
      THEN ABS(quantity_change) * COALESCE(NEW.price, OLD.price)
      ELSE NULL
    END,
    'USD', -- Default currency, can be made configurable
    reference_type,
    reference_id,
    reference_description,
    COALESCE(NEW.received_by, OLD.received_by),
    COALESCE(NEW.store_id, OLD.store_id)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for inventory_logs
CREATE TRIGGER trigger_create_inventory_log
  AFTER INSERT OR UPDATE OR DELETE ON inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION create_inventory_log();

-- Create function to link transactions to inventory logs
CREATE OR REPLACE FUNCTION link_transaction_to_inventory_log(
  p_transaction_id uuid,
  p_inventory_log_id uuid
)
RETURNS void AS $$
BEGIN
  UPDATE transactions 
  SET inventory_log_id = p_inventory_log_id
  WHERE id = p_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to get inventory logs for a transaction
CREATE OR REPLACE FUNCTION get_transaction_inventory_logs(p_transaction_id uuid)
RETURNS TABLE (
  log_id uuid,
  inventory_item_id uuid,
  product_name text,
  supplier_name text,
  action text,
  quantity_change integer,
  quantity_before integer,
  quantity_after integer,
  unit_price decimal(10,2),
  total_value decimal(10,2),
  currency text,
  reference_description text,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    il.id as log_id,
    il.inventory_item_id,
    p.name as product_name,
    s.name as supplier_name,
    il.action,
    il.quantity_change,
    il.quantity_before,
    il.quantity_after,
    il.unit_price,
    il.total_value,
    il.currency,
    il.reference_description,
    il.created_at
  FROM inventory_logs il
  JOIN products p ON il.product_id = p.id
  JOIN suppliers s ON il.supplier_id = s.id
  JOIN transactions t ON il.id = t.inventory_log_id
  WHERE t.id = p_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to get inventory logs for a specific inventory item
CREATE OR REPLACE FUNCTION get_inventory_item_logs(p_inventory_item_id uuid)
RETURNS TABLE (
  log_id uuid,
  action text,
  quantity_change integer,
  quantity_before integer,
  quantity_after integer,
  unit_price decimal(10,2),
  total_value decimal(10,2),
  currency text,
  reference_type text,
  reference_description text,
  created_at timestamptz,
  created_by_name text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    il.id as log_id,
    il.action,
    il.quantity_change,
    il.quantity_before,
    il.quantity_after,
    il.unit_price,
    il.total_value,
    il.currency,
    il.reference_type,
    il.reference_description,
    il.created_at,
    u.name as created_by_name
  FROM inventory_logs il
  JOIN users u ON il.created_by = u.id
  WHERE il.inventory_item_id = p_inventory_item_id
  ORDER BY il.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate FIFO cost for inventory items
CREATE OR REPLACE FUNCTION calculate_fifo_cost(
  p_product_id uuid,
  p_supplier_id uuid,
  p_quantity integer
)
RETURNS TABLE (
  total_cost decimal(10,2),
  average_unit_cost decimal(10,2),
  currency text
) AS $$
DECLARE
  total_cost_val decimal(10,2) := 0;
  total_quantity integer := 0;
  avg_cost decimal(10,2) := 0;
  currency_val text := 'USD';
BEGIN
  -- Calculate total cost using FIFO method
  SELECT 
    COALESCE(SUM(il.total_value), 0),
    COALESCE(SUM(ABS(il.quantity_change)), 0),
    il.currency
  INTO total_cost_val, total_quantity, currency_val
  FROM inventory_logs il
  WHERE il.product_id = p_product_id 
    AND il.supplier_id = p_supplier_id
    AND il.action = 'received'
    AND il.quantity_change > 0;

  -- Calculate average unit cost
  IF total_quantity > 0 THEN
    avg_cost := total_cost_val / total_quantity;
  END IF;

  RETURN QUERY SELECT total_cost_val, avg_cost, currency_val;
END;
$$ LANGUAGE plpgsql;

-- Create view for inventory movement summary
CREATE OR REPLACE VIEW inventory_movement_summary AS
SELECT 
  p.name as product_name,
  s.name as supplier_name,
  il.action,
  COUNT(*) as movement_count,
  SUM(ABS(il.quantity_change)) as total_quantity_moved,
  AVG(il.unit_price) as average_unit_price,
  SUM(il.total_value) as total_value,
  il.currency,
  il.store_id,
  DATE(il.created_at) as movement_date
FROM inventory_logs il
JOIN products p ON il.product_id = p.id
JOIN suppliers s ON il.supplier_id = s.id
GROUP BY p.name, s.name, il.action, il.currency, il.store_id, DATE(il.created_at)
ORDER BY movement_date DESC, product_name, supplier_name;

-- Create view for transaction inventory details
CREATE OR REPLACE VIEW transaction_inventory_details AS
SELECT 
  t.id as transaction_id,
  t.type as transaction_type,
  t.amount as transaction_amount,
  t.currency as transaction_currency,
  t.description as transaction_description,
  t.store_id,
  il.id as inventory_log_id,
  il.action as inventory_action,
  il.quantity_change,
  il.quantity_before,
  il.quantity_after,
  il.unit_price as inventory_unit_price,
  il.total_value as inventory_total_value,
  il.currency as inventory_currency,
  p.name as product_name,
  s.name as supplier_name,
  il.reference_description,
  il.created_at as inventory_log_created_at
FROM transactions t
LEFT JOIN inventory_logs il ON t.inventory_log_id = il.id
LEFT JOIN products p ON il.product_id = p.id
LEFT JOIN suppliers s ON il.supplier_id = s.id
ORDER BY t.created_at DESC; 