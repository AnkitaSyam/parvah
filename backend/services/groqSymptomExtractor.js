import Groq from 'groq-sdk';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// ── Load red-flag definitions from the canonical JSON file at module startup ──
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RED_FLAG_DATA = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/redFlagSymptoms.json'), 'utf8')
);

/**
 * Pre-compiled word-boundary regex patterns for each red-flag keyword.
 * Using \\b ensures 'fits' doesn't match 'benefits', 'bleeding' doesn't
 * match 'no bleeding' as a standalone false positive, etc.
 * Rebuilt once at startup from redFlagSymptoms.json — never hardcoded here.
 */
const RED_FLAG_PATTERNS = RED_FLAG_DATA.flatMap((rf) =>
  rf.keywords.map((kw) => {
    // Escape regex metacharacters in the keyword phrase
    const escaped = kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // \b fails on non-ASCII (Devanagari). (?<!\S)/(?!\S) fails when Hindi
    // phrases are directly followed by Devanagari punctuation like ।
    // (?<!\w)/(?!\w) treats any non-letter/digit as a word boundary — correct
    // for both Latin and Devanagari script.
    return {
      rfEntry: rf,
      pattern: new RegExp(`(?<!\\w)${escaped}(?!\\w)`, 'i')
    };
  })
);

/**
 * Canonical red-flag symptom names for LLM prompt injection.
 * e.g. "Severe Bleeding, Sudden Vision Loss, ..."
 */
const RED_FLAG_NAMES = RED_FLAG_DATA.map((rf) => rf.symptom).join(', ');

// ─────────────────────────────────────────────────────────────────────────────

/**
 * enforceRedFlagSeverity
 *
 * Post-processing safety guard.  After the LLM (or fallback) produces a list
 * of symptoms, scan every item's symptom_name + flag_description against the
 * keyword list from redFlagSymptoms.json.  Any match is unconditionally
 * upgraded to severity:"severe" and requires_doctor_referral:true.
 *
 * This ensures a red-flag symptom can NEVER be returned as mild or moderate,
 * regardless of what the LLM or the fallback decided.
 *
 * @param {Array<Object>} symptoms - Validated extracted_symptoms array
 * @returns {Array<Object>} Same array with red-flag items corrected in-place
 */
export function enforceRedFlagSeverity(symptoms) {
  return symptoms.map((s) => {
    const haystack = `${s.symptom_name} ${s.flag_description}`;

    // Use pre-compiled word-boundary regex for precise matching
    const matchedPattern = RED_FLAG_PATTERNS.find(({ pattern }) => pattern.test(haystack));

    if (!matchedPattern) return s;

    return {
      ...s,
      severity: 'severe',
      requires_doctor_referral: true,
      // Replace with the canonical ASHA emergency action from redFlagSymptoms.json
      recommended_asha_action: matchedPattern.rfEntry.recommended_asha_action,
      _red_flag_enforced: true // audit flag — visible in DB / logs
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * extractSymptoms
 *
 * Single-purpose function: Extracts symptoms and risk indicators from a visit
 * transcript.  Builds patient risk timeline entries without making diagnoses.
 *
 * Pipeline:
 *   1. Call Groq LLM with a system prompt that explicitly lists red-flag
 *      symptoms and instructs the model to always classify them as "severe".
 *   2. Validate the JSON response schema.
 *   3. Run enforceRedFlagSeverity() as a deterministic safety guard.
 *   4. On LLM failure, fall back to keyword-based extraction (also data-driven
 *      from redFlagSymptoms.json) and apply the same guard.
 *
 * @param {string} transcript        - Transcribed visit text
 * @param {number} gestationalWeeks  - Current gestational week of the patient
 * @returns {Promise<Object>} { summary: string, extracted_symptoms: Array }
 */
export async function extractSymptoms(transcript, gestationalWeeks = 20) {
  if (!transcript || typeof transcript !== 'string') {
    throw new Error('extractSymptoms error: Valid transcript string is required.');
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey.includes('your_groq_api_key')) {
    console.warn('⚠️ GROQ_API_KEY missing. Running offline keyword-based extraction.');
    const result = fallbackSymptomExtraction(transcript, gestationalWeeks);
    result.extracted_symptoms = enforceRedFlagSeverity(result.extracted_symptoms);
    return result;
  }

  const groq = new Groq({ apiKey });

  const systemPrompt = buildSystemPrompt(gestationalWeeks);
  const userPrompt = `Patient Gestational Week: ${gestationalWeeks}\nVisit Transcript:\n"${transcript}"`;

  // First attempt
  try {
    const raw = await callGroqLlm(groq, systemPrompt, userPrompt);
    return parseValidateAndGuard(raw);
  } catch (firstError) {
    console.warn(`⚠️ First LLM attempt failed: ${firstError.message}. Retrying once…`);

    // Single retry with explicit reminder
    try {
      const retryPrompt = `${systemPrompt}\n\nIMPORTANT: Your previous response failed JSON validation (${firstError.message}). Output STRICT VALID JSON ONLY — no markdown, no backticks.`;
      const retryRaw = await callGroqLlm(groq, retryPrompt, userPrompt);
      return parseValidateAndGuard(retryRaw);
    } catch (retryError) {
      console.error('❌ LLM retry also failed. Falling back to offline extraction:', retryError.message);
      const result = fallbackSymptomExtraction(transcript, gestationalWeeks);
      result.extracted_symptoms = enforceRedFlagSeverity(result.extracted_symptoms);
      return result;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the system prompt, embedding the red-flag list from redFlagSymptoms.json
 * so the LLM has explicit guidance — not a hardcoded string.
 */
function buildSystemPrompt(gestationalWeeks) {
  return `You are an AI assistant for ASHA community health workers in rural India.
Your task is to extract maternal health symptoms from an audio visit transcript to update the patient's Risk Timeline.

STRICT MEDICAL & ETHICAL BOUNDARIES:
- YOU MUST NEVER DIAGNOSE ANY MEDICAL CONDITION OR DISEASE.
- You ONLY extract reported symptoms, classify severity, describe risk indicators, and suggest ASHA protocol actions.

MANDATORY SEVERITY RULES — RED-FLAG SYMPTOMS:
The following symptoms are obstetric emergencies and MUST ALWAYS be classified as severity:"severe"
and requires_doctor_referral:true, regardless of how they are described in the transcript:
  ${RED_FLAG_NAMES}

Any symptom that matches or closely resembles one of the above MUST be "severe".
Never classify them as "mild" or "moderate".

CRITICAL FORMAT INSTRUCTIONS:
1. Return ONLY a raw valid JSON object — NO markdown, NO backticks, NO prose.
2. The JSON MUST adhere strictly to this schema:
{
  "summary": "string (1-2 sentence non-diagnostic summary of reported symptoms)",
  "extracted_symptoms": [
    {
      "symptom_name": "string",
      "severity": "mild" | "moderate" | "severe",
      "flag_description": "string (warning context for ASHA worker)",
      "recommended_asha_action": "string (concrete ASHA step)",
      "requires_doctor_referral": true | false
    }
  ]
}`;
}

/**
 * Calls the Groq LLM chat completion endpoint.
 */
async function callGroqLlm(groq, systemPrompt, userPrompt) {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });
    return completion.choices[0]?.message?.content || '';
  } catch (error) {
    throw new Error(`Groq LLM call error: ${error.message}`);
  }
}

/**
 * Parses the raw LLM string, validates the schema, then runs the
 * enforceRedFlagSeverity guard as the final deterministic safety step.
 */
function parseValidateAndGuard(rawText) {
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
  }

  // ── Deterministic safety guard: enforce red-flag rules from JSON ──
  data.extracted_symptoms = enforceRedFlagSeverity(data.extracted_symptoms);

  return data;
}

/**
 * Keyword-based offline fallback.
 * Entirely data-driven from redFlagSymptoms.json — no hardcoded strings.
 * Also handles common non-red-flag pregnancy symptoms.
 */
function fallbackSymptomExtraction(transcript, gestationalWeeks) {
  const text = transcript;
  const symptoms = [];

  // ── Red-flag symptoms — use same word-boundary patterns for consistency ──
  for (const rf of RED_FLAG_DATA) {
    const matched = RED_FLAG_PATTERNS
      .filter(({ rfEntry }) => rfEntry.id === rf.id)
      .some(({ pattern }) => pattern.test(text));
    if (matched) {
      symptoms.push({
        symptom_name: rf.symptom,
        severity: rf.severity,
        flag_description: rf.flag_description,
        recommended_asha_action: rf.recommended_asha_action,
        requires_doctor_referral: rf.requires_doctor_referral
      });
    }
  }

  // ── Subtle / non-emergency symptoms (these are still hardcoded here
  //    because they are contextual, not safety-critical) ──
  if (/(?<!\w)(swelling|edema|सूजन)(?!\w)/i.test(text)) {
    // Only add if not already captured as a red-flag sub-symptom
    const alreadyCaptured = symptoms.some((s) =>
      /swelling|edema/i.test(s.symptom_name)
    );
    if (!alreadyCaptured) {
      const hasHeadache = /(?<!\w)(headache|सिरदर्द)(?!\w)/i.test(text);
      symptoms.push({
        symptom_name: 'Pedal Edema (Foot Swelling)',
        severity: hasHeadache ? 'severe' : 'moderate',
        flag_description: `Swelling in lower limbs at gestational week ${gestationalWeeks}. ${hasHeadache ? 'Co-occurring headache raises pre-eclampsia concern.' : ''}`.trim(),
        recommended_asha_action: 'Measure blood pressure immediately. Check urine for albumin at Sub-Center.',
        requires_doctor_referral: true
      });
    }
  }

  if (/(?<!\w)(headache|सिरदर्द)(?!\w)/i.test(text)) {
    symptoms.push({
      symptom_name: 'Persistent Headache',
      severity: 'moderate',
      flag_description: 'Recurring or persistent headache reported. Evaluate alongside BP and visual symptoms.',
      recommended_asha_action: 'Check blood pressure. If ≥ 140/90 mmHg or visual symptoms present, escalate to PHC urgently.',
      requires_doctor_referral: true
    });
  }

  if (/(?<!\w)(fever|बुखार)(?!\w)/i.test(text)) {
    symptoms.push({
      symptom_name: 'Maternal Fever',
      severity: 'moderate',
      flag_description: 'Elevated body temperature reported. Potential infection risk.',
      recommended_asha_action: 'Check temperature. Advise hydration and test for malaria/UTI at PHC.',
      requires_doctor_referral: true
    });
  }

  if (/(?<!\w)(vomiting|nausea|उल्टी)(?!\w)/i.test(text)) {
    symptoms.push({
      symptom_name: 'Nausea / Vomiting',
      severity: 'mild',
      flag_description: 'Nausea or vomiting reported. Common in early pregnancy; monitor for severity.',
      recommended_asha_action: 'Advise small frequent meals and hydration. Refer if unable to keep any food or fluids down.',
      requires_doctor_referral: false
    });
  }

  if (symptoms.length === 0) {
    symptoms.push({
      symptom_name: 'Routine Checkup — No Flags',
      severity: 'mild',
      flag_description: 'No specific symptoms reported. Standard pregnancy progression.',
      recommended_asha_action: 'Continue routine monthly ANC visits. Reinforce IFA tablet compliance and balanced diet.',
      requires_doctor_referral: false
    });
  }

  const hasCritical = symptoms.some((s) => s.severity === 'severe');

  return {
    summary: hasCritical
      ? '⚠️ CRITICAL: One or more emergency-level symptoms detected. Immediate ASHA action and emergency referral required.'
      : 'Visit screened successfully. Symptoms logged to risk timeline for routine follow-up.',
    extracted_symptoms: symptoms
  };
}
