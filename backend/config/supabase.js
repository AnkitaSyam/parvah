import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ubnhvymufzandronopsi.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('⚠️ Supabase URL or Secret/Service Role Key missing in environment variables.');
}

// Server Supabase client / admin client (bypasses RLS for service tasks)
export const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey || 'placeholder-service-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export const supabaseAdmin = supabase; // Export as both for compatibility

/**
 * Creates an authenticated Supabase client using a user's JWT token
 * to guarantee Row Level Security (RLS) is respected for user context operations.
 */
export const createUserClient = (token) => {
  if (!token) {
    throw new Error('Authentication token required to create user-bound Supabase client.');
  }

  const supabaseAnonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  return createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-anon-key',
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );
};
