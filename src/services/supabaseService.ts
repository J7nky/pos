import { supabase } from '../lib/supabase';
import { handleSupabaseError } from '../lib/supabase';
import { Database } from '../types/database';

// Utility function to clean local-only fields before sending to Supabase
function cleanDataForSupabase(data: any): any {
  const { _synced, _lastSyncedAt, _deleted, _pendingSync, _syncError, _retryCount, ...cleanData } = data;
  return cleanData;
}

// Utility function to clean an array of items
function cleanArrayForSupabase(items: any[]): any[] {
  return items.map(item => cleanDataForSupabase(item));
}

type Tables = Database['public']['Tables'];

// Optimized SupabaseService - essential operations only (auth, store, bills, sync helpers)
export class SupabaseService {
  // Authentication & User Management
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

  static async createUserProfile(profile: any) {
    try {
      const cleanProfile = cleanDataForSupabase(profile) as Tables['users']['Insert'];
      const { data, error } = await (supabase
        .from('users') as any)
        .insert(cleanProfile)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
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
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async getStore(storeId: string) {
    try {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .eq('id', storeId)
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async updateStoreSettings(
    storeId: string, 
    updates: {
      preferred_currency?: 'USD' | 'LBP';
      preferred_language?: 'en' | 'ar' | 'fr';
      preferred_commission_rate?: number;
      exchange_rate?: number;
    }
  ) {
    try {
      const cleanUpdates = cleanDataForSupabase(updates) as Tables['stores']['Update'];
      const { data, error } = await (supabase
        .from('stores') as any)
        .update({
          ...cleanUpdates,
          updated_at: new Date().toISOString(),
        } as Tables['stores']['Update'])
        .eq('id', storeId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  // Sync helpers (offline-first): bulk upsert for commonly synced tables
  static async syncBills(_storeId: string, bills: any[]) {
    if (!bills?.length) return { success: true, synced: 0 };
    try {
      const cleaned = cleanArrayForSupabase(bills) as Tables['bills']['Insert'][];
      const { error } = await (supabase.from('bills') as any).upsert(cleaned, { onConflict: 'id' });
      if (error) throw error;
      return { success: true, synced: bills.length };
    } catch (error) {
      throw error;
    }
  }

  static async syncBillLineItems(_storeId: string, lineItems: any[]) {
    if (!lineItems?.length) return { success: true, synced: 0 };
    try {
      const cleaned = cleanArrayForSupabase(lineItems) as Tables['bill_line_items']['Insert'][];
      const { error } = await (supabase.from('bill_line_items') as any).upsert(cleaned, { onConflict: 'id' });
      if (error) throw error;
      return { success: true, synced: lineItems.length };
    } catch (error) {
      throw error;
    }
  }

  static async syncTransactions(_storeId: string, transactions: any[]) {
    if (!transactions?.length) return { success: true, synced: 0 };
    try {
      const cleaned = cleanArrayForSupabase(transactions) as Tables['transactions']['Insert'][];
      const { error } = await (supabase.from('transactions') as any).upsert(cleaned, { onConflict: 'id' });
      if (error) throw error;
      return { success: true, synced: transactions.length };
    } catch (error) {
      throw error;
    }
  }

  // Bills (minimal server-side ops)
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
        .select('*')
        .eq('store_id', storeId);

      if (filters?.searchTerm) {
        query = query.or(`bill_number.ilike.%${filters.searchTerm}%,id.ilike.%${filters.searchTerm}%,notes.ilike.%${filters.searchTerm}%`);
      }
      if (filters?.dateFrom) query = query.gte('bill_date', filters.dateFrom);
      if (filters?.dateTo) query = query.lte('bill_date', filters.dateTo);
      if (filters?.paymentStatus) query = query.eq('payment_status', filters.paymentStatus as any);
      if (filters?.customerId) query = query.eq('customer_id', filters.customerId as any);
      if (filters?.status) query = query.eq('status', filters.status as any);

      query = query.order('bill_date', { ascending: false });
      if (filters?.limit) query = query.limit(filters.limit);
      if (filters?.offset) query = query.range(filters.offset, (filters.offset || 0) + (filters.limit || 50) - 1);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  static async createBill(billData: any, lineItems: any[]) {
    try {
      const cleanBillData = cleanDataForSupabase(billData) as Tables['bills']['Insert'];
      const cleanLineItems = cleanArrayForSupabase(lineItems) as Tables['bill_line_items']['Insert'][];
      const { data: bill, error: billError } = await supabase
        .rpc('create_bill_with_line_items', {
          bill_data: cleanBillData,
          line_items_data: cleanLineItems
        } as any);
      if (billError) throw billError;
      return bill;
    } catch (error) {
      throw error;
    }
  }

  static async updateBill(billId: string, updates: any) {
    try {
      const cleanUpdates = cleanDataForSupabase(updates) as Tables['bills']['Update'];
      const { data, error } = await (supabase
        .from('bills') as any)
        .update(cleanUpdates)
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
        const { error } = await (supabase
          .from('bills') as any)
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString()
          } as Tables['bills']['Update'])
          .eq('id', billId);
        if (error) throw error;
      } else {
        const { error } = await (supabase
          .from('bills') as any)
          .delete()
          .eq('id', billId);
        if (error) throw error;
      }
      return true;
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
