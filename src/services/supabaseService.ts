import { supabase, handleSupabaseError } from '../lib/supabase';
import { Database } from '../types/database';

type Tables = Database['public']['Tables'];

// Generic CRUD operations
export class SupabaseService {
  // Products
  static async getProducts(storeId: any) {
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

  static async createProduct(product: any) {
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

  static async updateProduct(id: any, updates: any) {
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

  static async deleteProduct(id: any) {
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
  static async getSuppliers(storeId: any) {
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

  static async createSupplier(supplier: any) {
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
  static async getCustomers(storeId: any) {
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

  static async createCustomer(customer: any) {
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

  static async updateCustomer(id: any, updates: any) {
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
  static async getInventoryItems(storeId: any) {
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

  static async createInventoryItem(item: any) {
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

  static async updateInventoryItem(id: any, updates: any) {
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

  static async deleteInventoryItem(id: any) {
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
  static async getSaleItems(storeId: any, limit?: number) {
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

  static async createSaleItem(item: any) {
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

  static async deleteSaleItem(id: any) {
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

  static async deleteSaleItemsByInventoryItem(inventoryItemId: any) {
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

    static async updateSaleItem(id: any, updates: any) {
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
  static async getTransactions(storeId: any, type?: any) {
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

  static async createTransaction(transaction: any) {
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
    transaction: any,
    inventoryLogId?: any
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
            p_transaction_id: transactionData?.id as any,
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
  static async getBills(storeId: any, filters?: {
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
        query = query.eq('payment_status', filters.paymentStatus as any);
      }
      if (filters?.customerId) {
        query = query.eq('customer_id', filters.customerId as any);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status as any);
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



  static async getBillDetails(billId: any) {
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

  static async createBill(billData: any, lineItems: any) {
    try {
      // Start a transaction
      const { data: bill, error: billError } = await supabase
        .from('bills')
        .insert(billData)
        .select()
        .single();

      if (billError) throw billError;

      if (lineItems.length > 0) {
        // Add line items with the bill ID
        const lineItemsWithBillId = lineItems.map((item: any) => ({
          ...item,
          bill_id: bill.id
        }));

        const { error: lineItemsError } = await supabase
          .from('bill_line_items')
          .insert(lineItemsWithBillId);

        if (lineItemsError) throw lineItemsError;
      }

      return bill;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async updateBill(billId: any, updates: any) {
    try {
      const { data, error } = await supabase
        .from('bills')
        .update(updates)
        .eq('id', billId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async deleteBill(billId: any, softDelete: boolean = true) {
    try {
      if (softDelete) {
        // Soft delete - mark as cancelled
        const { error } = await supabase
          .from('bills')
          .update({ 
            status: 'cancelled',
            updated_at: new Date().toISOString()
          } as any)
          .eq('id', billId);

        if (error) throw error;
      } else {
        // Hard delete - remove from database
        const { error } = await supabase
          .from('bills')
          .delete()
          .eq('id', billId);

        if (error) throw error;
      }

      return true;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async createBillAuditLog(auditData: any) {
    try {
      const { data, error } = await supabase
        .from('bill_audit_logs')
        .insert(auditData)
        .select()
        .single();

      if (error) throw error;
      return data;
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
        .insert(lineItem as any)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async updateBillLineItem(lineItemId: any, updates: {
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
        } as any)
        .eq('id', lineItemId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async deleteBillLineItem(lineItemId: any) {
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
  static async getBillAuditLogs(billId: any) {
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

  // User Profile
  static async getUserProfile(userId: any) {
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

  static async createUserProfile(profile: any) {
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
    userId: any, 
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
          updated_at: new Date().toISOString(),
        } as any)
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