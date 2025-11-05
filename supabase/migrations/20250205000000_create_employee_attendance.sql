-- =====================================================
-- EMPLOYEE ATTENDANCE TRACKING SYSTEM
-- =====================================================
-- This migration creates an employee attendance tracking system
-- that records check-in and check-out times for employees.
--
-- Created: February 5, 2025
-- =====================================================

-- Create employee_attendance table
CREATE TABLE IF NOT EXISTS employee_attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  check_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_out_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  _synced BOOLEAN DEFAULT false,
  _deleted BOOLEAN DEFAULT false,
  
  -- Ensure one active check-in per employee at a time
  CONSTRAINT unique_active_checkin UNIQUE NULLS NOT DISTINCT (employee_id, check_out_at)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_employee_attendance_employee_id ON employee_attendance(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_attendance_store_id ON employee_attendance(store_id);
CREATE INDEX IF NOT EXISTS idx_employee_attendance_check_in_at ON employee_attendance(check_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_attendance_check_out_at ON employee_attendance(check_out_at DESC);

-- Enable RLS
ALTER TABLE employee_attendance ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Employees can view their own attendance records
CREATE POLICY "Employees can view own attendance"
  ON employee_attendance
  FOR SELECT
  USING (
    auth.uid() = employee_id OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND (users.role = 'admin' OR users.role = 'manager')
      AND users.store_id = employee_attendance.store_id
    )
  );

-- Employees can insert their own check-ins
CREATE POLICY "Employees can check in"
  ON employee_attendance
  FOR INSERT
  WITH CHECK (
    auth.uid() = employee_id OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND (users.role = 'admin' OR users.role = 'manager')
      AND users.store_id = employee_attendance.store_id
    )
  );

-- Employees can update their own check-outs
CREATE POLICY "Employees can check out"
  ON employee_attendance
  FOR UPDATE
  USING (
    auth.uid() = employee_id OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND (users.role = 'admin' OR users.role = 'manager')
      AND users.store_id = employee_attendance.store_id
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_employee_attendance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_employee_attendance_updated_at
  BEFORE UPDATE ON employee_attendance
  FOR EACH ROW
  EXECUTE FUNCTION update_employee_attendance_updated_at();

-- Add comment
COMMENT ON TABLE employee_attendance IS 'Tracks employee check-in and check-out times for attendance monitoring';

