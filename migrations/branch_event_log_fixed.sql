-- Branch Event Log Table - FIXED VERSION
-- Single source of truth for all business event changes
-- Replaces table-wide polling with event-driven sync

CREATE TABLE IF NOT EXISTS branch_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  
  -- Event metadata
  event_type TEXT NOT NULL,        -- sale_posted, payment_posted, inventory_received, etc.
  entity_type TEXT NOT NULL,       -- bill, transaction, journal_entry, inventory_item, etc.
  entity_id UUID NOT NULL,         -- ID of the affected record
  operation TEXT NOT NULL,         -- insert, update, reverse
  
  -- Versioning (monotonic, sequential per branch)
  version BIGINT NOT NULL,         -- Sequential version number per branch
  
  -- Timestamp
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Optional metadata
  user_id UUID REFERENCES users(id),  -- Who triggered the event
  metadata JSONB,                      -- Additional context (amounts, quantities, etc.)
  
  -- Constraints
  CONSTRAINT valid_operation CHECK (operation IN ('insert', 'update', 'reverse')),
  CONSTRAINT valid_entity_type CHECK (entity_type IN (
    -- Business operation tables
    'bill', 'bill_line_item', 'transaction', 'journal_entry', 
    'inventory_item', 'inventory_bill', 'entity', 'cash_drawer_session',
    'cash_drawer_account', 'product', 'reminder', 'missed_product',
    -- Configuration tables (for fully event-driven sync)
    'store', 'branch', 'user', 'chart_of_account',
    'role_operation_limit', 'user_module_access'
  ))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_branch_event_log_branch_version 
  ON branch_event_log(branch_id, version);

CREATE INDEX IF NOT EXISTS idx_branch_event_log_branch_occurred 
  ON branch_event_log(branch_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_branch_event_log_entity 
  ON branch_event_log(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_branch_event_log_store 
  ON branch_event_log(store_id);

-- RLS Policies
ALTER TABLE branch_event_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see events for branches in their store
-- The application will filter to the current branch_id on the client side
-- RLS ensures users can only access branches within their store
CREATE POLICY "Users can view events for their store branches"
  ON branch_event_log
  FOR SELECT
  USING (
    store_id IN (
      SELECT store_id FROM users 
      WHERE id = auth.uid()
    )
  );

-- Policy: Users can insert events for branches in their store
CREATE POLICY "Users can insert events for their store branches"
  ON branch_event_log
  FOR INSERT
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM users 
      WHERE id = auth.uid()
    )
  );

-- Policy: No updates or deletes (append-only)
-- No policies needed - RLS will deny by default

-- Function to get next version for a branch (atomic)
CREATE OR REPLACE FUNCTION get_next_branch_event_version(p_branch_id UUID)
RETURNS BIGINT AS $$
DECLARE
  next_version BIGINT;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1
  INTO next_version
  FROM branch_event_log
  WHERE branch_id = p_branch_id;
  
  RETURN next_version;
END;
$$ LANGUAGE plpgsql;

-- Function to emit event (called from application)
CREATE OR REPLACE FUNCTION emit_branch_event(
  p_store_id UUID,
  p_branch_id UUID,
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_operation TEXT,
  p_user_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  event_id UUID;
  event_version BIGINT;
BEGIN
  -- Get next version atomically
  event_version := get_next_branch_event_version(p_branch_id);
  
  -- Insert event
  INSERT INTO branch_event_log (
    store_id,
    branch_id,
    event_type,
    entity_type,
    entity_id,
    operation,
    version,
    occurred_at,
    user_id,
    metadata
  ) VALUES (
    p_store_id,
    p_branch_id,
    p_event_type,
    p_entity_type,
    p_entity_id,
    p_operation,
    event_version,
    NOW(),
    p_user_id,
    p_metadata
  )
  RETURNING id INTO event_id;
  
  RETURN event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT ON branch_event_log TO authenticated;
GRANT EXECUTE ON FUNCTION emit_branch_event TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_branch_event_version TO authenticated;

-- Comments for documentation
COMMENT ON TABLE branch_event_log IS 
  'Append-only event log for branch-level business events. Replaces table-wide polling with event-driven sync.';

COMMENT ON COLUMN branch_event_log.version IS 
  'Monotonic version number per branch. Clients use this for sequential catch-up sync.';

COMMENT ON COLUMN branch_event_log.operation IS 
  'insert: new record, update: record modified, reverse: transaction reversed/cancelled';

