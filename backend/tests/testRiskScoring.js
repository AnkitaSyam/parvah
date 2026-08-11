import { supabaseAdmin } from '../config/supabase.js';
import { calculateRiskScore } from '../services/riskScoring.js';

async function runTests() {
  console.log('🧪 Starting Progressive Risk Memory Scoring Verification Tests...\n');

  let testPatient1 = null;
  let testPatient2 = null;

  try {
    // 1. Fetch test ASHA worker
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const workerA = users.find(u => u.email === 'asha.workera@parvah.health');
    const ashaWorkerId = workerA ? workerA.id : '11111111-1111-1111-1111-111111111111';

    console.log(`📌 Using ASHA Worker ID: ${ashaWorkerId}`);

    // =========================================================================
    // TEST CASE 1: Progressive Risk Level (Normal -> Watch -> Alert)
    // =========================================================================
    console.log('\n------------------------------------------------------------');
    console.log('📈 TEST CASE 1: Simulating gradually worsening subtle symptoms');
    console.log('------------------------------------------------------------');

    testPatient1 = await createTestPatient(ashaWorkerId, 'Test Patient Progression');
    console.log(`Created Test Patient 1: ${testPatient1.name} (ID: ${testPatient1.id})`);

    const now = new Date();

    // ── STEP 1: Day 1 ──
    console.log('\n[Day 1] Patient reports mild fatigue...');
    const visit1 = await addVisitWithSymptoms(testPatient1.id, ashaWorkerId, now, [
      { name: 'Mild Fatigue', severity: 'mild' }
    ]);
    
    let res1 = await calculateRiskScore(testPatient1.id);
    console.log(`   -> Calculated Score: ${res1.current_risk_score} | Risk Level: ${res1.risk_level}`);
    if (res1.risk_level !== 'normal') {
      throw new Error(`Test Case 1 Step 1 Failed: Expected risk level "normal", got "${res1.risk_level}"`);
    }
    console.log('   ✅ Day 1 Passed.');

    // ── STEP 2: Day 5 ──
    console.log('\n[Day 5] Patient now has swelling in feet...');
    // Shift Day 1 visit back by 4 days
    await updateVisitAndTimelineDate(visit1.id, new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000));
    // Add Day 5 visit today
    const visit2 = await addVisitWithSymptoms(testPatient1.id, ashaWorkerId, now, [
      { name: 'Mild Fatigue', severity: 'mild' },
      { name: 'Swelling in Feet', severity: 'moderate' }
    ]);

    let res2 = await calculateRiskScore(testPatient1.id);
    console.log(`   -> Calculated Score: ${res2.current_risk_score} | Risk Level: ${res2.risk_level}`);
    if (res2.risk_level !== 'watch') {
      throw new Error(`Test Case 1 Step 2 Failed: Expected risk level "watch", got "${res2.risk_level}"`);
    }
    console.log('   ✅ Day 5 Passed.');

    // ── STEP 3: Day 10 ──
    console.log('\n[Day 10] Patient adds a persistent headache...');
    // Shift Day 1 visit back by 9 days, Day 5 visit back by 5 days
    await updateVisitAndTimelineDate(visit1.id, new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000));
    await updateVisitAndTimelineDate(visit2.id, new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000));
    // Add Day 10 visit today
    const visit3 = await addVisitWithSymptoms(testPatient1.id, ashaWorkerId, now, [
      { name: 'Mild Fatigue', severity: 'mild' },
      { name: 'Swelling in Feet', severity: 'moderate' },
      { name: 'Persistent Headache', severity: 'moderate' }
    ]);

    let res3 = await calculateRiskScore(testPatient1.id);
    console.log(`   -> Calculated Score: ${res3.current_risk_score} | Risk Level: ${res3.risk_level}`);
    if (res3.risk_level !== 'alert') {
      throw new Error(`Test Case 1 Step 3 Failed: Expected risk level "alert", got "${res3.risk_level}"`);
    }
    console.log('   ✅ Day 10 Passed.');

    // ── STEP 4: Day 14 ──
    console.log('\n[Day 14] Patient adds blurred vision...');
    // Shift Day 1 visit back to 13 days, Day 5 to 9 days, Day 10 to 4 days ago
    await updateVisitAndTimelineDate(visit1.id, new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000));
    await updateVisitAndTimelineDate(visit2.id, new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000));
    await updateVisitAndTimelineDate(visit3.id, new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000));
    // Add Day 14 visit today
    await addVisitWithSymptoms(testPatient1.id, ashaWorkerId, now, [
      { name: 'Mild Fatigue', severity: 'mild' },
      { name: 'Swelling in Feet', severity: 'moderate' },
      { name: 'Persistent Headache', severity: 'moderate' },
      { name: 'Blurred Vision', severity: 'moderate' }
    ]);

    let res4 = await calculateRiskScore(testPatient1.id);
    console.log(`   -> Calculated Score: ${res4.current_risk_score} | Risk Level: ${res4.risk_level}`);
    if (res4.risk_level !== 'alert') {
      throw new Error(`Test Case 1 Step 4 Failed: Expected risk level "alert", got "${res4.risk_level}"`);
    }
    console.log('   ✅ Day 14 Passed.');


    // =========================================================================
    // TEST CASE 2: Immediate Red-Flag Override
    // =========================================================================
    console.log('\n------------------------------------------------------------');
    console.log('🚨 TEST CASE 2: Severe/Red-Flag override check');
    console.log('------------------------------------------------------------');

    testPatient2 = await createTestPatient(ashaWorkerId, 'Test Patient Red-Flag');
    console.log(`Created Test Patient 2: ${testPatient2.name} (ID: ${testPatient2.id})`);

    console.log('\nLogging a single severe/red-flag symptom today...');
    await addVisitWithSymptoms(testPatient2.id, ashaWorkerId, now, [
      {
        name: 'Severe Bleeding',
        severity: 'severe',
        requires_doctor_referral: true,
        flag_description: 'Vaginal bleeding reported during pregnancy',
        recommended_asha_action: 'Arrange immediate transport to PHC'
      }
    ]);

    let resSevere = await calculateRiskScore(testPatient2.id);
    console.log(`   -> Calculated Score: ${resSevere.current_risk_score} | Risk Level: ${resSevere.risk_level}`);
    if (resSevere.risk_level !== 'alert' || resSevere.red_flag_triggered !== true) {
      throw new Error(`Test Case 2 Failed: Expected risk level "alert" with red_flag_triggered = true, got risk level "${resSevere.risk_level}", red_flag_triggered: ${resSevere.red_flag_triggered}`);
    }
    console.log('   ✅ Red-Flag Override Passed.');

    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');

  } catch (err) {
    console.error('\n❌ Test execution failed:', err.message);
    process.exitCode = 1;
  } finally {
    // Cleanup test data
    console.log('\n🧹 Cleaning up test database entries...');
    if (testPatient1) {
      await supabaseAdmin.from('patients').delete().eq('id', testPatient1.id);
      console.log(`   Removed Test Patient 1 (${testPatient1.id})`);
    }
    if (testPatient2) {
      await supabaseAdmin.from('patients').delete().eq('id', testPatient2.id);
      console.log(`   Removed Test Patient 2 (${testPatient2.id})`);
    }
    console.log('Done.');
  }
}

// Helpers
async function createTestPatient(ashaWorkerId, name) {
  const { data, error } = await supabaseAdmin
    .from('patients')
    .insert([{
      name,
      asha_worker_id: ashaWorkerId,
      due_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      current_risk_score: 0.0,
      risk_level: 'normal',
      gestational_weeks: 20
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function addVisitWithSymptoms(patientId, ashaWorkerId, createdDate, symptomsList) {
  const { data: visit, error: visitError } = await supabaseAdmin
    .from('visits')
    .insert([{
      patient_id: patientId,
      asha_worker_id: ashaWorkerId,
      status: 'analyzed',
      summary: 'Test visit',
      created_at: createdDate.toISOString(),
      visit_date: createdDate.toISOString().split('T')[0]
    }])
    .select()
    .single();

  if (visitError) throw visitError;

  const riskTimelineRows = symptomsList.map(s => ({
    patient_id: patientId,
    visit_id: visit.id,
    asha_worker_id: ashaWorkerId,
    symptom_name: s.name,
    severity: s.severity || 'mild',
    gestational_week: 20,
    flag_description: s.flag_description || `Reported ${s.name}`,
    recommended_asha_action: s.recommended_asha_action || 'Monitor symptom',
    requires_doctor_referral: s.requires_doctor_referral || false,
    created_at: createdDate.toISOString(),
    date_logged: createdDate.toISOString().split('T')[0]
  }));

  if (riskTimelineRows.length > 0) {
    const { error: timelineError } = await supabaseAdmin
      .from('risk_timeline')
      .insert(riskTimelineRows);

    if (timelineError) throw timelineError;
  }

  return visit;
}

async function updateVisitAndTimelineDate(visitId, newDate) {
  const { error: vError } = await supabaseAdmin
    .from('visits')
    .update({
      created_at: newDate.toISOString(),
      visit_date: newDate.toISOString().split('T')[0]
    })
    .eq('id', visitId);

  if (vError) throw vError;

  const { error: tError } = await supabaseAdmin
    .from('risk_timeline')
    .update({
      created_at: newDate.toISOString(),
      date_logged: newDate.toISOString().split('T')[0]
    })
    .eq('visit_id', visitId);

  if (tError) throw tError;
}

runTests();
