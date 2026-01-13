-- Migration: Opening Balance Migration RPC Function
-- Creates atomic operations for balance migration from Excel files
-- Follows DEVELOPER_RULES.md: atomic transactions, event emission, proper schema

-- =============================================================================
-- RPC FUNCTION: migrate_opening_balance
-- =============================================================================
-- Atomically creates entity (if needed), transaction, and journal entries
-- Emits event for real-time sync to store-app devices

CREATE OR REPLACE FUNCTION migrate_opening_balance(
  p_store_id UUID,
  p_branch_id UUID,
  p_entity_name TEXT,
  p_entity_type TEXT,  -- 'customer' or 'supplier'
  p_debit_balance DECIMAL(15,2),
  p_credit_balance DECIMAL(15,2),
  p_currency TEXT DEFAULT 'LBP',
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_entity_id UUID;
  v_entity_code TEXT;
  v_transaction_id UUID;
  v_debit_account TEXT;
  v_credit_account TEXT;
  v_debit_account_name TEXT;
  v_credit_account_name TEXT;
  v_amount DECIMAL(15,2);
  v_now TIMESTAMPTZ := NOW();
  v_fiscal_period TEXT;
  v_je_debit_id UUID;
  v_je_credit_id UUID;
  v_created_entity BOOLEAN := false;
BEGIN
  -- Validate entity type
  IF p_entity_type NOT IN ('customer', 'supplier') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Entity type must be "customer" or "supplier"',
      'entity_name', p_entity_name
    );
  END IF;

  -- Validate balance configuration
  IF p_entity_type = 'customer' AND p_debit_balance > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Customers cannot have debit balances',
      'entity_name', p_entity_name
    );
  END IF;

  IF p_entity_type = 'supplier' AND p_credit_balance > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Suppliers cannot have credit balances',
      'entity_name', p_entity_name
    );
  END IF;

  -- Calculate fiscal period (YYYY-MM format)
  v_fiscal_period := TO_CHAR(v_now, 'YYYY-MM');

  -- ==========================================================================
  -- STEP 1: Find or create entity
  -- ==========================================================================
  
  -- Try to find existing entity
  SELECT id INTO v_entity_id
  FROM entities
  WHERE store_id = p_store_id
    AND name = p_entity_name
    AND entity_type = p_entity_type
  LIMIT 1;

  -- Create entity if not found
  IF v_entity_id IS NULL THEN
    v_entity_id := gen_random_uuid();
    v_entity_code := UPPER(
      CASE p_entity_type 
        WHEN 'customer' THEN 'CUST-' 
        ELSE 'SUPP-' 
      END || 
      LEFT(REPLACE(p_entity_name, ' ', ''), 3) || 
      '-' || 
      EXTRACT(EPOCH FROM v_now)::BIGINT % 10000
    );

    INSERT INTO entities (
      id,
      store_id,
      branch_id,
      entity_type,
      entity_code,
      name,
      phone,
      is_system_entity,
      is_active,
      customer_data,
      supplier_data,
      created_at,
      updated_at
    ) VALUES (
      v_entity_id,
      p_store_id,
      p_branch_id,
      p_entity_type,
      v_entity_code,
      p_entity_name,
      NULL,
      false,
      true,
      CASE WHEN p_entity_type = 'customer' THEN '{}'::JSONB ELSE NULL END,
      CASE WHEN p_entity_type = 'supplier' THEN '{}'::JSONB ELSE NULL END,
      v_now,
      v_now
    );

    v_created_entity := true;

    -- Emit entity created event
    PERFORM emit_branch_event(
      p_store_id,
      p_branch_id,
      'entity_created',
      'entity',
      v_entity_id,
      'insert',
      p_user_id,
      jsonb_build_object(
        'entity_name', p_entity_name,
        'entity_type', p_entity_type,
        'source', 'balance_migration'
      )
    );
  END IF;

  -- ==========================================================================
  -- STEP 2: Determine accounts and amounts
  -- ==========================================================================
  
  IF p_entity_type = 'customer' AND p_credit_balance > 0 THEN
    -- Customer with credit balance (owes us money)
    -- Debit AR (1200), Credit Owner's Equity (3100)
    v_debit_account := '1200';
    v_credit_account := '3100';
    v_amount := p_credit_balance;
  ELSIF p_entity_type = 'supplier' AND p_debit_balance > 0 THEN
    -- Supplier with debit balance (we owe them money)
    -- Debit Owner's Equity (3100), Credit AP (2100)
    v_debit_account := '3100';
    v_credit_account := '2100';
    v_amount := p_debit_balance;
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid balance configuration',
      'entity_name', p_entity_name
    );
  END IF;

  -- Get account names from chart of accounts
  SELECT account_name INTO v_debit_account_name
  FROM chart_of_accounts
  WHERE store_id = p_store_id AND account_code = v_debit_account;
  
  SELECT account_name INTO v_credit_account_name
  FROM chart_of_accounts
  WHERE store_id = p_store_id AND account_code = v_credit_account;

  -- Use default names if not found
  v_debit_account_name := COALESCE(v_debit_account_name, v_debit_account);
  v_credit_account_name := COALESCE(v_credit_account_name, v_credit_account);

  -- ==========================================================================
  -- STEP 3: Create transaction record
  -- ==========================================================================
  
  v_transaction_id := gen_random_uuid();

  INSERT INTO transactions (
    id,
    store_id,
    branch_id,
    type,
    category,
    amount,
    currency,
    description,
    reference,
    entity_id,
    created_at,
    created_by,
    is_reversal,
    metadata
  ) VALUES (
    v_transaction_id,
    p_store_id,
    p_branch_id,
    CASE WHEN p_entity_type = 'customer' THEN 'income' ELSE 'expense' END,
    'opening_balance',
    v_amount,
    p_currency,
    'Opening balance for ' || p_entity_name,
    'OB-' || TO_CHAR(v_now, 'YYYYMMDD-HH24MISS'),
    v_entity_id,
    v_now,
    p_user_id,  -- Use actual user ID (UUID, can be NULL)
    false,
    jsonb_build_object(
      'source', 'balance_migration',
      'entity_type', p_entity_type,
      'original_debit', p_debit_balance,
      'original_credit', p_credit_balance
    )
  );

  -- ==========================================================================
  -- STEP 4: Create journal entries (double-entry accounting)
  -- ==========================================================================
  
  v_je_debit_id := gen_random_uuid();
  v_je_credit_id := gen_random_uuid();

  -- Debit entry
  INSERT INTO journal_entries (
    id,
    store_id,
    branch_id,
    transaction_id,
    account_code,
    account_name,
    debit_usd,
    credit_usd,
    debit_lbp,
    credit_lbp,
    entity_id,
    entity_type,
    posted_date,
    fiscal_period,
    is_posted,
    description,
    created_at,
    created_by
  ) VALUES (
    v_je_debit_id,
    p_store_id,
    p_branch_id,
    v_transaction_id,
    v_debit_account,
    v_debit_account_name,
    CASE WHEN p_currency = 'USD' THEN v_amount ELSE 0 END,
    0,
    CASE WHEN p_currency = 'LBP' THEN v_amount ELSE 0 END,
    0,
    v_entity_id,
    p_entity_type,
    v_now::DATE,
    v_fiscal_period,
    true,
    'Opening balance debit: ' || p_entity_name,
    v_now,
    p_user_id
  );

  -- Credit entry
  INSERT INTO journal_entries (
    id,
    store_id,
    branch_id,
    transaction_id,
    account_code,
    account_name,
    debit_usd,
    credit_usd,
    debit_lbp,
    credit_lbp,
    entity_id,
    entity_type,
    posted_date,
    fiscal_period,
    is_posted,
    description,
    created_at,
    created_by
  ) VALUES (
    v_je_credit_id,
    p_store_id,
    p_branch_id,
    v_transaction_id,
    v_credit_account,
    v_credit_account_name,
    0,
    CASE WHEN p_currency = 'USD' THEN v_amount ELSE 0 END,
    0,
    CASE WHEN p_currency = 'LBP' THEN v_amount ELSE 0 END,
    v_entity_id,
    p_entity_type,
    v_now::DATE,
    v_fiscal_period,
    true,
    'Opening balance credit: ' || p_entity_name,
    v_now,
    p_user_id
  );

  -- ==========================================================================
  -- STEP 5: Emit events for real-time sync
  -- ==========================================================================
  
  -- Emit transaction created event
  PERFORM emit_branch_event(
    p_store_id,
    p_branch_id,
    'transaction_posted',
    'transaction',
    v_transaction_id,
    'insert',
    p_user_id,
    jsonb_build_object(
      'category', 'opening_balance',
      'amount', v_amount,
      'currency', p_currency,
      'entity_id', v_entity_id,
      'entity_type', p_entity_type,
      'source', 'balance_migration'
    )
  );

  -- Emit journal entry events
  PERFORM emit_branch_event(
    p_store_id,
    p_branch_id,
    'journal_entry_posted',
    'journal_entry',
    v_je_debit_id,
    'insert',
    p_user_id,
    jsonb_build_object(
      'transaction_id', v_transaction_id,
      'account_code', v_debit_account,
      'is_debit', true,
      'source', 'balance_migration'
    )
  );

  PERFORM emit_branch_event(
    p_store_id,
    p_branch_id,
    'journal_entry_posted',
    'journal_entry',
    v_je_credit_id,
    'insert',
    p_user_id,
    jsonb_build_object(
      'transaction_id', v_transaction_id,
      'account_code', v_credit_account,
      'is_debit', false,
      'source', 'balance_migration'
    )
  );

  -- ==========================================================================
  -- STEP 6: Return success result
  -- ==========================================================================
  
  RETURN jsonb_build_object(
    'success', true,
    'entity_id', v_entity_id,
    'entity_name', p_entity_name,
    'entity_type', p_entity_type,
    'entity_created', v_created_entity,
    'transaction_id', v_transaction_id,
    'journal_entry_ids', ARRAY[v_je_debit_id, v_je_credit_id],
    'amount', v_amount,
    'currency', p_currency,
    'debit_account', v_debit_account,
    'credit_account', v_credit_account
  );

EXCEPTION WHEN OTHERS THEN
  -- Return error details
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'error_detail', SQLSTATE,
    'entity_name', p_entity_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION migrate_opening_balance TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION migrate_opening_balance IS 
  'Atomically migrates an opening balance for a customer or supplier. Creates entity if needed, transaction record, and balanced journal entries. Emits events for real-time sync.';

-- =============================================================================
-- BULK MIGRATION FUNCTION (for better performance)
-- =============================================================================

CREATE OR REPLACE FUNCTION migrate_opening_balances_bulk(
  p_store_id UUID,
  p_branch_id UUID,
  p_rows JSONB,  -- Array of {entity_name, entity_type, debit_balance, credit_balance}
  p_currency TEXT DEFAULT 'LBP',
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_row JSONB;
  v_result JSONB;
  v_results JSONB[] := '{}';
  v_success_count INT := 0;
  v_error_count INT := 0;
BEGIN
  -- Process each row
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_result := migrate_opening_balance(
      p_store_id,
      p_branch_id,
      v_row->>'entity_name',
      v_row->>'entity_type',
      (v_row->>'debit_balance')::DECIMAL,
      (v_row->>'credit_balance')::DECIMAL,
      p_currency,
      p_user_id
    );

    v_results := array_append(v_results, v_result);

    IF (v_result->>'success')::BOOLEAN THEN
      v_success_count := v_success_count + 1;
    ELSE
      v_error_count := v_error_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', v_error_count = 0,
    'total_rows', jsonb_array_length(p_rows),
    'success_count', v_success_count,
    'error_count', v_error_count,
    'results', to_jsonb(v_results)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION migrate_opening_balances_bulk TO authenticated;

COMMENT ON FUNCTION migrate_opening_balances_bulk IS 
  'Bulk version of migrate_opening_balance. Processes multiple rows in a single call for better performance.';

