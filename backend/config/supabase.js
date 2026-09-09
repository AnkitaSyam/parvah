import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * A live project ref used to be hardcoded here as a fallback, so a machine
 * with a missing SUPABASE_URL silently connected to someone else's database
 * instead of failing. Misconfiguration should be loud.
 */
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const missing = [];
if (!supabaseUrl) missing.push('SUPABASE_URL');
if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (!supabaseAnonKey) missing.push('SUPABASE_ANON_KEY');

if (missing.length > 0) {
  console.error(
    `\n❌ Missing required environment variable(s): ${missing.join(', ')}\n` +
    `   Copy backend/.env.example to backend/.env and fill in your Supabase project values.\n` +
    `   Find them at: Supabase dashboard → Project Settings → API\n`
  );
  // Fail fast rather than serving requests that will all error confusingly
  // deeper in the stack with an opaque PostgREST message.
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

/**
 * Service-role client. Bypasses RLS — use ONLY for trusted server-side work
 * that legitimately spans users (risk scoring, storage, seeding).
 * Never hand a request's data to this client without checking ownership first.
 */
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export const supabaseAdmin = supabase;

/**
 * Creates a Supabase client bound to a user's JWT, so every query runs under
 * that user's Row Level Security policies. This is the client that should
 * serve request data.
 */
export const createUserClient = (token) => {
  if (!token) {
    throw new Error('Authentication token required to create a user-bound Supabase client.');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
};
