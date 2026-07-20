import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), 'server', '.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ubnhvymufzandronopsi.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!serviceRoleKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY is required in .env to run seed.js');
  process.exit(1);
}

// Service role client bypasses RLS
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function runSeed() {
  console.log('🌱 Starting Parvah Database Seeding (Service Role Admin)...');

  try {
    // 1. Create or fetch Worker A
    let workerAId;
    const workerAEmail = 'asha.workera@parvah.health';
    const { data: userA, error: errA } = await supabaseAdmin.auth.admin.createUser({
      email: workerAEmail,
      password: 'TestPassword123!',
      email_confirm: true
    });

    if (errA) {
      console.log(`ℹ️ Worker A user creation note: ${errA.message}. Fetching user list...`);
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      const existingA = users.find(u => u.email === workerAEmail);
      workerAId = existingA ? existingA.id : '11111111-1111-1111-1111-111111111111';
    } else {
      workerAId = userA.user.id;
    }

    // 2. Create or fetch Worker B
    let workerBId;
    const workerBEmail = 'asha.workerb@parvah.health';
    const { data: userB, error: errB } = await supabaseAdmin.auth.admin.createUser({
      email: workerBEmail,
      password: 'TestPassword123!',
      email_confirm: true
    });

    if (errB) {
      console.log(`ℹ️ Worker B user creation note: ${errB.message}. Fetching user list...`);
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      const existingB = users.find(u => u.email === workerBEmail);
      workerBId = existingB ? existingB.id : '22222222-2222-2222-2222-222222222222';
    } else {
      workerBId = userB.user.id;
    }

    console.log(`📌 Worker A UUID (${workerAEmail}): ${workerAId}`);
    console.log(`📌 Worker B UUID (${workerBEmail}): ${workerBId}`);

    // 3. Clear existing test seed patients
    await supabaseAdmin.from('patients').delete().in('asha_worker_id', [workerAId, workerBId]);

    // 4. Insert 3 Fake Patients (2 for Worker A, 1 for Worker B)
    const seedPatients = [
      {
        name: 'Rekha Devi (Worker A Patient)',
        asha_worker_id: workerAId,
        due_date: '2026-10-15',
        current_risk_score: 8.5,
        risk_level: 'alert'
      },
      {
        name: 'Sunita Sharma (Worker A Patient)',
        asha_worker_id: workerAId,
        due_date: '2026-11-20',
        current_risk_score: 3.0,
        risk_level: 'watch'
      },
      {
        name: 'Pooja Verma (Worker B Patient)',
        asha_worker_id: workerBId,
        due_date: '2026-12-05',
        current_risk_score: 1.0,
        risk_level: 'normal'
      }
    ];

    const { data: insertedPatients, error: insertError } = await supabaseAdmin
      .from('patients')
      .insert(seedPatients)
      .select();

    if (insertError) {
      throw insertError;
    }

    console.log('\n✅ Successfully inserted 3 seed patients:');
    insertedPatients.forEach(p => {
      console.log(`   - ID: ${p.id} | Name: ${p.name} | Worker ID: ${p.asha_worker_id} | Risk: ${p.risk_level}`);
    });

    console.log('\n🎉 Seeding Completed Successfully!');
    console.log(`\nTo test RLS isolation:`);
    console.log(`1. Login as Worker A (${workerAEmail}) or set auth.uid() to ${workerAId}.`);
    console.log(`2. Query 'patients' table. Only Worker A's 2 patients will be returned.`);
    console.log(`3. Worker B's patient (${workerBId}) will be completely hidden by RLS policies.`);

  } catch (err) {
    console.error('❌ Seeding Error:', err.message);
  }
}

runSeed();
