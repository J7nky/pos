-- Quick fix script for cash_drawer RLS issue
-- Copy and paste this into Supabase Dashboard > SQL Editor

\i apps/store-app/supabase/migrations/20250212000000_add_cash_drawer_rls_policies.sql
