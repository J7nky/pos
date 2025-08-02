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
          balance: number | null;
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
          balance?: number | null;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string;
          email?: string | null;
          address?: string;
          balance?: number | null;
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
          balance: number;
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
          balance?: number;
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
          balance?: number;
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
          received_quantity: number;
        };
        Insert: {
          id?: string;
          product_id: string;
          supplier_id: string;
          type: 'commission' | 'cash';
          quantity: number;
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
          received_quantity: number;
        };
        Update: {
          id?: string;
          quantity?: number;
          weight?: number | null;
          porterage?: number | null;
          transfer_fee?: number | null;
          price?: number | null;
          commission_rate?: number | null;
          notes?: string | null;
          received_quantity?: number;
        };
      };
      sale_items: {
        Row: {
          id: string;
          inventory_item_id: string;
          product_id: string;
          supplier_id: string;
          weight: number | null;
          unit_price: number;
          received_value: number;
          notes: string | null;
          created_at: string;
          store_id: string;
          customer_id: string | null;
          created_by: string;
        };
        Insert: {
          id?: string;
          inventory_item_id: string;
          product_id: string;
          supplier_id: string;
          weight?: number | null;
          unit_price: number;
          received_value: number;
          notes?: string | null;
          created_at?: string;
          store_id: string;
          customer_id?: string | null;
          created_by: string;
        };
        Update: {
          id?: string;
          inventory_item_id: string;
          product_id?: string;
          supplier_id?: string;
          weight?: number | null;
          unit_price?: number;
          received_value?: number;
          notes?: string | null;
          customer_id?: string | null;
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