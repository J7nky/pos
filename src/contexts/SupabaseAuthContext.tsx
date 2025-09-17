import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { useSupabase } from '../hooks/useSupabase';
import { SupabaseService } from '../services/supabaseService';
import { supabase } from '../lib/supabase';

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
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string, profile: Omit<UserProfile, 'id' | 'email'>) => Promise<boolean>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<boolean>;
  getStores: () => Promise<any[]>;
}

const SupabaseAuthContext = createContext<SupabaseAuthContextType | undefined>(undefined);

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, signIn: supabaseSignIn, signUp: supabaseSignUp, signOut: supabaseSignOut, resetPassword: supabaseResetPassword } = useSupabase();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load user profile function
  const loadUserProfile = async () => {
    if (user) {
      try {
        // Check if we're online before making Supabase requests
        if (navigator.onLine) {
          const profile = await SupabaseService.getUserProfile(user.id);
          setUserProfile(profile as any);
        } else {
          // Offline mode - try to load from localStorage
          const cachedProfile = SupabaseService.getCachedUserProfile(user.id);
          if (cachedProfile) {
            console.log('📱 Using cached user profile (offline mode)');
            setUserProfile(cachedProfile);
          } else {
            console.log('⚠️ No cached user profile available (offline mode)');
            setUserProfile(null);
          }
        }
      } catch (error) {
        console.error('Error loading user profile:', error);
        
        // If online request failed, try to load from cache
        if (navigator.onLine) {
          const cachedProfile = SupabaseService.getCachedUserProfile(user.id);
          if (cachedProfile) {
            console.log('📱 Fallback to cached user profile');
            setUserProfile(cachedProfile);
          } else {
            setUserProfile(null);
          }
        } else {
          setUserProfile(null);
        }
      }
    } else {
      setUserProfile(null);
    }
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

  const signIn = async (email: string, password: string): Promise<boolean> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('Sign in error:', error);
        return false;
      }
      
      // Cache user profile for offline use
      if (navigator.onLine) {
        try {
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          if (currentUser) {
            const profile = await SupabaseService.getUserProfile(currentUser.id);
            if (profile) {
              localStorage.setItem(`user_profile_${profile.id}`, JSON.stringify(profile));
              console.log('📱 Cached user profile for offline use');
            }
          }
        } catch (profileError) {
          console.warn('Failed to cache user profile:', profileError);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Sign in error:', error);
      return false;
    }
  };

  const signUp = async (
    email: string, 
    password: string, 
    profile: Omit<UserProfile, 'id' | 'email'>
  ): Promise<boolean> => {
    try {
      const { data, error } = await supabaseSignUp({ email, password });
      if (error || !data.user) {
        console.error('Sign up error:', error);
        return false;
      }

      // Create user profile
      await SupabaseService.createUserProfile({
        id: data.user.id,
        email,
        ...profile
      });

      return true;
    } catch (error) {
      console.error('Sign up error:', error);
      return false;
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      await supabaseSignOut();
      setUserProfile(null);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const resetPassword = async (email: string): Promise<boolean> => {
    try {
      const { error } = await supabaseResetPassword(email);
      if (error) {
        console.error('Reset password error:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Reset password error:', error);
      return false;
    }
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
      signIn,
      signUp,
      signOut,
      resetPassword,
      getStores
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