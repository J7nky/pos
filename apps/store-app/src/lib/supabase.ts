import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables. App will run in offline mode.');
  console.warn('Required variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
  console.warn('Please create a .env.local file with your Supabase credentials for full functionality.');
}

// Validate URL format
if (supabaseUrl) {
  try {
    new URL(supabaseUrl);
  } catch (error) {
    console.error('Invalid VITE_SUPABASE_URL format:', supabaseUrl);
    console.error('Expected format: https://your-project-id.supabase.co');
    throw new Error(`Invalid VITE_SUPABASE_URL format: ${supabaseUrl}. Expected format: https://your-project-id.supabase.co`);
  }
}

// Check if we're online
const isOnline = () => navigator.onLine;

// Use placeholder values if environment variables are missing
const safeSupabaseUrl = supabaseUrl || 'https://placeholder.supabase.co';
const safeSupabaseAnonKey = supabaseAnonKey || 'placeholder-key';

// Determine if we should enable auto token refresh (only when online)
// Note: We can't dynamically change this, but we'll block refresh attempts in the fetch interceptor
const shouldAutoRefreshToken = isOnline();

export const supabase = createClient<Database>(safeSupabaseUrl, safeSupabaseAnonKey, {
  auth: {
    autoRefreshToken: shouldAutoRefreshToken, // Disable when offline to prevent ERR_NAME_NOT_RESOLVED
    persistSession: true,
    detectSessionInUrl: true
  },
  global: {
    headers: {
      'X-Client-Info': `pos-app-${isOnline() ? 'online' : 'offline'}`
    },
    fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      // If offline, prevent ALL Supabase requests including auth token refresh
      // This prevents ERR_NAME_NOT_RESOLVED errors when there's no internet
      if (!navigator.onLine) {
        const url = typeof input === 'string' ? input : input.toString();
        
        // Block ALL requests when offline, including token refresh
        // The app will use local authentication instead
        if (url.includes('/auth/v1/token') || url.includes('/auth/v1/')) {
          console.log('🚫 Blocking auth token refresh while offline - using local authentication');
          // Return a mock response to prevent errors, but the app should handle this gracefully
          throw new Error('Offline - authentication unavailable. Please use local credentials.');
        }
        
        // Block all other requests when offline
        console.log('🚫 Blocking Supabase request while offline:', url);
        throw new Error('Offline - request blocked');
      }
      
      // Online - proceed with request
      try {
        return await fetch(input, init);
      } catch (error) {
        // If request fails and we're now offline, provide a better error message
        if (!navigator.onLine) {
          console.log('🌐 Connection lost during request');
          throw new Error('Connection lost - please check your internet connection');
        }
        throw error;
      }
    }
  },
  db: {
    schema: 'public'
  }
});



// Helper function to handle Supabase errors
export const handleSupabaseError = (error: any) => {
  // Suppress CORS/network errors when offline
  if (!navigator.onLine && (
    error?.message?.includes('CORS') ||
    error?.message?.includes('NetworkError') ||
    error?.message?.includes('Failed to fetch') ||
    error?.name === 'NetworkError'
  )) {
    console.log('Network request failed while offline - this is expected');
    return;
  }
  
  console.error('Supabase error:', error);
  if (error?.message) {
    throw new Error(error.message);
  }
  throw new Error('An unexpected error occurred');
};

// Override console.error to filter out CORS errors when offline
if (typeof window !== 'undefined' && typeof console !== 'undefined' && console.error) {
  try {
    const originalConsoleError = console.error.bind(console);
    console.error = (...args: any[]) => {
      try {
        const errorString = args.join(' ');
        
        // Skip CORS errors when offline
        if (!navigator.onLine && (
          errorString.includes('Cross-Origin Request Blocked') ||
          errorString.includes('CORS request did not succeed') ||
          errorString.includes('NetworkError when attempting to fetch')
        )) {
          console.log('Suppressed CORS error while offline');
          return;
        }
        
        // Call original console.error for other errors
        if (typeof originalConsoleError === 'function') {
          originalConsoleError.apply(console, args);
        } else {
          // Fallback if original is not a function
          console.log(...args);
        }
      } catch (err) {
        // If override fails, try to restore and log normally
        console.log('Error in console.error override:', err);
        console.log(...args);
      }
    };
  } catch (err) {
    // If we can't override console.error, just log a warning
    console.warn('Could not override console.error:', err);
  }
}