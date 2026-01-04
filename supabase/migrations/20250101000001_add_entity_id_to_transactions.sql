-- Migration: Add entity_id to transactions table
-- This unifies customer_id, supplier_id, and employee_id into a single entity_id field
-- Following the same pattern used for bills table migration

-- Add entity_id column (nullable UUID) - unified field for customer/supplier/employee
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS entity_id UUID NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_transactions_entity_id ON public.transactions(entity_id);

-- Add foreign key constraint to entities table
ALTER TABLE public.transactions
ADD CONSTRAINT fk_transactions_entity_id
FOREIGN KEY (entity_id)
REFERENCES public.entities(id)
ON DELETE SET NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.transactions.entity_id IS 'Unified field for customer_id, supplier_id, or employee_id - references entities table';

-- Note: No data migration needed - new field is nullable and will be set when creating new transactions
-- Legacy fields (customer_id, supplier_id, employee_id) are kept for backward compatibility

