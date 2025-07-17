import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

export function useSupabase() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if supabase client is properly initialized
    if (!supabase || !supabase.auth) {
      console.error('Supabase client is not properly initialized');
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch((error) => {
      console.error('Error getting session:', error);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Return null methods if supabase is not initialized
  if (!supabase || !supabase.auth) {
    return {
      user: null,
      loading: false,
      signUp: null,
      signIn: null,
      signOut: null,
      resetPassword: null,
    };
  }

  return {
    user,
    loading,
    signUp: supabase.auth.signUp.bind(supabase.auth),
    signIn: supabase.auth.signInWithPassword.bind(supabase.auth),
    signOut: supabase.auth.signOut.bind(supabase.auth),
    resetPassword: supabase.auth.resetPasswordForEmail.bind(supabase.auth),
  };
}