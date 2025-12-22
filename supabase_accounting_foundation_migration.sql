-- Accounting Foundation Migration for Supabase
-- Based on ACCOUNTING_FOUNDATION_MIGRATION_PLAN.md
-- Date: November 25, 2025
-- 
-- This migration adds the 4 new accounting foundation tables:
-- 1. journal_entries - Source of truth for all financial transactions
-- 2. balance_snapshots - Performance optimization for historical queries
-- 3. entities - Unified customer/supplier/employee/cash abstraction
-- 4. chart_of_accounts - Configuration for account types

-- Enable RLS (Row Level Security) for all new tables
-- This ensures data isolation between stores

-- =============================================================================
-- 1. JOURNAL ENTRIES TABLE - Source of Truth for Financial Transactions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    branch_id UUID NULL, -- Future: references branches table when implemented
    transaction_id UUID NOT NULL, -- Groups debit + credit entries
    account_code VARCHAR(10) NOT NULL, -- '1100', '1200', etc.
    account_name VARCHAR(255) NOT NULL,
    debit_usd DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    credit_usd DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    debit_lbp DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    credit_lbp DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    entity_id UUID NOT NULL, -- NEVER NULL - references entities table
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('customer', 'supplier', 'employee', 'cash', 'internal')),
    posted_date DATE NOT NULL DEFAULT CURRENT_DATE,
    fiscal_period VARCHAR(7) NOT NULL, -- Format: "YYYY-MM"
    is_posted BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES auth.users(id),
    
    
    -- Constraints
    CONSTRAINT journal_entries_usd_check CHECK (
        (debit_usd > 0 AND credit_usd = 0) OR (credit_usd > 0 AND debit_usd = 0) OR (debit_usd = 0 AND credit_usd = 0)
    ),
    CONSTRAINT journal_entries_lbp_check CHECK (
        (debit_lbp > 0 AND credit_lbp = 0) OR (credit_lbp > 0 AND debit_lbp = 0) OR (debit_lbp = 0 AND credit_lbp = 0)
    ),
    CONSTRAINT journal_entries_amount_positive CHECK (
        debit_usd >= 0 AND credit_usd >= 0 AND debit_lbp >= 0 AND credit_lbp >= 0
    ),
    CONSTRAINT journal_entries_has_amount CHECK (
        (debit_usd > 0 OR credit_usd > 0 OR debit_lbp > 0 OR credit_lbp > 0)
    )
);

-- Indexes for journal_entries
CREATE INDEX IF NOT EXISTS idx_journal_entries_store_id ON public.journal_entries(store_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_transaction_id ON public.journal_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_entity_id ON public.journal_entries(entity_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_account_code ON public.journal_entries(account_code);
CREATE INDEX IF NOT EXISTS idx_journal_entries_posted_date ON public.journal_entries(posted_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_fiscal_period ON public.journal_entries(fiscal_period);
CREATE INDEX IF NOT EXISTS idx_journal_entries_store_entity ON public.journal_entries(store_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_store_account ON public.journal_entries(store_id, account_code);

-- RLS for journal_entries
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view journal entries for their store" ON public.journal_entries
    FOR SELECT USING (
        store_id = (
            SELECT store_id FROM public.users 
            WHERE id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() 
            AND role = 'super_admin' 
            AND store_id IS NULL
        )
    );

CREATE POLICY "Users can insert journal entries for their store" ON public.journal_entries
    FOR INSERT WITH CHECK (
        store_id = (
            SELECT store_id FROM public.users 
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update journal entries for their store" ON public.journal_entries
    FOR UPDATE USING (
        store_id = (
            SELECT store_id FROM public.users 
            WHERE id = auth.uid()
        )
    );

-- =============================================================================
-- 2. BALANCE SNAPSHOTS TABLE - Performance Optimization
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.balance_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    branch_id UUID NULL, -- Future: references branches table
    account_code VARCHAR(10) NOT NULL,
    entity_id UUID NULL, -- Can be null for account-level snapshots
    balance_usd DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    balance_lbp DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    snapshot_date DATE NOT NULL,
    snapshot_type VARCHAR(20) NOT NULL CHECK (snapshot_type IN ('hourly', 'daily', 'end_of_day')),
    verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    
    -- Unique constraint to prevent duplicate snapshots
    CONSTRAINT unique_balance_snapshot UNIQUE (store_id, account_code, entity_id, snapshot_date, snapshot_type)
);

-- Indexes for balance_snapshots
CREATE INDEX IF NOT EXISTS idx_balance_snapshots_store_id ON public.balance_snapshots(store_id);
CREATE INDEX IF NOT EXISTS idx_balance_snapshots_entity_id ON public.balance_snapshots(entity_id);
CREATE INDEX IF NOT EXISTS idx_balance_snapshots_account_code ON public.balance_snapshots(account_code);
CREATE INDEX IF NOT EXISTS idx_balance_snapshots_date ON public.balance_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_balance_snapshots_store_entity_date ON public.balance_snapshots(store_id, entity_id, snapshot_date);

-- RLS for balance_snapshots
ALTER TABLE public.balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view balance snapshots for their store" ON public.balance_snapshots
    FOR SELECT USING (
        store_id = (
            SELECT store_id FROM public.users 
            WHERE id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() 
            AND role = 'super_admin' 
            AND store_id IS NULL
        )
    );

CREATE POLICY "Users can insert balance snapshots for their store" ON public.balance_snapshots
    FOR INSERT WITH CHECK (
        store_id = (
            SELECT store_id FROM public.users 
            WHERE id = auth.uid()
        )
    );

-- =============================================================================
-- 3. ENTITIES TABLE - Unified Customer/Supplier/Employee/Cash Abstraction
-- =============================================================================
--
-- IMPORTANT: This table does NOT include usd_balance or lb_balance fields.
-- Entity balances are calculated from journal_entries (source of truth).
-- This follows accounting best practices: balances are DERIVED, not STORED.
-- For performance optimization, use balance_snapshots table.
--
-- Migration Note: Previous versions may have had balance fields on entities.
-- These have been removed in favor of journal-entry-based calculations.

CREATE TABLE IF NOT EXISTS public.entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    branch_id UUID NULL, -- Future: references branches table
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('customer', 'supplier', 'employee', 'cash', 'internal')),
    entity_code VARCHAR(50) NOT NULL, -- 'CUST-12345678', 'SUPP-87654321', etc.
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    is_system_entity BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    customer_data JSONB, -- Type-specific data for customers
    supplier_data JSONB, -- Type-specific data for suppliers
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    
    -- Unique constraint for entity codes within a store
    CONSTRAINT unique_entity_code_per_store UNIQUE (store_id, entity_code)
);

-- Indexes for entities
CREATE INDEX IF NOT EXISTS idx_entities_store_id ON public.entities(store_id);
CREATE INDEX IF NOT EXISTS idx_entities_entity_type ON public.entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_entity_code ON public.entities(entity_code);
CREATE INDEX IF NOT EXISTS idx_entities_name ON public.entities(name);
CREATE INDEX IF NOT EXISTS idx_entities_phone ON public.entities(phone);
CREATE INDEX IF NOT EXISTS idx_entities_store_type ON public.entities(store_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_store_active ON public.entities(store_id, is_active);
CREATE INDEX IF NOT EXISTS idx_entities_system ON public.entities(is_system_entity);

-- RLS for entities
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view entities for their store" ON public.entities
    FOR SELECT USING (
        store_id = (
            SELECT store_id FROM public.users 
            WHERE id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() 
            AND role = 'super_admin' 
            AND store_id IS NULL
        )
    );

CREATE POLICY "Users can insert entities for their store" ON public.entities
    FOR INSERT WITH CHECK (
        store_id = (
            SELECT store_id FROM public.users 
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update entities for their store" ON public.entities
    FOR UPDATE USING (
        store_id = (
            SELECT store_id FROM public.users 
            WHERE id = auth.uid()
        )
    );

-- =============================================================================
-- 4. CHART OF ACCOUNTS TABLE - Configuration for Account Types
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    account_code VARCHAR(10) NOT NULL, -- '1100', '1200', etc.
    account_name VARCHAR(255) NOT NULL,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    requires_entity BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint for account codes within a store
    CONSTRAINT unique_account_code_per_store UNIQUE (store_id, account_code)
);

-- Indexes for chart_of_accounts
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_store_id ON public.chart_of_accounts(store_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_account_code ON public.chart_of_accounts(account_code);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_account_type ON public.chart_of_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_store_active ON public.chart_of_accounts(store_id, is_active);

-- RLS for chart_of_accounts
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view chart of accounts for their store" ON public.chart_of_accounts
    FOR SELECT USING (
        store_id = (
            SELECT store_id FROM public.users 
            WHERE id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() 
            AND role = 'super_admin' 
            AND store_id IS NULL
        )
    );

CREATE POLICY "Users can insert chart of accounts for their store" ON public.chart_of_accounts
    FOR INSERT WITH CHECK (
        store_id = (
            SELECT store_id FROM public.users 
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update chart of accounts for their store" ON public.chart_of_accounts
    FOR UPDATE USING (
        store_id = (
            SELECT store_id FROM public.users 
            WHERE id = auth.uid()
        )
    );

-- =============================================================================
-- 5. FOREIGN KEY CONSTRAINTS
-- =============================================================================

-- Add foreign key from journal_entries to entities
ALTER TABLE public.journal_entries 
ADD CONSTRAINT fk_journal_entries_entity_id 
FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE RESTRICT;

-- Add foreign key from journal_entries to chart_of_accounts (optional, for validation)
-- Note: This is commented out as it might be too restrictive during development
-- ALTER TABLE public.journal_entries 
-- ADD CONSTRAINT fk_journal_entries_account_code 
-- FOREIGN KEY (store_id, account_code) REFERENCES public.chart_of_accounts(store_id, account_code);

-- Add foreign key from balance_snapshots to entities (optional, can be null)
ALTER TABLE public.balance_snapshots 
ADD CONSTRAINT fk_balance_snapshots_entity_id 
FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;

-- =============================================================================
-- 6. TRIGGERS FOR AUTOMATIC TIMESTAMPS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for entities table
CREATE TRIGGER update_entities_updated_at 
    BEFORE UPDATE ON public.entities 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 7. SYSTEM ENTITIES INSERTION (for each store)
-- =============================================================================

-- Function to create system entities for a store
CREATE OR REPLACE FUNCTION create_system_entities_for_store(store_uuid UUID)
RETURNS VOID AS $$
BEGIN
    -- Insert system entities if they don't exist
    INSERT INTO public.entities (id, store_id, entity_type, entity_code, name, is_system_entity, is_active, customer_data, supplier_data)
    VALUES 
        -- Customer entities
        ('entity-cash-customer'::UUID, store_uuid, 'cash', 'CASH-CUST', 'Cash Customer', true, true, '{"lb_max_balance": 0, "credit_limit": 0, "payment_terms": "immediate"}', null),
        
        -- Supplier entities
        ('entity-cash-supplier'::UUID, store_uuid, 'cash', 'CASH-SUPP', 'Cash Supplier', true, true, null, '{"type": "direct", "payment_terms": "immediate"}'),
        
        -- Employee entities
        ('entity-salaries'::UUID, store_uuid, 'employee', 'SALARIES', 'Employee Salaries', true, true, null, null),
        
        -- Internal entities
        ('entity-internal'::UUID, store_uuid, 'internal', 'INTERNAL', 'Internal Operations', true, true, null, null),
        ('entity-owner'::UUID, store_uuid, 'internal', 'OWNER', 'Owner Equity', true, true, null, null),
        
        -- Financial entities
        ('entity-bank'::UUID, store_uuid, 'cash', 'BANK', 'Bank Account', true, true, null, null),
        ('entity-tax-authority'::UUID, store_uuid, 'internal', 'TAX', 'Tax Authority', true, true, null, null),
        ('entity-utilities'::UUID, store_uuid, 'internal', 'UTILITIES', 'Utilities', true, true, null, null),
        ('entity-rent'::UUID, store_uuid, 'internal', 'RENT', 'Rent Payments', true, true, null, null)
    ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 8. DEFAULT CHART OF ACCOUNTS INSERTION
-- =============================================================================

-- Function to create default chart of accounts for a store
CREATE OR REPLACE FUNCTION create_default_chart_of_accounts(store_uuid UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.chart_of_accounts (store_id, account_code, account_name, account_type, requires_entity, is_active)
    VALUES 
        -- ASSETS (1000-1999)
        (store_uuid, '1100', 'Cash', 'asset', true, true),
        (store_uuid, '1200', 'Accounts Receivable', 'asset', true, true),
        (store_uuid, '1300', 'Inventory', 'asset', false, true),
        (store_uuid, '1400', 'Prepaid Expenses', 'asset', false, true),
        (store_uuid, '1500', 'Equipment', 'asset', false, true),
        
        -- LIABILITIES (2000-2999)
        (store_uuid, '2100', 'Accounts Payable', 'liability', true, true),
        (store_uuid, '2200', 'Accrued Expenses', 'liability', false, true),
        (store_uuid, '2300', 'Short-term Loans', 'liability', true, true),
        
        -- EQUITY (3000-3999)
        (store_uuid, '3100', 'Owner''s Equity', 'equity', false, true),
        (store_uuid, '3200', 'Retained Earnings', 'equity', false, true),
        
        -- REVENUE (4000-4999)
        (store_uuid, '4100', 'Sales Revenue', 'revenue', true, true),
        (store_uuid, '4200', 'Service Revenue', 'revenue', true, true),
        (store_uuid, '4300', 'Other Income', 'revenue', false, true),
        
        -- EXPENSES (5000-5999)
        (store_uuid, '5100', 'Cost of Goods Sold', 'expense', false, true),
        (store_uuid, '5200', 'Salaries Expense', 'expense', true, true),
        (store_uuid, '5300', 'Rent Expense', 'expense', false, true),
        (store_uuid, '5400', 'Utilities Expense', 'expense', false, true),
        (store_uuid, '5500', 'Office Supplies', 'expense', false, true),
        (store_uuid, '5600', 'Marketing Expense', 'expense', false, true),
        (store_uuid, '5700', 'Professional Fees', 'expense', true, true),
        (store_uuid, '5800', 'Bank Charges', 'expense', false, true),
        (store_uuid, '5900', 'Miscellaneous Expense', 'expense', false, true)
    ON CONFLICT (store_id, account_code) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 9. COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE public.journal_entries IS 'Source of truth for all financial transactions using explicit double-entry bookkeeping';
COMMENT ON TABLE public.balance_snapshots IS 'Performance optimization table storing account balances at specific points in time';
COMMENT ON TABLE public.entities IS 'Unified abstraction for customers, suppliers, employees, and system entities';
COMMENT ON TABLE public.chart_of_accounts IS 'Configuration table defining the accounting structure and account types';

COMMENT ON COLUMN public.journal_entries.transaction_id IS 'Groups related debit and credit entries together';
COMMENT ON COLUMN public.journal_entries.entity_id IS 'NEVER NULL - all transactions must be associated with an entity';
COMMENT ON COLUMN public.entities.customer_data IS 'JSON field storing customer-specific data like credit limits';
COMMENT ON COLUMN public.entities.supplier_data IS 'JSON field storing supplier-specific data like commission rates';
COMMENT ON COLUMN public.chart_of_accounts.requires_entity IS 'Whether transactions to this account must specify an entity_id';

-- Important: Entity balances are NOT stored in this table.
-- Balances are calculated from journal_entries WHERE account_code IN ('1200', '2100') AND entity_id = entities.id
-- This ensures data integrity and follows double-entry bookkeeping principles.
-- Use balance_snapshots table for performance optimization of historical queries.

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Accounting Foundation Migration completed successfully!';
    RAISE NOTICE 'Created tables: journal_entries, balance_snapshots, entities, chart_of_accounts';
    RAISE NOTICE 'Added RLS policies, indexes, and helper functions';
    RAISE NOTICE 'Ready for Phase 2: Entity migration and Phase 3: Journal entry creation';
END $$;
