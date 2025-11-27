-- =====================================================
-- BRANCH-CENTRIC ARCHITECTURE MIGRATION
-- =====================================================
-- This migration adds branch_id to all operational tables
-- and sets up automatic default branch creation for new stores
-- =====================================================

-- =====================================================
-- STEP 1: ADD branch_id COLUMNS TO ALL OPERATIONAL TABLES
-- =====================================================

-- Cash Drawer Tables
ALTER TABLE public.cash_drawer_accounts 
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

ALTER TABLE public.cash_drawer_sessions 
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

-- Inventory Tables
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

ALTER TABLE public.inventory_bills 
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

-- Bill Management Tables
ALTER TABLE public.bills 
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

ALTER TABLE public.bill_line_items 
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

ALTER TABLE public.bill_audit_logs 
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

-- Operational Tables
ALTER TABLE public.missed_products 
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;



ALTER TABLE public.reminders 
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

ALTER TABLE public.employee_attendance 
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

-- =====================================================
-- STEP 2: CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Cash Drawer Indexes
CREATE INDEX IF NOT EXISTS idx_cash_drawer_accounts_branch_id ON public.cash_drawer_accounts(branch_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_accounts_store_branch ON public.cash_drawer_accounts(store_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_cash_drawer_sessions_branch_id ON public.cash_drawer_sessions(branch_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_sessions_store_branch ON public.cash_drawer_sessions(store_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_sessions_branch_status ON public.cash_drawer_sessions(branch_id, status);

-- Inventory Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_items_branch_id ON public.inventory_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_store_branch ON public.inventory_items(store_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_branch_product ON public.inventory_items(branch_id, product_id);

CREATE INDEX IF NOT EXISTS idx_inventory_bills_branch_id ON public.inventory_bills(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_bills_store_branch ON public.inventory_bills(store_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_transactions_branch_id ON public.transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_transactions_store_branch ON public.transactions(store_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_transactions_branch_date ON public.transactions(branch_id, created_at);

-- Bill Management Indexes
CREATE INDEX IF NOT EXISTS idx_bills_branch_id ON public.bills(branch_id);
CREATE INDEX IF NOT EXISTS idx_bills_store_branch ON public.bills(store_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_bills_branch_date ON public.bills(branch_id, bill_date);
CREATE INDEX IF NOT EXISTS idx_bills_branch_status ON public.bills(branch_id, status);

CREATE INDEX IF NOT EXISTS idx_bill_line_items_branch_id ON public.bill_line_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_branch_bill ON public.bill_line_items(branch_id, bill_id);

CREATE INDEX IF NOT EXISTS idx_bill_audit_logs_branch_id ON public.bill_audit_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_bill_audit_logs_branch_bill ON public.bill_audit_logs(branch_id, bill_id);

-- Operational Indexes
CREATE INDEX IF NOT EXISTS idx_missed_products_branch_id ON public.missed_products(branch_id);
CREATE INDEX IF NOT EXISTS idx_reminders_branch_id ON public.reminders(branch_id);
CREATE INDEX IF NOT EXISTS idx_reminders_branch_status ON public.reminders(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_attendance_branch_id ON public.employee_attendance(branch_id);

-- =====================================================
-- STEP 3: UPDATE EXISTING DATA (IF ANY)
-- =====================================================
-- Create a default branch for each store and assign all existing data to it

DO $$
DECLARE
    store_record RECORD;
    default_branch_id uuid;
BEGIN
    -- Loop through all stores
    FOR store_record IN SELECT id, name, address, phone FROM public.stores
    LOOP
        -- Check if store already has a branch
        SELECT id INTO default_branch_id 
        FROM public.branches 
        WHERE store_id = store_record.id 
        LIMIT 1;
        
        -- If no branch exists, create default branch
        IF default_branch_id IS NULL THEN
            INSERT INTO public.branches (id, store_id, name, address, phone, created_at, updated_at)
            VALUES (
                gen_random_uuid(),
                store_record.id,
                'Main Branch',
                store_record.address,
                store_record.phone,
                now(),
                now()
            )
            RETURNING id INTO default_branch_id;
            
            RAISE NOTICE 'Created default branch for store: % (branch_id: %)', store_record.name, default_branch_id;
        END IF;
        
        -- Update all operational tables with branch_id
        UPDATE public.cash_drawer_accounts 
        SET branch_id = default_branch_id 
        WHERE store_id = store_record.id AND branch_id IS NULL;
        
        UPDATE public.cash_drawer_sessions 
        SET branch_id = default_branch_id 
        WHERE store_id = store_record.id AND branch_id IS NULL;
        
        UPDATE public.inventory_items 
        SET branch_id = default_branch_id 
        WHERE store_id = store_record.id AND branch_id IS NULL;
        
        UPDATE public.inventory_bills 
        SET branch_id = default_branch_id 
        WHERE store_id = store_record.id AND branch_id IS NULL;
        
        UPDATE public.transactions 
        SET branch_id = default_branch_id 
        WHERE store_id = store_record.id AND branch_id IS NULL;
        
        UPDATE public.bills 
        SET branch_id = default_branch_id 
        WHERE store_id = store_record.id AND branch_id IS NULL;
        
        UPDATE public.bill_line_items 
        SET branch_id = default_branch_id 
        WHERE store_id = store_record.id AND branch_id IS NULL;
        
        UPDATE public.bill_audit_logs 
        SET branch_id = default_branch_id 
        WHERE store_id = store_record.id AND branch_id IS NULL;
        
        UPDATE public.missed_products 
        SET branch_id = default_branch_id 
        WHERE store_id = store_record.id AND branch_id IS NULL;
        
        UPDATE public.reminders 
        SET branch_id = default_branch_id 
        WHERE store_id = store_record.id AND branch_id IS NULL;
        
        UPDATE public.employee_attendance 
        SET branch_id = default_branch_id 
        WHERE store_id = store_record.id AND branch_id IS NULL;
        
        RAISE NOTICE 'Migrated all operational data for store: %', store_record.name;
    END LOOP;
END $$;

-- =====================================================
-- STEP 4: MAKE branch_id NOT NULL (AFTER DATA MIGRATION)
-- =====================================================
-- Run this after confirming all data has been migrated

ALTER TABLE public.cash_drawer_accounts 
ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE public.cash_drawer_sessions 
ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE public.inventory_items 
ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE public.inventory_bills 
ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE public.transactions 
ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE public.bills 
ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE public.bill_line_items 
ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE public.bill_audit_logs 
ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE public.missed_products 
ALTER COLUMN branch_id SET NOT NULL;



ALTER TABLE public.reminders 
ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE public.employee_attendance 
ALTER COLUMN branch_id SET NOT NULL;

-- =====================================================
-- STEP 5: CREATE TRIGGER FOR AUTO DEFAULT BRANCH CREATION
-- =====================================================

-- Function to create default branch when a new store is created
CREATE OR REPLACE FUNCTION public.create_default_branch_for_store()
RETURNS TRIGGER AS $$
BEGIN
    -- Create a default "Main Branch" for the new store
    INSERT INTO public.branches (
        id,
        store_id,
        name,
        address,
        phone,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        NEW.id,
        'Main Branch',
        NEW.address,
        NEW.phone,
        now(),
        now()
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create default branch
DROP TRIGGER IF EXISTS trigger_create_default_branch ON public.stores;
CREATE TRIGGER trigger_create_default_branch
    AFTER INSERT ON public.stores
    FOR EACH ROW
    EXECUTE FUNCTION public.create_default_branch_for_store();

-- =====================================================
-- STEP 6: UPDATE RLS POLICIES (IF USING ROW LEVEL SECURITY)
-- =====================================================
-- Update your RLS policies to filter by branch_id where appropriate
-- Example:

-- DROP POLICY IF EXISTS "Users can view bills in their branch" ON public.bills;
-- CREATE POLICY "Users can view bills in their branch" ON public.bills
--     FOR SELECT
--     USING (
--         branch_id IN (
--             SELECT branch_id FROM public.user_branches 
--             WHERE user_id = auth.uid()
--         )
--     );

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check that all stores have at least one branch
SELECT 
    s.id as store_id,
    s.name as store_name,
    COUNT(b.id) as branch_count
FROM public.stores s
LEFT JOIN public.branches b ON b.store_id = s.id
GROUP BY s.id, s.name
HAVING COUNT(b.id) = 0;
-- Should return 0 rows

-- Check for any operational data without branch_id
SELECT 'cash_drawer_accounts' as table_name, COUNT(*) as missing_branch_id 
FROM public.cash_drawer_accounts WHERE branch_id IS NULL
UNION ALL
SELECT 'cash_drawer_sessions', COUNT(*) 
FROM public.cash_drawer_sessions WHERE branch_id IS NULL
UNION ALL
SELECT 'inventory_items', COUNT(*) 
FROM public.inventory_items WHERE branch_id IS NULL
UNION ALL
SELECT 'inventory_bills', COUNT(*) 
FROM public.inventory_bills WHERE branch_id IS NULL
UNION ALL
SELECT 'transactions', COUNT(*) 
FROM public.transactions WHERE branch_id IS NULL
UNION ALL
SELECT 'bills', COUNT(*) 
FROM public.bills WHERE branch_id IS NULL
UNION ALL
SELECT 'bill_line_items', COUNT(*) 
FROM public.bill_line_items WHERE branch_id IS NULL
UNION ALL
SELECT 'bill_audit_logs', COUNT(*) 
FROM public.bill_audit_logs WHERE branch_id IS NULL;
-- All counts should be 0

-- =====================================================
-- ROLLBACK (IF NEEDED)
-- =====================================================
-- WARNING: This will remove all branch_id data
-- Only use if you need to completely reverse the migration

/*
-- Drop trigger
DROP TRIGGER IF EXISTS trigger_create_default_branch ON public.stores;
DROP FUNCTION IF EXISTS public.create_default_branch_for_store();

-- Drop indexes
DROP INDEX IF EXISTS idx_cash_drawer_accounts_branch_id;
DROP INDEX IF EXISTS idx_cash_drawer_accounts_store_branch;
DROP INDEX IF EXISTS idx_cash_drawer_sessions_branch_id;
DROP INDEX IF EXISTS idx_cash_drawer_sessions_store_branch;
DROP INDEX IF EXISTS idx_cash_drawer_sessions_branch_status;
DROP INDEX IF EXISTS idx_inventory_items_branch_id;
DROP INDEX IF EXISTS idx_inventory_items_store_branch;
DROP INDEX IF EXISTS idx_inventory_items_branch_product;
DROP INDEX IF EXISTS idx_inventory_bills_branch_id;
DROP INDEX IF EXISTS idx_inventory_bills_store_branch;
DROP INDEX IF EXISTS idx_transactions_branch_id;
DROP INDEX IF EXISTS idx_transactions_store_branch;
DROP INDEX IF EXISTS idx_transactions_branch_date;
DROP INDEX IF EXISTS idx_bills_branch_id;
DROP INDEX IF EXISTS idx_bills_store_branch;
DROP INDEX IF EXISTS idx_bills_branch_date;
DROP INDEX IF EXISTS idx_bills_branch_status;
DROP INDEX IF EXISTS idx_bill_line_items_branch_id;
DROP INDEX IF EXISTS idx_bill_line_items_branch_bill;
DROP INDEX IF EXISTS idx_bill_audit_logs_branch_id;
DROP INDEX IF EXISTS idx_bill_audit_logs_branch_bill;
DROP INDEX IF EXISTS idx_missed_products_branch_id;
DROP INDEX IF EXISTS idx_notifications_branch_id;
DROP INDEX IF EXISTS idx_notifications_branch_read;
DROP INDEX IF EXISTS idx_reminders_branch_id;
DROP INDEX IF EXISTS idx_reminders_branch_status;
DROP INDEX IF EXISTS idx_employee_attendance_branch_id;

-- Remove columns
ALTER TABLE public.cash_drawer_accounts DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.cash_drawer_sessions DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.inventory_bills DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.bills DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.bill_line_items DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.bill_audit_logs DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.missed_products DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.notifications DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.reminders DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.employee_attendance DROP COLUMN IF EXISTS branch_id;
*/

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- ✅ All operational tables now have branch_id
-- ✅ Indexes created for performance
-- ✅ Existing data migrated to default branches
-- ✅ Auto-creation of default branch for new stores enabled
-- ✅ System is now BRANCH-CENTRIC
-- =====================================================
