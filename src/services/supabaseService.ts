import { supabase, handleSupabaseError } from '../lib/supabase';
import { Database } from '../types/database';

type Tables = Database['public']['Tables'];

// Generic CRUD operations
export class SupabaseService {
  // Products
  static async getProducts(storeId: string) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async createProduct(product: Tables['products']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert(product)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async updateProduct(id: string, updates: Tables['products']['Update']) {
    try {
      const { data, error } = await supabase
        .from('products')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  // Suppliers
  static async getSuppliers(storeId: string) {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async createSupplier(supplier: Tables['suppliers']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert(supplier)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  // Customers
  static async getCustomers(storeId: string) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async createCustomer(customer: Tables['customers']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .insert(customer)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async updateCustomer(id: string, updates: Tables['customers']['Update']) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  // Inventory
  static async getInventoryItems(storeId: string) {
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select(`
          *,
          products(name, category),
          suppliers(name)
        `)
        .eq('store_id', storeId)
        .order('received_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async createInventoryItem(item: Tables['inventory_items']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .insert(item)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  // Sales
  static async getSales(storeId: string, limit?: number) {
    try {
      let query = supabase
        .from('sales')
        .select(`
          *,
          customers(name),
          sale_items(*)
        `)
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async createSale(sale: Tables['sales']['Insert'], items: Tables['sale_items']['Insert'][]) {
    try {
      // Start a transaction
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert(sale)
        .select()
        .single();

      if (saleError) throw saleError;

      // Insert sale items
      const saleItemsWithSaleId = items.map(item => ({
        ...item,
        sale_id: saleData.id
      }));

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItemsWithSaleId);

      if (itemsError) throw itemsError;

      return saleData;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  // Transactions
  static async getTransactions(storeId: string, type?: 'income' | 'expense') {
    try {
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async createTransaction(transaction: Tables['transactions']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert(transaction)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  // Expense Categories
  static async getExpenseCategories(storeId: string) {
    try {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async createExpenseCategory(category: Tables['expense_categories']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('expense_categories')
        .insert(category)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  // User Profile
  static async getUserProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          stores(*)
        `)
        .eq('id', userId)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async createUserProfile(profile: Tables['users']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('users')
        .insert(profile)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  // Real-time subscriptions
  static subscribeToTable(table: string, callback: (payload: any) => void, storeId?: string) {
    let channel = supabase
      .channel(`${table}_changes`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table,
          ...(storeId && { filter: `store_id=eq.${storeId}` })
        }, 
        callback
      );

    return channel.subscribe();
  }
}