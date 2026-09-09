/**
 * backend/tests/testVitalsAndGrowth.js
 *
 * Offline test suite for vitals grading, voice extraction of vitals, and
 * infant growth monitoring. No API key, no network, no database.
 *
 * Run from backend/:  npm run test:vitals
 */

import { gradeVitals, parseVitalsFromText, weightTrend } from '../services/vitals.js';
import {
  classifyWeightForAge, detectFaltering, buildGrowthSummary,
  ageInDays, growthToRiskEntry
} from '../services/childGrowth.js';

let passed = 0;
let failed = 0;
const failures = [];

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

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().split('T')[0];
const find = (r, name) => r.findings.find((f) => f.symptom_name === name);

console.log('\n🧪 Parvah vitals & growth suite\n');

// ── 1. Blood pressure ───────────────────────────────────────────────────────
section('1. Blood pressure grading');

const normalBp = gradeVitals({ systolic_bp: 118, diastolic_bp: 76 }, { stage: 'antenatal' });
check('Normal BP produces no finding', normalBp.findings.length === 0,
  normalBp.findings.map((f) => f.symptom_name).join(', '));

const raisedBp = gradeVitals({ systolic_bp: 142, diastolic_bp: 92 }, { stage: 'antenatal' });
check('140/90 is flagged as raised', Boolean(find(raisedBp, 'Raised Blood Pressure')));
check('Raised BP is moderate, not severe',
  find(raisedBp, 'Raised Blood Pressure')?.severity === 'moderate');
check('Raised BP advises referral', find(raisedBp, 'Raised Blood Pressure')?.requires_doctor_referral === true);

const severeBp = gradeVitals({ systolic_bp: 168, diastolic_bp: 112 }, { stage: 'antenatal' });
check('160/110 is severe hypertension', Boolean(find(severeBp, 'Severe Hypertension')));
check('Severe hypertension is an emergency', severeBp.has_emergency === true);
check('Severe hypertension action names 108',
  /108/.test(find(severeBp, 'Severe Hypertension')?.recommended_asha_action || ''));

// Diastolic alone crossing the threshold must still fire.
const diastolicOnly = gradeVitals({ systolic_bp: 132, diastolic_bp: 94 }, { stage: 'antenatal' });
check('Raised diastolic alone is flagged', diastolicOnly.findings.length > 0);

const severeDiastolic = gradeVitals({ systolic_bp: 145, diastolic_bp: 115 }, { stage: 'antenatal' });
check('Diastolic >=110 alone is severe', Boolean(find(severeDiastolic, 'Severe Hypertension')));

const lowBp = gradeVitals({ systolic_bp: 84, diastolic_bp: 54 }, { stage: 'antenatal' });
check('Low BP is flagged', Boolean(find(lowBp, 'Low Blood Pressure')));

// ── 2. Pre-eclampsia pairing ────────────────────────────────────────────────
section('2. Raised BP with proteinuria');

const preEclampsia = gradeVitals(
  { systolic_bp: 148, diastolic_bp: 96, urine_albumin: '2+' },
  { stage: 'antenatal' }
);
check('BP + proteinuria is graded severe',
  find(preEclampsia, 'Raised Blood Pressure with Proteinuria')?.severity === 'severe');
check('BP + proteinuria is an emergency', preEclampsia.has_emergency === true);
check('Does not also emit a standalone raised-BP finding',
  !find(preEclampsia, 'Raised Blood Pressure'));

const traceOnly = gradeVitals(
  { systolic_bp: 148, diastolic_bp: 96, urine_albumin: 'trace' },
  { stage: 'antenatal' }
);
check('Trace albumin does not escalate to severe',
  find(traceOnly, 'Raised Blood Pressure')?.severity === 'moderate');

const proteinuriaAlone = gradeVitals({ urine_albumin: '3+' }, { stage: 'antenatal' });
check('Proteinuria without raised BP is flagged separately',
  Boolean(find(proteinuriaAlone, 'Proteinuria')));

// ── 3. Anaemia ──────────────────────────────────────────────────────────────
section('3. Haemoglobin grading (Anemia Mukt Bharat cutoffs)');

check('Hb 6.4 is severe anaemia',
  find(gradeVitals({ hemoglobin_gdl: 6.4 }), 'Severe Anaemia')?.severity === 'severe');
check('Hb 8.5 is moderate anaemia',
  find(gradeVitals({ hemoglobin_gdl: 8.5 }), 'Moderate Anaemia')?.severity === 'moderate');
check('Hb 10.4 is mild anaemia',
  find(gradeVitals({ hemoglobin_gdl: 10.4 }), 'Mild Anaemia')?.severity === 'mild');
check('Hb 11.8 produces no finding', gradeVitals({ hemoglobin_gdl: 11.8 }).findings.length === 0);
check('Severe anaemia warns against IFA alone',
  /transfusion|IFA tablets alone/i.test(
    find(gradeVitals({ hemoglobin_gdl: 6.4 }), 'Severe Anaemia')?.recommended_asha_action || ''));

// ── 4. Temperature, pulse ───────────────────────────────────────────────────
section('4. Temperature and pulse');

check('37.2 C produces no finding', gradeVitals({ temperature_c: 37.2 }).findings.length === 0);
check('38.4 C antenatal is moderate',
  find(gradeVitals({ temperature_c: 38.4 }, { stage: 'antenatal' }), 'Fever on Examination')?.severity === 'moderate');
check('38.4 C postpartum is severe (puerperal sepsis)',
  find(gradeVitals({ temperature_c: 38.4 }, { stage: 'postpartum' }), 'Fever on Examination')?.severity === 'severe');
check('Postpartum fever action mentions lochia',
  /lochia/i.test(find(gradeVitals({ temperature_c: 38.4 }, { stage: 'postpartum' }), 'Fever on Examination')?.recommended_asha_action || ''));
check('Pulse 124 is tachycardia', Boolean(find(gradeVitals({ pulse_bpm: 124 }), 'Tachycardia')));
check('Pulse 78 produces no finding', gradeVitals({ pulse_bpm: 78 }).findings.length === 0);

// ── 5. Robustness ───────────────────────────────────────────────────────────
section('5. Grading robustness');

check('Empty vitals produce nothing', gradeVitals({}).findings.length === 0);
check('Null values are ignored',
  gradeVitals({ systolic_bp: null, hemoglobin_gdl: null }).findings.length === 0);
check('Blank strings are ignored',
  gradeVitals({ systolic_bp: '', diastolic_bp: '' }).findings.length === 0);
check('Numeric strings are graded',
  find(gradeVitals({ systolic_bp: '168', diastolic_bp: '112' }), 'Severe Hypertension') !== undefined);
check('highest_severity reports the worst finding',
  gradeVitals({ systolic_bp: 168, diastolic_bp: 112, hemoglobin_gdl: 10.5 }).highest_severity === 'severe');

// ── 6. Voice extraction ─────────────────────────────────────────────────────
section('6. Vitals spoken aloud');

const spoken = [
  ['BP one forty by ninety hai, aur Hb seven point two.', { systolic_bp: 140, diastolic_bp: 90, hemoglobin_gdl: 7.2 }],
  ['Blood pressure 148/96, weight 52 kg.',                { systolic_bp: 148, diastolic_bp: 96, weight_kg: 52 }],
  ['बीपी 160 बटा 110 है।',                                 { systolic_bp: 160, diastolic_bp: 110 }],
  ['bp one sixty by one ten',                             { systolic_bp: 160, diastolic_bp: 110 }],
  ['Temperature 38.5 celsius, pulse 96.',                 { temperature_c: 38.5, pulse_bpm: 96 }],
  ['Her temperature is 101 fahrenheit.',                  { temperature_c: 38.3 }],
  ['Urine albumin 2 plus.',                               { urine_albumin: '2+' }],
  ['vazan 48 kilo hai',                                   { weight_kg: 48 }]
];

for (const [text, expected] of spoken) {
  const { vitals } = parseVitalsFromText(text);
  const ok = Object.entries(expected).every(([k, v]) =>
    typeof v === 'number' ? Math.abs((vitals[k] ?? -999) - v) < 0.15 : vitals[k] === v);
  check(`Parses: "${text.slice(0, 44)}…"`, ok, JSON.stringify(vitals));
}

// ── 7. Voice extraction must not invent values ──────────────────────────────
section('7. Voice extraction safety');

check('No vitals in ordinary conversation',
  Object.keys(parseVitalsFromText('She says the baby is moving well and she feels fine today.').vitals).length === 0);

check('A swapped BP pair is rejected',
  parseVitalsFromText('bp 90 by 140').vitals.systolic_bp === undefined,
  JSON.stringify(parseVitalsFromText('bp 90 by 140').vitals));

check('An implausible BP is rejected',
  parseVitalsFromText('bp 400 by 300').vitals.systolic_bp === undefined);

check('An implausible Hb is rejected',
  parseVitalsFromText('hb 45').vitals.hemoglobin_gdl === undefined);

check('A gestational week is not mistaken for a weight',
  parseVitalsFromText('She is 28 weeks pregnant.').vitals.weight_kg === undefined);

check('Empty input is handled', Object.keys(parseVitalsFromText('').vitals).length === 0);
check('Null input is handled', Object.keys(parseVitalsFromText(null).vitals).length === 0);

// ── 8. Weight trend ─────────────────────────────────────────────────────────
section('8. Maternal weight trend');

const up = weightTrend(54.2, 52.0, 28);
check('Weight gain reads as up', up.direction === 'up' && up.delta_kg === 2.2);
check('Per-week gain is computed', Math.abs(up.per_week_kg - 0.55) < 0.02, String(up.per_week_kg));
check('Weight loss reads as down', weightTrend(50.0, 52.0, 14).direction === 'down');
check('Missing input returns null', weightTrend(null, 52, 14) === null);

// ── 9. Weight-for-age classification ────────────────────────────────────────
section('9. Infant weight-for-age');

check('Girl 3.0 kg at birth is normal',
  classifyWeightForAge({ weightKg: 3.0, ageDays: 0, sex: 'female' }).classification === 'normal');
check('Girl 2.2 kg at birth is underweight',
  classifyWeightForAge({ weightKg: 2.2, ageDays: 0, sex: 'female' }).classification === 'underweight');
check('Girl 1.8 kg at birth is severely underweight',
  classifyWeightForAge({ weightKg: 1.8, ageDays: 0, sex: 'female' }).classification === 'severely_underweight');
check('Boy 9.6 kg at 12 months is normal',
  classifyWeightForAge({ weightKg: 9.6, ageDays: 365, sex: 'male' }).classification === 'normal');
check('Boy 7.0 kg at 12 months is underweight',
  classifyWeightForAge({ weightKg: 7.0, ageDays: 365, sex: 'male' }).classification === 'underweight');

// Unknown sex must not be guessed — a wrong classification is worse than none.
check('Unrecorded sex returns unknown, not a guess',
  classifyWeightForAge({ weightKg: 3.0, ageDays: 0, sex: null }).classification === 'unknown');
check('Beyond the table range returns unknown',
  classifyWeightForAge({ weightKg: 14, ageDays: 1200, sex: 'male' }).classification === 'unknown');
check('Cutoffs are returned for the UI',
  classifyWeightForAge({ weightKg: 3.0, ageDays: 0, sex: 'female' }).cutoffs?.underweight_below > 0);

// ── 10. Faltering ───────────────────────────────────────────────────────────
section('10. Growth faltering');

const lost = detectFaltering(
  { weight_kg: 5.2, measured_on: daysAgo(0),  age_days: 90 },
  { weight_kg: 5.6, measured_on: daysAgo(21), age_days: 69 }
);
check('Weight loss is faltering', lost.faltering === true, lost.reason);

const gained = detectFaltering(
  { weight_kg: 6.4, measured_on: daysAgo(0),  age_days: 90 },
  { weight_kg: 5.6, measured_on: daysAgo(28), age_days: 62 }
);
check('Healthy gain is not faltering', gained.faltering === false, gained.reason);

const stalled = detectFaltering(
  { weight_kg: 5.65, measured_on: daysAgo(0),  age_days: 90 },
  { weight_kg: 5.60, measured_on: daysAgo(28), age_days: 62 }
);
check('Near-zero gain over four weeks is faltering', stalled.faltering === true, stalled.reason);

// Newborns normally lose up to ~10% before regaining by day 14.
const newbornDip = detectFaltering(
  { weight_kg: 2.85, measured_on: daysAgo(0), age_days: 5 },
  { weight_kg: 3.00, measured_on: daysAgo(5), age_days: 0 }
);
check('Normal newborn weight dip is not faltering', newbornDip.faltering === false, newbornDip.reason);

const newbornBigLoss = detectFaltering(
  { weight_kg: 2.55, measured_on: daysAgo(0), age_days: 5 },
  { weight_kg: 3.00, measured_on: daysAgo(5), age_days: 0 }
);
check('Newborn loss beyond 10% is faltering', newbornBigLoss.faltering === true, newbornBigLoss.reason);

check('Missing previous measurement returns null', detectFaltering({ weight_kg: 5 }, null) === null);

// ── 11. Growth summary ──────────────────────────────────────────────────────
section('11. Growth summary');

const babyPatient = {
  id: 'p1', stage: 'postpartum',
  delivery_date: daysAgo(84),
  delivery_outcome: 'live_birth',
  baby_sex: 'female',
  baby_birth_weight_kg: 2.4
};

const summary = buildGrowthSummary(babyPatient, [
  { id: 'g1', measured_on: daysAgo(84), weight_kg: 2.4 },
  { id: 'g2', measured_on: daysAgo(56), weight_kg: 3.4 },
  { id: 'g3', measured_on: daysAgo(28), weight_kg: 4.3 },
  { id: 'g4', measured_on: daysAgo(0),  weight_kg: 4.35 }
]);

check('All measurements are summarised', summary.points.length === 4);
check('Points are ordered oldest first',
  new Date(summary.points[0].measured_on) < new Date(summary.points[3].measured_on));
check('Low birth weight is surfaced', summary.low_birth_weight === true);
check('The stalled final month reads as faltering', summary.status === 'faltering', summary.status);
check('A concrete action is given', Boolean(summary.recommended_action));
check('The first point is never faltering', summary.points[0].faltering === false);
check('Ages are computed from the delivery date', summary.points[3].age_days === 84);
check('The next weighing date is given', Boolean(summary.next_weighing_due));

const healthy = buildGrowthSummary(babyPatient, [
  { id: 'h1', measured_on: daysAgo(56), weight_kg: 3.4 },
  { id: 'h2', measured_on: daysAgo(28), weight_kg: 4.4 },
  { id: 'h3', measured_on: daysAgo(0),  weight_kg: 5.5 }
]);
check('Steady gain reads as normal', healthy.status === 'normal', healthy.status);

check('No measurements reads as no_data', buildGrowthSummary(babyPatient, []).status === 'no_data');

const noSex = buildGrowthSummary({ ...babyPatient, baby_sex: null }, [
  { id: 'n1', measured_on: daysAgo(0), weight_kg: 4.0 }
]);
check('Missing sex asks for it rather than guessing',
  noSex.status === 'unclassified' && /sex/i.test(noSex.recommended_action || ''));

// ── 12. Growth → risk timeline ──────────────────────────────────────────────
section('12. Growth feeds the risk timeline');

const entry = growthToRiskEntry(summary, {
  patientId: 'p1', visitId: null, ashaWorkerId: 'w1', postpartumDay: 84
});
check('A faltering summary produces a timeline entry', Boolean(entry));
check('The entry is stage-tagged postpartum', entry?.stage === 'postpartum');
check('The entry carries the reason', Boolean(entry?.flag_description));
check('The entry carries an action', Boolean(entry?.recommended_asha_action));

check('A healthy summary produces no entry',
  growthToRiskEntry(healthy, { patientId: 'p1', ashaWorkerId: 'w1' }) === null);

// ── 13. Age helper ──────────────────────────────────────────────────────────
section('13. Age helper');

check('Age in days is computed', ageInDays(daysAgo(30)) === 30);
check('Missing birth date returns null', ageInDays(null) === null);
check('Age is never negative', ageInDays(daysAgo(-5)) === 0);

console.log(`\n${'═'.repeat(60)}`);
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  • ${f}`));
  console.log('');
  process.exit(1);
}
console.log('All vitals & growth tests passed.\n');
