import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database';
import { networkMonitorService } from '../services/networkMonitorService';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

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

// Use placeholder values if environment variables are missing
const safeSupabaseUrl = supabaseUrl || 'https://placeholder.supabase.co';
const safeSupabaseAnonKey = supabaseAnonKey || 'placeholder-key';
const safeSupabaseServiceRoleKey = supabaseServiceRoleKey || 'placeholder-service-role-key';

export const supabase = createClient<Database>(safeSupabaseUrl, safeSupabaseAnonKey, {
  auth: {
    // Always enable auto token refresh. The custom fetch interceptor below already
    // blocks all auth requests (including /auth/v1/token) while offline, so there
    // is no risk of ERR_NAME_NOT_RESOLVED. Freezing this to false at startup
    // (based on navigator.onLine at import time) would permanently disable refresh
    // for the entire session if the app loads offline then comes back online.
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  global: {
    headers: {
      'X-Client-Info': `pos-app-${navigator.onLine ? 'online' : 'offline'}`
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
      const monitorId = networkMonitorService.onRequestStart(
        typeof input === 'string' ? input : input.toString(),
        init
      );
      try {
        const response = await fetch(input, init);
        networkMonitorService.onRequestEnd(monitorId, response.status);
        return response;
      } catch (error) {
        networkMonitorService.onRequestEnd(monitorId, null);
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

// Admin client with service role key for admin operations (like creating users)
export const supabaseAdmin = createClient<Database>(safeSupabaseUrl, safeSupabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
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
