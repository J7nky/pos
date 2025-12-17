export interface Database {
  public: {
    Tables: {
       
      cash_drawer_accounts: {
        Row: {
          id: string;
          store_id: string;
          account_code: string;
          name: string;
          current_balance: number;
          currency: 'USD' | 'LBP';
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          account_code: string;
          name: string;
          current_balance?: number;
          currency?: 'USD' | 'LBP';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          account_code?: string;
          name?: string;
          current_balance?: number;
          currency?: 'USD' | 'LBP';
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
        Row: {
          id: string;
          email: string;
          name: string;
          role: 'admin' | 'manager' | 'cashier';
          store_id: string;
          created_at: string;
          updated_at: string;
          phone?: string | null;
          address?: string | null;
          monthly_salary?: string | null;
          lbp_balance?: number | null;
          usd_balance?: number | null;
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
          lbp_balance?: number | null;
          usd_balance?: number | null;
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
          lbp_balance?: number | null;
          usd_balance?: number | null;
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
        Row: {
          id: string;
          preferred_currency: 'USD' | 'LBP';
          preferred_language: 'en' | 'ar'|'fr';
          preferred_commission_rate: number;
          exchange_rate: number;
          low_stock_alert: boolean;
          name: string;
          address: string | null;
          phone: string | null;
          email: string | null;
          status: 'active' | 'suspended' | 'archived';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          preferred_currency?: 'USD' | 'LBP';
          preferred_language?: 'en' | 'ar'|'fr';
          preferred_commission_rate?: number;
          exchange_rate?: number;
          low_stock_alert?: boolean;
          name: string;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          status?: 'active' | 'suspended' | 'archived';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          preferred_currency?: 'USD' | 'LBP';
          preferred_language?: 'en' | 'ar'|'fr';
          preferred_commission_rate?: number;
          exchange_rate?: number;
          low_stock_alert?: boolean;
          id?: string;
          name?: string;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          status?: 'active' | 'suspended' | 'archived';
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          name: string;
          category: string;
          image: string;
          store_id: string | null; // null for global products
          is_global: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category: string;
          image: string;
          store_id: string | null; // null for global products
          is_global?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string;
          image?: string;
          is_global?: boolean;
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
          lb_balance: number | null;
          usd_balance: number | null;
          advance_lb_balance: number | null;
          advance_usd_balance: number | null;
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
          lb_balance?: number | null;
          usd_balance?: number | null;
          advance_lb_balance?: number | null;
          advance_usd_balance?: number | null;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string;
          email?: string | null;
          address?: string;
          lb_balance?: number | null;
          usd_balance?: number | null;
          advance_lb_balance?: number | null;
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
          lb_balance: number;
          usd_balance: number;
          lb_max_balance?: number | null; // Maximum allowed balance in LBP
          usd_max_balance?: number | null; // Maximum allowed balance in USD
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
          lb_balance?: number;
          usd_balance?: number;
          lb_max_balance?: number | null; // Maximum allowed balance in LBP
          usd_max_balance?: number | null; // Maximum allowed balance in USD
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
          lb_balance?: number;
          usd_balance?: number;
          lb_max_balance?: number | null; // Maximum allowed balance in LBP
          usd_max_balance?: number | null; // Maximum allowed balance in USD
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
          unit: string;
          weight: number | null;
          price: number | null;
          store_id: string;
          created_at: string;
          received_quantity: number;
          batch_id: string | null;
          sku: string | null;
          updated_at: string;
        };
        Insert:{
          id: string;
          product_id?: string;
          quantity?: number;
          selling_price?: number | null;
          unit?: string;
          weight?: number | null;
          price?: number | null;
          store_id?: string;
          created_at?: string;
          received_quantity?: number;
          batch_id?: string | null;
          sku?: string | null;
          updated_at?: string;
        };
        Update: {
          id: string;
          product_id?: string;
          quantity?: number;
          selling_price?: number | null;
          unit?: string;
          weight?: number | null;
          price?: number | null;
          store_id?: string;
          created_at?: string;
          received_quantity?: number;
          batch_id?: string | null;
          sku?: string | null;
          updated_at?: string;
        };
      };
      bills: {
        Row: {
          id: string;
          store_id: string;
          bill_number: string;
          customer_id: string | null;
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
        };
        Insert: {
          id?: string;
          store_id: string;
          bill_number: string;
          customer_id?: string | null;
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
          currency: 'USD' | 'LBP';
          description: string;
          reference: string | null;
          store_id: string;
          created_by: string;
          created_at: string;
          supplier_id: string | null;
          customer_id: string | null;
          is_reversal: boolean;
          reversal_of_transaction_id?: string | null;
        };
        Insert: {
          id: string;
          type: 'income' | 'expense';
          category: string;
          amount: number;
          currency: 'USD' | 'LBP';
          description: string;
          reference?: string | null;
          store_id: string;
          created_by: string;
          created_at?: string;
          supplier_id?: string | null;
          customer_id?: string | null;
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
          lb_balance: number;
          usd_balance: number;
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
          lb_balance?: number;
          usd_balance?: number;
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
          lb_balance?: number;
          usd_balance?: number;
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
          debit: number;
          credit: number;
          currency: 'USD' | 'LBP';
          entity_id: string;
          entity_type: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal';
          posted_date: string;
          fiscal_period: string;
          is_posted: boolean;
          description?: string;
          created_at: string;
          created_by: string;
          _synced: boolean;
        };
        Insert: {
          id?: string;
          store_id: string;
          branch_id: string | null;
          transaction_id: string;
          account_code: string;
          account_name: string;
          debit: number;
          credit: number;
          currency: 'USD' | 'LBP';
          entity_id: string;
          entity_type: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal';
          posted_date: string;
          fiscal_period: string;
          is_posted: boolean;
          description?: string;
          created_at?: string;
          created_by?: string;
          _synced?: boolean;
        };
        Update: {
          id?: string;
          store_id?: string;
          branch_id?: string | null;
          transaction_id?: string;
          account_code?: string;
          account_name?: string;
          debit?: number;
          credit?: number;
          currency?: 'USD' | 'LBP';
          entity_id?: string;
          entity_type?: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal';
          posted_date?: string;
          fiscal_period?: string;
          is_posted?: boolean;
          description?: string;
          updated_at?: string;
          created_by?: string;
          _synced?: boolean;
        };
      };
      balance_snapshots: {
        Row: {
          id: string;
          store_id: string;
          branch_id: string | null;
          account_code: string;
          entity_id: string | null;
          balance_usd: number;
          balance_lbp: number;
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
          balance_usd: number;
          balance_lbp: number;
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
          balance_usd?: number;
          balance_lbp?: number;
          snapshot_date?: string;
          snapshot_type?: 'hourly' | 'daily' | 'end_of_day';
          verified?: boolean;
          updated_at?: string;
          _synced?: boolean;
        };
      };
      
      // RBAC Tables
      role_operation_limits: {
        Row: {
          id: string;
          store_id: string;
          role: 'admin' | 'manager' | 'cashier';
          user_id: string | null;
          operation_type: string;
          limit_value: number;
          limit_currency: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          role: 'admin' | 'manager' | 'cashier';
          user_id?: string | null;
          operation_type: string;
          limit_value: number;
          limit_currency?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          role?: 'admin' | 'manager' | 'cashier';
          user_id?: string | null;
          operation_type?: string;
          limit_value?: number;
          limit_currency?: string | null;
          updated_at?: string;
        };
      };

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