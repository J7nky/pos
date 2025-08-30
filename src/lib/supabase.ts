import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please check your .env.local file.');
  console.error('Required variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
  throw new Error('Missing Supabase environment variables. Please check your .env.local file and ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.');
}

// Validate URL format
try {
  new URL(supabaseUrl);
} catch (error) {
  console.error('Invalid VITE_SUPABASE_URL format:', supabaseUrl);
  console.error('Expected format: https://your-project-id.supabase.co');
  throw new Error(`Invalid VITE_SUPABASE_URL format: ${supabaseUrl}. Expected format: https://your-project-id.supabase.co`);
}

// Check if we're online
const isOnline = () => navigator.onLine;
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  global: {
    headers: {
      'X-Client-Info': `pos-app-${isOnline() ? 'online' : 'offline'}`
    },
    fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      // If offline, prevent auth refresh requests
      if (!navigator.onLine && typeof input === "string" && input.includes('/auth/v1/token')) {
        console.log('Skipping auth token refresh while offline');
        throw new Error('Offline - skipping auth refresh');
      }
      return fetch(input, init);
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
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
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
    originalConsoleError.apply(console, args);
  };
}