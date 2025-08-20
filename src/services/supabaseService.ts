import { supabase, handleSupabaseError } from '../lib/supabase';
import { Database } from '../types/database';

type Tables = Database['public']['Tables'];

export class SupabaseService {
  // User Management
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
      return null;
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
      return null;
    }
  }

  static async updateUserSettings(userId: string, updates: {
    preferred_currency?: 'USD' | 'LBP';
    preferred_language?: 'en' | 'ar' | 'fr';
    preferred_commission_rate?: number;
  }) {
    try {
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  }

  // Store Management
  static async getStores() {
    try {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }

  // Product Management
  static async getProducts(storeId: string) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('store_id', storeId)
        .order('name');
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return [];
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
      return null;
    }
  }

  static async updateProduct(id: string, updates: Tables['products']['Update']) {
    try {
      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  }

  static async deleteProduct(id: string) {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return true;
    } catch (error) {
      handleSupabaseError(error);
      return false;
    }
  }

  // Supplier Management
  static async getSuppliers(storeId: string) {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('store_id', storeId)
        .order('name');
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return [];
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
      return null;
    }
  }

  static async updateSupplier(id: string, updates: Tables['suppliers']['Update']) {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  }

  // Customer Management
  static async getCustomers(storeId: string) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('store_id', storeId)
        .order('name');
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return [];
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
      return null;
    }
  }

  static async updateCustomer(id: string, updates: Tables['customers']['Update']) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  }

  // Inventory Management
  static async getInventoryItems(storeId: string) {
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select(`
          *,
          products(name, category, image),
          suppliers(name, phone, email)
        `)
        .eq('store_id', storeId)
        .order('received_at', { ascending: false });
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }

  static async createInventoryItem(item: Tables['inventory_items']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .insert(item)
        .select(`
          *,
          products(name, category, image),
          suppliers(name, phone, email)
        `)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  }

  static async updateInventoryItem(id: string, updates: Tables['inventory_items']['Update']) {
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .update(updates)
        .eq('id', id)
        .select(`
          *,
          products(name, category, image),
          suppliers(name, phone, email)
        `)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  }

  // Sale Items Management
  static async getSaleItems(storeId: string) {
    try {
      const { data, error } = await supabase
        .from('sale_items')
        .select(`
          *,
          products(name, category),
          suppliers(name),
          customers(name),
          inventory_items(received_at, type)
        `)
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }

  static async createSaleItem(saleItem: Tables['sale_items']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('sale_items')
        .insert(saleItem)
        .select(`
          *,
          products(name, category),
          suppliers(name),
          customers(name)
        `)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  }

  static async updateSaleItem(id: string, updates: Tables['sale_items']['Update']) {
    try {
      const { data, error } = await supabase
        .from('sale_items')
        .update(updates)
        .eq('id', id)
        .select(`
          *,
          products(name, category),
          suppliers(name),
          customers(name)
        `)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  }

  static async deleteSaleItem(id: string) {
    try {
      const { error } = await supabase
        .from('sale_items')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return true;
    } catch (error) {
      handleSupabaseError(error);
      return false;
    }
  }

  // Transaction Management
  static async getTransactions(storeId: string) {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return [];
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
      return null;
    }
  }

  // Bill Management
  static async getBills(storeId: string) {
    try {
      const { data, error } = await supabase
        .from('bills')
        .select(`
          *,
          customers(name, phone, email),
          users!bills_created_by_fkey(name, email)
        `)
        .eq('store_id', storeId)
        .order('bill_date', { ascending: false });
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }

  static async createBill(bill: {
    store_id: string;
    bill_number: string;
    customer_id?: string | null;
    customer_name?: string | null;
    subtotal: number;
    total_amount: number;
    payment_method: 'cash' | 'card' | 'credit';
    payment_status: 'paid' | 'partial' | 'pending';
    amount_paid: number;
    amount_due: number;
    bill_date: string;
    notes?: string | null;
    status?: 'active' | 'cancelled' | 'refunded';
    created_by: string;
  }) {
    try {
      const { data, error } = await supabase
        .from('bills')
        .insert(bill)
        .select(`
          *,
          customers(name, phone, email),
          users!bills_created_by_fkey(name, email)
        `)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  }

  static async updateBill(id: string, updates: {
    customer_id?: string | null;
    customer_name?: string | null;
    subtotal?: number;
    total_amount?: number;
    payment_method?: 'cash' | 'card' | 'credit';
    payment_status?: 'paid' | 'partial' | 'pending';
    amount_paid?: number;
    amount_due?: number;
    bill_date?: string;
    notes?: string | null;
    status?: 'active' | 'cancelled' | 'refunded';
    last_modified_by?: string;
    last_modified_at?: string;
  }) {
    try {
      const { data, error } = await supabase
        .from('bills')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(`
          *,
          customers(name, phone, email),
          users!bills_created_by_fkey(name, email)
        `)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  }

  static async deleteBill(id: string) {
    try {
      const { error } = await supabase
        .from('bills')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return true;
    } catch (error) {
      handleSupabaseError(error);
      return false;
    }
  }

  // Bill Line Items Management
  static async getBillLineItems(billId: string) {
    try {
      const { data, error } = await supabase
        .from('bill_line_items')
        .select(`
          *,
          products(name, category),
          suppliers(name),
          inventory_items(quantity, received_at)
        `)
        .eq('bill_id', billId)
        .order('line_order');
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }

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
        .select(`
          *,
          products(name, category),
          suppliers(name)
        `)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  }

  static async createBillLineItems(lineItems: Array<{
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
  }>) {
    try {
      const { data, error } = await supabase
        .from('bill_line_items')
        .insert(lineItems)
        .select(`
          *,
          products(name, category),
          suppliers(name)
        `);
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }

  static async updateBillLineItem(id: string, updates: {
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
  }) {
    try {
      const { data, error } = await supabase
        .from('bill_line_items')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(`
          *,
          products(name, category),
          suppliers(name)
        `)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  }

  static async deleteBillLineItem(id: string) {
    try {
      const { error } = await supabase
        .from('bill_line_items')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return true;
    } catch (error) {
      handleSupabaseError(error);
      return false;
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
      return [];
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
      return null;
    }
  }

  // Inventory Batches Management
  static async getInventoryBatches(storeId: string) {
    try {
      const { data, error } = await supabase
        .from('inventory_batches')
        .select(`
          *,
          suppliers(name, phone, email)
        `)
        .eq('store_id', storeId)
        .order('received_at', { ascending: false });
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }

  static async createInventoryBatch(batch: {
    store_id: string;
    supplier_id: string;
    porterage?: number | null;
    transfer_fee?: number | null;
    received_at?: string;
    created_by: string;
    status?: string;
  }) {
    try {
      const { data, error } = await supabase
        .from('inventory_batches')
        .insert(batch)
        .select(`
          *,
          suppliers(name, phone, email)
        `)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  }

  // Bulk Operations
  static async bulkCreateProducts(products: Tables['products']['Insert'][]) {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert(products)
        .select();
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }

  static async bulkCreateSuppliers(suppliers: Tables['suppliers']['Insert'][]) {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert(suppliers)
        .select();
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }

  static async bulkCreateCustomers(customers: Tables['customers']['Insert'][]) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .insert(customers)
        .select();
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }

  static async bulkCreateInventoryItems(items: Tables['inventory_items']['Insert'][]) {
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .insert(items)
        .select();
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }

  static async bulkCreateSaleItems(saleItems: Tables['sale_items']['Insert'][]) {
    try {
      const { data, error } = await supabase
        .from('sale_items')
        .insert(saleItems)
        .select();
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }

  static async bulkCreateTransactions(transactions: Tables['transactions']['Insert'][]) {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert(transactions)
        .select();
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }

  static async bulkCreateBills(bills: Array<{
    store_id: string;
    bill_number: string;
    customer_id?: string | null;
    customer_name?: string | null;
    subtotal: number;
    total_amount: number;
    payment_method: 'cash' | 'card' | 'credit';
    payment_status: 'paid' | 'partial' | 'pending';
    amount_paid: number;
    amount_due: number;
    bill_date: string;
    notes?: string | null;
    status?: 'active' | 'cancelled' | 'refunded';
    created_by: string;
  }>) {
    try {
      const { data, error } = await supabase
        .from('bills')
        .insert(bills)
        .select();
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }

  // Search and Query Functions
  static async searchBills(params: {
    storeId: string;
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
      const { data, error } = await supabase.rpc('search_bills', {
        p_store_id: params.storeId,
        p_search_term: params.searchTerm || null,
        p_date_from: params.dateFrom || null,
        p_date_to: params.dateTo || null,
        p_payment_status: params.paymentStatus || null,
        p_customer_id: params.customerId || null,
        p_status: params.status || null,
        p_limit: params.limit || 50,
        p_offset: params.offset || 0
      });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }

  static async getBillDetails(billId: string) {
    try {
      const { data, error } = await supabase.rpc('get_bill_details', {
        bill_uuid: billId
      });
      
      if (error) throw error;
      return data?.[0] || null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  }

  // Data Synchronization
  static async syncTableData(tableName: string, storeId: string, lastSyncedAt?: string) {
    try {
      let query = supabase
        .from(tableName as any)
        .select('*')
        .eq('store_id', storeId);

      if (lastSyncedAt) {
        query = query.gt('updated_at', lastSyncedAt);
      }

      const { data, error } = await query.order('updated_at', { ascending: true });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }

  static async uploadTableData(tableName: string, records: any[]) {
    try {
      if (records.length === 0) return [];

      // Clean records for upload (remove sync fields)
      const cleanRecords = records.map(record => {
        const { _synced, _lastSyncedAt, _deleted, ...cleanRecord } = record;
        return cleanRecord;
      });

      const { data, error } = await supabase
        .from(tableName as any)
        .upsert(cleanRecords, { onConflict: 'id' })
        .select();
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }

  // Health Check
  static async healthCheck() {
    try {
      const { data, error } = await supabase
        .from('stores')
        .select('id')
        .limit(1);
      
      if (error) throw error;
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (error) {
      return { 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString() 
      };
    }
  }
}