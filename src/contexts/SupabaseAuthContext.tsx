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
  useEffect(() => {
    if (!user && !authLoading) {
      console.log('🔍 No user available, checking for cached profile');
      // Try to get any cached user profile
      const keys = Object.keys(localStorage).filter(key => key.startsWith('user_profile_'));
      if (keys.length > 0) {
        const cachedKey = keys[0];
        const cachedProfile = JSON.parse(localStorage.getItem(cachedKey) || '{}');
        if (cachedProfile && cachedProfile.id) {
          console.log('📱 Found cached user profile:', cachedProfile);
          setUserProfile(cachedProfile);
          setLoading(false);
        }
      }
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
  useEffect(() => {
    if (!user && !authLoading && !userProfile) {
      console.log('🔍 No user or profile, checking for offline fallback');
      // Check if we have any cached user data
      const keys = Object.keys(localStorage).filter(key => key.startsWith('user_profile_'));
      if (keys.length > 0) {
        const cachedKey = keys[0];
        const cachedProfile = JSON.parse(localStorage.getItem(cachedKey) || '{}');
        if (cachedProfile && cachedProfile.id) {
          console.log('📱 Using cached profile as offline fallback:', cachedProfile);
          setUserProfile(cachedProfile);
          setLoading(false);
        }
      }
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