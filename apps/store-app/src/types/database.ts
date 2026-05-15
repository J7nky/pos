import type { BranchCore, StoreCore, CurrencyCode, UserCore, ExchangeRatesMap } from '@pos-platform/shared';

/**
 * Per-currency debit/credit amounts on a single journal_entries row (Phase 11).
 * The map is self-describing: every currency present in the entry carries
 * its own debit/credit pair, so a row written for an AED store is always
 * interpretable regardless of the store's later configuration changes.
 */
export type JournalEntryAmounts = Partial<Record<CurrencyCode, { debit: number; credit: number }>>;

/** Per-currency running balance map on a balance_snapshots row (Phase 11). */
export type BalanceSnapshotMap = Partial<Record<CurrencyCode, number>>;

export interface Database {
  public: {
    Tables: {
       
      cash_drawer_accounts: {
        Row: {
          id: string;
          store_id: string;
          account_code: string;
          name: string;
          /** 
           * @deprecated COMPUTED-ONLY: Never read or write this field.
           * Balance is calculated from journal entries (account_code = 1100).
           * Kept in schema for backward compatibility only.
           */
          current_balance?: number;
          /** 
           * @deprecated COMPUTED-ONLY: Never read or write this field.
           * Balance is calculated from journal entries (account_code = 1100).
           * Kept in schema for backward compatibility only.
           */
          usd_balance?: number;
          /** 
           * @deprecated COMPUTED-ONLY: Never read or write this field.
           * Balance is calculated from journal entries (account_code = 1100).
           * Kept in schema for backward compatibility only.
           */
          lbp_balance?: number;
          currency: CurrencyCode;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          account_code: string;
          name: string;
          /** 
           * @deprecated COMPUTED-ONLY: Never read or write this field.
           * Balance is calculated from journal entries (account_code = 1100).
           * Kept in schema for backward compatibility only.
           */
          current_balance?: number;
          /** 
           * @deprecated COMPUTED-ONLY: Never read or write this field.
           * Balance is calculated from journal entries (account_code = 1100).
           * Kept in schema for backward compatibility only.
           */
          usd_balance?: number;
          /** 
           * @deprecated COMPUTED-ONLY: Never read or write this field.
           * Balance is calculated from journal entries (account_code = 1100).
           * Kept in schema for backward compatibility only.
           */
          lbp_balance?: number;
          currency?: CurrencyCode;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          account_code?: string;
          name?: string;
          /** 
           * @deprecated COMPUTED-ONLY: Never read or write this field.
           * Balance is calculated from journal entries (account_code = 1100).
           * Kept in schema for backward compatibility only.
           */
          current_balance?: number;
          /** 
           * @deprecated COMPUTED-ONLY: Never read or write this field.
           * Balance is calculated from journal entries (account_code = 1100).
           * Kept in schema for backward compatibility only.
           */
          usd_balance?: number;
          /** 
           * @deprecated COMPUTED-ONLY: Never read or write this field.
           * Balance is calculated from journal entries (account_code = 1100).
           * Kept in schema for backward compatibility only.
           */
          lbp_balance?: number;
          currency?: CurrencyCode;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      
      cash_drawer_sessions: {
        Row: {
          id: string;
          store_id: string;
          account_id: string;
          opened_by: string;
          opened_at: string;
          closed_at: string | null;
          closed_by: string | null;
          opening_amount: number;
          expected_amount: number | null;
          actual_amount: number | null;
          variance: number | null;
          status: 'open' | 'closed';
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          account_id: string;
          opened_by: string;
          opened_at?: string;
          closed_at?: string | null;
          closed_by?: string | null;
          opening_amount: number;
          expected_amount?: number | null;
          actual_amount?: number | null;
          variance?: number | null;
          status?: 'open' | 'closed';
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          account_id?: string;
          opened_by?: string;
          opened_at?: string;
          closed_at?: string | null;
          closed_by?: string | null;
          opening_amount?: number;
          expected_amount?: number | null;
          actual_amount?: number | null;
          variance?: number | null;
          status?: 'open' | 'closed';
          notes?: string | null;
          updated_at?: string;
        };
      };
      users: {
        /** Overlap: `UserCore` from `@pos-platform/shared`; `is_active` optional here for legacy/synced rows (normative core requires boolean — see feature research). */
        Row: Omit<UserCore, 'is_active'> & {
          /** Present in admin-app; optional on synced store rows when column absent. */
          is_active?: boolean;
          phone?: string | null;
          address?: string | null;
          monthly_salary?: string | null; // Numeric amount string (e.g., "500.00"); currency is in salary_currency
          salary_currency?: string | null; // CurrencyCode (e.g., "USD", "LBP", "EUR") — sourced from store's accepted_currencies
          // Note: Running balances are calculated from journal entries (account 2200 - Salaries Payable)
          working_hours_start?: string | null;
          working_hours_end?: string | null;
          working_days?: string | null;
          _synced?: boolean;
          _deleted?: boolean;
        };
        Insert: {
          phone?: string | null;
          address?: string | null;
          monthly_salary?: string | null;
          salary_currency?: string | null;
          working_hours_start?: string | null;
          working_hours_end?: string | null;
          working_days?: string | null;

          id: string;
          email: string;
          name: string;
          role: 'admin' | 'manager' | 'cashier';
          store_id: string;
          created_at?: string;
          updated_at?: string;
          _synced?: boolean;
          _deleted?: boolean;
        };
        Update: {
          id?: string;
          phone?: string | null;
          address?: string | null;
          monthly_salary?: string | null;
          salary_currency?: string | null;
          working_hours_start?: string | null;
          working_hours_end?: string | null;
          working_days?: string | null;
          email?: string;
          name?: string;
          role?: 'admin' | 'manager' | 'cashier';
          store_id?: string;
          updated_at?: string;
          _synced?: boolean;
          _deleted?: boolean;
        };
      };
      stores: {
        /** Remote `stores` row: normative overlap `StoreCore` + store-app extensions (not Dexie-only `_synced`). */
        Row: StoreCore & {
          preferred_commission_rate: number;
          low_stock_alert: boolean;
          address: string | null;
          phone: string | null;
          email: string | null;
          logo: string | null;
          status: 'active' | 'suspended' | 'archived';
          /** Tenant vertical (v64) — drives admin-side seeding of categories + units. */
          tenant_type?: string;
        };
        Insert: {
          id?: string;
          country?: string | null;
          accepted_currencies?: CurrencyCode[];
          preferred_currency?: CurrencyCode;
          preferred_language?: 'en' | 'ar'|'fr';
          preferred_commission_rate?: number;
          exchange_rate?: number;
          exchange_rates?: ExchangeRatesMap;
          low_stock_alert?: boolean;
          name: string;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          logo?: string | null;
          status?: 'active' | 'suspended' | 'archived';
          tenant_type?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          country?: string | null;
          accepted_currencies?: CurrencyCode[];
          preferred_currency?: CurrencyCode;
          preferred_language?: 'en' | 'ar'|'fr';
          preferred_commission_rate?: number;
          exchange_rate?: number;
          exchange_rates?: ExchangeRatesMap;
          low_stock_alert?: boolean;
          id?: string;
          name?: string;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          logo?: string | null;
          status?: 'active' | 'suspended' | 'archived';
          tenant_type?: string;
          updated_at?: string;
        };
      };
      branches: {
        /** Remote `branches` row: normative overlap `BranchCore` + shared remote columns (soft-delete may be present before sync strips to `_deleted` locally). */
        Row: BranchCore & {
          logo: string | null;
          is_deleted?: boolean;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Insert: {
          id?: string;
          store_id: string;
          name: string;
          address?: string | null;
          phone?: string | null;
          is_active?: boolean;
          logo?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          name?: string;
          address?: string | null;
          phone?: string | null;
          is_active?: boolean;
          logo?: string | null;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          name: string;
          /** FK into `product_categories.id` (v64+). Source of truth. */
          category_id?: string | null;
          /** @deprecated Legacy text category. */
          category?: string | null;
          image: string;
          store_id: string | null; // null for global products
          is_global: boolean;
          /** Tenant vertical tag (v65+). Only meaningful when is_global=true. */
          tenant_type?: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category_id?: string | null;
          /** @deprecated Legacy text category. */
          category?: string | null;
          image: string;
          store_id: string | null; // null for global products
          is_global?: boolean;
          tenant_type?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category_id?: string | null;
          /** @deprecated Legacy text category. */
          category?: string | null;
          image?: string;
          is_global?: boolean;
          tenant_type?: string | null;
          updated_at?: string;
        };
      };
      product_categories: {
        Row: {
          id: string;
          store_id: string;
          code: string;
          name: import('../utils/multilingual').MultilingualString;
          sort_order: number;
          is_active: boolean;
          is_system: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          code: string;
          name: import('../utils/multilingual').MultilingualString;
          sort_order?: number;
          is_active?: boolean;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: import('../utils/multilingual').MultilingualString;
          sort_order?: number;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      units_of_measure: {
        Row: {
          id: string;
          store_id: string;
          code: string;
          name: import('../utils/multilingual').MultilingualString;
          symbol?: string | null;
          system_role?: import('./taxonomy').UnitSystemRole | null;
          conversion_to_base?: number | null;
          base_unit_code?: string | null;
          sort_order: number;
          is_active: boolean;
          is_system: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          code: string;
          name: import('../utils/multilingual').MultilingualString;
          symbol?: string | null;
          system_role?: import('./taxonomy').UnitSystemRole | null;
          conversion_to_base?: number | null;
          base_unit_code?: string | null;
          sort_order?: number;
          is_active?: boolean;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: import('../utils/multilingual').MultilingualString;
          symbol?: string | null;
          system_role?: import('./taxonomy').UnitSystemRole | null;
          conversion_to_base?: number | null;
          base_unit_code?: string | null;
          sort_order?: number;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      suppliers: {
        Row: {
          id: string;
          name: string;
          phone: string;
          email: string | null;
          address: string;
          store_id: string;
          created_at: string;
          updated_at: string;
          /** Per-currency balance map (primary surface). Derived from journal entries. */
          balances?: Partial<Record<CurrencyCode, number>>;
          /** Per-currency advance-payment map. */
          advance_balances?: Partial<Record<CurrencyCode, number>>;
          /** @deprecated Use `balances.LBP`. Kept as a back-compat mirror. */
          lb_balance?: number | null;
          /** @deprecated Use `balances.USD`. */
          usd_balance?: number | null;
          /** @deprecated Use `advance_balances.LBP`. */
          advance_lb_balance?: number | null;
          /** @deprecated Use `advance_balances.USD`. */
          advance_usd_balance?: number | null;
        };
        Insert: {
          id?: string;
          name: string;
          phone: string;
          email?: string | null;
          address: string;
          store_id: string;
          created_at?: string;
          updated_at?: string;
          balances?: Partial<Record<CurrencyCode, number>>;
          advance_balances?: Partial<Record<CurrencyCode, number>>;
          /** @deprecated Use `balances.LBP`. */
          lb_balance?: number | null;
          /** @deprecated Use `balances.USD`. */
          usd_balance?: number | null;
          /** @deprecated Use `advance_balances.LBP`. */
          advance_lb_balance?: number | null;
          /** @deprecated Use `advance_balances.USD`. */
          advance_usd_balance?: number | null;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string;
          email?: string | null;
          address?: string;
          balances?: Partial<Record<CurrencyCode, number>>;
          advance_balances?: Partial<Record<CurrencyCode, number>>;
          /** @deprecated Use `balances.LBP`. */
          lb_balance?: number | null;
          /** @deprecated Use `balances.USD`. */
          usd_balance?: number | null;
          /** @deprecated Use `advance_balances.LBP`. */
          advance_lb_balance?: number | null;
          /** @deprecated Use `advance_balances.USD`. */
          advance_usd_balance?: number | null;
          updated_at?: string;
        };
      };
      customers: {
        Row: {
          id: string;
          name: string;
          phone: string;
          email: string | null;
          address: string | null;
          /** Per-currency balance map (primary surface). Derived from journal entries. */
          balances?: Partial<Record<CurrencyCode, number>>;
          /** Per-currency credit-limit map. */
          max_balances?: Partial<Record<CurrencyCode, number>>;
          /** @deprecated Use `balances.LBP`. */
          lb_balance: number;
          /** @deprecated Use `balances.USD`. */
          usd_balance: number;
          /** @deprecated Use `max_balances.LBP`. */
          lb_max_balance?: number | null;
          /** @deprecated Use `max_balances.USD`. */
          usd_max_balance?: number | null;
          is_active: boolean;
          store_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone: string;
          email?: string | null;
          address?: string | null;
          balances?: Partial<Record<CurrencyCode, number>>;
          max_balances?: Partial<Record<CurrencyCode, number>>;
          /** @deprecated Use `balances.LBP`. */
          lb_balance?: number;
          /** @deprecated Use `balances.USD`. */
          usd_balance?: number;
          /** @deprecated Use `max_balances.LBP`. */
          lb_max_balance?: number | null;
          /** @deprecated Use `max_balances.USD`. */
          usd_max_balance?: number | null;
          is_active?: boolean;
          store_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string;
          email?: string | null;
          address?: string | null;
          balances?: Partial<Record<CurrencyCode, number>>;
          max_balances?: Partial<Record<CurrencyCode, number>>;
          /** @deprecated Use `balances.LBP`. */
          lb_balance?: number;
          /** @deprecated Use `balances.USD`. */
          usd_balance?: number;
          /** @deprecated Use `max_balances.LBP`. */
          lb_max_balance?: number | null;
          /** @deprecated Use `max_balances.USD`. */
          usd_max_balance?: number | null;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      inventory_items: {
        Row: {
          id: string;
          product_id: string;
          quantity: number;
          selling_price: number | null;
          /** @deprecated Legacy unit code. Use `unit_id`. */
          unit: string;
          /** FK into `units_of_measure.id` (v64+). */
          unit_id?: string | null;
          weight: number | null;
          price: number | null;
          store_id: string;
          created_at: string;
          received_quantity: number;
          batch_id: string | null;
          sku: string | null;
          updated_at: string;
          is_archived: boolean | null;
          currency: CurrencyCode | null;
        };
        Insert:{
          id: string;
          product_id?: string;
          quantity?: number;
          selling_price?: number | null;
          unit?: string;
          unit_id?: string | null;
          weight?: number | null;
          price?: number | null;
          store_id?: string;
          created_at?: string;
          received_quantity?: number;
          batch_id?: string | null;
          sku?: string | null;
          updated_at?: string;
          is_archived?: boolean | null;
          currency: CurrencyCode;
        };
        Update: {
          id: string;
          product_id?: string;
          quantity?: number;
          selling_price?: number | null;
          unit?: string;
          unit_id?: string | null;
          weight?: number | null;
          price?: number | null;
          store_id?: string;
          created_at?: string;
          received_quantity?: number;
          batch_id?: string | null;
          sku?: string | null;
          updated_at?: string;
          is_archived?: boolean | null;
          currency?: CurrencyCode;
        };
      };
      bills: {
        Row: {
          id: string;
          store_id: string;
          bill_number: string;
          entity_id: string | null; // Unified field for customer_id, supplier_id, or employee_id
          subtotal: number;
          total_amount: number;
          payment_method: 'cash' | 'card' | 'credit';
          payment_status: 'paid' | 'partial' | 'pending';
          amount_paid: number;
          amount_due: number;
          bill_date: string;
          notes: string | null;
          status: 'active' | 'cancelled' | 'refunded';
          created_by: string;
          created_at: string;
          updated_at: string;
          last_modified_by: string | null;
          last_modified_at: string | null;
          currency: CurrencyCode;
        };
        Insert: {
          id?: string;
          store_id: string;
          bill_number: string;
          entity_id?: string | null; // Unified field for customer_id, supplier_id, or employee_id
          subtotal?: number;
          total_amount?: number;
          payment_method: 'cash' | 'card' | 'credit';
          payment_status: 'paid' | 'partial' | 'pending';
          amount_paid?: number;
          amount_due?: number;
          bill_date?: string;
          notes?: string | null;
          status?: 'active' | 'cancelled' | 'refunded';
          created_by: string;
          created_at?: string;
          updated_at?: string;
          last_modified_by?: string | null;
          last_modified_at?: string | null;
          currency: CurrencyCode;
        };
        Update: {
          id?: string;
          store_id?: string;
          bill_number?: string;
          customer_id?: string | null;
          subtotal?: number;
          total_amount?: number;
          payment_method?: 'cash' | 'card' | 'credit';
          payment_status?: 'paid' | 'partial' | 'pending';
          amount_paid?: number;
          amount_due?: number;
          bill_date?: string;
          notes?: string | null;
          status?: 'active' | 'cancelled' | 'refunded';
          created_by?: string;
          updated_at?: string;
          last_modified_by?: string | null;
          last_modified_at?: string | null;
          currency?: CurrencyCode;
        };
      };
      public_access_tokens: {
        Row: {
          id: string;
          customer_id: string;
          bill_id: string | null;
          token: string;
          expires_at: string;
          created_at: string;
          accessed_at: string | null;
          access_count: number;
          revoked: boolean;
          last_ip_address: string | null;
          last_user_agent: string | null;
        };
        Insert: {
          id?: string;
          customer_id: string;
          bill_id?: string | null;
          token?: string;
          expires_at?: string;
          created_at?: string;
          accessed_at?: string | null;
          access_count?: number;
          revoked?: boolean;
          last_ip_address?: string | null;
          last_user_agent?: string | null;
        };
        Update: {
          id?: string;
          customer_id?: string;
          bill_id?: string | null;
          token?: string;
          expires_at?: string;
          accessed_at?: string | null;
          access_count?: number;
          revoked?: boolean;
          last_ip_address?: string | null;
          last_user_agent?: string | null;
        };
      };
      bill_line_items: {
        Row: {
          id: string;
          store_id: string;
          bill_id: string;
          product_id: string;
          product_name: string;
          supplier_id: string;
          supplier_name: string;
          inventory_item_id: string | null;
          quantity: number;
          unit_price: number;
          line_total: number;
          weight: number | null;
          notes: string | null;
          line_order: number;
          payment_method: 'cash' | 'card' | 'credit';
          customer_id: string | null;
          created_by: string;
          received_value: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          bill_id: string;
          product_id: string;
          product_name: string;
          supplier_id: string;
          supplier_name: string;
          inventory_item_id?: string | null;
          quantity: number;
          unit_price: number;
          line_total: number;
          weight?: number | null;
          notes?: string | null;
          line_order?: number;
          payment_method: 'cash' | 'card' | 'credit';
          customer_id?: string | null;
          created_by: string;
          received_value: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          bill_id?: string;
          product_id?: string;
          product_name?: string;
          supplier_id?: string;
          supplier_name?: string;
          inventory_item_id?: string | null;
          quantity?: number;
          unit_price?: number;
          line_total?: number;
          weight?: number | null;
          notes?: string | null;
          line_order?: number;
          payment_method?: 'cash' | 'card' | 'credit';
          customer_id?: string | null;
          created_by?: string;
          received_value?: number;
          updated_at?: string;
        };
      };
      bill_audit_logs: {
        Row: {
          id: string;
          store_id: string;
          bill_id: string;
          action: 'created' | 'updated' | 'deleted' | 'item_added' | 'item_removed' | 'item_modified' | 'payment_updated';
          field_changed: string | null;
          old_value: string | null;
          new_value: string | null;
          change_reason: string | null;
          changed_by: string;
          ip_address: string | null;
        
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          bill_id: string;
          action: 'created' | 'updated' | 'deleted' | 'item_added' | 'item_removed' | 'item_modified' | 'payment_updated';
          field_changed?: string | null;
          old_value?: string | null;
          new_value?: string | null;
          change_reason?: string | null;
          changed_by: string;
          ip_address?: string | null;
        
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          bill_id?: string;
          action?: 'created' | 'updated' | 'deleted' | 'item_added' | 'item_removed' | 'item_modified' | 'payment_updated';
          field_changed?: string | null;
          old_value?: string | null;
          new_value?: string | null;
          change_reason?: string | null;
          changed_by?: string;
          ip_address?: string | null;
        
          updated_at?: string;
        };
      };
      inventory_bills: {
        Row: {
          id: string;
          plastic_fee?:string;
          supplier_id: string;
          porterage_fee?: number | null;
          transfer_fee?: number | null;
          received_at: string;
          store_id: string;
          created_by: string;
          status?: string;
          created_at:string;
          notes?:string;
          commission_rate?:number | null;
          type:string
        };
        Insert: {
          id: string;
          plastic_fee?:string;
          supplier_id: string;
          porterage_fee?: number | null;
          transfer_fee?: number | null;
          received_at: string;
          store_id: string;
          created_by: string;
          status?: string;
          created_at:string;
          commission_rate?:number | null;
          type?:string
          notes?:string
        };
        Update: {
          id: string;
          plastic_fee?:string;
          supplier_id: string;
          porterage_fee?: number | null;
          transfer_fee?: number | null;
          received_at: string;
          store_id: string;
          created_by: string;
          status?: string;
          commission_rate?:number | null;
          created_at:string;
          type?:string
          notes?:string
        };
      };
      transactions: {
        Row: {

          id: string;
          type: 'income' | 'expense';
          category: string;
          amount: number;
          currency: CurrencyCode;
          description: string;
          reference: string | null;
          store_id: string;
          created_by: string;
          created_at: string;
          supplier_id: string | null;
          customer_id: string | null;
          employee_id?: string | null;
          entity_id?: string | null; // Unified field for customer_id, supplier_id, or employee_id
          is_reversal: boolean;
          reversal_of_transaction_id?: string | null;
        };
        Insert: {
          id: string;
          type: 'income' | 'expense';
          category: string;
          amount: number;
          currency: CurrencyCode;
          description: string;
          reference?: string | null;
          store_id: string;
          created_by: string;
          created_at?: string;
          supplier_id?: string | null;
          customer_id?: string | null;
          employee_id?: string | null;
          entity_id?: string | null; // Unified field for customer_id, supplier_id, or employee_id
          is_reversal?: boolean;
          reversal_of_transaction_id?: string | null;
        };
        Update: {
          id: string;
          amount?: number;
          description?: string;
          reference?: string | null;
          supplier_id?: string | null;
          customer_id?: string | null;
          employee_id?: string | null;
          entity_id?: string | null; // Unified field for customer_id, supplier_id, or employee_id
          is_reversal?: boolean;
          reversal_of_transaction_id?: string | null;
        };
      };
      missed_products: {
        Row: {
          id: string;
          session_id: string;
          inventory_item_id: string;
          system_quantity: number;
          physical_quantity: number;
          variance: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          inventory_item_id: string;
          system_quantity: number;
          physical_quantity: number;
          variance: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          inventory_item_id?: string;
          system_quantity?: number;
          physical_quantity?: number;
          variance?: number;
          notes?: string | null;
          updated_at?: string;
        };
      };
      employee_attendance: {
        Row: {
          id: string;
          store_id: string;
          employee_id: string;
          check_in_at: string;
          check_out_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          _synced?: boolean;
          _deleted?: boolean;
        };
        Insert: {
          id?: string;
          store_id: string;
          employee_id: string;
          check_in_at?: string;
          check_out_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          _synced?: boolean;
          _deleted?: boolean;
        };
        Update: {
          id?: string;
          store_id?: string;
          employee_id?: string;
          check_in_at?: string;
          check_out_at?: string | null;
          notes?: string | null;
          updated_at?: string;
          _synced?: boolean;
          _deleted?: boolean;
        };
      };
      // Accounting foundation tables
      entities: {
        Row: {
          id: string;
          store_id: string;
          branch_id: string | null;
          entity_type: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal';
          name: string;
          phone: string | null;
          is_system_entity: boolean;
          is_active: boolean;
          customer_data: object | null;
          supplier_data: object | null;
          created_at: string;
          updated_at: string;
          _synced: boolean;
          _deleted: boolean;
        };
        Insert: {
          id?: string;
          store_id: string;
          branch_id: string | null;
          entity_type: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal';
          name: string;
          phone?: string | null;
          is_system_entity?: boolean;
          is_active?: boolean;
          customer_data?: object | null;
          supplier_data?: object | null;
          created_at?: string;
          updated_at?: string;
          _synced?: boolean;
          _deleted?: boolean;
        };
        Update: {
          id?: string;
          store_id?: string;
          branch_id?: string | null;
          entity_type?: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal';
          name?: string;
          phone?: string | null;
          is_system_entity?: boolean;
          is_active?: boolean;
          customer_data?: object | null;
          supplier_data?: object | null;
          updated_at?: string;
          _synced?: boolean;
          _deleted?: boolean;
        };
      };
      chart_of_accounts: {
        Row: {
          id: string;
          store_id: string;
          account_code: string;
          account_name: string;
          account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
          requires_entity: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          _synced: boolean;
          _deleted: boolean;
        };
        Insert: {
          id?: string;
          store_id: string;
          account_code: string;
          account_name: string;
          account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
          requires_entity: boolean;
          is_active: boolean;
          created_at?: string;
          updated_at?: string;
          _synced?: boolean;
          _deleted?: boolean;
        };
        Update: {
          id?: string;
          store_id?: string;
          account_code?: string;
          account_name?: string;
          account_type?: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
          requires_entity?: boolean;
          is_active?: boolean;
          updated_at?: string;
          _synced?: boolean;
          _deleted?: boolean;
        };
      };
      journal_entries: {
        Row: {
          id: string;
          store_id: string;
          branch_id: string | null;
          transaction_id: string;
          account_code: string;
          account_name: string;
          /** Self-describing per-currency debit/credit map. Immutable once written. */
          amounts: JournalEntryAmounts;
          entity_id: string;
          entity_type: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal';
          posted_date: string;
          fiscal_period: string;
          is_posted: boolean;
          description?: string;
          created_at: string;
          created_by: string;
          _synced: boolean;
          bill_id?: string | null;
          reversal_of_journal_entry_id?: string | null;
          entry_type?: 'original' | 'reversal' | 'reactivation';
        };
        Insert: {
          id?: string;
          store_id: string;
          branch_id?: string | null;
          transaction_id: string;
          account_code: string;
          account_name: string;
          amounts?: JournalEntryAmounts;
          entity_id: string;
          entity_type: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal';
          posted_date?: string;
          fiscal_period: string;
          is_posted?: boolean;
          description?: string;
          created_at?: string;
          created_by?: string;
          _synced?: boolean;
          bill_id?: string | null;
          reversal_of_journal_entry_id?: string | null;
          entry_type?: 'original' | 'reversal' | 'reactivation';
        };
        Update: {
          id?: string;
          store_id?: string;
          branch_id?: string | null;
          transaction_id?: string;
          account_code?: string;
          account_name?: string;
          amounts?: JournalEntryAmounts;
          entity_id?: string;
          entity_type?: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal';
          posted_date?: string;
          fiscal_period?: string;
          is_posted?: boolean;
          description?: string;
          updated_at?: string;
          created_by?: string;
          _synced?: boolean;
          bill_id?: string | null;
          reversal_of_journal_entry_id?: string | null;
          entry_type?: 'original' | 'reversal' | 'reactivation';
        };
      };
      balance_snapshots: {
        Row: {
          id: string;
          store_id: string;
          branch_id: string | null;
          account_code: string;
          entity_id: string | null;
          /** Self-describing per-currency running balance map. */
          balances: BalanceSnapshotMap;
          snapshot_date: string;
          snapshot_type: 'hourly' | 'daily' | 'end_of_day';
          verified: boolean;
          created_at: string;
          _synced: boolean;
        };
        Insert: {
          id?: string;
          store_id: string;
          branch_id: string | null;
          account_code: string;
          entity_id: string | null;
          balances?: BalanceSnapshotMap;
          snapshot_date: string;
          snapshot_type: 'hourly' | 'daily' | 'end_of_day';
          verified: boolean;
          created_at?: string;
          _synced?: boolean;
        };
        Update: {
          id?: string;
          store_id?: string;
          branch_id?: string | null;
          account_code?: string;
          entity_id?: string | null;
          balances?: BalanceSnapshotMap;
          snapshot_date?: string;
          snapshot_type?: 'hourly' | 'daily' | 'end_of_day';
          verified?: boolean;
          updated_at?: string;
          _synced?: boolean;
        };
      };
      
      // RBAC Tables
      user_module_access: {
        Row: {
          id: string;
          user_id: string;
          store_id: string;
          module: string;
          can_access: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          store_id: string;
          module: string;
          can_access?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          store_id?: string;
          module?: string;
          can_access?: boolean;
          updated_at?: string;
        };
      };
      
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}