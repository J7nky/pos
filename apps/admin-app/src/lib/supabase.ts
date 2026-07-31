import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
// SECURITY: the service role key must NEVER be read here. Any VITE_* var is
// inlined into the served bundle, and the service role bypasses all RLS.
// Operations that need it live in the admin-users Edge Function.

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Admin app will run in offline mode.');
  console.warn('Required variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
  console.warn('Please create a .env.local file with your Supabase credentials for full functionality.');
}

// Use placeholder values if environment variables are missing
// This prevents the "supabaseKey is required" error
const safeSupabaseUrl = supabaseUrl || 'https://placeholder.supabase.co';
const safeSupabaseAnonKey = supabaseAnonKey || 'placeholder-key';

// Regular client for user operations
export const supabase = createClient(safeSupabaseUrl, safeSupabaseAnonKey);

