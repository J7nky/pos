import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please check your .env.local file.');
  console.error('Required variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
  console.error('Current values:', { supabaseUrl, supabaseAnonKey });
  // Don't throw error immediately, create a mock client to prevent crashes
}

// Create client only if environment variables are available
let supabase: any = null;

if (supabaseUrl && supabaseAnonKey) {
  // Validate URL format
  try {
    new URL(supabaseUrl);
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
  } catch (error) {
    console.error('Invalid VITE_SUPABASE_URL format:', supabaseUrl);
    console.error('Expected format: https://your-project-id.supabase.co');
    console.error('Error:', error);
  }
} else {
  console.warn('Supabase client not initialized due to missing environment variables');
}

export { supabase };

// Helper function to handle Supabase errors
export const handleSupabaseError = (error: any) => {
  console.error('Supabase error:', error);
  if (error?.message) {
    throw new Error(error.message);
  }
  throw new Error('An unexpected error occurred');
};