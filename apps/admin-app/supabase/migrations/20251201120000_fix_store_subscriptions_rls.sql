Migration:  stor_subscriptionicies for trial subscription creaton
-- Date: December 1, 2025
-- Purpose: Allow authenticated users to create trial subscriptions for their stores

-- =============================================================================
-- =============================================================================
-- 1. ENABLE RLS ON store_subscriptions (if not already enabled)
-- =============================================================================

ALTER TABLE public.store_subscriptions ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. CREATE PROPER RLS POLICIES FOR store_subscriptions
-- =============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Store owners can view own subscriptions" ON public.store_subscriptions;
DROP POLICY IF EXISTS "Store owners can create own subscriptions" ON public.store_subscriptions;
DROP POLICY IF EXISTS "Store owners can update own subscriptions" ON public.store_subscriptions;

-- Policy for viewing subscriptions (SELECT)
CREATE POLICY "Store owners can view own subscriptions"
ON public.store_subscriptions
FOR SELECT
TO authenticated
USING (store_id IN (SELECT users.store_id FROM users WHERE users.id = auth.uid()));

-- Policy for creating subscriptions (INSERT)
CREATE POLICY "Store owners can create own subscriptions"
ON public.store_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (store_id IN (SELECT users.store_id FROM users WHERE users.id = auth.uid()));

-- Policy for updating subscriptions (UPDATE)
CREATE POLICY "Store owners can update own subscriptions"
ON public.store_subscriptions
FOR UPDATE
TO authenticated
USING (store_id IN (SELECT users.store_id FROM users WHERE users.id = auth.uid()))
WITH CHECK (store_id IN (SELECT users.store_id FROM users WHERE users.id = auth.uid()));

-- =============================================================================
-- 3. MIGRATION COMPLETE
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration completed: Fixed store_subscriptions RLS policies';
    RAISE NOTICE 'Added INSERT and UPDATE policies for store owners';    RAISE NOTICE 'Users can now create trialsubscriptionsfortheirstores';END $$