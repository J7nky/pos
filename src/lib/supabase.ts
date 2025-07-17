import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Comprehensive validation and error handling
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ SUPABASE CONFIGURATION ERROR');
  console.error('Missing required environment variables:');
  console.error(`VITE_SUPABASE_URL: ${supabaseUrl ? '✅ Set' : '❌ Missing'}`);
  console.error(`VITE_SUPABASE_ANON_KEY: ${supabaseAnonKey ? '✅ Set' : '❌ Missing'}`);
  console.error('');
  console.error('🔧 TO FIX THIS:');
  console.error('1. Go to https://supabase.com/dashboard');
  console.error('2. Select your project (or create a new one)');
  console.error('3. Go to Settings > API');
  console.error('4. Copy the "Project URL" and "anon public" key');
  console.error('5. Update your .env.local file with these values');
  console.error('6. Restart your development server');
  console.error('');
  console.error('Example .env.local format:');
  console.error('VITE_SUPABASE_URL=https://your-project-id.supabase.co');
  console.error('VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
}

// Validate URL format
if (supabaseUrl && !supabaseUrl.startsWith('https://')) {
  console.error('❌ INVALID SUPABASE URL FORMAT');
  console.error(`Current URL: ${supabaseUrl}`);
  console.error('Expected format: https://your-project-id.supabase.co');
  console.error('Make sure your URL starts with "https://" and ends with ".supabase.co"');
}

// Validate anon key format
if (supabaseAnonKey && !supabaseAnonKey.startsWith('eyJ')) {
  console.error('❌ INVALID SUPABASE ANON KEY FORMAT');
  console.error('The anon key should start with "eyJ" (it\'s a JWT token)');
  console.error('Make sure you copied the "anon public" key, not the service role key');
}

// Create client only if both values are valid
let supabase: any = null;

if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('https://') && supabaseAnonKey.startsWith('eyJ')) {
  try {
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      },
      global: {
        headers: {
          'X-Client-Info': 'supabase-js-web'
        }
      }
    });
    
    console.log('✅ Supabase client initialized successfully');
    console.log(`🔗 Connected to: ${supabaseUrl}`);
  } catch (error) {
    console.error('❌ Failed to create Supabase client:', error);
    supabase = null;
  }
} else {
  console.warn('⚠️ Supabase client not initialized - check environment variables');
}

export { supabase };

// Helper function to handle Supabase errors
export const handleSupabaseError = (error: any) => {
  console.error('Supabase operation error:', error);
  
  // Provide user-friendly error messages
  if (error?.message?.includes('Failed to fetch')) {
    throw new Error('Unable to connect to the database. Please check your internet connection and try again.');
  }
  
  if (error?.message?.includes('Invalid login credentials')) {
    throw new Error('Invalid email or password. Please check your credentials and try again.');
  }
  
  if (error?.message?.includes('Email not confirmed')) {
    throw new Error('Please check your email and click the confirmation link before signing in.');
  }
  
  if (error?.message) {
    throw new Error(error.message);
  }
  
  throw new Error('An unexpected error occurred. Please try again.');
};

// Export a function to check if Supabase is properly configured
export const isSupabaseConfigured = (): boolean => {
  return !!(supabase && supabaseUrl && supabaseAnonKey);
};