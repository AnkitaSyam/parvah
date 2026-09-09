import Groq from 'groq-sdk';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import { findAffirmedMatches, quoteAround } from './clinicalText.js';

dotenv.config();

// ── Load red-flag definitions from the canonical JSON file at module startup ──
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RED_FLAG_DATA = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/redFlagSymptoms.json'), 'utf8')
);

export const CARE_STAGES = ['antenatal', 'postpartum'];

/**
 * Red flags that apply to a given stage of care. Some signs are shared
 * (bleeding, eclampsia); others are stage-specific — reduced fetal movement
 * is meaningless after delivery, and puerperal sepsis is meaningless before it.
 */
export function redFlagsForStage(stage = 'antenatal') {
  const target = CARE_STAGES.includes(stage) ? stage : 'antenatal';
  return RED_FLAG_DATA.filter((rf) => !rf.stages || rf.stages.includes(target));
}

/**
 * Canonical red-flag symptom names for LLM prompt injection, scoped to stage.
 */
function redFlagNamesForStage(stage) {
  return redFlagsForStage(stage).map((rf) => rf.symptom).join(', ');
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * scanRedFlags
 *
 * Finds every red-flag sign that is *affirmatively* reported in the transcript
 * for the given stage of care. Negated mentions ("no bleeding", "खून नहीं
 * बह रहा") are excluded — see services/clinicalText.js.
 *
 * @param {string} transcript
 * @param {string} stage - 'antenatal' | 'postpartum'
 * @returns {Array<{ rfEntry: Object, quote: string }>}
 */
export function scanRedFlags(transcript, stage = 'antenatal') {
  const found = [];

  for (const rf of redFlagsForStage(stage)) {
    for (const keyword of rf.keywords) {
      const hits = findAffirmedMatches(transcript, keyword);
      if (hits.length > 0) {
        found.push({
          rfEntry: rf,
          quote: quoteAround(transcript, hits[0].start, hits[0].end)
        });
        break; // one hit per red flag is enough
      }
    }
  }

  return found;
}

/**
 * enforceRedFlagSeverity
 *
 * Post-processing safety guard, rewritten to be evidence-based rather than
 * absolute.
 *
 * The previous version matched keywords against each symptom's own text and
 * unconditionally rewrote severity to "severe" — with no negation handling.
 * A visit in which the ASHA worker ruled out every danger sign therefore
 * produced the strongest possible alarm, overriding a *correct* LLM judgment.
 *
 * Two rules now:
 *
 *   1. UPGRADE — a symptom the extractor already reported is promoted to
 *      "severe" only when the red-flag phrase is affirmatively present in the
 *      transcript. The guard corrects an under-graded symptom; it no longer
 *      invents one.
 *
 *   2. ADD — a red flag clearly stated in the transcript but missed entirely
 *      by the extractor is appended, carrying the quote that triggered it so
 *      the ASHA worker can see the words rather than an opaque label.
 *
 * @param {Array<Object>} symptoms   - Validated extracted_symptoms array
 * @param {string}        transcript - The source transcript (required for negation scope)
 * @param {string}        stage      - 'antenatal' | 'postpartum'
 * @returns {Array<Object>} Corrected symptom list
 */
export function enforceRedFlagSeverity(symptoms, transcript = '', stage = 'antenatal') {
  const affirmed = scanRedFlags(transcript, stage);

  if (affirmed.length === 0) {
    // Nothing is affirmatively present, so nothing may be promoted. Whatever
    // the LLM graded stands.
    return symptoms;
  }

  const affirmedById = new Map(affirmed.map((a) => [a.rfEntry.id, a]));
  const claimedIds = new Set();

  // ── Rule 1: upgrade symptoms that correspond to an affirmed red flag ──
  const upgraded = symptoms.map((s) => {
    // An extractor-produced symptom already knows which red flag it came from.
    // Prefer that over text matching: a flag_description often quotes the
    // surrounding transcript, which can contain another red flag's keywords
    // ("foul smelling discharge and fever with chills") and would otherwise
    // claim the wrong entry — leaving the right one to be re-added as a
    // duplicate by rule 2.
    let match = s.red_flag_id ? affirmedById.get(s.red_flag_id) : null;

    if (!match) {
      const name = (s.symptom_name || '').toLowerCase();
      const haystack = `${s.symptom_name} ${s.flag_description}`.toLowerCase();

      // Match on the symptom name first — it is the least ambiguous signal —
      // and only then on the fuller text. Never claim an id twice.
      match =
        affirmed.find(({ rfEntry }) =>
          !claimedIds.has(rfEntry.id) &&
          (name.includes(rfEntry.symptom.toLowerCase()) ||
           rfEntry.keywords.some((kw) => name.includes(kw.toLowerCase())))
        ) ||
        affirmed.find(({ rfEntry }) =>
          !claimedIds.has(rfEntry.id) &&
          (haystack.includes(rfEntry.symptom.toLowerCase()) ||
           rfEntry.keywords.some((kw) => haystack.includes(kw.toLowerCase())))
        );
    }

    if (!match) return s;

    claimedIds.add(match.rfEntry.id);

    if (s.severity === 'severe' && s.requires_doctor_referral === true) {
      return s; // already correctly graded
    }

    return {
      ...s,
      severity: 'severe',
      requires_doctor_referral: true,
      recommended_asha_action: match.rfEntry.recommended_asha_action,
      red_flag_id: match.rfEntry.id,
      red_flag_enforced: true
    };
  });

  // ── Rule 2: add affirmed red flags the extractor missed entirely ──
  for (const [id, { rfEntry, quote }] of affirmedById) {
    if (claimedIds.has(id)) continue;

    upgraded.push({
      symptom_name: rfEntry.symptom,
      severity: 'severe',
      flag_description: `${rfEntry.flag_description} Detected directly in the transcript: "${quote}"`,
      recommended_asha_action: rfEntry.recommended_asha_action,
      requires_doctor_referral: true,
      subject: rfEntry.id === 'rf_newborn_danger_sign' ? 'newborn' : 'mother',
      red_flag_id: rfEntry.id,
      red_flag_enforced: true,
      source_quote: quote
    });
  }

  return upgraded;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * extractSymptoms
 *
 * Extracts symptoms and risk indicators from a visit transcript to build
 * risk-timeline entries, without making diagnoses.
 *
 * @param {string} transcript       - Transcribed visit text
 * @param {Object} [context]
 * @param {number} [context.gestationalWeeks] - Gestational week (antenatal)
 * @param {string} [context.stage]            - 'antenatal' | 'postpartum'
 * @param {number} [context.postpartumDay]    - Days since delivery (postpartum)
 * @returns {Promise<Object>} { summary, extracted_symptoms, has_red_flag, mode }
 */
export async function extractSymptoms(transcript, context = {}) {
  if (!transcript || typeof transcript !== 'string') {
    throw new Error('extractSymptoms error: Valid transcript string is required.');
  }

  // Backwards compatible: extractSymptoms(text, 24) still works.
  const opts = typeof context === 'number' ? { gestationalWeeks: context } : (context || {});
  const stage = CARE_STAGES.includes(opts.stage) ? opts.stage : 'antenatal';
  const gestationalWeeks = opts.gestationalWeeks ?? 20;
  const postpartumDay = opts.postpartumDay ?? null;

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey.includes('your_groq_api_key')) {
    console.warn('⚠️ GROQ_API_KEY missing. Running offline keyword-based extraction.');
    return finalize(fallbackSymptomExtraction(transcript, { stage, gestationalWeeks, postpartumDay }), transcript, stage, 'offline_keyword');
  }

  const groq = new Groq({ apiKey });
  const systemPrompt = buildSystemPrompt({ stage, gestationalWeeks, postpartumDay });
  const userPrompt = buildUserPrompt(transcript, { stage, gestationalWeeks, postpartumDay });

  try {
    const raw = await callGroqLlm(groq, systemPrompt, userPrompt);
    return finalize(parseAndValidate(raw), transcript, stage, 'llm');
  } catch (firstError) {
    console.warn(`⚠️ First LLM attempt failed: ${firstError.message}. Retrying once…`);

    try {
      const retryPrompt = `${systemPrompt}\n\nIMPORTANT: Your previous response failed JSON validation (${firstError.message}). Output STRICT VALID JSON ONLY — no markdown, no backticks.`;
      const retryRaw = await callGroqLlm(groq, retryPrompt, userPrompt);
      return finalize(parseAndValidate(retryRaw), transcript, stage, 'llm_retry');
    } catch (retryError) {
      console.error('❌ LLM retry also failed. Falling back to offline extraction:', retryError.message);
      return finalize(fallbackSymptomExtraction(transcript, { stage, gestationalWeeks, postpartumDay }), transcript, stage, 'offline_keyword');
    }
  }
}

/**
 * Applies the deterministic guard and derives the summary from what the guard
 * actually concluded — so the summary can never disagree with the symptom list.
 */
function finalize(result, transcript, stage, mode) {
  const symptoms = enforceRedFlagSeverity(result.extracted_symptoms, transcript, stage);
  const hasRedFlag = symptoms.some((s) => s.severity === 'severe');

  let summary = result.summary;
  if (hasRedFlag) {
    const names = symptoms.filter((s) => s.severity === 'severe').map((s) => s.symptom_name);
    summary = `CRITICAL: emergency-level sign(s) reported — ${names.join('; ')}. Immediate ASHA action and referral required.`;
  }

  return {
    summary,
    extracted_symptoms: symptoms,
    has_red_flag: hasRedFlag,
    stage,
    mode
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt({ stage, gestationalWeeks, postpartumDay }) {
  const isPostpartum = stage === 'postpartum';

  const stageContext = isPostpartum
    ? `You are analysing a POSTNATAL (postpartum) home visit, conducted under India's Home Based Newborn Care (HBNC) programme.
The mother delivered approximately ${postpartumDay ?? 'an unknown number of'} days ago.
Assess BOTH the mother and the newborn. Most maternal deaths occur in this period —
postpartum haemorrhage, puerperal sepsis, and postpartum eclampsia are the leading causes.
Also record any mental-health symptoms the mother reports (mood, sleep, appetite, thoughts
about the baby). Report what she SAYS. Do not infer or diagnose depression.`
    : `You are analysing an ANTENATAL home visit. The patient is at approximately
gestational week ${gestationalWeeks}.`;

  return `You are an AI assistant for ASHA community health workers in rural India.
Extract maternal and newborn health symptoms from a visit transcript to update the Risk Timeline.

${stageContext}

STRICT MEDICAL & ETHICAL BOUNDARIES:
- NEVER diagnose any medical condition or disease.
- ONLY extract reported symptoms, classify severity, describe risk indicators, and suggest ASHA protocol actions.
- NEVER report a symptom the transcript explicitly denies. If the transcript says a symptom is
  ABSENT ("no bleeding", "खून नहीं बह रहा", "denies fever"), do NOT include it. Recording a
  ruled-out symptom as present causes false emergency referrals.

SEVERITY RULES — RED-FLAG SYMPTOMS FOR THIS STAGE OF CARE:
When any of the following is AFFIRMATIVELY reported, it must be severity:"severe"
and requires_doctor_referral:true:
  ${redFlagNamesForStage(stage)}

Never classify an affirmatively reported red flag as "mild" or "moderate".
Equally, never fabricate one that was not reported.

CRITICAL FORMAT INSTRUCTIONS:
1. Return ONLY a raw valid JSON object — NO markdown, NO backticks, NO prose.
2. The JSON MUST adhere strictly to this schema:
{
  "summary": "string (1-2 sentence non-diagnostic summary of reported symptoms)",
  "extracted_symptoms": [
    {
      "symptom_name": "string",
      "severity": "mild" | "moderate" | "severe",
      "flag_description": "string (warning context for the ASHA worker)",
      "recommended_asha_action": "string (concrete ASHA step)",
      "requires_doctor_referral": true | false,
      "subject": "mother" | "newborn"
    }
  ]
}`;
}

function buildUserPrompt(transcript, { stage, gestationalWeeks, postpartumDay }) {
  const header = stage === 'postpartum'
    ? `Care stage: POSTPARTUM\nDays since delivery: ${postpartumDay ?? 'unknown'}`
    : `Care stage: ANTENATAL\nPatient gestational week: ${gestationalWeeks}`;
  return `${header}\nVisit Transcript:\n"${transcript}"`;
}

async function callGroqLlm(groq, systemPrompt, userPrompt) {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt }
      ],
      model: 'openai/gpt-oss-20b',
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });
    return completion.choices[0]?.message?.content || '';
  } catch (error) {
    throw new Error(`Groq LLM call error: ${error.message}`);
  }
}

function parseAndValidate(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty text received from LLM response.');
  }

  const sanitized = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

  let data;
  try {
    data = JSON.parse(sanitized);
  } catch (e) {
    throw new Error(`JSON parse error: ${e.message}`);
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Parsed JSON is not an object.');
  }

  if (typeof data.summary !== 'string' || !data.summary) {
    data.summary = 'Patient visit completed with symptom screening.';
  }

  if (!Array.isArray(data.extracted_symptoms)) {
    throw new Error('Missing "extracted_symptoms" array in JSON response.');
  }

  for (const item of data.extracted_symptoms) {
    if (!item.symptom_name || !item.flag_description || !item.recommended_asha_action) {
      throw new Error('Symptom item missing required fields (symptom_name, flag_description, recommended_asha_action).');
    }
    if (!['mild', 'moderate', 'severe'].includes(item.severity)) {
      item.severity = 'moderate';
    }
    if (typeof item.requires_doctor_referral !== 'boolean') {
      item.requires_doctor_referral = item.severity === 'severe';
    }
    if (!['mother', 'newborn'].includes(item.subject)) {
      item.subject = 'mother';
    }
  }

  return data;
}

/**
 * Keyword-based offline fallback, used when Groq is unavailable.
 *
 * Red flags come from redFlagSymptoms.json via the negation-aware scanner.
 * The non-emergency symptoms below are contextual rather than safety-critical.
 *
 * Note on referral flags: a moderate symptom no longer sets
 * requires_doctor_referral, because the risk scorer treats a referral flag as
 * a red-alert trigger. Previously every offline transcript containing the word
 * "fever" produced a 10.0 alert.
 */
function fallbackSymptomExtraction(transcript, { stage, gestationalWeeks, postpartumDay }) {
  const symptoms = [];
  const seen = new Set();

  // ── Red flags, negation-aware and stage-scoped ──
  for (const { rfEntry, quote } of scanRedFlags(transcript, stage)) {
    symptoms.push({
      symptom_name: rfEntry.symptom,
      severity: rfEntry.severity,
      flag_description: `${rfEntry.flag_description} Detected in transcript: "${quote}"`,
      recommended_asha_action: rfEntry.recommended_asha_action,
      requires_doctor_referral: rfEntry.requires_doctor_referral,
      subject: rfEntry.id === 'rf_newborn_danger_sign' ? 'newborn' : 'mother',
      red_flag_id: rfEntry.id,
      source_quote: quote
    });
    seen.add(rfEntry.id);
  }

  const affirms = (kws) => kws.some((kw) => findAffirmedMatches(transcript, kw).length > 0);

  // ── Contextual, non-emergency signs ──
  const hasSwelling = affirms(['swelling', 'edema', 'oedema', 'सूजन', 'पैर में सूजन']);
  const hasHeadache = affirms(['headache', 'सिरदर्द', 'सर दर्द']);

  if (hasSwelling && !seen.has('rf_calf_pain_swelling')) {
    symptoms.push({
      symptom_name: 'Pedal Edema (Foot Swelling)',
      severity: hasHeadache ? 'severe' : 'moderate',
      flag_description: hasHeadache
        ? `Swelling with co-occurring headache${stage === 'antenatal' ? ` at gestational week ${gestationalWeeks}` : ''} — this combination raises pre-eclampsia concern.`
        : `Swelling in the lower limbs${stage === 'antenatal' ? ` at gestational week ${gestationalWeeks}` : ''}. Monitor alongside blood pressure.`,
      recommended_asha_action: 'Measure blood pressure. Check urine for albumin at the sub-centre. Elevate legs and reassess at the next visit.',
      requires_doctor_referral: Boolean(hasHeadache),
      subject: 'mother'
    });
  }

  if (hasHeadache && !seen.has('rf_severe_headache')) {
    symptoms.push({
      symptom_name: 'Headache',
      severity: 'moderate',
      flag_description: 'Headache reported. Evaluate alongside blood pressure and any visual symptoms.',
      recommended_asha_action: 'Check blood pressure. If ≥140/90 mmHg or visual symptoms appear, escalate to the PHC.',
      requires_doctor_referral: false,
      subject: 'mother'
    });
  }

  if (affirms(['fever', 'बुखार', 'temperature']) && !seen.has('rf_high_fever')) {
    symptoms.push({
      symptom_name: 'Fever',
      severity: 'moderate',
      flag_description: 'Raised body temperature reported. Possible infection; assess severity and duration.',
      recommended_asha_action: 'Measure temperature. Advise hydration. If ≥38°C or persisting beyond 48 hours, refer to the PHC for malaria/UTI testing.',
      requires_doctor_referral: false,
      subject: 'mother'
    });
  }

  if (affirms(['vomiting', 'nausea', 'उल्टी', 'जी मिचलाना'])) {
    symptoms.push({
      symptom_name: 'Nausea / Vomiting',
      severity: 'mild',
      flag_description: 'Nausea or vomiting reported. Common in early pregnancy; monitor for dehydration.',
      recommended_asha_action: 'Advise small frequent meals and hydration. Refer if unable to keep any food or fluids down.',
      requires_doctor_referral: false,
      subject: 'mother'
    });
  }

  // ── Postpartum-specific contextual signs ──
  if (stage === 'postpartum') {
    if (affirms(['not sleeping', 'cannot sleep', 'crying all the time', 'feels sad', 'feeling low',
                 'no interest', 'उदास', 'रोती रहती', 'नींद नहीं', 'मन नहीं लगता'])) {
      symptoms.push({
        symptom_name: 'Low Mood / Possible Postpartum Depression Symptoms',
        severity: 'moderate',
        flag_description: 'Mother reports persistent low mood, sleep disturbance or loss of interest. These are reported symptoms, not a diagnosis.',
        recommended_asha_action: 'Listen without judgement. Ask directly about thoughts of self-harm. Screen with the EPDS at the sub-centre and inform the ANM.',
        requires_doctor_referral: false,
        subject: 'mother'
      });
    }

    if (affirms(['not enough milk', 'no milk', 'breastfeeding problem', 'cracked nipple',
                 'दूध नहीं आ रहा', 'दूध कम', 'स्तनपान में दिक्कत'])) {
      symptoms.push({
        symptom_name: 'Breastfeeding Difficulty',
        severity: 'mild',
        flag_description: 'Difficulty with breastfeeding reported. A common and usually correctable problem — but a driver of early formula substitution.',
        recommended_asha_action: 'Observe a full feed and correct the latch. Reassure that supply responds to demand. Refer if the baby is not gaining weight.',
        requires_doctor_referral: false,
        subject: 'mother'
      });
    }
  }

  if (symptoms.length === 0) {
    symptoms.push({
      symptom_name: stage === 'postpartum' ? 'Routine Postnatal Check — No Flags' : 'Routine Checkup — No Flags',
      severity: 'mild',
      flag_description: 'No specific symptoms reported. Standard progression.',
      recommended_asha_action: stage === 'postpartum'
        ? 'Continue the HBNC visit schedule. Reinforce exclusive breastfeeding, warmth and cord care.'
        : 'Continue routine monthly ANC visits. Reinforce IFA tablet compliance and a balanced diet.',
      requires_doctor_referral: false,
      subject: 'mother'
    });
  }

  return {
    summary: 'Visit screened. Symptoms logged to the risk timeline for follow-up.',
    extracted_symptoms: symptoms
  };
}
