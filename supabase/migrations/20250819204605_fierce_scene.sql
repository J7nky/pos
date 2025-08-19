/*
  # Create bill management tables

  1. New Tables
    - `bills`
      - `id` (uuid, primary key)
      - `store_id` (uuid, foreign key to stores)
      - `bill_number` (text, unique bill identifier)
      - `customer_id` (uuid, foreign key to customers, nullable)
      - `customer_name` (text, cached customer name)
      - Financial fields: subtotal, tax_amount, discount_amount, total_amount
      - Payment fields: payment_method, payment_status, amount_paid, amount_due
      - Date fields: bill_date, due_date
      - Metadata: notes, status, created_by, timestamps

    - `bill_line_items`
      - `id` (uuid, primary key)
      - `store_id` (uuid, foreign key to stores)
      - `bill_id` (uuid, foreign key to bills)
      - Product fields: product_id, product_name, supplier_id, supplier_name
      - `inventory_item_id` (uuid, foreign key to inventory_items, nullable)
      - Quantity and pricing: quantity, unit_price, line_total
      - Additional: weight, notes, line_order
      - Timestamps: created_at, updated_at

    - `bill_audit_logs`
      - `id` (uuid, primary key)
      - `store_id` (uuid, foreign key to stores)
      - `bill_id` (uuid, foreign key to bills)
      - Audit fields: action, field_changed, old_value, new_value
      - Metadata: change_reason, changed_by, ip_address, user_agent
      - Timestamps: created_at, updated_at

  2. Security
    - Enable RLS on all bill management tables
    - Add policies for users to access bills from their store only
    - Restrict sensitive operations to appropriate user roles

  3. Indexes
    - Performance indexes for bill queries
    - Audit trail indexes for tracking changes
*/

-- Create bills table
CREATE TABLE IF NOT EXISTS bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  bill_number text NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  tax_amount numeric(10,2) NOT NULL DEFAULT 0,
  discount_amount numeric(10,2) NOT NULL DEFAULT 0,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'card', 'credit')),
  payment_status text NOT NULL CHECK (payment_status IN ('paid', 'partial', 'pending')),
  amount_paid numeric(10,2) NOT NULL DEFAULT 0,
  amount_due numeric(10,2) NOT NULL DEFAULT 0,
  bill_date timestamptz NOT NULL DEFAULT now(),
  due_date timestamptz,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'refunded')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_modified_by uuid REFERENCES users(id),
  last_modified_at timestamptz,
  
  -- Constraints
  CONSTRAINT bills_store_bill_number_unique UNIQUE (store_id, bill_number),
  CONSTRAINT bills_amounts_valid CHECK (
    subtotal >= 0 AND 
    tax_amount >= 0 AND 
    discount_amount >= 0 AND 
    total_amount >= 0 AND
    amount_paid >= 0 AND
    amount_due >= 0
  )
);

-- Create bill line items table
CREATE TABLE IF NOT EXISTS bill_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  bill_id uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  product_name text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  supplier_name text NOT NULL,
  inventory_item_id uuid REFERENCES inventory_items(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(10,2) NOT NULL CHECK (line_total >= 0),
  weight numeric(10,2),
  notes text,
  line_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create bill audit logs table
CREATE TABLE IF NOT EXISTS bill_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  bill_id uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'item_added', 'item_removed', 'item_modified', 'payment_updated')),
  field_changed text,
  old_value text,
  new_value text,
  change_reason text,
  changed_by uuid NOT NULL REFERENCES users(id),
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bills_store_id ON bills(store_id);
CREATE INDEX IF NOT EXISTS idx_bills_bill_number ON bills(bill_number);
CREATE INDEX IF NOT EXISTS idx_bills_customer_id ON bills(customer_id);
CREATE INDEX IF NOT EXISTS idx_bills_bill_date ON bills(bill_date);
CREATE INDEX IF NOT EXISTS idx_bills_payment_status ON bills(payment_status);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_composite_search ON bills(store_id, bill_date DESC, payment_status);
CREATE INDEX IF NOT EXISTS idx_bills_customer_bills ON bills(customer_id, bill_date DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bills_active ON bills(store_id, bill_date DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_bills_pending_payment ON bills(store_id, due_date) WHERE payment_status IN ('pending', 'partial');

CREATE INDEX IF NOT EXISTS idx_bill_line_items_bill_id ON bill_line_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_product_id ON bill_line_items(product_id);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_supplier_id ON bill_line_items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_inventory_item_id ON bill_line_items(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_store_id ON bill_line_items(store_id);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_composite ON bill_line_items(bill_id, line_order);

CREATE INDEX IF NOT EXISTS idx_bill_audit_logs_bill_id ON bill_audit_logs(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_audit_logs_changed_by ON bill_audit_logs(changed_by);
CREATE INDEX IF NOT EXISTS idx_bill_audit_logs_created_at ON bill_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_bill_audit_logs_action ON bill_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_bill_audit_logs_store_id ON bill_audit_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_bill_audit_logs_timeline ON bill_audit_logs(bill_id, created_at DESC);

-- Enable RLS on all tables
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_audit_logs ENABLE ROW LEVEL SECURITY;

-- Bills RLS policies
CREATE POLICY "Users can view store bills"
  ON bills FOR SELECT
  TO authenticated
  USING (store_id IN (
    SELECT store_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can create store bills"
  ON bills FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IN (SELECT store_id FROM users WHERE id = auth.uid()) AND
    created_by = auth.uid()
  );

CREATE POLICY "Managers and admins can update bills"
  ON bills FOR UPDATE
  TO authenticated
  USING (
    store_id IN (SELECT store_id FROM users WHERE id = auth.uid()) AND
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    store_id IN (SELECT store_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Admins can delete bills"
  ON bills FOR DELETE
  TO authenticated
  USING (
    store_id IN (SELECT store_id FROM users WHERE id = auth.uid()) AND
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

-- Bill line items RLS policies
CREATE POLICY "Users can access line items from their store"
  ON bill_line_items FOR ALL
  TO authenticated
  USING (store_id IN (
    SELECT store_id FROM users WHERE id = auth.uid()
  ));

-- Bill audit logs RLS policies
CREATE POLICY "Users can view audit logs from their store"
  ON bill_audit_logs FOR SELECT
  TO authenticated
  USING (store_id IN (
    SELECT store_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "System can create audit logs"
  ON bill_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (store_id IN (
    SELECT store_id FROM users WHERE id = auth.uid()
  ));

-- Create trigger function for automatic audit logging
CREATE OR REPLACE FUNCTION log_bill_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Log the change
  INSERT INTO bill_audit_logs (
    store_id,
    bill_id,
    action,
    field_changed,
    old_value,
    new_value,
    change_reason,
    changed_by,
    user_agent
  ) VALUES (
    COALESCE(NEW.store_id, OLD.store_id),
    COALESCE(NEW.id, OLD.id),
    CASE 
      WHEN TG_OP = 'INSERT' THEN 'created'
      WHEN TG_OP = 'UPDATE' THEN 'updated'
      WHEN TG_OP = 'DELETE' THEN 'deleted'
    END,
    'bill_record',
    CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)::text ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' THEN row_to_json(NEW)::text 
         WHEN TG_OP = 'UPDATE' THEN row_to_json(NEW)::text 
         ELSE NULL END,
    'Automatic audit log',
    COALESCE(NEW.last_modified_by, NEW.created_by, OLD.created_by),
    current_setting('request.headers', true)::json->>'user-agent'
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger function for automatic total recalculation
CREATE OR REPLACE FUNCTION update_bill_totals()
RETURNS TRIGGER AS $$
DECLARE
  bill_record bills%ROWTYPE;
  new_subtotal numeric(10,2);
BEGIN
  -- Get the bill record
  SELECT * INTO bill_record FROM bills WHERE id = COALESCE(NEW.bill_id, OLD.bill_id);
  
  -- Calculate new subtotal from all line items
  SELECT COALESCE(SUM(line_total), 0) INTO new_subtotal
  FROM bill_line_items 
  WHERE bill_id = bill_record.id;
  
  -- Update bill totals
  UPDATE bills SET
    subtotal = new_subtotal,
    total_amount = new_subtotal + tax_amount - discount_amount,
    amount_due = new_subtotal + tax_amount - discount_amount - amount_paid,
    updated_at = now()
  WHERE id = bill_record.id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
DO $$
BEGIN
  -- Drop triggers if they exist
  DROP TRIGGER IF EXISTS bills_audit_trigger ON bills;
  DROP TRIGGER IF EXISTS bill_line_items_totals_trigger ON bill_line_items;
  
  -- Create triggers
  CREATE TRIGGER bills_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON bills
    FOR EACH ROW EXECUTE FUNCTION log_bill_changes();

  CREATE TRIGGER bill_line_items_totals_trigger
    AFTER INSERT OR UPDATE OR DELETE ON bill_line_items
    FOR EACH ROW EXECUTE FUNCTION update_bill_totals();
END $$;

-- Create utility functions for bill management
CREATE OR REPLACE FUNCTION get_bill_details(bill_uuid uuid)
RETURNS TABLE(
  bill_info json,
  line_items json,
  audit_trail json
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    row_to_json(b.*) as bill_info,
    COALESCE(
      json_agg(
        json_build_object(
          'id', bli.id,
          'product_id', bli.product_id,
          'product_name', bli.product_name,
          'supplier_id', bli.supplier_id,
          'supplier_name', bli.supplier_name,
          'quantity', bli.quantity,
          'unit_price', bli.unit_price,
          'line_total', bli.line_total,
          'weight', bli.weight,
          'notes', bli.notes,
          'line_order', bli.line_order
        ) ORDER BY bli.line_order
      ) FILTER (WHERE bli.id IS NOT NULL),
      '[]'::json
    ) as line_items,
    COALESCE(
      json_agg(
        json_build_object(
          'id', bal.id,
          'action', bal.action,
          'field_changed', bal.field_changed,
          'old_value', bal.old_value,
          'new_value', bal.new_value,
          'change_reason', bal.change_reason,
          'changed_by', bal.changed_by,
          'created_at', bal.created_at
        ) ORDER BY bal.created_at DESC
      ) FILTER (WHERE bal.id IS NOT NULL),
      '[]'::json
    ) as audit_trail
  FROM bills b
  LEFT JOIN bill_line_items bli ON b.id = bli.bill_id
  LEFT JOIN bill_audit_logs bal ON b.id = bal.bill_id
  WHERE b.id = bill_uuid
  GROUP BY b.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to search bills with filters
CREATE OR REPLACE FUNCTION search_bills(
  p_store_id uuid,
  p_search_term text DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_payment_status text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  bill_number text,
  customer_name text,
  total_amount numeric,
  payment_status text,
  bill_date timestamptz,
  status text,
  line_items_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.bill_number,
    b.customer_name,
    b.total_amount,
    b.payment_status,
    b.bill_date,
    b.status,
    COUNT(bli.id) as line_items_count
  FROM bills b
  LEFT JOIN bill_line_items bli ON b.id = bli.bill_id
  WHERE b.store_id = p_store_id
    AND (p_search_term IS NULL OR (
      b.bill_number ILIKE '%' || p_search_term || '%' OR
      b.customer_name ILIKE '%' || p_search_term || '%' OR
      b.notes ILIKE '%' || p_search_term || '%'
    ))
    AND (p_date_from IS NULL OR b.bill_date::date >= p_date_from)
    AND (p_date_to IS NULL OR b.bill_date::date <= p_date_to)
    AND (p_payment_status IS NULL OR b.payment_status = p_payment_status)
    AND (p_customer_id IS NULL OR b.customer_id = p_customer_id)
    AND (p_status IS NULL OR b.status = p_status)
  GROUP BY b.id
  ORDER BY b.bill_date DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;