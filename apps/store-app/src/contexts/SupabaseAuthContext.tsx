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
  branch_id: string | null; // null for admin (can access all branches), branch ID for manager/cashier
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
  const loadUserProfile = async (userId: string) => {
    try {
      // Try to get profile from Supabase first
      const profile = await SupabaseService.getUserProfile(userId);
      if (profile) {
        setUserProfile(profile as any);
      } else {
        // Fallback to cached profile
        const cachedProfile = SupabaseService.getCachedUserProfile(userId);
        setUserProfile(cachedProfile);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      // Try cached profile as fallback
      const cachedProfile = SupabaseService.getCachedUserProfile(userId);
      setUserProfile(cachedProfile);
    }
  };

  // Initialize authentication
  useEffect(() => {
    // Check if we have valid Supabase credentials
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'https://placeholder.supabase.co') {
      console.log('No valid Supabase credentials found. Running in offline mode.');
      setLoading(false);
      setUser(null);
      setUserProfile(null);
      return;
    }

    // Set a timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      console.log('Supabase connection timeout - running in offline mode');
      setLoading(false);
      setUser(null);
      setUserProfile(null);
    }, 5000); // 5 second timeout

    // Get initial session with timeout
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(timeoutId);
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      console.log('🔐 Session loaded:', currentUser ? 'authenticated' : 'not authenticated');
      
      // Load profile immediately if user exists
      if (currentUser) {
        // Try to load cached profile first for instant UI
        const cachedProfile = SupabaseService.getCachedUserProfile(currentUser.id);
        if (cachedProfile) {
          console.log('⚡ Using cached profile - UI ready immediately');
          setUserProfile(cachedProfile);
          // We have cached profile, show UI immediately
          setLoading(false);
          
          // Then load fresh profile from server in background
          loadUserProfile(currentUser.id).catch(err => {
            console.error('Background profile update failed:', err);
          });
        } else {
          console.log('📡 No cached profile - loading from server...');
          // No cached profile, try to load from server with timeout
          const profileLoadTimeout = setTimeout(() => {
            console.warn('⏱️ Profile loading timeout - proceeding anyway');
            setLoading(false);
          }, 3000);
          
          try {
            await loadUserProfile(currentUser.id);
            clearTimeout(profileLoadTimeout);
            console.log('✅ Profile loaded successfully');
            setLoading(false);
          } catch (error) {
            clearTimeout(profileLoadTimeout);
            console.error('❌ Profile loading failed:', error);
            setLoading(false);
          }
        }
      } else {
        console.log('👤 No user - showing login');
        setLoading(false);
      }
    }).catch((error) => {
      clearTimeout(timeoutId);
      console.error('Error getting session:', error);
      setLoading(false);
      setUser(null);
      setUserProfile(null);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        clearTimeout(timeoutId);
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        
        // Load profile when auth state changes
        if (currentUser) {
          // Try cached profile first
          const cachedProfile = SupabaseService.getCachedUserProfile(currentUser.id);
          if (cachedProfile) {
            setUserProfile(cachedProfile);
            setLoading(false);
            
            // Record check-in if signing in (not on initial load)
            if (event === 'SIGNED_IN' && cachedProfile.store_id) {
              try {
                const { EmployeeAttendanceService } = await import('../services/employeeAttendanceService');
                // Check if already checked in
                const currentStatus = await EmployeeAttendanceService.getCurrentStatus(currentUser.id);
                if (!currentStatus) {
                  await EmployeeAttendanceService.checkIn(currentUser.id, cachedProfile.store_id);
                  console.log('✅ Employee check-in recorded on sign-in');
                }
              } catch (attendanceError) {
                console.warn('Failed to record employee check-in:', attendanceError);
              }
            }
            
            // Load fresh profile in background
            loadUserProfile(currentUser.id).catch(err => {
              console.error('Background profile update failed:', err);
            });
          } else {
            // No cached profile, try to load with timeout
            const profileTimeout = setTimeout(() => {
              console.warn('Profile loading timeout in auth change');
              setLoading(false);
            }, 3000);
            
            try {
              const profile = await loadUserProfile(currentUser.id);
              clearTimeout(profileTimeout);
              
              // Record check-in if signing in
              if (event === 'SIGNED_IN' && profile?.store_id) {
                try {
                  const { EmployeeAttendanceService } = await import('../services/employeeAttendanceService');
                  const currentStatus = await EmployeeAttendanceService.getCurrentStatus(currentUser.id);
                  if (!currentStatus) {
                    await EmployeeAttendanceService.checkIn(currentUser.id, profile.store_id);
                    console.log('✅ Employee check-in recorded on sign-in');
                  }
                } catch (attendanceError) {
                  console.warn('Failed to record employee check-in:', attendanceError);
                }
              }
            } catch (error) {
              clearTimeout(profileTimeout);
              console.error('Profile loading failed:', error);
            } finally {
              setLoading(false);
            }
          }
        } else {
          setUserProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setError(null);
      setLoading(true);
      
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) {
        setError(error.message);
        setLoading(false);
        return { success: false, error: error.message };
      }
      
      if (!data.user) {
        setError('No user data returned');
        setLoading(false);
        return { success: false, error: 'No user data returned' };
      }
      
      // Try to load cached profile immediately for faster UX
      const cachedProfile = SupabaseService.getCachedUserProfile(data.user.id);
      if (cachedProfile) {
        setUserProfile(cachedProfile);
        setLoading(false);
      }
      
      // Record check-in for employee attendance tracking
      if (cachedProfile?.store_id) {
        try {
          const { EmployeeAttendanceService } = await import('../services/employeeAttendanceService');
          await EmployeeAttendanceService.checkIn(data.user.id, cachedProfile.store_id);
          console.log('✅ Employee check-in recorded');
        } catch (attendanceError) {
          // Don't fail login if attendance check-in fails
          console.warn('Failed to record employee check-in:', attendanceError);
        }
      }
      
      // Note: onAuthStateChange will handle loading fresh profile
      
      return { success: true };
    } catch (error: any) {
      const errorMessage = error?.message || 'An unexpected error occurred';
      setError(errorMessage);
      setLoading(false);
      return { success: false, error: errorMessage };
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
        setLoading(false);
        return { success: false, error: error.message };
      }
      
      if (!data.user) {
        setError('No user data returned');
        setLoading(false);
        return { success: false, error: 'No user data returned' };
      }

      // Create user profile
      const newProfile = {
        id: data.user.id,
        email,
        ...profile
      };
      
      await SupabaseService.createUserProfile(newProfile);
      
      // Set the profile immediately
      setUserProfile(newProfile as any);
      setLoading(false);
      
      return { success: true };
    } catch (error: any) {
      const errorMessage = error?.message || 'An unexpected error occurred';
      setError(errorMessage);
      setLoading(false);
      return { success: false, error: errorMessage };
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      setError(null);
      
      // Record check-out for employee attendance tracking before signing out
      if (userProfile?.id && userProfile?.store_id) {
        try {
          const { EmployeeAttendanceService } = await import('../services/employeeAttendanceService');
          await EmployeeAttendanceService.checkOut(userProfile.id);
          console.log('✅ Employee check-out recorded');
        } catch (attendanceError) {
          // Don't fail logout if attendance check-out fails
          console.warn('Failed to record employee check-out:', attendanceError);
        }
      }
      
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