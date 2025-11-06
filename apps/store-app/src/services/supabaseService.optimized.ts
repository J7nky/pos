// Optimized SupabaseService - Only auth and essential operations
// Following offline-first architecture: IndexedDB is SSOT, this is only for auth
import { supabase, handleSupabaseError } from '../lib/supabase';

/**
 * SupabaseService - AUTHENTICATION ONLY
 * 
 * Following strict offline-first architecture:
 * - All data CRUD operations go through: IndexedDB → syncService → Supabase
 * - This service handles ONLY: Authentication and User Profile caching
 * 
 * DO NOT add data CRUD operations here!
 */
export class SupabaseService {
  /**
   * Get user profile from Supabase (with offline caching)
   */
  static async getUserProfile(userId: string) {
    try {
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
      
      // Cache for offline use
      if (data) {
        localStorage.setItem(`user_profile_${userId}`, JSON.stringify(data));
        console.log('📱 Cached user profile for offline use');
      }
      
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  /**
   * Get cached user profile (offline fallback)
   */
  static getCachedUserProfile(userId: string) {
    try {
      const cached = localStorage.getItem(`user_profile_${userId}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Error reading cached user profile:', error);
      return null;
    }
  }

  /**
   * Create user profile (initial setup only)
   */
  static async createUserProfile(profile: any) {
    try {
      const { data, error } = await supabase
        .from('users')
        .insert(profile)
        .select()
        .single();
      
      if (error) throw error;
      
      // Cache the new profile
      if (data) {
        localStorage.setItem(`user_profile_${data.id}`, JSON.stringify(data));
      }
      
      return data;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

  /**
   * Get available stores (for initial setup/selection)
   */
  static async getStores() {
    try {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }

  /**
   * Get specific store (for initial setup)
   */
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
      return null;
    }
  }
}

