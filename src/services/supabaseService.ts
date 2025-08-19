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

  static async deleteSaleItem(id: string) {
    try {
      const { error } = await supabase
        .from('sale_items')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true; // Return success indicator instead of deleted data
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async deleteSaleItemsByInventoryItem(inventoryItemId: string) {
    try {
      const { error } = await supabase
        .from('sale_items')
        .delete()
        .eq('inventory_item_id', inventoryItemId);
      if (error) throw error;
      return true;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async updateSaleItem(id: string, updates: Tables['sale_items']['Update']) {
    try {
      const { data, error } = await supabase
        .from('sale_items')
        .update(updates)
        .eq('id', id)
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

  // Bills Management
  static async getBills(storeId: string, filters?: {
    searchTerm?: string;
    dateFrom?: string;
    dateTo?: string;
    paymentStatus?: string;
    customerId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    try {
      let query = supabase
        .from('bills')
        .select(`
          *,
          customers(name),
          users!bills_created_by_fkey(name)
        `)
        .eq('store_id', storeId);

      // Apply filters
      if (filters?.searchTerm) {
        query = query.or(`bill_number.ilike.%${filters.searchTerm}%,customer_name.ilike.%${filters.searchTerm}%,notes.ilike.%${filters.searchTerm}%`);
      }
      if (filters?.dateFrom) {
        query = query.gte('bill_date', filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte('bill_date', filters.dateTo);
      }
      if (filters?.paymentStatus) {
        query = query.eq('payment_status', filters.paymentStatus);
      }
      if (filters?.customerId) {
        query = query.eq('customer_id', filters.customerId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      query = query.order('bill_date', { ascending: false });

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }
      if (filters?.offset) {
        query = query.range(filters.offset, (filters.offset || 0) + (filters.limit || 50) - 1);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async getBillDetails(billId: string) {
    try {
      const { data, error } = await supabase
        .from('bills')
        .select(`
          *,
          customers(name, phone, email),
          users!bills_created_by_fkey(name),
          bill_line_items(
            *,
            products(name, category),
            suppliers(name)
          ),
          bill_audit_logs(
            *,
            users!bill_audit_logs_changed_by_fkey(name)
          )
        `)
        .eq('id', billId)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async createBill(bill: {
    store_id: string;
    bill_number: string;
    customer_id?: string | null;
    customer_name?: string | null;
    subtotal: number;
    tax_amount?: number;
    discount_amount?: number;
    total_amount: number;
    payment_method: 'cash' | 'card' | 'credit';
    payment_status: 'paid' | 'partial' | 'pending';
    amount_paid: number;
    amount_due: number;
    bill_date?: string;
    due_date?: string | null;
    notes?: string | null;
    created_by: string;
  }) {
    try {
      const { data, error } = await supabase
        .from('bills')
        .insert(bill)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async updateBill(billId: string, updates: {
    customer_id?: string | null;
    customer_name?: string | null;
    subtotal?: number;
    tax_amount?: number;
    discount_amount?: number;
    total_amount?: number;
    payment_method?: 'cash' | 'card' | 'credit';
    payment_status?: 'paid' | 'partial' | 'pending';
    amount_paid?: number;
    amount_due?: number;
    due_date?: string | null;
    notes?: string | null;
    last_modified_by: string;
  }) {
    try {
      const { data, error } = await supabase
        .from('bills')
        .update({
          ...updates,
          last_modified_at: new Date().toISOString()
        })
        .eq('id', billId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async deleteBill(billId: string, softDelete: boolean = true) {
    try {
      if (softDelete) {
        const { data, error } = await supabase
          .from('bills')
          .update({ 
            status: 'cancelled',
            last_modified_at: new Date().toISOString()
          })
          .eq('id', billId)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      } else {
        const { error } = await supabase
          .from('bills')
          .delete()
          .eq('id', billId);
        
        if (error) throw error;
        return true;
      }
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  // Bill Line Items
  static async createBillLineItem(lineItem: {
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
    line_order: number;
  }) {
    try {
      const { data, error } = await supabase
        .from('bill_line_items')
        .insert(lineItem)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async updateBillLineItem(lineItemId: string, updates: {
    quantity?: number;
    unit_price?: number;
    line_total?: number;
    weight?: number | null;
    notes?: string | null;
  }) {
    try {
      const { data, error } = await supabase
        .from('bill_line_items')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', lineItemId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async deleteBillLineItem(lineItemId: string) {
    try {
      const { error } = await supabase
        .from('bill_line_items')
        .delete()
        .eq('id', lineItemId);
      
      if (error) throw error;
      return true;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  // Bill Audit Logs
  static async getBillAuditLogs(billId: string) {
    try {
      const { data, error } = await supabase
        .from('bill_audit_logs')
        .select(`
          *,
          users!bill_audit_logs_changed_by_fkey(name, email)
        `)
        .eq('bill_id', billId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async createBillAuditLog(auditLog: {
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
  }) {
    try {
      const { data, error } = await supabase
        .from('bill_audit_logs')
        .insert(auditLog)
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

  static async updateUserSettings(
    userId: string, 
    updates: {
      preferred_currency?: 'USD' | 'LBP';
      preferred_language?: 'en' | 'ar' | 'fr';
      preferred_commission_rate?: number;
    }
  ) {
    try {
      console.log('SupabaseService: updateUserSettings called with userId:', userId, 'updates:', updates);
      const { data, error } = await supabase
        .from('users')
        .update({ 
          ...updates, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', userId)
        .select()
        .single();
      
      if (error) {
        console.error('SupabaseService: Database error:', error);
        throw error;
      }
      
      console.log('SupabaseService: updateUserSettings successful, returned data:', data);
      return data;
    } catch (error) {
      console.error('SupabaseService: Exception in updateUserSettings:', error);
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