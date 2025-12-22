-- Migration: Update Journal Entries Schema to Base Currency Fields
-- Date: January 30, 2025
-- 
-- This migration updates the journal_entries table to use base currency fields:
-- - Adds: debit_usd, credit_usd, debit_lbp, credit_lbp
-- - Removes: debit, credit, currency (if they exist)
--
-- This change supports base currency journal entries where both USD and LBP
-- amounts can be stored in a single entry, following accounting best practices.

-- =============================================================================
-- 1. ADD NEW BASE CURRENCY FIELDS
-- =============================================================================

-- Add new base currency fields if they don't exist
DO $$
BEGIN
    -- Add debit_usd column
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'journal_entries' 
        AND column_name = 'debit_usd'
    ) THEN
        ALTER TABLE public.journal_entries 
        ADD COLUMN debit_usd DECIMAL(15,2) NOT NULL DEFAULT 0.00;
        RAISE NOTICE 'Added debit_usd column to journal_entries table';
    ELSE
        RAISE NOTICE 'debit_usd column already exists - skipping';
    END IF;

    -- Add credit_usd column
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'journal_entries' 
        AND column_name = 'credit_usd'
    ) THEN
        ALTER TABLE public.journal_entries 
        ADD COLUMN credit_usd DECIMAL(15,2) NOT NULL DEFAULT 0.00;
        RAISE NOTICE 'Added credit_usd column to journal_entries table';
    ELSE
        RAISE NOTICE 'credit_usd column already exists - skipping';
    END IF;

    -- Add debit_lbp column
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'journal_entries' 
        AND column_name = 'debit_lbp'
    ) THEN
        ALTER TABLE public.journal_entries 
        ADD COLUMN debit_lbp DECIMAL(15,2) NOT NULL DEFAULT 0.00;
        RAISE NOTICE 'Added debit_lbp column to journal_entries table';
    ELSE
        RAISE NOTICE 'debit_lbp column already exists - skipping';
    END IF;

    -- Add credit_lbp column
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'journal_entries' 
        AND column_name = 'credit_lbp'
    ) THEN
        ALTER TABLE public.journal_entries 
        ADD COLUMN credit_lbp DECIMAL(15,2) NOT NULL DEFAULT 0.00;
        RAISE NOTICE 'Added credit_lbp column to journal_entries table';
    ELSE
        RAISE NOTICE 'credit_lbp column already exists - skipping';
    END IF;
END $$;

-- =============================================================================
-- 2. MIGRATE EXISTING DATA (if old fields exist)
-- =============================================================================

-- Migrate data from old schema to new schema if old fields exist
DO $$
DECLARE
    has_old_debit BOOLEAN;
    has_old_credit BOOLEAN;
    has_old_currency BOOLEAN;
    record_count INTEGER;
BEGIN
    -- Check if old columns exist
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'journal_entries' 
        AND column_name = 'debit'
    ) INTO has_old_debit;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'journal_entries' 
        AND column_name = 'credit'
    ) INTO has_old_credit;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'journal_entries' 
        AND column_name = 'currency'
    ) INTO has_old_currency;

    -- Only migrate if old fields exist
    IF has_old_debit AND has_old_credit THEN
        -- Get count of records to migrate
        SELECT COUNT(*) INTO record_count FROM public.journal_entries;
        
        IF record_count > 0 THEN
            RAISE NOTICE 'Migrating % journal entries from old schema to new schema...', record_count;
            
            -- Migrate data based on currency field
            IF has_old_currency THEN
                -- Migrate using currency field
                UPDATE public.journal_entries
                SET 
                    debit_usd = CASE WHEN currency = 'USD' THEN COALESCE(debit, 0) ELSE 0 END,
                    credit_usd = CASE WHEN currency = 'USD' THEN COALESCE(credit, 0) ELSE 0 END,
                    debit_lbp = CASE WHEN currency = 'LBP' THEN COALESCE(debit, 0) ELSE 0 END,
                    credit_lbp = CASE WHEN currency = 'LBP' THEN COALESCE(credit, 0) ELSE 0 END
                WHERE debit_usd = 0 AND credit_usd = 0 AND debit_lbp = 0 AND credit_lbp = 0;
                
                RAISE NOTICE 'Migrated journal entries using currency field';
            ELSE
                -- Migrate assuming USD (default) if no currency field
                UPDATE public.journal_entries
                SET 
                    debit_usd = COALESCE(debit, 0),
                    credit_usd = COALESCE(credit, 0),
                    debit_lbp = 0,
                    credit_lbp = 0
                WHERE debit_usd = 0 AND credit_usd = 0 AND debit_lbp = 0 AND credit_lbp = 0;
                
                RAISE NOTICE 'Migrated journal entries assuming USD (no currency field found)';
            END IF;
        ELSE
            RAISE NOTICE 'No journal entries to migrate';
        END IF;
    ELSE
        RAISE NOTICE 'Old schema fields (debit, credit) do not exist - no data migration needed';
    END IF;
END $$;

-- =============================================================================
-- 3. ADD CONSTRAINTS FOR NEW FIELDS
-- =============================================================================

-- Add constraints for USD fields (if they don't exist)
DO $$
BEGIN
    -- Check if constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'journal_entries_usd_check'
    ) THEN
        ALTER TABLE public.journal_entries
        ADD CONSTRAINT journal_entries_usd_check CHECK (
            (debit_usd > 0 AND credit_usd = 0) OR 
            (credit_usd > 0 AND debit_usd = 0) OR 
            (debit_usd = 0 AND credit_usd = 0)
        );
        RAISE NOTICE 'Added journal_entries_usd_check constraint';
    ELSE
        RAISE NOTICE 'journal_entries_usd_check constraint already exists - skipping';
    END IF;

    -- Check if constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'journal_entries_lbp_check'
    ) THEN
        ALTER TABLE public.journal_entries
        ADD CONSTRAINT journal_entries_lbp_check CHECK (
            (debit_lbp > 0 AND credit_lbp = 0) OR 
            (credit_lbp > 0 AND debit_lbp = 0) OR 
            (debit_lbp = 0 AND credit_lbp = 0)
        );
        RAISE NOTICE 'Added journal_entries_lbp_check constraint';
    ELSE
        RAISE NOTICE 'journal_entries_lbp_check constraint already exists - skipping';
    END IF;

    -- Check if constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'journal_entries_amount_positive'
    ) THEN
        ALTER TABLE public.journal_entries
        ADD CONSTRAINT journal_entries_amount_positive CHECK (
            debit_usd >= 0 AND credit_usd >= 0 AND 
            debit_lbp >= 0 AND credit_lbp >= 0
        );
        RAISE NOTICE 'Added journal_entries_amount_positive constraint';
    ELSE
        RAISE NOTICE 'journal_entries_amount_positive constraint already exists - skipping';
    END IF;

    -- Check if constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'journal_entries_has_amount'
    ) THEN
        ALTER TABLE public.journal_entries
        ADD CONSTRAINT journal_entries_has_amount CHECK (
            (debit_usd > 0 OR credit_usd > 0 OR debit_lbp > 0 OR credit_lbp > 0)
        );
        RAISE NOTICE 'Added journal_entries_has_amount constraint';
    ELSE
        RAISE NOTICE 'journal_entries_has_amount constraint already exists - skipping';
    END IF;
END $$;

-- =============================================================================
-- 4. REMOVE OLD FIELDS (if they exist)
-- =============================================================================

-- Drop old columns if they exist
DO $$
BEGIN
    -- Drop currency column
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'journal_entries' 
        AND column_name = 'currency'
    ) THEN
        ALTER TABLE public.journal_entries DROP COLUMN currency;
        RAISE NOTICE 'Dropped currency column from journal_entries table';
    ELSE
        RAISE NOTICE 'currency column does not exist - skipping';
    END IF;

    -- Drop debit column
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'journal_entries' 
        AND column_name = 'debit'
    ) THEN
        ALTER TABLE public.journal_entries DROP COLUMN debit;
        RAISE NOTICE 'Dropped debit column from journal_entries table';
    ELSE
        RAISE NOTICE 'debit column does not exist - skipping';
    END IF;

    -- Drop credit column
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'journal_entries' 
        AND column_name = 'credit'
    ) THEN
        ALTER TABLE public.journal_entries DROP COLUMN credit;
        RAISE NOTICE 'Dropped credit column from journal_entries table';
    ELSE
        RAISE NOTICE 'credit column does not exist - skipping';
    END IF;
END $$;

-- =============================================================================
-- 5. UPDATE INDEXES (remove currency from compound indexes if needed)
-- =============================================================================

-- Note: Indexes that include currency will need to be recreated
-- The application code should handle this, but we document it here
DO $$
BEGIN
    -- Check if there are any indexes that include currency
    -- These would need to be dropped and recreated without currency
    -- For now, we'll just log a notice
    RAISE NOTICE 'Review indexes on journal_entries table';
    RAISE NOTICE 'If any indexes include currency field, they should be recreated without it';
    RAISE NOTICE 'Compound indexes should use: [store_id+account_code], [entity_id+account_code], etc.';
END $$;

-- =============================================================================
-- 6. UPDATE COMMENTS
-- =============================================================================

COMMENT ON COLUMN public.journal_entries.debit_usd IS 
'Debit amount in USD. For each entry, either debit_usd or credit_usd should be positive, not both.';

COMMENT ON COLUMN public.journal_entries.credit_usd IS 
'Credit amount in USD. For each entry, either debit_usd or credit_usd should be positive, not both.';

COMMENT ON COLUMN public.journal_entries.debit_lbp IS 
'Debit amount in LBP. For each entry, either debit_lbp or credit_lbp should be positive, not both.';

COMMENT ON COLUMN public.journal_entries.credit_lbp IS 
'Credit amount in LBP. For each entry, either debit_lbp or credit_lbp should be positive, not both.';

COMMENT ON TABLE public.journal_entries IS 
'Source of truth for all financial transactions using explicit double-entry bookkeeping.
Uses base currency schema: debit_usd, credit_usd, debit_lbp, credit_lbp.
Each entry can contain amounts in both currencies, supporting base currency accounting.';

-- =============================================================================
-- 7. VERIFICATION
-- =============================================================================

-- Verify the migration
DO $$
DECLARE
    has_debit_usd BOOLEAN;
    has_credit_usd BOOLEAN;
    has_debit_lbp BOOLEAN;
    has_credit_lbp BOOLEAN;
    has_old_debit BOOLEAN;
    has_old_credit BOOLEAN;
    has_old_currency BOOLEAN;
BEGIN
    -- Check new fields
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'journal_entries' 
        AND column_name = 'debit_usd'
    ) INTO has_debit_usd;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'journal_entries' 
        AND column_name = 'credit_usd'
    ) INTO has_credit_usd;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'journal_entries' 
        AND column_name = 'debit_lbp'
    ) INTO has_debit_lbp;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'journal_entries' 
        AND column_name = 'credit_lbp'
    ) INTO has_credit_lbp;

    -- Check old fields
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'journal_entries' 
        AND column_name = 'debit'
    ) INTO has_old_debit;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'journal_entries' 
        AND column_name = 'credit'
    ) INTO has_old_credit;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'journal_entries' 
        AND column_name = 'currency'
    ) INTO has_old_currency;

    -- Report results
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Journal Entries Schema Migration Status';
    RAISE NOTICE '========================================';
    
    IF has_debit_usd AND has_credit_usd AND has_debit_lbp AND has_credit_lbp THEN
        RAISE NOTICE '✅ New base currency fields: PRESENT';
    ELSE
        RAISE WARNING '❌ New base currency fields: MISSING';
        IF NOT has_debit_usd THEN RAISE WARNING '  - debit_usd missing'; END IF;
        IF NOT has_credit_usd THEN RAISE WARNING '  - credit_usd missing'; END IF;
        IF NOT has_debit_lbp THEN RAISE WARNING '  - debit_lbp missing'; END IF;
        IF NOT has_credit_lbp THEN RAISE WARNING '  - credit_lbp missing'; END IF;
    END IF;

    IF has_old_debit OR has_old_credit OR has_old_currency THEN
        RAISE WARNING '⚠️ Old schema fields still exist:';
        IF has_old_debit THEN RAISE WARNING '  - debit column still exists'; END IF;
        IF has_old_credit THEN RAISE WARNING '  - credit column still exists'; END IF;
        IF has_old_currency THEN RAISE WARNING '  - currency column still exists'; END IF;
    ELSE
        RAISE NOTICE '✅ Old schema fields: REMOVED';
    END IF;

    RAISE NOTICE '========================================';
END $$;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Log completion
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Journal Entries Schema Migration Complete';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Added: debit_usd, credit_usd, debit_lbp, credit_lbp';
    RAISE NOTICE 'Removed: debit, credit, currency (if they existed)';
    RAISE NOTICE 'Journal entries now use base currency schema';
    RAISE NOTICE 'Each entry can contain both USD and LBP amounts';
    RAISE NOTICE '========================================';
END $$;

