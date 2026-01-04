-- Migration: Add bill_id, reversal_of_journal_entry_id, and entry_type to journal_entries
-- This eliminates string parsing for reversals/reactivations and improves query performance

-- Add bill_id column (nullable UUID) - direct link from journal entries to bills
ALTER TABLE public.journal_entries
ADD COLUMN IF NOT EXISTS bill_id UUID NULL;

-- Add reversal_of_journal_entry_id column (nullable UUID) - links reversal entries to original entries
ALTER TABLE public.journal_entries
ADD COLUMN IF NOT EXISTS reversal_of_journal_entry_id UUID NULL;

-- Add entry_type column (VARCHAR) - explicit type instead of parsing description
-- Values: 'original', 'reversal', 'reactivation'
ALTER TABLE public.journal_entries
ADD COLUMN IF NOT EXISTS entry_type VARCHAR(20) NULL DEFAULT 'original'
CHECK (entry_type IN ('original', 'reversal', 'reactivation'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_journal_entries_bill_id ON public.journal_entries(bill_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reversal_of_journal_entry_id ON public.journal_entries(reversal_of_journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_type ON public.journal_entries(entry_type);

-- Add foreign key constraint for reversal_of_journal_entry_id (self-referencing)
ALTER TABLE public.journal_entries
ADD CONSTRAINT fk_journal_entries_reversal_of_journal_entry_id
FOREIGN KEY (reversal_of_journal_entry_id)
REFERENCES public.journal_entries(id)
ON DELETE SET NULL;

-- Add foreign key constraint for bill_id
ALTER TABLE public.journal_entries
ADD CONSTRAINT fk_journal_entries_bill_id
FOREIGN KEY (bill_id)
REFERENCES public.bills(id)
ON DELETE SET NULL;

-- Add comments for documentation
-- Note: No data migration needed - new fields are nullable and will be set when creating new entries
COMMENT ON COLUMN public.journal_entries.bill_id IS 'Direct link to bill - enables fast queries without joining through transactions';
COMMENT ON COLUMN public.journal_entries.reversal_of_journal_entry_id IS 'Links a reversal entry to the original entry it reverses - replaces description parsing';
COMMENT ON COLUMN public.journal_entries.entry_type IS 'Explicit type: original, reversal, or reactivation - replaces description parsing';

