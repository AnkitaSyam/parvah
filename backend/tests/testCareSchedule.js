/**
 * backend/tests/testCareSchedule.js
 *
 * Offline test suite for the ANC / HBNC / immunization schedule.
 * No API key, no network, no database.
 *
 * Run from backend/:  npm run test:schedule
 */

import {
  buildCareSchedule, scheduleHeadline, currentGestationalWeeks,
  postpartumDay, IMMUNIZATION_CATALOG
} from '../services/careSchedule.js';

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

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

console.log('\n🧪 Parvah care-schedule suite\n');

// ── 1. Gestational age advances with time ───────────────────────────────────
section('1. Gestational age');

const registeredAt12Weeks = {
  id: 'p1', stage: 'antenatal', gestational_weeks: 12,
  created_at: daysAgo(28) // registered four weeks ago
};

check('Advances from the registration date',
  currentGestationalWeeks(registeredAt12Weeks) === 16,
  `got ${currentGestationalWeeks(registeredAt12Weeks)}, expected 16`);

check('Returns null once postpartum',
  currentGestationalWeeks({ stage: 'postpartum', delivery_date: '2026-01-01' }) === null);

// ── 2. ANC schedule ─────────────────────────────────────────────────────────
section('2. Antenatal schedule');

const ancSchedule = buildCareSchedule(registeredAt12Weeks, []);

check('Stage is antenatal', ancSchedule.stage === 'antenatal');
check('Includes all four ANC visits',
  ['ANC-1', 'ANC-2', 'ANC-3', 'ANC-4'].every((c) => ancSchedule.items.some((i) => i.code === c)));
check('Includes TT/Td doses',
  ancSchedule.items.some((i) => i.code === 'TT-1') && ancSchedule.items.some((i) => i.code === 'TT-2'));
check('Includes IFA and calcium',
  ancSchedule.items.some((i) => i.code === 'IFA') && ancSchedule.items.some((i) => i.code === 'CA'));
check('No immunization items before delivery',
  !ancSchedule.items.some((i) => i.kind === 'immunization'));

// At 16 weeks, ANC-1 (weeks 4-12) is past its window → overdue.
const anc1 = ancSchedule.items.find((i) => i.code === 'ANC-1');
check('ANC-1 is overdue at 16 weeks', anc1.status === 'overdue', `status=${anc1.status}`);

// ANC-2 covers weeks 14-26, so at 16 weeks it is currently due.
const anc2 = ancSchedule.items.find((i) => i.code === 'ANC-2');
check('ANC-2 is due at 16 weeks', anc2.status === 'due', `status=${anc2.status}`);

// ANC-4 covers weeks 36-40 — still upcoming.
const anc4 = ancSchedule.items.find((i) => i.code === 'ANC-4');
check('ANC-4 is upcoming at 16 weeks', anc4.status === 'upcoming', `status=${anc4.status}`);

check('Items are sorted by due date',
  ancSchedule.items.every((item, i, arr) =>
    i === 0 || new Date(arr[i - 1].due_date) <= new Date(item.due_date)));

check('Headline names an actionable item',
  /ANC-1|ANC-2|TT/.test(scheduleHeadline(ancSchedule)),
  scheduleHeadline(ancSchedule));

// ── 3. Postpartum schedule ──────────────────────────────────────────────────
section('3. Postpartum (HBNC) schedule');

const delivered10DaysAgo = {
  id: 'p2',
  stage: 'postpartum',
  delivery_date: daysAgo(10).split('T')[0],
  delivery_outcome: 'live_birth',
  delivery_place: 'institutional',
  created_at: daysAgo(200)
};

const pncSchedule = buildCareSchedule(delivered10DaysAgo, []);

check('Postpartum day is 10', postpartumDay(delivered10DaysAgo) === 10,
  `got ${postpartumDay(delivered10DaysAgo)}`);
check('Stage is postpartum', pncSchedule.stage === 'postpartum');

check('Institutional delivery starts HBNC at day 3',
  pncSchedule.items.some((i) => i.code === 'HBNC-D3') &&
  !pncSchedule.items.some((i) => i.code === 'HBNC-D1'));

const homeBirth = { ...delivered10DaysAgo, delivery_place: 'home' };
check('Home delivery adds day-1 and day-2 visits',
  buildCareSchedule(homeBirth, []).items.some((i) => i.code === 'HBNC-D1'));

check('Day-3 visit is overdue at day 10',
  pncSchedule.items.find((i) => i.code === 'HBNC-D3').status === 'overdue');
check('Day-14 visit is still upcoming at day 10',
  pncSchedule.items.find((i) => i.code === 'HBNC-D14').status === 'upcoming');

// ── 4. Immunization schedule ────────────────────────────────────────────────
section('4. Immunization schedule');

check('Catalog is non-empty', IMMUNIZATION_CATALOG.length > 0);
check('Vaccine codes are unique',
  new Set(IMMUNIZATION_CATALOG.map((v) => v.code)).size === IMMUNIZATION_CATALOG.length);
check('Every vaccine names what it protects against',
  IMMUNIZATION_CATALOG.every((v) => Boolean(v.protects)));

check('Birth doses are present',
  ['BCG', 'OPV-0', 'HEPB-0'].every((c) => pncSchedule.items.some((i) => i.code === c)));
check('Six-week doses are present',
  ['PENTA-1', 'RVV-1', 'PCV-1', 'FIPV-1'].every((c) => pncSchedule.items.some((i) => i.code === c)));

// BCG is a birth dose with a 14-day catch-up window, so at day 10 it is
// still "due" rather than "overdue".
const bcg = pncSchedule.items.find((i) => i.code === 'BCG');
check('BCG is due at day 10 with no record', bcg.status === 'due', `status=${bcg.status}`);

// The hepatitis B birth dose has a 24-hour window, so it is overdue by day 10.
const hepb = pncSchedule.items.find((i) => i.code === 'HEPB-0');
check('Hep B birth dose is overdue at day 10', hepb.status === 'overdue', `status=${hepb.status}`);

// Past the catch-up window, BCG does become overdue.
const delivered30DaysAgo = { ...delivered10DaysAgo, delivery_date: daysAgo(30).split('T')[0] };
check('BCG is overdue at day 30',
  buildCareSchedule(delivered30DaysAgo, []).items.find((i) => i.code === 'BCG').status === 'overdue');

const penta1 = pncSchedule.items.find((i) => i.code === 'PENTA-1');
check('Pentavalent-1 is upcoming at day 10', penta1.status === 'upcoming', `status=${penta1.status}`);

// A recorded dose overrides the computed status.
const withRecords = buildCareSchedule(delivered10DaysAgo, [
  { id: 'r1', vaccine_code: 'BCG', status: 'given', given_date: daysAgo(9).split('T')[0] },
  { id: 'r2', vaccine_code: 'OPV-0', status: 'refused', refusal_reason: 'Family believes it causes fever.' }
]);

check('A given dose shows as given',
  withRecords.items.find((i) => i.code === 'BCG').status === 'given');
check('A refused dose shows as refused',
  withRecords.items.find((i) => i.code === 'OPV-0').status === 'refused');
check('A refusal carries its reason',
  /fever/i.test(withRecords.items.find((i) => i.code === 'OPV-0').refusal_reason || ''));
check('Refusals are counted', withRecords.refused_count === 1);
check('Refusals are actionable', withRecords.actionable.some((i) => i.code === 'OPV-0'));

// ── 5. Stillbirth suppresses immunization ───────────────────────────────────
section('5. Outcome handling');

const stillbirth = { ...delivered10DaysAgo, delivery_outcome: 'stillbirth' };
const stillbirthSchedule = buildCareSchedule(stillbirth, []);

check('No immunization items after a stillbirth',
  !stillbirthSchedule.items.some((i) => i.kind === 'immunization'));
check('HBNC visits still scheduled for the mother',
  stillbirthSchedule.items.some((i) => i.kind === 'hbnc_visit'));

// ── 6. Edge cases ───────────────────────────────────────────────────────────
section('6. Edge cases');

check('Postpartum day is null with no delivery date',
  postpartumDay({ stage: 'antenatal' }) === null);

check('Falls back to the antenatal schedule when the delivery date is missing',
  buildCareSchedule({ id: 'p3', stage: 'postpartum', gestational_weeks: 20, created_at: daysAgo(1) }, []).stage === 'antenatal');

let threw = false;
try { buildCareSchedule(null); } catch { threw = true; }
check('Throws on a missing patient', threw);

check('Day-0 delivery is handled',
  buildCareSchedule({ ...delivered10DaysAgo, delivery_date: new Date().toISOString().split('T')[0] }, []).postpartum_day === 0);

console.log(`\n${'═'.repeat(60)}`);
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  • ${f}`));
  console.log('');
  process.exit(1);
}
console.log('All care-schedule tests passed.\n');
