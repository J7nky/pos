export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string;
          role: 'admin' | 'manager' | 'cashier';
          store_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name: string;
          role: 'admin' | 'manager' | 'cashier';
          store_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
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
          name: string;
          address: string;
          phone: string;
          email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          address: string;
          phone: string;
          email: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
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
          is_active: boolean;
          store_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category: string;
          image: string;
          is_active?: boolean;
          store_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string;
          image?: string;
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
          type: 'commission' | 'cash';
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
          address: string;
          type: 'commission' | 'cash';
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
          address?: string;
          type?: 'commission' | 'cash';
          is_active?: boolean;
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
          current_debt: number;
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
          current_debt?: number;
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
          current_debt?: number;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      inventory_items: {
        Row: {
          id: string;
          product_id: string;
          supplier_id: string;
          type: 'commission' | 'cash';
          quantity: number;
          received_quantity: number;
          unit: 'kg' | 'piece' | 'box' | 'bag';
          weight: number | null;
          porterage: number | null;
          transfer_fee: number | null;
          price: number | null;
          commission_rate: number | null;
          notes: string | null;
          received_at: string;
          received_by: string;
          store_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          supplier_id: string;
          type: 'commission' | 'cash';
          quantity: number;
          received_quantity: number;
          unit: 'kg' | 'piece' | 'box' | 'bag';
          weight?: number | null;
          porterage?: number | null;
          transfer_fee?: number | null;
          price?: number | null;
          commission_rate?: number | null;
          notes?: string | null;
          received_at?: string;
          received_by: string;
          store_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          quantity?: number;
          received_quantity?: number;
          weight?: number | null;
          porterage?: number | null;
          transfer_fee?: number | null;
          price?: number | null;
          commission_rate?: number | null;
          notes?: string | null;
        };
      };
      sales: {
        Row: {
          id: string;
          customer_id: string | null;
          subtotal: number;
          total: number;
          payment_method: 'cash' | 'card' | 'credit';
          amount_paid: number;
          amount_due: number;
          status: 'completed' | 'pending' | 'cancelled';
          notes: string | null;
          store_id: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id?: string | null;
          subtotal: number;
          total: number;
          payment_method: 'cash' | 'card' | 'credit';
          amount_paid: number;
          amount_due: number;
          status: 'completed' | 'pending' | 'cancelled';
          notes?: string | null;
          store_id: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          status?: 'completed' | 'pending' | 'cancelled';
          amount_paid?: number;
          amount_due?: number;
          notes?: string | null;
        };
      };
      sale_items: {
        Row: {
          id: string;
          sale_id: string;
          product_id: string;
          product_name: string;
          supplier_id: string;
          supplier_name: string;
          quantity: number;
          weight: number | null;
          unit_price: number;
          total_price: number;
          notes: string | null;
          store_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          sale_id: string;
          product_id: string;
          product_name: string;
          supplier_id: string;
          supplier_name: string;
          quantity: number;
          weight?: number | null;
          unit_price: number;
          total_price: number;
          notes?: string | null;
          store_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          sale_id?: string;
          product_id?: string;
          product_name?: string;
          supplier_id?: string;
          supplier_name?: string;
          quantity?: number;
          weight?: number | null;
          unit_price?: number;
          total_price?: number;
          notes?: string | null;
          store_id?: string;
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
        };
        Insert: {
          id?: string;
          type: 'income' | 'expense';
          category: string;
          amount: number;
          currency: 'USD' | 'LBP';
          description: string;
          reference?: string | null;
          store_id: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          amount?: number;
          description?: string;
          reference?: string | null;
        };
      };
      expense_categories: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          is_active: boolean;
          store_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          is_active?: boolean;
          store_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          is_active?: boolean;
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