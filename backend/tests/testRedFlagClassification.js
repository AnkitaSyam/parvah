/**
 * backend/tests/testRedFlagClassification.js
 *
 * Offline test suite — no Groq API key, no network, no database.
 *
 * Run from backend/:  npm run test:redflags
 *
 * The centrepiece is the negation suite. The previous guard matched red-flag
 * keywords with a word-boundary regex and no negation handling, so a visit in
 * which the ASHA worker ruled out every danger sign produced three severe
 * flags and pinned the patient at risk 10.0 for a week. Every one of those
 * transcripts is now a regression case.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  enforceRedFlagSeverity,
  scanRedFlags,
  redFlagsForStage,
  RED_FLAG_DATA
} from '../services/groqSymptomExtractor.js';
import { isNegated, findAffirmedMatches } from '../services/clinicalText.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// Minimal test harness
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────

console.log('\n🧪 Parvah red-flag classification suite\n');

// ── 1. Catalog integrity ────────────────────────────────────────────────────
section('1. Red-flag catalog schema');

check('Catalog loads and is non-empty', Array.isArray(RED_FLAG_DATA) && RED_FLAG_DATA.length > 0);

const REQUIRED_FIELDS = ['id', 'symptom', 'keywords', 'severity', 'flag_description',
                         'recommended_asha_action', 'requires_doctor_referral', 'stages'];

for (const rf of RED_FLAG_DATA) {
  const missing = REQUIRED_FIELDS.filter((f) => rf[f] === undefined);
  check(`"${rf.id}" has all required fields`, missing.length === 0, missing.join(', '));
}

check('Every red flag is graded severe',
  RED_FLAG_DATA.every((rf) => rf.severity === 'severe'));

check('Every red flag requires referral',
  RED_FLAG_DATA.every((rf) => rf.requires_doctor_referral === true));

check('Every red flag cites a source',
  RED_FLAG_DATA.every((rf) => Boolean(rf.source)));

check('Red-flag ids are unique',
  new Set(RED_FLAG_DATA.map((r) => r.id)).size === RED_FLAG_DATA.length);

// ── 2. Danger signs that must exist ─────────────────────────────────────────
section('2. Coverage of core ANC/PNC danger signs');

const MUST_COVER = [
  'rf_severe_bleeding',
  'rf_convulsions',
  'rf_sudden_vision_loss',
  'rf_difficulty_breathing',
  'rf_severe_abdominal_pain',
  'rf_reduced_fetal_movement',      // was missing — a leading stillbirth precursor
  'rf_rupture_of_membranes',        // was missing
  'rf_high_fever',                  // was missing
  'rf_severe_headache',             // was missing
  'rf_severe_pallor',               // was missing
  'rf_foul_smelling_discharge',     // postpartum sepsis
  'rf_calf_pain_swelling',          // postpartum DVT
  'rf_postpartum_mental_health_crisis',
  'rf_newborn_danger_sign'
];

const ids = new Set(RED_FLAG_DATA.map((r) => r.id));
for (const id of MUST_COVER) {
  check(`Covers ${id}`, ids.has(id));
}

// ── 3. Stage scoping ────────────────────────────────────────────────────────
section('3. Stage scoping');

const antenatal = redFlagsForStage('antenatal').map((r) => r.id);
const postpartum = redFlagsForStage('postpartum').map((r) => r.id);

check('Fetal movement applies antenatally only',
  antenatal.includes('rf_reduced_fetal_movement') && !postpartum.includes('rf_reduced_fetal_movement'));

check('Puerperal sepsis applies postpartum only',
  postpartum.includes('rf_foul_smelling_discharge') && !antenatal.includes('rf_foul_smelling_discharge'));

check('Newborn danger signs apply postpartum only',
  postpartum.includes('rf_newborn_danger_sign') && !antenatal.includes('rf_newborn_danger_sign'));

check('Bleeding applies to both stages',
  antenatal.includes('rf_severe_bleeding') && postpartum.includes('rf_severe_bleeding'));

// ── 4. NEGATION — the regression suite ──────────────────────────────────────
section('4. Negation handling (regression: false emergency referrals)');

const NEGATED = [
  'Patient reports no vaginal bleeding and no convulsions this month.',
  'She denies any difficulty breathing.',
  'Ruled out seizures; mother is stable.',
  'Mild discomfort only, no blurred vision.',
  'No bleeding or convulsions or fits reported.',
  'There is no high fever and no severe headache.',
  'खून नहीं बह रहा है, सब ठीक है।',
  'कोई तेज बुखार नहीं है।',
  'Bleeding nahi hai, baby theek hai.',
  'Baby is feeding well, no jaundice.'
];

for (const text of NEGATED) {
  const hits = scanRedFlags(text, 'postpartum').map((h) => h.rfEntry.symptom);
  check(`Silent on: "${text.slice(0, 52)}…"`, hits.length === 0, `fired: ${hits.join(', ')}`);
}

// ── 5. AFFIRMED — must still fire ───────────────────────────────────────────
section('5. Affirmed danger signs still fire');

const AFFIRMED = [
  ['She has heavy bleeding since this morning.',            'rf_severe_bleeding',           'antenatal'],
  ['Baby has not moved since yesterday.',                   'rf_reduced_fetal_movement',    'antenatal'],
  ['Water broke early, leaking fluid since morning.',       'rf_rupture_of_membranes',      'antenatal'],
  ['High fever with chills for three days.',                'rf_high_fever',                'antenatal'],
  ['No fever, but severe headache that will not go away.',  'rf_severe_headache',           'antenatal'],
  ['Very pale palms and tongue, extremely weak.',           'rf_severe_pallor',             'antenatal'],
  ['खून बह रहा है और तेज सिरदर्द है।',                        'rf_severe_bleeding',           'antenatal'],
  ['बच्चा हिल नहीं रहा है दो दिन से।',                        'rf_reduced_fetal_movement',    'antenatal'],
  ['Foul smelling discharge on day five after delivery.',   'rf_foul_smelling_discharge',   'postpartum'],
  ['One leg swollen with calf pain since yesterday.',       'rf_calf_pain_swelling',        'postpartum'],
  ['She says she wants to harm herself.',                   'rf_postpartum_mental_health_crisis', 'postpartum'],
  ['Baby not feeding and baby feels cold.',                 'rf_newborn_danger_sign',       'postpartum']
];

for (const [text, expectedId, stage] of AFFIRMED) {
  const hits = scanRedFlags(text, stage).map((h) => h.rfEntry.id);
  check(`Detects ${expectedId} in: "${text.slice(0, 44)}…"`,
    hits.includes(expectedId), `got: ${hits.join(', ') || 'nothing'}`);
}

// ── 6. Mixed transcripts ────────────────────────────────────────────────────
section('6. Mixed affirmation and negation in one transcript');

const mixed = 'She has no bleeding and no convulsions, but she reports severe headache and blurred vision since Tuesday.';
const mixedHits = scanRedFlags(mixed, 'antenatal').map((h) => h.rfEntry.id);

check('Ignores the negated bleeding', !mixedHits.includes('rf_severe_bleeding'), mixedHits.join(', '));
check('Ignores the negated convulsions', !mixedHits.includes('rf_convulsions'), mixedHits.join(', '));
check('Catches the affirmed headache', mixedHits.includes('rf_severe_headache'), mixedHits.join(', '));
check('Catches the affirmed vision loss', mixedHits.includes('rf_sudden_vision_loss'), mixedHits.join(', '));

// ── 7. The guard itself ─────────────────────────────────────────────────────
section('7. enforceRedFlagSeverity behaviour');

// 7a. Upgrades an under-graded symptom when the transcript affirms it.
const underGraded = [{
  symptom_name: 'Heavy bleeding',
  severity: 'mild',
  flag_description: 'Patient mentions heavy bleeding.',
  recommended_asha_action: 'Advise rest.',
  requires_doctor_referral: false
}];
const upgradedResult = enforceRedFlagSeverity(
  underGraded, 'She reports heavy bleeding since this morning.', 'antenatal'
);
check('Upgrades an affirmed red flag to severe',
  upgradedResult[0].severity === 'severe' && upgradedResult[0].requires_doctor_referral === true);
check('Replaces the action with the protocol action',
  /108/.test(upgradedResult[0].recommended_asha_action));

// 7b. Does NOT upgrade when the transcript negates it — the core fix.
const hallucinated = [{
  symptom_name: 'Vaginal bleeding',
  severity: 'mild',
  flag_description: 'Mentioned bleeding.',
  recommended_asha_action: 'Monitor.',
  requires_doctor_referral: false
}];
const notUpgraded = enforceRedFlagSeverity(
  hallucinated, 'Patient reports no vaginal bleeding at all this month.', 'antenatal'
);
check('Does NOT upgrade a negated red flag',
  notUpgraded[0].severity === 'mild' && notUpgraded[0].requires_doctor_referral === false,
  `got severity=${notUpgraded[0].severity}`);

// 7c. Adds an affirmed red flag the extractor missed entirely.
const missed = [{
  symptom_name: 'Mild backache',
  severity: 'mild',
  flag_description: 'Backache reported.',
  recommended_asha_action: 'Advise rest.',
  requires_doctor_referral: false
}];
const withAdded = enforceRedFlagSeverity(
  missed, 'She also mentioned the baby has not moved since yesterday.', 'antenatal'
);
check('Adds a red flag the extractor missed', withAdded.length === 2, `length=${withAdded.length}`);
check('The added flag carries the triggering quote',
  Boolean(withAdded.find((s) => s.red_flag_id === 'rf_reduced_fetal_movement')?.source_quote));

// 7d. Leaves an ordinary symptom alone.
const ordinary = [{
  symptom_name: 'Nausea',
  severity: 'mild',
  flag_description: 'Morning nausea.',
  recommended_asha_action: 'Small frequent meals.',
  requires_doctor_referral: false
}];
const untouched = enforceRedFlagSeverity(ordinary, 'She feels some nausea in the morning.', 'antenatal');
check('Leaves non-red-flag symptoms untouched',
  untouched.length === 1 && untouched[0].severity === 'mild');

// 7e. No duplicates when one flag's quote contains another flag's keywords.
//     "foul smelling discharge and fever with chills" used to make the
//     discharge symptom claim rf_high_fever by text match, leaving
//     rf_foul_smelling_discharge unclaimed and re-added by rule 2.
const overlapping = 'Day five after delivery. She has foul smelling discharge and fever with chills.';
const overlapResult = enforceRedFlagSeverity(
  [
    {
      symptom_name: 'Foul-Smelling Vaginal Discharge', severity: 'severe',
      flag_description: `Puerperal sepsis sign. Detected in transcript: "${overlapping}"`,
      recommended_asha_action: 'Refer.', requires_doctor_referral: true,
      red_flag_id: 'rf_foul_smelling_discharge'
    },
    {
      symptom_name: 'High Fever', severity: 'severe',
      flag_description: `Fever sign. Detected in transcript: "${overlapping}"`,
      recommended_asha_action: 'Refer.', requires_doctor_referral: true,
      red_flag_id: 'rf_high_fever'
    }
  ],
  overlapping,
  'postpartum'
);

const names = overlapResult.map((s) => s.symptom_name);
check('No duplicate symptoms when quotes overlap',
  new Set(names).size === names.length, names.join(' | '));
check('Overlapping quotes yield exactly two symptoms',
  overlapResult.length === 2, `length=${overlapResult.length}`);

// 7f. Added flags carry a subject.
const subjectResult = enforceRedFlagSeverity(
  [], 'Baby not feeding and baby feels cold.', 'postpartum'
);
check('An added newborn flag is attributed to the newborn',
  subjectResult[0]?.subject === 'newborn', `subject=${subjectResult[0]?.subject}`);

const motherSubject = enforceRedFlagSeverity([], 'She has heavy bleeding.', 'postpartum');
check('An added maternal flag is attributed to the mother',
  motherSubject[0]?.subject === 'mother', `subject=${motherSubject[0]?.subject}`);

// ── 8. Negation primitive ───────────────────────────────────────────────────
section('8. isNegated primitive');

function negatedIn(text, phrase) {
  const idx = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (idx === -1) throw new Error(`Test bug: "${phrase}" not present in "${text}"`);
  return isNegated(text, idx, idx + phrase.length);
}

check('"no bleeding" → negated', negatedIn('There is no bleeding today.', 'bleeding'));
check('"bleeding" alone → affirmed', !negatedIn('There is bleeding today.', 'bleeding'));
check('scope breaks at "but"', !negatedIn('No fever but severe headache.', 'severe headache'));
check('scope carries across "or"', negatedIn('No fever or convulsions.', 'convulsions'));
check('Hindi post-negation', negatedIn('खून नहीं बह रहा', 'खून'));
check('Hinglish post-negation', negatedIn('bleeding nahi hai', 'bleeding'));

// "not getting better" negates the improvement, not the symptom. Reading
// this as absence is the most dangerous direction to get wrong — the mother
// is actively complaining about the symptom.
check('"सिरदर्द ठीक नहीं हो रहा" → headache is PRESENT',
  !negatedIn('सिरदर्द भी ठीक नहीं हो रहा', 'सिरदर्द'));
check('"headache is not better" → present',
  !negatedIn('The headache is not better today.', 'headache'));
check('"headache not improving" → present',
  !negatedIn('Her headache is not improving.', 'headache'));
check('"सिरदर्द नहीं है" → genuinely absent',
  negatedIn('सिरदर्द नहीं है', 'सिरदर्द'));

// ── 9. Multi-word phrases and word boundaries ───────────────────────────────
section('9. Boundary handling');

check('"fits" does not match inside "benefits"',
  findAffirmedMatches('She understands the benefits of ANC.', 'fits').length === 0);
check('"fits" matches as its own word',
  findAffirmedMatches('She had fits last night.', 'fits').length === 1);
check('Devanagari phrase matches before a danda',
  findAffirmedMatches('उसे दौरे पड़े।', 'दौरे').length === 1);

// ── 10. Fixtures ────────────────────────────────────────────────────────────
section('10. Test fixtures present');

const fixtureDir = path.join(__dirname, 'fixtures');
check('fixtures/ directory exists', fs.existsSync(fixtureDir));

// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`);
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  • ${f}`));
  console.log('');
  process.exit(1);
}
console.log('All red-flag classification tests passed.\n');
