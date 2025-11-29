-- ============================================================================
-- SUBSCRIPTIONS TABLE MIGRATION
-- ============================================================================
-- This migration creates the subscriptions table for managing store subscriptions
-- Run this in your Supabase SQL Editor
-- ============================================================================

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    tier VARCHAR(20) NOT NULL DEFAULT 'starter' CHECK (tier IN ('starter', 'professional', 'premium')),
    status VARCHAR(20) NOT NULL DEFAULT 'trial' CHECK (status IN ('active', 'trial', 'expired', 'suspended', 'cancelled')),
    billing_cycle VARCHAR(10) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
    trial_ends_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Each store can only have one active subscription
    CONSTRAINT unique_store_subscription UNIQUE (store_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_store_id ON public.subscriptions(store_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tier ON public.subscriptions(tier);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscriptions
-- Super admins can do everything
CREATE POLICY "Super admins can manage all subscriptions"
    ON public.subscriptions
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'super_admin'
            AND users.store_id IS NULL
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'super_admin'
            AND users.store_id IS NULL
        )
    );

-- Store admins can view their own subscription
CREATE POLICY "Store admins can view own subscription"
    ON public.subscriptions
    FOR SELECT
    TO authenticated
    USING (
        store_id IN (
            SELECT store_id FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_subscription_updated_at ON public.subscriptions;
CREATE TRIGGER trigger_update_subscription_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_updated_at();

-- Function to create a trial subscription for a new store
CREATE OR REPLACE FUNCTION create_trial_subscription_for_store(
    p_store_id UUID,
    p_tier VARCHAR DEFAULT 'professional',
    p_trial_days INTEGER DEFAULT 14
)
RETURNS UUID AS $$
DECLARE
    v_subscription_id UUID;
BEGIN
    INSERT INTO public.subscriptions (
        store_id,
        tier,
        status,
        billing_cycle,
        current_period_start,
        current_period_end,
        trial_ends_at
    ) VALUES (
        p_store_id,
        p_tier,
        'trial',
        'monthly',
        now(),
        now() + (p_trial_days || ' days')::INTERVAL,
        now() + (p_trial_days || ' days')::INTERVAL
    )
    RETURNING id INTO v_subscription_id;
    
    RETURN v_subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_trial_subscription_for_store TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After running this migration, verify with:
-- SELECT * FROM public.subscriptions;
-- SELECT * FROM information_schema.tables WHERE table_name = 'subscriptions';
