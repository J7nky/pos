-- Migration: Add is_reversal and reversal_of_transaction_id to transactions table
-- Date: December 12, 2025
-- Purpose: Add fields to track reversal transactions and link them to their original transactions
--          This enables proper audit trail and filtering of corrected/reversed payments

-- =============================================================================
-- 1. ADD NEW COLUMNS TO TRANSACTIONS TABLE
-- =============================================================================

-- Add is_reversal boolean field (defaults to false)
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS is_reversal BOOLEAN DEFAULT false NOT NULL;

-- Add reversal_of_transaction_id to link reversals to their original transactions
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS reversal_of_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;

-- =============================================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =============================================================================

-- Index for filtering reversals
CREATE INDEX IF NOT EXISTS idx_transactions_is_reversal 
ON public.transactions(is_reversal) 
WHERE is_reversal = true;

-- Index for finding reversals of a specific transaction
CREATE INDEX IF NOT EXISTS idx_transactions_reversal_of_transaction_id 
ON public.transactions(reversal_of_transaction_id) 
WHERE reversal_of_transaction_id IS NOT NULL;

-- Composite index for common queries (filtering reversals by store/branch)
CREATE INDEX IF NOT EXISTS idx_transactions_store_branch_reversal 
ON public.transactions(store_id, branch_id, is_reversal) 
WHERE is_reversal = true;

-- =============================================================================
-- 3. ADD COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON COLUMN public.transactions.is_reversal IS 
'Indicates whether this transaction is a reversal of another transaction. Reversals are created to correct mistakes while maintaining audit trail.';

COMMENT ON COLUMN public.transactions.reversal_of_transaction_id IS 
'If this transaction is a reversal, this field contains the ID of the original transaction being reversed. NULL for non-reversal transactions.';

-- =============================================================================
-- 4. ADD CONSTRAINT TO ENSURE DATA INTEGRITY
-- =============================================================================

-- Ensure that if reversal_of_transaction_id is set, is_reversal must be true
ALTER TABLE public.transactions
ADD CONSTRAINT check_reversal_consistency 
CHECK (
    (reversal_of_transaction_id IS NULL AND is_reversal = false) OR
    (reversal_of_transaction_id IS NOT NULL AND is_reversal = true)
);

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Summary:
-- ✅ Added is_reversal boolean column (defaults to false)
-- ✅ Added reversal_of_transaction_id UUID column with foreign key to transactions
-- ✅ Created indexes for performance optimization
-- ✅ Added constraint to ensure data consistency
-- ✅ Added documentation comments

