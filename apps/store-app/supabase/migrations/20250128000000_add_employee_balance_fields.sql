-- Migration: Add Employee Balance and Working Hours Fields to Users Table
-- Adds lbp_balance, usd_balance, working_hours_start, working_hours_end, and working_days columns to users table
-- Following offline-first architecture pattern: local IndexedDB → syncService → Supabase
--
-- Balance fields allow storing employee salary in either LBP (Lebanese Pound) or USD currency
-- Only one currency should have a value at a time, the other should be null
-- This matches the pattern used in customers and suppliers tables (lb_balance, usd_balance)
--
-- Working hours fields store employee schedule:
-- - working_hours_start: Start time in "HH:mm" format (e.g., "09:00")
-- - working_hours_end: End time in "HH:mm" format (e.g., "17:00")
-- - working_days: Comma-separated days (e.g., "Monday,Tuesday,Wednesday,Thursday,Friday")

-- =============================================================================
-- USERS TABLE - Add Balance Fields
-- =============================================================================

-- Add lbp_balance column (nullable numeric for Lebanese Pound balance)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'lbp_balance'
  ) THEN
    ALTER TABLE users 
    ADD COLUMN lbp_balance numeric(13,2) NULL;
    
    COMMENT ON COLUMN users.lbp_balance IS 'Monthly salary stored in Lebanese Pounds (LBP). Only one currency (LBP or USD) should have a value at a time.';
  ELSE
    RAISE NOTICE 'Column lbp_balance already exists in users table';
  END IF;
END $$;

-- Add usd_balance column (nullable numeric for USD balance)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'usd_balance'
  ) THEN
    ALTER TABLE users 
    ADD COLUMN usd_balance numeric(13,2) NULL;
    
    COMMENT ON COLUMN users.usd_balance IS 'Monthly salary stored in US Dollars (USD). Only one currency (LBP or USD) should have a value at a time.';
  ELSE
    RAISE NOTICE 'Column usd_balance already exists in users table';
  END IF;
END $$;

-- Add working_hours_start column (nullable text for start time in HH:mm format)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'working_hours_start'
  ) THEN
    ALTER TABLE users 
    ADD COLUMN working_hours_start text NULL;
    
    COMMENT ON COLUMN users.working_hours_start IS 'Employee working hours start time in "HH:mm" format (e.g., "09:00")';
  ELSE
    RAISE NOTICE 'Column working_hours_start already exists in users table';
  END IF;
END $$;

-- Add working_hours_end column (nullable text for end time in HH:mm format)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'working_hours_end'
  ) THEN
    ALTER TABLE users 
    ADD COLUMN working_hours_end text NULL;
    
    COMMENT ON COLUMN users.working_hours_end IS 'Employee working hours end time in "HH:mm" format (e.g., "17:00")';
  ELSE
    RAISE NOTICE 'Column working_hours_end already exists in users table';
  END IF;
END $$;

-- Add working_days column (nullable text for comma-separated days)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'working_days'
  ) THEN
    ALTER TABLE users 
    ADD COLUMN working_days text NULL;
    
    COMMENT ON COLUMN users.working_days IS 'Employee working days as comma-separated list (e.g., "Monday,Tuesday,Wednesday,Thursday,Friday")';
  ELSE
    RAISE NOTICE 'Column working_days already exists in users table';
  END IF;
END $$;

-- =============================================================================
-- UPDATE EXISTING RECORDS (Optional)
-- =============================================================================
-- If monthly_salary exists as a string, we could migrate it here
-- For now, leaving existing records with null balances (they can be updated via the UI)

-- =============================================================================
-- VALIDATION
-- =============================================================================
-- Verify all columns were added successfully
DO $$
DECLARE
  v_lbp_exists boolean;
  v_usd_exists boolean;
  v_start_exists boolean;
  v_end_exists boolean;
  v_days_exists boolean;
BEGIN
  -- Check if lbp_balance column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'lbp_balance'
    AND data_type = 'numeric'
    AND numeric_precision = 13
    AND numeric_scale = 2
    AND is_nullable = 'YES'
  ) INTO v_lbp_exists;
  
  -- Check if usd_balance column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'usd_balance'
    AND data_type = 'numeric'
    AND numeric_precision = 13
    AND numeric_scale = 2
    AND is_nullable = 'YES'
  ) INTO v_usd_exists;
  
  -- Check if working_hours_start column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'working_hours_start'
    AND data_type = 'text'
    AND is_nullable = 'YES'
  ) INTO v_start_exists;
  
  -- Check if working_hours_end column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'working_hours_end'
    AND data_type = 'text'
    AND is_nullable = 'YES'
  ) INTO v_end_exists;
  
  -- Check if working_days column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'working_days'
    AND data_type = 'text'
    AND is_nullable = 'YES'
  ) INTO v_days_exists;
  
  IF v_lbp_exists AND v_usd_exists AND v_start_exists AND v_end_exists AND v_days_exists THEN
    RAISE NOTICE 'Successfully added all employee fields to users table: lbp_balance, usd_balance, working_hours_start, working_hours_end, and working_days';
  ELSE
    RAISE WARNING 'Some fields may not have been added correctly. lbp_balance: %, usd_balance: %, working_hours_start: %, working_hours_end: %, working_days: %', 
      v_lbp_exists, v_usd_exists, v_start_exists, v_end_exists, v_days_exists;
  END IF;
END $$;

