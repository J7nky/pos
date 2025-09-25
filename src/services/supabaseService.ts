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

// SupabaseService - Following offline-first architecture pattern
// Handles: Authentication, Store Management, and Sync Helpers ONLY
// CRUD operations should go through: IndexedDB → syncService → Supabase
export class SupabaseService {
  // Authentication & User Management
  static async getUserProfile(userId: string) {
    try {
      // Check if we're online before making the request
      if (!navigator.onLine) {
        throw new Error('Offline - cannot fetch user profile');
      }

      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          stores(*)
        `)
        .eq('id', userId)
        .single();
      
      if (error) throw error;
      
      // Cache the profile for offline use
      if (data) {
        localStorage.setItem(`user_profile_${userId}`, JSON.stringify(data));
        console.log('📱 Cached user profile for offline use');
      }
      
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  // Get cached user profile for offline use
  static getCachedUserProfile(userId: string) {
    try {
      const cached = localStorage.getItem(`user_profile_${userId}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Error loading cached user profile:', error);
      return null;
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
      low_stock_alert?: boolean;
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
