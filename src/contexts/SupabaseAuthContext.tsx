import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { useSupabase } from '../hooks/useSupabase';
import { SupabaseService } from '../services/supabaseService';
import { supabase } from '../lib/supabase';
import { AuthUtils } from '../utils/authUtils';

interface UserProfile {
  preferred_currency: 'USD' | 'LBP';
  preferred_language: 'en' | 'ar' | 'fr';
  preferred_commission_rate: number;
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
  const { user, loading: authLoading, signIn: supabaseSignIn, signUp: supabaseSignUp, signOut: supabaseSignOut, resetPassword: supabaseResetPassword } = useSupabase();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load user profile function
  const loadUserProfile = async () => {
    if (user) {
      try {
        console.log('🔍 Loading user profile for user:', user.id);
        // Check if we're online before making Supabase requests
        if (navigator.onLine) {
          console.log('🌐 Online - fetching user profile from Supabase');
          const profile = await SupabaseService.getUserProfile(user.id);
          if (profile) {
            console.log('✅ User profile loaded from Supabase:', profile);
            setUserProfile(profile as any);
          } else {
            console.log('⚠️ No profile returned from Supabase');
            setUserProfile(null);
          }
        } else {
          console.log('📱 Offline - loading cached user profile');
          // Offline mode - try to load from localStorage
          const cachedProfile = SupabaseService.getCachedUserProfile(user.id);
          if (cachedProfile) {
            console.log('📱 Using cached user profile (offline mode):', cachedProfile);
            setUserProfile(cachedProfile);
          } else {
            console.log('⚠️ No cached user profile available (offline mode)');
            setUserProfile(null);
          }
        }
      } catch (error) {
        console.error('❌ Error loading user profile:', error);
        
        // If online request failed, try to load from cache
        if (navigator.onLine) {
          console.log('🔄 Online request failed, trying cached profile');
          const cachedProfile = SupabaseService.getCachedUserProfile(user.id);
          if (cachedProfile) {
            console.log('📱 Fallback to cached user profile:', cachedProfile);
            setUserProfile(cachedProfile);
          } else {
            console.log('❌ No cached profile available, setting userProfile to null');
            setUserProfile(null);
          }
        } else {
          console.log('❌ Offline and no cached profile, setting userProfile to null');
          setUserProfile(null);
        }
      }
    } else {
      console.log('❌ No user available, setting userProfile to null');
      setUserProfile(null);
    }
    console.log('🔍 Setting loading to false');
    setLoading(false);
  };

  // Handle online/offline transitions
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Back online - refreshing user profile');
      if (user) {
        // Refresh user profile when back online
        loadUserProfile();
      }
    };

    const handleOffline = () => {
      console.log('📱 Gone offline - using cached data');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user]);

  // Load user profile when user changes
  useEffect(() => {
    if (!authLoading) {
      loadUserProfile();
    }
  }, [user, authLoading]);

  // Check for cached user profile on mount if no user is available
  // DISABLED: This was causing the app to think user is logged in when they're not
  // Only load cached profile when there's an actual authenticated user
  useEffect(() => {
    if (!user && !authLoading) {
      console.log('🔍 No user available, not loading cached profile to prevent false authentication');
      setUserProfile(null);
      setLoading(false);
    }
  }, [user, authLoading]);

  // Add a fallback to check for any existing session
  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && !user) {
          console.log('🔍 Found existing session, user:', session.user.id);
          // Force reload the user profile
          loadUserProfile();
        }
      } catch (error) {
        console.error('Error checking existing session:', error);
      }
    };

    if (!user && !authLoading) {
      checkExistingSession();
    }
  }, [user, authLoading]);

  // Add a fallback for offline mode - create a minimal user profile if we have a cached session
  // DISABLED: This was causing the app to think user is logged in when they're not
  // Only use cached profiles when there's an actual authenticated user
  useEffect(() => {
    if (!user && !authLoading && !userProfile) {
      console.log('🔍 No user or profile, not using cached profile to prevent false authentication');
      setUserProfile(null);
      setLoading(false);
    }
  }, [user, authLoading, userProfile]);

  // Add timeout to prevent infinite loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        console.log('⏰ Authentication timeout - forcing loading to false');
        setLoading(false);
      }
    }, 5000); // 5 second timeout

    return () => clearTimeout(timeout);
  }, [loading]);

  // Add a final fallback - if we're still loading after timeout, show login
  useEffect(() => {
    if (!user && !authLoading && !userProfile) {
      console.log('🔍 No user, profile, or auth loading - showing login screen');
      setLoading(false);
    }
  }, [user, authLoading, userProfile]);

  const signIn = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setError(null);
      setLoading(true);
      
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) {
        console.error('Sign in error:', error);
        setError(error.message);
        return { success: false, error: error.message };
      }
      
      if (!data.user) {
        setError('No user data returned');
        return { success: false, error: 'No user data returned' };
      }
      
      // Cache user profile for offline use
      if (navigator.onLine) {
        try {
          const profile = await SupabaseService.getUserProfile(data.user.id);
          if (profile) {
            localStorage.setItem(`user_profile_${profile.id}`, JSON.stringify(profile));
            console.log('📱 Cached user profile for offline use');
          }
        } catch (profileError) {
          console.warn('Failed to cache user profile:', profileError);
        }
      }
      
      setError(null);
      return { success: true };
    } catch (error: any) {
      console.error('Sign in error:', error);
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
      
      const { data, error } = await supabaseSignUp({ email, password });
      
      if (error) {
        console.error('Sign up error:', error);
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

      setError(null);
      return { success: true };
    } catch (error: any) {
      console.error('Sign up error:', error);
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
      await supabaseSignOut();
      setUserProfile(null);
      // Clear all cached data
      AuthUtils.clearAuthData();
    } catch (error: any) {
      console.error('Sign out error:', error);
      setError(error?.message || 'Sign out failed');
    }
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setError(null);
      const { error } = await supabaseResetPassword(email);
      
      if (error) {
        console.error('Reset password error:', error);
        setError(error.message);
        return { success: false, error: error.message };
      }
      
      return { success: true };
    } catch (error: any) {
      console.error('Reset password error:', error);
      const errorMessage = error?.message || 'An unexpected error occurred';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const refreshSession = async (): Promise<boolean> => {
    try {
      setError(null);
      return await AuthUtils.refreshSessionIfNeeded();
    } catch (error: any) {
      console.error('Session refresh error:', error);
      setError(error?.message || 'Session refresh failed');
      return false;
    }
  };

  const clearError = () => {
    setError(null);
  };

  const getStores = async (): Promise<any[]> => {
    try {
      return await SupabaseService.getStores();
    } catch (error) {
      console.error('Get stores error:', error);
      return [];
    }
  };

  return (
    <SupabaseAuthContext.Provider value={{
      user,
      userProfile,
      loading: loading || authLoading,
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