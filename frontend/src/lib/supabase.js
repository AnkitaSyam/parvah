import { createClient } from '@supabase/supabase-js';

/**
 * There were previously two near-identical clients (lib/supabase.js and
 * supabase/config.js), each with a live project ref hardcoded as a fallback —
 * so a misconfigured build silently pointed at someone else's database.
 * This is now the only client, and misconfiguration is visible.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);

if (!supabaseConfigured) {
  console.error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.\n' +
    'Copy .env.example to frontend/.env and fill in your Supabase project values.'
  );
}

// RLS is enforced per ASHA worker; the anon key is safe to ship to the client.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);
