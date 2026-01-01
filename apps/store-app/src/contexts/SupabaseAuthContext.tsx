import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { SupabaseService } from '../services/supabaseService';
import { supabase } from '../lib/supabase';
import { getDB } from '../lib/db';
import { localAuthService } from '../services/localAuthService';
import { credentialStorageService } from '../services/credentialStorageService';

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
  syncCredentialsWithSupabase: (email: string, password: string) => Promise<boolean>;
  clearError: () => void;
}

const SupabaseAuthContext = createContext<SupabaseAuthContextType | undefined>(undefined);

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track in-flight profile loads to prevent concurrent requests for the same user
  const profileLoadPromises = new Map<string, Promise<any>>();

  // Load user profile function with timeout handling and error recovery
  const loadUserProfile = async (userId: string, retryCount = 0, forceRefresh = false): Promise<any> => {
    // Check if there's already an in-flight request for this user
    if (!forceRefresh && profileLoadPromises.has(userId)) {
      console.log('⏳ Profile load already in progress, reusing existing request');
      return profileLoadPromises.get(userId);
    }

    const maxRetries = 1; // Reduced from 2 to 1 to prevent excessive retries
    const timeoutMs = 8000; // Reduced from 10s to 8s for faster failure detection
    
    // Create the load promise
    const loadPromise = (async () => {
      try {
        // Try cached profile first if not forcing refresh and we have one
        if (!forceRefresh && retryCount === 0) {
          const cachedProfile = SupabaseService.getCachedUserProfile(userId);
          if (cachedProfile) {
            console.log('⚡ Using cached profile immediately');
            setUserProfile(cachedProfile);
            // Still try to refresh in background
            if (navigator.onLine) {
              loadUserProfile(userId, 0, true).catch(() => {
                // Silently fail background refresh
              });
            }
            return cachedProfile;
          }
        }

        // Try to get profile from Supabase with a timeout
        const profilePromise = SupabaseService.getUserProfile(userId);
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Profile load timeout')), timeoutMs)
        );
        
        const profile = await Promise.race([profilePromise, timeoutPromise]) as any;
        
        if (profile) {
          setUserProfile(profile);
          return profile;
        } else {
          // Fallback to cached profile
          const cachedProfile = SupabaseService.getCachedUserProfile(userId);
          if (cachedProfile) {
            setUserProfile(cachedProfile);
            return cachedProfile;
          }
          return null;
        }
      } catch (error: any) {
        // Check if it's a timeout error
        const isTimeout = error?.message === 'Profile load timeout';
        
        // Try cached profile as fallback first
        const cachedProfile = SupabaseService.getCachedUserProfile(userId);
        
        // Only log warnings if we don't have a cached profile (critical failure)
        // or if this is a forced refresh (background refresh) - fail silently for background refreshes
        if (!cachedProfile && !forceRefresh) {
          if (isTimeout) {
            console.warn(`⏱️ Profile load timeout for user ${userId} (attempt ${retryCount + 1}/${maxRetries + 1})`);
          } else {
            console.error('Error loading user profile:', error);
          }
        }
        
        if (cachedProfile) {
          // We have a cached profile, use it
          if (retryCount === 0 && !forceRefresh) {
            console.log('✅ Using cached profile as fallback');
          }
          setUserProfile(cachedProfile);
          
          // Only try background refresh if this was the initial load (not already a refresh)
          // and we haven't already started a background refresh
          if (retryCount === 0 && !forceRefresh && navigator.onLine) {
            // Retry in background silently (don't log failures)
            setTimeout(() => {
              loadUserProfile(userId, 0, true).catch(() => {
                // Silently fail background refresh - we already have cached profile
              });
            }, 2000);
          }
          return cachedProfile;
        }
        
        // If no cached profile and we haven't exceeded retries, retry with exponential backoff
        if (retryCount < maxRetries && navigator.onLine && !forceRefresh) {
          const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 3000);
          if (retryCount === 0) {
            console.log(`🔄 Retrying profile load in ${retryDelay}ms...`);
          }
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return loadUserProfile(userId, retryCount + 1, forceRefresh);
        }
        
        // If there's an error and no cached profile, try to clear potentially corrupted cache
        try {
          const profileKey = `user_profile_${userId}`;
          const cached = localStorage.getItem(profileKey);
          if (cached) {
            // Test if the cached data is valid JSON
            try {
              JSON.parse(cached);
            } catch (parseError) {
              // Corrupted data, remove it
              console.warn('Removing corrupted profile cache:', profileKey);
              localStorage.removeItem(profileKey);
            }
          }
        } catch (clearError) {
          console.warn('Failed to clear cached profile:', clearError);
        }
        
        // Final fallback: return null (caller should handle this)
        if (retryCount >= maxRetries) {
          console.warn('⚠️ Could not load user profile after all retries');
        }
        return null;
      } finally {
        // Remove from in-flight map when done
        profileLoadPromises.delete(userId);
      }
    })();

    // Store the promise to prevent concurrent loads
    if (!forceRefresh || retryCount === 0) {
      profileLoadPromises.set(userId, loadPromise);
    }

    return loadPromise;
  };

  // Initialize authentication
  useEffect(() => {
    // Clean up potentially corrupted localStorage data on startup
    const cleanupCorruptedData = () => {
      try {
        // Check for and remove corrupted profile data
        const profileKeys = Object.keys(localStorage).filter(key => 
          key.startsWith('user_profile_')
        );
        
        for (const key of profileKeys) {
          try {
            const data = localStorage.getItem(key);
            if (data) {
              // Test if it's valid JSON
              JSON.parse(data);
            }
          } catch (e) {
            // Corrupted data, remove it
            console.warn('Removing corrupted profile data:', key);
            localStorage.removeItem(key);
          }
        }
        
        // Check for suspiciously large Supabase auth keys (potential corruption)
        const supabaseKeys = Object.keys(localStorage).filter(key =>
          (key.includes('supabase.auth') || key.startsWith('sb-')) && 
          key.length > 50 // Only check longer keys
        );
        
        for (const key of supabaseKeys) {
          try {
            const data = localStorage.getItem(key);
            if (data && data.length > 50000) { // Suspiciously large (>50KB)
              console.warn('Removing suspiciously large Supabase key:', key);
              localStorage.removeItem(key);
            }
          } catch (e) {
            // If we can't read it, it might be corrupted
            console.warn('Removing potentially corrupted Supabase key:', key);
            localStorage.removeItem(key);
          }
        }
      } catch (error) {
        console.error('Error during storage cleanup:', error);
      }
    };
    
    cleanupCorruptedData();
    
    // Initialize database first
    getDB().ensureOpen().catch((dbError) => {
      console.error('❌ Database initialization failed:', dbError);
    });

    // Check for local session first (offline support)
    const localSession = localAuthService.getSession();
    if (localSession) {
      console.log('🔐 Local session found - loading user from local storage');
      localAuthService.getCurrentUser().then(async (localUser) => {
        if (localUser) {
          // Load user profile from local storage
          const localProfile = await localAuthService.getUserProfile(localUser.id);
          if (localProfile) {
            setUserProfile(localProfile);
          }
          
          // Create a mock Supabase User object for compatibility
          const mockSupabaseUser: User = {
            id: localUser.id,
            email: localUser.email,
            created_at: localUser.created_at || new Date().toISOString(),
            app_metadata: {},
            user_metadata: {
              name: localUser.name,
              role: localUser.role,
            },
            aud: 'authenticated',
            confirmation_sent_at: null,
            recovery_sent_at: null,
            email_confirmed_at: null,
            invited_at: null,
            action_link: null,
            phone: null,
            phone_confirmed_at: null,
            confirmed_at: null,
            last_sign_in_at: new Date().toISOString(),
            role: 'authenticated',
            updated_at: new Date().toISOString(),
          };
          
          setUser(mockSupabaseUser);
          setLoading(false);
          
          // Try to sync with Supabase if online
          if (navigator.onLine) {
            const credential = await credentialStorageService.getCredentials(localUser.id);
            if (credential && !credential.supabaseUserId) {
              // Try to sync in background
              console.log('🔄 Attempting to sync local credentials with Supabase...');
            }
          }
          
          return;
        }
      }).catch((error) => {
        console.error('Error loading local user:', error);
        // Continue to Supabase check
      });
    }

    // Check if we have valid Supabase credentials
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'https://placeholder.supabase.co') {
      console.log('No valid Supabase credentials found. Running in offline mode.');
      
      // If we have a local session, we're already set above
      if (!localSession) {
        setLoading(false);
        setUser(null);
        setUserProfile(null);
      }
      return;
    }

    // Set a timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      console.log('Supabase connection timeout - using local session if available');
      if (!localSession) {
        setLoading(false);
        setUser(null);
        setUserProfile(null);
      }
    }, 5000); // 5 second timeout

    // Get initial session with timeout (only if no local session)
    if (!localSession && navigator.onLine) {
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
        // If Supabase fails and no local session, show login
        if (!localSession) {
          setLoading(false);
          setUser(null);
          setUserProfile(null);
        }
      });
    } else {
      clearTimeout(timeoutId);
      if (localSession) {
        // Already handled above
      } else {
        setLoading(false);
      }
    }

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
      
      const isOnline = navigator.onLine;
      
      // Try Supabase authentication first if online
      if (isOnline) {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          
          if (!error && data?.user) {
            // Successfully authenticated with Supabase
            // Store credentials locally for offline access
            try {
              // Find local user by email to get userId
              const localUser = await getDB().users.where('email').equals(email).first();
              if (localUser) {
                await localAuthService.storeCredentialsFromSupabase(
                  localUser.id,
                  email,
                  password,
                  data.user.id
                );
              } else {
                // Create local user entry if it doesn't exist
                // This might happen if user was created directly in Supabase
                console.warn('Local user not found, credentials not stored for offline access');
              }
            } catch (credentialError) {
              console.warn('Failed to store credentials for offline access:', credentialError);
              // Don't fail login if credential storage fails
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
                const currentStatus = await EmployeeAttendanceService.getCurrentStatus(data.user.id);
                if (!currentStatus) {
                  await EmployeeAttendanceService.checkIn(data.user.id, cachedProfile.store_id);
                  console.log('✅ Employee check-in recorded');
                } else {
                  console.log('ℹ️ Employee already checked in, skipping check-in');
                }
              } catch (attendanceError) {
                console.warn('Failed to record employee check-in:', attendanceError);
              }
            }
            
            // Note: onAuthStateChange will handle loading fresh profile
            return { success: true };
          }
          
          // If Supabase auth failed, fall through to local auth
          console.log('Supabase authentication failed, trying local authentication...');
        } catch (supabaseError: any) {
          // Network error or Supabase unavailable - try local auth
          console.log('Supabase unavailable, trying local authentication...', supabaseError?.message);
        }
      }
      
      // Offline or Supabase failed - try local authentication
      try {
        const localUser = await localAuthService.signIn(email, password);
        
        // Load user profile from local storage
        const localProfile = await localAuthService.getUserProfile(localUser.id);
        if (localProfile) {
          setUserProfile(localProfile);
        }
        
        // Create a mock Supabase User object for compatibility
        const mockSupabaseUser: User = {
          id: localUser.id,
          email: localUser.email,
          created_at: localUser.created_at || new Date().toISOString(),
          app_metadata: {},
          user_metadata: {
            name: localUser.name,
            role: localUser.role,
          },
          aud: 'authenticated',
          confirmation_sent_at: null,
          recovery_sent_at: null,
          email_confirmed_at: null,
          invited_at: null,
          action_link: null,
          phone: null,
          phone_confirmed_at: null,
          confirmed_at: null,
          last_sign_in_at: new Date().toISOString(),
          role: 'authenticated',
          updated_at: new Date().toISOString(),
        };
        
        setUser(mockSupabaseUser);
        setLoading(false);
        
        // Try to sync with Supabase in background when connection is restored
        if (!isOnline) {
          // Listen for online event to sync
          const syncOnOnline = async () => {
            if (navigator.onLine) {
              try {
                await localAuthService.syncWithSupabase(localUser.id, email, password);
                console.log('✅ Credentials synced with Supabase');
              } catch (syncError) {
                console.warn('Failed to sync credentials with Supabase:', syncError);
              }
              window.removeEventListener('online', syncOnOnline);
            }
          };
          window.addEventListener('online', syncOnOnline);
        }
        
        return { success: true };
      } catch (localError: any) {
        const errorMessage = localError?.message || 'Invalid email or password';
        setError(errorMessage);
        setLoading(false);
        return { success: false, error: errorMessage };
      }
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
          // Check if there's an active check-in before attempting check-out
          const currentStatus = await EmployeeAttendanceService.getCurrentStatus(userProfile.id);
          if (currentStatus) {
            await EmployeeAttendanceService.checkOut(userProfile.id);
            console.log('✅ Employee check-out recorded');
          } else {
            console.log('ℹ️ No active check-in found, skipping check-out');
          }
        } catch (attendanceError) {
          // Don't fail logout if attendance check-out fails
          console.warn('Failed to record employee check-out:', attendanceError);
        }
      }
      
      // Clear branch preference for this store before signing out
      if (userProfile?.store_id) {
        try {
          const branchPreferenceKey = `branch_preference_${userProfile.store_id}`;
          localStorage.removeItem(branchPreferenceKey);
          console.log('✅ Branch preference cleared for store:', userProfile.store_id);
        } catch (storageError) {
          console.warn('Failed to clear branch preference:', storageError);
        }
      }
      
      // Clear all branch preferences (in case multiple stores)
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('branch_preference_')) {
            localStorage.removeItem(key);
          }
        });
      } catch (err) {
        console.warn('Failed to clear all branch preferences:', err);
      }
      
      // Sign out from Supabase (if online and has Supabase session)
      if (navigator.onLine) {
        try {
          await supabase.auth.signOut();
        } catch (error) {
          console.warn('Supabase sign out failed:', error);
        }
      }
      
      // Sign out from local auth
      localAuthService.signOut();
      
      // Clear any in-flight profile loads
      profileLoadPromises.clear();
      
      setUser(null);
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
      
      // If offline, check local session
      if (!navigator.onLine) {
        const localSession = localAuthService.getSession();
        if (localSession) {
          const localUser = await localAuthService.getCurrentUser();
          if (localUser) {
            const localProfile = await localAuthService.getUserProfile(localUser.id);
            if (localProfile) {
              setUserProfile(localProfile);
            }
            return true;
          }
        }
        return false;
      }
      
      const { error } = await supabase.auth.refreshSession();
      return !error;
    } catch (error: any) {
      setError(error?.message || 'Session refresh failed');
      return false;
    }
  };

  /**
   * Sync local credentials with Supabase when connection is restored
   */
  const syncCredentialsWithSupabase = async (email: string, password: string): Promise<boolean> => {
    try {
      if (!navigator.onLine) {
        console.log('Cannot sync - offline');
        return false;
      }

      // Find local user
      const localUser = await getDB().users.where('email').equals(email).first();
      if (!localUser) {
        console.warn('Local user not found for sync');
        return false;
      }

      // Try to sync
      const synced = await localAuthService.syncWithSupabase(localUser.id, email, password);
      if (synced) {
        console.log('✅ Credentials synced with Supabase');
        return true;
      }

      return false;
    } catch (error: any) {
      console.error('Error syncing credentials:', error);
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
      syncCredentialsWithSupabase,
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