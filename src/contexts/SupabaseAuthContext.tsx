import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { useSupabase } from '../hooks/useSupabase';
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
}

const SupabaseAuthContext = createContext<SupabaseAuthContextType | undefined>(undefined);

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, signIn: supabaseSignIn, signUp: supabaseSignUp, signOut: supabaseSignOut, resetPassword: supabaseResetPassword } = useSupabase();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load user profile when user changes
  useEffect(() => {
    async function loadUserProfile() {
      if (user) {
        try {
          const profile = await SupabaseService.getUserProfile(user.id);
          setUserProfile(profile);
        } catch (error) {
          console.error('Error loading user profile:', error);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    }

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

  return (
    <SupabaseAuthContext.Provider value={{
      user,
      userProfile,
      loading: loading || authLoading,
      signIn,
      signUp,
      signOut,
      resetPassword
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