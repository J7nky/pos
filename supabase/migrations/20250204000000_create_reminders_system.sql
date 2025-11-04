-- =====================================================
-- UNIFIED REMINDER SYSTEM
-- =====================================================
-- This migration creates a comprehensive reminder system that can handle
-- all types of reminders across the application (supplier reviews, payments,
-- follow-ups, maintenance, etc.)
--
-- Cloud notification infrastructure is included but inactive by default.
-- Can be activated in future without schema changes.
--
-- Created: November 4, 2025
-- =====================================================

-- Create reminders table
CREATE TABLE IF NOT EXISTS reminders (
  -- Primary key and store relationship
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  
  -- What to remind about
  type TEXT NOT NULL CHECK (type IN (
    'supplier_advance_review',
    'payment_due',
    'bill_payment',
    'customer_followup',
    'inventory_reorder',
    'contract_renewal',
    'license_expiration',
    'equipment_maintenance',
    'employee_review',
    'insurance_renewal',
    'lease_renewal',
    'custom'
  )),
  
  -- Who/what is this about (polymorphic relationship)
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'supplier',
    'customer',
    'transaction',
    'bill',
    'inventory',
    'employee',
    'contract',
    'equipment',
    'license',
    'other'
  )),
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL, -- Denormalized for performance
  
  -- When to remind
  due_date DATE NOT NULL,
  remind_before_days INTEGER[] DEFAULT ARRAY[1, 0], -- Array: [7, 3, 1, 0] = remind 7, 3, 1 days before and on due date
  
  -- Recurrence (for recurring reminders like monthly reviews)
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern TEXT CHECK (recurrence_pattern IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly') OR recurrence_pattern IS NULL),
  recurrence_interval INTEGER DEFAULT 1, -- e.g., every 2 weeks
  recurrence_end_date DATE, -- When to stop recurring
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'dismissed', 'overdue', 'snoozed')),
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID REFERENCES users(id),
  completion_note TEXT,
  snoozed_until DATE,
  
  -- Notification tracking (for local notifications)
  last_notified_at TIMESTAMP WITH TIME ZONE,
  notification_count INTEGER DEFAULT 0,
  
  -- Details
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  action_url TEXT, -- Deep link to relevant page
  
  -- Metadata (flexible JSONB for type-specific data)
  metadata JSONB DEFAULT '{}'::jsonb,
  -- Examples of metadata:
  -- For supplier_advance_review: { "amount": 1000, "currency": "USD", "advance_date": "2025-11-01", "transaction_id": "..." }
  -- For payment_due: { "amount": 500, "invoice_number": "INV-001", "payment_method": "bank_transfer" }
  -- For inventory_reorder: { "current_quantity": 5, "reorder_point": 10, "supplier_id": "..." }
  
  -- =====================================================
  -- CLOUD NOTIFICATION INFRASTRUCTURE (FUTURE USE)
  -- These fields are included for future cloud notification support
  -- Currently inactive but ready for activation without schema changes
  -- =====================================================
  
  -- Notification delivery channels (for future cloud notifications)
  notification_channels JSONB DEFAULT '{"in_app": true, "email": false, "sms": false, "push": false}'::jsonb,
  
  -- Cloud notification settings (INACTIVE - for future use)
  send_via_cloud BOOLEAN DEFAULT FALSE, -- Set to TRUE to enable cloud notifications
  cloud_notification_sent BOOLEAN DEFAULT FALSE,
  next_cloud_notification_at TIMESTAMP WITH TIME ZONE,
  
  -- Notification history tracking (for future cloud delivery tracking)
  notification_history JSONB DEFAULT '[]'::jsonb,
  -- Structure: [{ "sent_at": "...", "channel": "email", "status": "sent", "provider_id": "...", "opened_at": "...", "clicked_at": "..." }]
  
  -- User targeting (who should be notified - for future multi-user support)
  notify_users UUID[] DEFAULT ARRAY[]::UUID[], -- Array of user IDs to notify
  notify_roles TEXT[] DEFAULT ARRAY[]::TEXT[], -- Array of roles to notify: ['admin', 'manager']
  
  -- =====================================================
  -- END CLOUD NOTIFICATION INFRASTRUCTURE
  -- =====================================================
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Soft delete support
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for efficient querying
CREATE INDEX idx_reminders_store_id ON reminders(store_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_reminders_status ON reminders(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_reminders_due_date ON reminders(due_date) WHERE deleted_at IS NULL AND status = 'pending';
CREATE INDEX idx_reminders_entity ON reminders(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_reminders_type ON reminders(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_reminders_created_by ON reminders(created_by) WHERE deleted_at IS NULL;
CREATE INDEX idx_reminders_recurring ON reminders(is_recurring) WHERE deleted_at IS NULL AND is_recurring = TRUE;

-- Composite index for common queries (due reminders for a store)
CREATE INDEX idx_reminders_store_status_due ON reminders(store_id, status, due_date) WHERE deleted_at IS NULL;

-- Index for cloud notification queries (for future use)
CREATE INDEX idx_reminders_cloud_notifications ON reminders(send_via_cloud, next_cloud_notification_at) 
  WHERE deleted_at IS NULL AND send_via_cloud = TRUE AND status = 'pending';

-- Add comments for documentation
COMMENT ON TABLE reminders IS 'Unified reminder system for all types of reminders across the application';
COMMENT ON COLUMN reminders.type IS 'Type of reminder (supplier_advance_review, payment_due, etc.)';
COMMENT ON COLUMN reminders.entity_type IS 'Type of entity this reminder is about';
COMMENT ON COLUMN reminders.entity_id IS 'ID of the entity (polymorphic relationship)';
COMMENT ON COLUMN reminders.remind_before_days IS 'Array of days before due date to send notifications. [7,3,1,0] = notify 7,3,1 days before and on due date';
COMMENT ON COLUMN reminders.is_recurring IS 'Whether this reminder repeats automatically';
COMMENT ON COLUMN reminders.recurrence_pattern IS 'How often reminder recurs (daily, weekly, monthly, quarterly, yearly)';
COMMENT ON COLUMN reminders.metadata IS 'Flexible JSON field for type-specific data (amounts, references, etc.)';
COMMENT ON COLUMN reminders.notification_channels IS 'Which channels to use for notifications (in_app, email, sms, push)';
COMMENT ON COLUMN reminders.send_via_cloud IS 'FUTURE: Enable cloud-based notifications (email, SMS, push) - Currently inactive';
COMMENT ON COLUMN reminders.notification_history IS 'FUTURE: Track cloud notification delivery status - Currently unused';
COMMENT ON COLUMN reminders.notify_users IS 'FUTURE: User IDs to notify when cloud notifications are enabled';

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_reminders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_reminders_updated_at
  BEFORE UPDATE ON reminders
  FOR EACH ROW
  EXECUTE FUNCTION update_reminders_updated_at();

-- Function to automatically update status to 'overdue'
CREATE OR REPLACE FUNCTION check_reminder_overdue()
RETURNS TRIGGER AS $$
BEGIN
  -- If due date has passed and status is still pending, mark as overdue
  IF NEW.due_date < CURRENT_DATE AND NEW.status = 'pending' THEN
    NEW.status = 'overdue';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_reminder_overdue
  BEFORE INSERT OR UPDATE ON reminders
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION check_reminder_overdue();

-- Function to create next recurrence when reminder is completed
CREATE OR REPLACE FUNCTION create_reminder_recurrence()
RETURNS TRIGGER AS $$
DECLARE
  next_due_date DATE;
BEGIN
  -- Only process if reminder was just completed and is recurring
  IF NEW.status = 'completed' AND OLD.status = 'pending' AND NEW.is_recurring = TRUE THEN
    
    -- Calculate next due date based on recurrence pattern
    CASE NEW.recurrence_pattern
      WHEN 'daily' THEN
        next_due_date := NEW.due_date + (NEW.recurrence_interval || ' days')::INTERVAL;
      WHEN 'weekly' THEN
        next_due_date := NEW.due_date + (NEW.recurrence_interval * 7 || ' days')::INTERVAL;
      WHEN 'monthly' THEN
        next_due_date := NEW.due_date + (NEW.recurrence_interval || ' months')::INTERVAL;
      WHEN 'quarterly' THEN
        next_due_date := NEW.due_date + (NEW.recurrence_interval * 3 || ' months')::INTERVAL;
      WHEN 'yearly' THEN
        next_due_date := NEW.due_date + (NEW.recurrence_interval || ' years')::INTERVAL;
      ELSE
        RETURN NEW;
    END CASE;
    
    -- Only create next occurrence if before recurrence_end_date (or no end date)
    IF NEW.recurrence_end_date IS NULL OR next_due_date <= NEW.recurrence_end_date THEN
      -- Create next occurrence
      INSERT INTO reminders (
        store_id,
        type,
        entity_type,
        entity_id,
        entity_name,
        due_date,
        remind_before_days,
        is_recurring,
        recurrence_pattern,
        recurrence_interval,
        recurrence_end_date,
        status,
        title,
        description,
        priority,
        action_url,
        metadata,
        notification_channels,
        send_via_cloud,
        notify_users,
        notify_roles,
        created_by
      ) VALUES (
        NEW.store_id,
        NEW.type,
        NEW.entity_type,
        NEW.entity_id,
        NEW.entity_name,
        next_due_date,
        NEW.remind_before_days,
        NEW.is_recurring,
        NEW.recurrence_pattern,
        NEW.recurrence_interval,
        NEW.recurrence_end_date,
        'pending',
        NEW.title,
        NEW.description,
        NEW.priority,
        NEW.action_url,
        NEW.metadata,
        NEW.notification_channels,
        NEW.send_via_cloud,
        NEW.notify_users,
        NEW.notify_roles,
        NEW.created_by
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_reminder_recurrence
  AFTER UPDATE ON reminders
  FOR EACH ROW
  EXECUTE FUNCTION create_reminder_recurrence();

-- Enable Row Level Security
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can see reminders for their store
CREATE POLICY reminders_select_policy ON reminders
  FOR SELECT
  USING (
    store_id IN (
      SELECT store_id FROM users WHERE id = auth.uid()
    )
    AND deleted_at IS NULL
  );

-- Users can insert reminders for their store
CREATE POLICY reminders_insert_policy ON reminders
  FOR INSERT
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM users WHERE id = auth.uid()
    )
  );

-- Users can update reminders for their store
CREATE POLICY reminders_update_policy ON reminders
  FOR UPDATE
  USING (
    store_id IN (
      SELECT store_id FROM users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM users WHERE id = auth.uid()
    )
  );

-- Users can soft delete reminders for their store
CREATE POLICY reminders_delete_policy ON reminders
  FOR DELETE
  USING (
    store_id IN (
      SELECT store_id FROM users WHERE id = auth.uid()
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON reminders TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =====================================================
-- CLOUD NOTIFICATION INFRASTRUCTURE (FUTURE)
-- =====================================================
-- The following is commented out but ready for future activation
-- Uncomment when ready to enable cloud notifications
--
-- -- Create edge function invocation schedule (runs every hour)
-- -- SELECT cron.schedule(
-- --   'check-reminders-hourly',
-- --   '0 * * * *', -- Every hour at minute 0
-- --   $$
-- --     SELECT net.http_post(
-- --       url:='https://your-project-id.supabase.co/functions/v1/check-reminders',
-- --       headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
-- --       body:='{}'::jsonb
-- --     ) AS request_id;
-- --   $$
-- -- );
--
-- =====================================================

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Unified Reminder System created successfully!';
  RAISE NOTICE 'Features:';
  RAISE NOTICE '  ✓ Multi-type reminder support (supplier reviews, payments, etc.)';
  RAISE NOTICE '  ✓ Flexible notification timing (remind X days before)';
  RAISE NOTICE '  ✓ Recurring reminders (daily, weekly, monthly, etc.)';
  RAISE NOTICE '  ✓ Status tracking (pending, completed, overdue, dismissed)';
  RAISE NOTICE '  ✓ Automatic overdue detection';
  RAISE NOTICE '  ✓ Flexible metadata storage';
  RAISE NOTICE '  ✓ Cloud notification infrastructure (ready but inactive)';
  RAISE NOTICE '';
  RAISE NOTICE 'To activate cloud notifications in the future:';
  RAISE NOTICE '  1. Set send_via_cloud = TRUE for desired reminders';
  RAISE NOTICE '  2. Configure notification_channels JSONB';
  RAISE NOTICE '  3. Deploy edge function (check-reminders)';
  RAISE NOTICE '  4. Uncomment cron schedule in this file';
END $$;

