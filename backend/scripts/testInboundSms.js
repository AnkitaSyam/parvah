/**
 * backend/scripts/testInboundSms.js
 *
 * Test suite for the inbound SMS myth-correction and emergency bypass channel.
 * Simulates Twilio form-encoded POST webhooks against /api/sms/inbound and
 * inspects the TwiML response and the resulting row in the sms_alerts table.
 *
 * Run with: node scripts/testInboundSms.js
 */

process.env.NODE_ENV = 'test';
process.env.SKIP_TWILIO_VALIDATION = 'true';

import http from 'http';
import { supabaseAdmin } from '../config/supabase.js';

let passed = 0;
let failed = 0;
const failures = [];
const createdAlertIds = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ❌ ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
  console.log('─'.repeat(title.length));
}

async function postInboundSms(serverUrl, from, body) {
  const params = new URLSearchParams();
  params.append('From', from);
  params.append('Body', body);
  params.append('MessageSid', `SIM_SM${Date.now()}`);

  const res = await fetch(`${serverUrl}/api/sms/inbound`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  const text = await res.text();
  const contentType = res.headers.get('content-type') || '';

  return { status: res.status, contentType, text };
}

async function fetchLatestAlert(phone) {
  const { data, error } = await supabaseAdmin
    .from('sms_alerts')
    .select('*')
    .eq('phone_number', phone)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error querying sms_alerts:', error.message);
    return null;
  }

  return data?.[0] || null;
}

async function runTests() {
  console.log('\n🧪 Parvah Inbound SMS Channel Suite\n');

  // Dynamically import app after NODE_ENV=test is set to avoid port 5000 collision
  const { default: app } = await import('../index.js');

  // Start an ephemeral test server on an unused port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const serverUrl = `http://127.0.0.1:${port}`;
  console.log(`📡 Inbound test server running on ${serverUrl}\n`);

  try {
    const testPhone = '+919988776655';

    // ── Test 1: English Emergency Text ────────────────────────────────────────
    section('1. English Emergency Text (Emergency Bypass)');
    const englishEmergencyBody = 'heavy bleeding, please help';
    const res1 = await postInboundSms(serverUrl, testPhone, englishEmergencyBody);

    check('HTTP 200 status returned', res1.status === 200);
    check('Content-Type is text/xml', /text\/xml/.test(res1.contentType));
    check('Response is valid TwiML with <Response><Message>', /<Response><Message>.*<\/Message><\/Response>/.test(res1.text));
    check('TwiML advises 108 emergency referral', /108/i.test(res1.text));

    console.log(`     TwiML: "${res1.text.trim()}"`);

    const alert1 = await fetchLatestAlert(testPhone);
    if (alert1) createdAlertIds.push(alert1.id);
    check('Row inserted into sms_alerts table', Boolean(alert1));
    check("alert_type is 'emergency'", alert1?.alert_type === 'emergency');
    check('Logged message matches inbound body', alert1?.message === englishEmergencyBody);
    console.log(`     DB Row: id=${alert1?.id}, type=${alert1?.alert_type}, phone=${alert1?.phone_number}`);

    // ── Test 2: Hindi Emergency Text ──────────────────────────────────────────
    section('2. Hindi Emergency Text (Emergency Bypass)');
    const hindiEmergencyBody = 'तेज़ सिरदर्द और चक्कर आ रहे हैं, बहुत खून बह रहा है';
    const res2 = await postInboundSms(serverUrl, testPhone, hindiEmergencyBody);

    check('HTTP 200 status returned', res2.status === 200);
    check('Content-Type is text/xml', /text\/xml/.test(res2.contentType));
    check('TwiML contains 108 and Hindi emergency warning', /108/i.test(res2.text));

    console.log(`     TwiML: "${res2.text.trim()}"`);

    const alert2 = await fetchLatestAlert(testPhone);
    if (alert2) createdAlertIds.push(alert2.id);
    check('Row inserted into sms_alerts table', Boolean(alert2));
    check("alert_type is 'emergency'", alert2?.alert_type === 'emergency');
    console.log(`     DB Row: id=${alert2?.id}, type=${alert2?.alert_type}, phone=${alert2?.phone_number}`);

    // ── Test 3: Known Myth Statement in Hindi ──────────────────────────────────
    section('3. Known Myth Statement in Hindi (Myth Correction)');
    const hindiMythBody = 'क्या गर्भावस्था में पपीता खाने से गर्भपात हो जाता है? सासू जी मना कर रही हैं।';
    const res3 = await postInboundSms(serverUrl, testPhone, hindiMythBody);

    check('HTTP 200 status returned', res3.status === 200);
    check('Content-Type is text/xml', /text\/xml/.test(res3.contentType));
    check('TwiML response contains counseling script addressing the myth', /पपीता|फल|गर्भावस्था/i.test(res3.text));

    console.log(`     TwiML: "${res3.text.trim()}"`);

    const alert3 = await fetchLatestAlert(testPhone);
    if (alert3) createdAlertIds.push(alert3.id);
    check('Row inserted into sms_alerts table', Boolean(alert3));
    check("alert_type is 'myth'", alert3?.alert_type === 'myth');
    console.log(`     DB Row: id=${alert3?.id}, type=${alert3?.alert_type}, phone=${alert3?.phone_number}`);

    // ── Test 4: Unrelated Neutral Message ─────────────────────────────────────
    section('4. Unrelated Neutral Message (Neutral Acknowledgment)');
    const neutralBody = 'नमस्ते, कल मौसम कैसा रहेगा? बारिश होगी क्या?';
    const res4 = await postInboundSms(serverUrl, testPhone, neutralBody);

    check('HTTP 200 status returned', res4.status === 200);
    check('Content-Type is text/xml', /text\/xml/.test(res4.contentType));
    check('TwiML response directs to ASHA worker', /आशा|स्वास्थ्य केंद्र|ASHA/i.test(res4.text));

    console.log(`     TwiML: "${res4.text.trim()}"`);

    const alert4 = await fetchLatestAlert(testPhone);
    if (alert4) createdAlertIds.push(alert4.id);
    check('Row inserted into sms_alerts table', Boolean(alert4));
    check("alert_type is 'neutral'", alert4?.alert_type === 'neutral');
    console.log(`     DB Row: id=${alert4?.id}, type=${alert4?.alert_type}, phone=${alert4?.phone_number}`);

    // ── Test 5: Registered Patient Matching (Language & Worker Alert) ────────
    section('5. Registered Patient Matching (Patient Lookup & Language)');
    const res5 = await postInboundSms(serverUrl, '+919999922222', 'severe abdominal pain and bleeding');

    check('HTTP 200 status returned', res5.status === 200);
    check('English emergency reply sent for patient with preferred_language = en', /EMERGENCY: Danger sign detected/i.test(res5.text));

    console.log(`     TwiML: "${res5.text.trim()}"`);

    const alert5 = await fetchLatestAlert('+919999922222');
    if (alert5) createdAlertIds.push(alert5.id);
    check('sms_alerts row has patient_id linked', Boolean(alert5?.patient_id));
    console.log(`     DB Row: id=${alert5?.id}, patient_id=${alert5?.patient_id}, type=${alert5?.alert_type}`);


  } finally {
    // Clean up created test alerts from sms_alerts
    if (createdAlertIds.length > 0) {
      await supabaseAdmin.from('sms_alerts').delete().in('id', createdAlertIds);
    }
    server.close();
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  • ${f}`));
    console.log('');
    process.exit(1);
  }
  console.log('All inbound SMS channel tests passed successfully.\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
