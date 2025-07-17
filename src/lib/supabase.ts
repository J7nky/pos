import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Enhanced validation with detailed error messages
function validateSupabaseConfig() {
  const errors = [];
  
  if (!supabaseUrl) {
    errors.push('❌ VITE_SUPABASE_URL is missing');
  } else if (!supabaseUrl.startsWith('https://')) {
    errors.push('❌ VITE_SUPABASE_URL must start with "https://"');
  } else if (!supabaseUrl.includes('.supabase.co')) {
    errors.push('❌ VITE_SUPABASE_URL must be a valid Supabase URL ending with ".supabase.co"');
  }
  
  if (!supabaseAnonKey) {
    errors.push('❌ VITE_SUPABASE_ANON_KEY is missing');
  } else if (!supabaseAnonKey.startsWith('eyJ')) {
    errors.push('❌ VITE_SUPABASE_ANON_KEY must be a valid JWT token starting with "eyJ"');
  }
  
  return errors;
}

// Check configuration
const configErrors = validateSupabaseConfig();

if (configErrors.length > 0) {
  console.error('🚨 SUPABASE CONFIGURATION ERRORS:');
  configErrors.forEach(error => console.error(error));
  console.error('');
  console.error('🔧 TO FIX THESE ERRORS:');
  console.error('1. Go to https://supabase.com/dashboard');
  console.error('2. Select your project (or create a new one)');
  console.error('3. Go to Settings > API');
  console.error('4. Copy the "Project URL" and "anon public" key');
  console.error('5. Create/update your .env.local file:');
  console.error('');
  console.error('VITE_SUPABASE_URL=https://your-project-id.supabase.co');
  console.error('VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
  console.error('');
  console.error('6. Restart your development server (npm run dev)');
  console.error('');
  console.error('📖 For detailed setup instructions, see: DEMO_USER_SETUP.md');
}

// Create client only if configuration is valid
let supabase: any = null;

if (configErrors.length === 0) {
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
  console.warn('⚠️ Supabase client not initialized due to configuration errors');
}

export { supabase };

// Helper function to handle Supabase errors
export const handleSupabaseError = (error: any) => {
  console.error('Supabase operation error:', error);
  
  // Handle network/connection errors
  if (error?.message?.includes('Failed to fetch') || error?.message?.includes('fetch')) {
    throw new Error('Unable to connect to the database. Please check your Supabase configuration and internet connection.');
  }
  
  // Handle authentication errors
  if (error?.message?.includes('Invalid login credentials')) {
    throw new Error('Invalid email or password. Please check your credentials and try again.');
  }
  
  if (error?.message?.includes('Email not confirmed')) {
    throw new Error('Please check your email and click the confirmation link before signing in.');
  }
  
  if (error?.message?.includes('Invalid API key')) {
    throw new Error('Invalid Supabase API key. Please check your VITE_SUPABASE_ANON_KEY in .env.local');
  }
  
  // Generic error handling
  if (error?.message) {
    throw new Error(error.message);
  }
  
  throw new Error('An unexpected error occurred. Please check your Supabase configuration and try again.');
};

// Export configuration status checker
export const isSupabaseConfigured = (): boolean => {
  return configErrors.length === 0 && supabase !== null;
};

// Export configuration errors for UI display
export const getConfigurationErrors = (): string[] => {
  return configErrors;
};