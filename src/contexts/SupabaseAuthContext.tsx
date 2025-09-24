import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { SupabaseService } from '../services/supabaseService';
import { supabase } from '../lib/supabase';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'cashier';
  store_id: string;
  stores?: {
    id: string;
    name: string;
    address: string;
    phone: string;
    email: string;
    preferred_currency: 'USD' | 'LBP';
    preferred_language: 'en' | 'ar' | 'fr';
    preferred_commission_rate: number;
    exchange_rate: number;
    low_stock_alert: boolean;
  };
}

interface SupabaseAuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, profile: Omit<UserProfile, 'id' | 'email'>) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  getStores: () => Promise<any[]>;
  refreshSession: () => Promise<boolean>;
  clearError: () => void;
}

const SupabaseAuthContext = createContext<SupabaseAuthContextType | undefined>(undefined);

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load user profile function
  const loadUserProfile = async () => {
    if (!user) {
      setUserProfile(null);
      setLoading(false);
      return;
    }

    try {
      // Try to get profile from Supabase first
      const profile = await SupabaseService.getUserProfile(user.id);
      if (profile) {
        setUserProfile(profile as any);
      } else {
        // Fallback to cached profile
        const cachedProfile = SupabaseService.getCachedUserProfile(user.id);
        setUserProfile(cachedProfile);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      // Try cached profile as fallback
      const cachedProfile = SupabaseService.getCachedUserProfile(user.id);
      setUserProfile(cachedProfile);
    } finally {
      setLoading(false);
    }
  };

  // Initialize authentication
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Load user profile when user changes
  useEffect(() => {
    if (user) {
      loadUserProfile();
    } else {
      setUserProfile(null);
      setLoading(false);
    }
  }, [user]);

  const signIn = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setError(null);
      setLoading(true);
      
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) {
        setError(error.message);
        return { success: false, error: error.message };
      }
      
      if (!data.user) {
        setError('No user data returned');
        return { success: false, error: 'No user data returned' };
      }
      
      return { success: true };
    } catch (error: any) {
      const errorMessage = error?.message || 'An unexpected error occurred';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (
    email: string, 
    password: string, 
    profile: Omit<UserProfile, 'id' | 'email'>
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      setError(null);
      setLoading(true);
      
      const { data, error } = await supabase.auth.signUp({ email, password });
      
      if (error) {
        setError(error.message);
        return { success: false, error: error.message };
      }
      
      if (!data.user) {
        setError('No user data returned');
        return { success: false, error: 'No user data returned' };
      }

      // Create user profile
      await SupabaseService.createUserProfile({
        id: data.user.id,
        email,
        ...profile
      });

      return { success: true };
    } catch (error: any) {
      const errorMessage = error?.message || 'An unexpected error occurred';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      setError(null);
      await supabase.auth.signOut();
      setUserProfile(null);
      
      // Clear localStorage
      const keysToRemove = Object.keys(localStorage).filter(key => 
        key.startsWith('user_profile') || 
        key === 'erp_user' ||
        key.includes('supabase') ||
        key.includes('auth') ||
        key.includes('session')
      );
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error: any) {
      setError(error?.message || 'Sign out failed');
    }
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setError(null);
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      
      if (error) {
        setError(error.message);
        return { success: false, error: error.message };
      }
      
      return { success: true };
    } catch (error: any) {
      const errorMessage = error?.message || 'An unexpected error occurred';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const refreshSession = async (): Promise<boolean> => {
    try {
      setError(null);
      const { error } = await supabase.auth.refreshSession();
      return !error;
    } catch (error: any) {
      setError(error?.message || 'Session refresh failed');
      return false;
    }
  };

  const clearError = () => {
    setError(null);
  };

  const getStores = async (): Promise<any[]> => {
    try {
      const stores = await SupabaseService.getStores();
      return stores || [];
    } catch (error) {
      console.error('Get stores error:', error);
      return [];
    }
  };

  return (
    <SupabaseAuthContext.Provider value={{
      user,
      userProfile,
      loading,
      error,
      signIn,
      signUp,
      signOut,
      resetPassword,
      getStores,
      refreshSession,
      clearError
    }}>
      {children}
    </SupabaseAuthContext.Provider>
  );
}

export function useSupabaseAuth() {
  const context = useContext(SupabaseAuthContext);
  if (context === undefined) {
    throw new Error('useSupabaseAuth must be used within a SupabaseAuthProvider');
  }
  return context;
}