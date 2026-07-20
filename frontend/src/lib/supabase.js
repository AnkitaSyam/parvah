import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ubnhvymufzandronopsi.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

// Frontend Supabase Client with Anon / Publishable Key. RLS policies are strictly enforced per ASHA worker.
export const supabase = createClient(supabaseUrl, supabaseKey);

