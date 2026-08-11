/**
 * backend/tests/testRedFlagClassification.js
 *
 * Offline test suite — no Groq API key or network access required.
 *
 * Verifies:
 *   1. enforceRedFlagSeverity() promotes every red-flag symptom to "severe"
 *      regardless of what severity string the LLM (or any upstream code) set.
 *   2. Non-red-flag (subtle) symptoms are never upgraded by the guard.
 *   3. The fallback extractor classifies each red-flag keyword-phrase as "severe"
 *      and non-red-flag phrases as "mild" or "moderate".
 *   4. RED_FLAG_DATA is loadable and has the expected 5 canonical entries.
 *   5. Every entry in redFlagSymptoms.json has the required schema fields.
 *
 * Run from backend/:
 *   node tests/testRedFlagClassification.js
 */

import { enforceRedFlagSeverity, extractSymptoms } from '../services/groqSymptomExtractor.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RED_FLAG_DATA = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/redFlagSymptoms.json'), 'utf8')
);

// ─────────────────────────────────────────────────────────────────────────────
// Minimal test harness
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}\n📋 ${title}\n${'─'.repeat(60)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: JSON schema integrity
// ─────────────────────────────────────────────────────────────────────────────

section('1 · redFlagSymptoms.json integrity');

const REQUIRED_FIELDS = ['id', 'symptom', 'keywords', 'severity', 'flag_description',
                         'recommended_asha_action', 'requires_doctor_referral', 'source'];

assert(Array.isArray(RED_FLAG_DATA), 'JSON root is an array');
assert(RED_FLAG_DATA.length === 5, `Exactly 5 canonical red-flag entries (got ${RED_FLAG_DATA.length})`);

const EXPECTED_SYMPTOMS = [
  'Severe Bleeding',
  'Sudden Vision Loss',
  'Difficulty Breathing',
  'Severe Abdominal Pain',
  'Convulsions / Seizures'
];

for (const expected of EXPECTED_SYMPTOMS) {
  const found = RED_FLAG_DATA.find((e) => e.symptom === expected);
  assert(!!found, `Entry exists: "${expected}"`);
}

for (const entry of RED_FLAG_DATA) {
  for (const field of REQUIRED_FIELDS) {
    assert(
      Object.prototype.hasOwnProperty.call(entry, field),
      `  [${entry.id}] has field "${field}"`
    );
  }
  assert(entry.severity === 'severe',            `  [${entry.id}] severity is "severe"`);
  assert(entry.requires_doctor_referral === true,`  [${entry.id}] requires_doctor_referral is true`);
  assert(Array.isArray(entry.keywords) && entry.keywords.length > 0,
                                                 `  [${entry.id}] keywords array is non-empty`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: enforceRedFlagSeverity() — guard promotes red-flag items
// ─────────────────────────────────────────────────────────────────────────────

section('2 · enforceRedFlagSeverity() — red-flag promotion');

// Simulate LLM output that incorrectly classifies red-flag symptoms as mild/moderate
const MISCLASSIFIED_INPUT = [
  {
    symptom_name: 'Vaginal Bleeding',
    flag_description: 'Patient reported heavy bleeding for the past hour.',
    recommended_asha_action: 'Monitor at home, advise rest.',   // weak — should be overridden
    severity: 'mild',                                            // WRONG — guard must fix this
    requires_doctor_referral: false                              // WRONG — guard must fix this
  },
  {
    symptom_name: 'Vision Blurring',
    flag_description: 'Patient reported sudden vision loss and spots.',
    recommended_asha_action: 'Counsel on rest and hydration.',   // weak
    severity: 'moderate',                                        // WRONG
    requires_doctor_referral: false                              // WRONG
  },
  {
    symptom_name: 'Breathing Difficulty',
    flag_description: 'Shortness of breath and difficulty breathing during routine activity.',
    recommended_asha_action: 'Suggest light exercise.',          // incorrect
    severity: 'mild',                                            // WRONG
    requires_doctor_referral: false                              // WRONG
  },
  {
    symptom_name: 'Abdominal Cramps',
    flag_description: 'Severe abdominal pain in upper quadrant.',
    recommended_asha_action: 'Hot compress.',                    // incorrect
    severity: 'moderate',                                        // WRONG
    requires_doctor_referral: false                              // WRONG
  },
  {
    symptom_name: 'Seizure Episode',
    flag_description: 'Patient had convulsions for 2 minutes.',
    recommended_asha_action: 'Let the episode pass naturally.',  // dangerous — must be overridden
    severity: 'moderate',                                        // WRONG
    requires_doctor_referral: false                              // WRONG
  }
];

const guarded = enforceRedFlagSeverity(MISCLASSIFIED_INPUT);

assert(guarded.length === 5, 'Guard preserves all 5 input items');

for (const item of guarded) {
  assert(item.severity === 'severe',
    `"${item.symptom_name}" promoted to severity:"severe" (was NOT severe before guard)`);
  assert(item.requires_doctor_referral === true,
    `"${item.symptom_name}" requires_doctor_referral set to true by guard`);
  assert(item._red_flag_enforced === true,
    `"${item.symptom_name}" carries _red_flag_enforced audit flag`);
}

// Verify the canonical ASHA action replaced the dangerous weak recommendation
const bleedingItem = guarded.find((s) => s.symptom_name === 'Vaginal Bleeding');
assert(
  bleedingItem?.recommended_asha_action.toLowerCase().includes('108') ||
  bleedingItem?.recommended_asha_action.toLowerCase().includes('emergency'),
  'Bleeding item: recommended_asha_action replaced with emergency protocol'
);

const convulsionItem = guarded.find((s) => s.symptom_name === 'Seizure Episode');
assert(
  convulsionItem?.recommended_asha_action.toLowerCase().includes('108') ||
  convulsionItem?.recommended_asha_action.toLowerCase().includes('immediately'),
  'Convulsions item: dangerous "let the episode pass" action replaced with emergency protocol'
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: enforceRedFlagSeverity() — subtle symptoms are NOT upgraded
// ─────────────────────────────────────────────────────────────────────────────

section('3 · enforceRedFlagSeverity() — subtle symptoms left unchanged');

const SUBTLE_INPUT = [
  {
    symptom_name: 'Mild Nausea',
    flag_description: 'Patient reports occasional nausea in the morning.',
    recommended_asha_action: 'Advise small frequent meals.',
    severity: 'mild',
    requires_doctor_referral: false
  },
  {
    symptom_name: 'Fatigue',
    flag_description: 'Patient feels tired during second trimester.',
    recommended_asha_action: 'Recommend rest and iron-folic acid compliance.',
    severity: 'mild',
    requires_doctor_referral: false
  },
  {
    symptom_name: 'Mild Ankle Swelling',
    flag_description: 'Mild pitting edema in ankles, common at 32 weeks.',
    recommended_asha_action: 'Elevate feet, monitor BP weekly.',
    severity: 'moderate',
    requires_doctor_referral: true
  },
  {
    symptom_name: 'Heartburn',
    flag_description: 'Acid reflux after meals reported by patient.',
    recommended_asha_action: 'Advise small meals, avoid spicy food.',
    severity: 'mild',
    requires_doctor_referral: false
  }
];

const subtleGuarded = enforceRedFlagSeverity(SUBTLE_INPUT);

for (let i = 0; i < SUBTLE_INPUT.length; i++) {
  const before = SUBTLE_INPUT[i];
  const after  = subtleGuarded[i];
  assert(after.severity === before.severity,
    `"${before.symptom_name}" severity unchanged (stays "${before.severity}")`);
  assert(after._red_flag_enforced !== true,
    `"${before.symptom_name}" NOT flagged as red-flag enforced`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: Fallback extractor — red-flag keyword transcripts
// ─────────────────────────────────────────────────────────────────────────────

section('4 · fallbackExtractor — red-flag keyword transcripts classified as "severe"');

// Force offline mode by temporarily blanking the env key
const originalKey = process.env.GROQ_API_KEY;
process.env.GROQ_API_KEY = '';

const RED_FLAG_TRANSCRIPTS = [
  {
    label: 'Severe Bleeding',
    transcript: 'The patient came in with severe bleeding since early morning. She is very weak.'
  },
  {
    label: 'Sudden Vision Loss',
    transcript: 'She says she had sudden vision loss and cannot see clearly anymore. Blurred vision started this morning.'
  },
  {
    label: 'Difficulty Breathing',
    transcript: 'Patient is showing difficulty breathing and shortness of breath when lying down.'
  },
  {
    label: 'Severe Abdominal Pain',
    transcript: 'She has severe abdominal pain in the upper stomach area, unbearable since last night.'
  },
  {
    label: 'Convulsions',
    transcript: 'The patient had convulsions for about 2 minutes and lost consciousness. Family is very scared.'
  },
  {
    label: 'Hindi: दौरे (convulsions)',
    transcript: 'मरीज को आज सुबह दौरे पड़े और वो बेहोश हो गई।'
  },
  {
    label: 'Hindi: खून बह रहा है (bleeding)',
    transcript: 'मरीज के पेट से बहुत ज्यादा खून बह रहा है। परिवार घबराया हुआ है।'
  }
];

for (const { label, transcript } of RED_FLAG_TRANSCRIPTS) {
  try {
    const result = await extractSymptoms(transcript, 28);
    const hasSevere = result.extracted_symptoms.some((s) => s.severity === 'severe');
    const hasReferral = result.extracted_symptoms.some((s) => s.requires_doctor_referral === true);
    const noMildRedFlag = result.extracted_symptoms.every((s) =>
      s._red_flag_enforced !== true || s.severity === 'severe'
    );

    assert(hasSevere,     `[${label}] At least one symptom classified as "severe"`);
    assert(hasReferral,   `[${label}] At least one symptom has requires_doctor_referral:true`);
    assert(noMildRedFlag, `[${label}] No red-flag symptom remains mild/moderate after guard`);
  } catch (err) {
    assert(false, `[${label}] extractSymptoms threw unexpectedly: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: Fallback extractor — subtle-only transcripts stay mild/moderate
// ─────────────────────────────────────────────────────────────────────────────

section('5 · fallbackExtractor — subtle-only transcripts not upgraded to "severe"');

const SUBTLE_TRANSCRIPTS = [
  {
    label: 'Morning nausea only',
    transcript: 'Patient reports mild nausea every morning. Eating well otherwise. No other complaints.'
  },
  {
    label: 'Routine visit, no symptoms',
    transcript: 'ASHA worker visited. Patient feels fine, no complaints today. Regular checkup completed.'
  },
  {
    label: 'Mild heartburn',
    transcript: 'She mentioned some heartburn and mild acidity after eating spicy food. Appetite is good and she feels generally well.'
  }
];

for (const { label, transcript } of SUBTLE_TRANSCRIPTS) {
  try {
    const result = await extractSymptoms(transcript, 20);
    const hasForcedSevere = result.extracted_symptoms.some(
      (s) => s._red_flag_enforced === true
    );
    assert(!hasForcedSevere, `[${label}] Guard did NOT flag any symptom as red-flag-enforced`);
  } catch (err) {
    assert(false, `[${label}] extractSymptoms threw unexpectedly: ${err.message}`);
  }
}

// Restore original key
process.env.GROQ_API_KEY = originalKey;

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`);
console.log(`🏁 Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(60));

if (failed > 0) {
  console.error('\n❌ Test suite FAILED. Fix the issues above before proceeding to Phase 6.\n');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed. Red-flag classification is correctly enforced.\n');
  process.exit(0);
}
