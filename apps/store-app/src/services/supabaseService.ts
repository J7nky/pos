import { supabase } from '../lib/supabase';
import { handleSupabaseError } from '../lib/supabase';
import { Database } from '../types/database';

// Utility function to clean local-only fields before sending to Supabase
function cleanDataForSupabase(data: any): any {
  const { _synced, _lastSyncedAt, _deleted, _pendingSync, _syncError, _retryCount, ...cleanData } = data;
  return cleanData;
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
      
      if (error) {
        // Preserve error code for PGRST116 (no rows) handling in auth context
        const enhancedError: any = new Error(error.message);
        enhancedError.code = error.code;
        enhancedError.details = error.details;
        enhancedError.hint = error.hint;
        throw enhancedError;
      }
      
      // Cache the profile for offline use
      if (data) {
        localStorage.setItem(`user_profile_${userId}`, JSON.stringify(data));
        console.log('📱 Cached user profile for offline use');
      }
      
      return data;
    } catch (error: any) {
      // If it's already an enhanced error with code, re-throw it
      if (error.code) {
        throw error;
      }
      // Otherwise, use standard error handling
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



 






}
