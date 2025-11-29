-- Migration: Make optional fields in stores table nullable
-- The admin app allows address, phone, and email to be optional
-- This migration updates the database schema to match the application logic

-- Make address nullable
ALTER TABLE stores 
ALTER COLUMN address DROP NOT NULL;

-- Make phone nullable
ALTER TABLE stores 
ALTER COLUMN phone DROP NOT NULL;

-- Make email nullable
ALTER TABLE stores 
ALTER COLUMN email DROP NOT NULL;

-- Add helpful comments
COMMENT ON COLUMN stores.address IS 'Store physical address (optional)';
COMMENT ON COLUMN stores.phone IS 'Store phone number (optional)';
COMMENT ON COLUMN stores.email IS 'Store email address (optional)';
