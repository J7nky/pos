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
          monthly_salary: string;
        };
        Insert: {
          monthly_salary?: string;

          id: string;
          email: string;
          name: string;
          role: 'admin' | 'manager' | 'cashier';
          store_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          monthly_salary?: string;
          email?: string;
          name?: string;
          role?: 'admin' | 'manager' | 'cashier';
          store_id?: string;
          updated_at?: string;
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
          address: string;
          phone: string;
          email: string;
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
          address: string;
          phone: string;
          email: string;
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
          address?: string;
          phone?: string;
          email?: string;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          name: string;
          category: string;
          image: string;
          store_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category: string;
          image: string;
          store_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string;
          image?: string;
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
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string;
          email?: string | null;
          address?: string;
          lb_balance?: number | null;
          usd_balance?: number | null;
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
          user_agent: string | null;
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
          user_agent?: string | null;
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
          user_agent?: string | null;
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
        };
        Update: {
          id: string;
          amount?: number;
          description?: string;
          reference?: string | null;
          supplier_id?: string | null;
          customer_id?: string | null;
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