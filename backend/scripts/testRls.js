import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), 'server', '.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ubnhvymufzandronopsi.supabase.co';
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

async function testRlsIsolation() {
  console.log('🧪 Testing Supabase Row Level Security (RLS) Isolation...\n');

  const supabaseAnon = createClient(supabaseUrl, anonKey);

  // 1. Authenticate as Worker A
  const workerAEmail = 'asha.workera@parvah.health';
  const { data: authData, error: authErr } = await supabaseAnon.auth.signInWithPassword({
    email: workerAEmail,
    password: 'TestPassword123!'
  });

  if (authErr) {
    console.log(`ℹ️ Auth Note: ${authErr.message}. Make sure migration 001_init.sql and seed.js have been run.`);
    return;
  }

  const workerAUser = authData.user;
  console.log(`🔑 Successfully authenticated as Worker A: ${workerAUser.email} (ID: ${workerAUser.id})`);

  // 2. Query patients table as Worker A (RLS active)
  const { data: visiblePatients, error: queryErr } = await supabaseAnon
    .from('patients')
    .select('*');

  if (queryErr) {
    console.error('❌ Query error:', queryErr.message);
    return;
  }

  console.log(`\n📊 Patients returned to Worker A (Total: ${visiblePatients.length}):`);
  visiblePatients.forEach(p => {
    console.log(`   - Patient: "${p.name}" | ASHA Worker ID: ${p.asha_worker_id}`);
  });

  const workerBVisible = visiblePatients.some(p => p.name.includes('Worker B'));

  if (!workerBVisible) {
    console.log('\n✅ RLS Isolation VERIFIED: Worker B\'s patients are completely hidden from Worker A!');
  } else {
    console.error('\n❌ RLS Failure: Worker A was able to view Worker B\'s patient data.');
  }
}

testRlsIsolation();
