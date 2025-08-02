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

  static async deleteProduct(id: string) {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true; // Return success indicator instead of deleted data
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

  static async updateInventoryItem(id: string, updates: Tables['inventory_items']['Update']) {
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .update({ ...updates })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async deleteInventoryItem(id: string) {
    try {
      const { error } = await supabase
        .from('inventory_items')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true; // Return success indicator instead of deleted data
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  // Sale Items (since there's no sales table, we work directly with sale_items)
  static async getSaleItems(storeId: string, limit?: number) {
    try {
      let query = supabase
        .from('sale_items')
        .select(`
          *,
          customers(name),
          products(name, category),
          suppliers(name)
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

  static async createSaleItem(item: Tables['sale_items']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('sale_items')
        .insert(item)
        .select()
        .single();
      
      if (error) throw error;
      return data;
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

  static async createTransactionWithInventoryLog(
    transaction: Tables['transactions']['Insert'],
    inventoryLogId?: string
  ) {
    try {
      // Create the transaction
      const { data: transactionData, error: transactionError } = await supabase
        .from('transactions')
        .insert(transaction)
        .select()
        .single();
      
      if (transactionError) throw transactionError;

      // If inventory log ID is provided, link it to the transaction
      if (inventoryLogId && transactionData) {
        const { error: linkError } = await supabase
          .rpc('link_transaction_to_inventory_log', {
            p_transaction_id: transactionData.id,
            p_inventory_log_id: inventoryLogId
          });

        if (linkError) {
          console.warn('Failed to link transaction to inventory log:', linkError);
        }
      }

      return transactionData;
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

  // Stores
  static async getStores() {
    try {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
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