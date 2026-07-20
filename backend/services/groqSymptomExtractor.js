import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Single-purpose function: Extracts symptoms and risk indicators from visit transcript.
 * Builds patient risk timeline entries without making medical diagnoses.
 * Uses Groq LLM with strict JSON schema validation & 1-time retry on malformed JSON.
 *
 * @param {string} transcript - Transcribed visit text
 * @param {number} gestationalWeeks - Current gestational week of the patient
 * @returns {Promise<Object>} Object containing extracted symptoms array and summary
 */
export async function extractSymptoms(transcript, gestationalWeeks = 20) {
  if (!transcript || typeof transcript !== 'string') {
    throw new Error('extractSymptoms error: Valid transcript string is required.');
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey.includes('your_groq_api_key')) {
    console.warn('⚠️ GROQ_API_KEY missing. Returning offline symptom extraction results for testing.');
    return fallbackSymptomExtraction(transcript, gestationalWeeks);
  }

  const groq = new Groq({ apiKey });

  const systemPrompt = `You are an AI assistant for ASHA community health workers in rural India.
Your task is to extract maternal health symptoms from an audio visit transcript to update the patient's Risk Timeline.

STRICT MEDICAL & ETHICAL BOUNDARIES:
- YOU MUST NEVER DIAGNOSE ANY MEDICAL CONDITION OR DISEASE.
- You ONLY extract reported symptoms, classify severity (mild, moderate, severe), describe potential risk indicators, and suggest standard ASHA frontline protocol actions.

CRITICAL FORMAT INSTRUCTIONS:
1. Return ONLY a raw valid JSON object with NO markdown formatting, NO backticks, and NO conversational text.
2. The JSON MUST adhere strictly to this schema:
{
  "summary": "string (1-2 sentence non-diagnostic summary of reported symptoms)",
  "extracted_symptoms": [
    {
      "symptom_name": "string (e.g. Swelling in Feet, Severe Headache, Blurred Vision, Fever, Reduced Fetal Movement)",
      "severity": "mild" | "moderate" | "severe",
      "flag_description": "string (descriptive warning flag for ASHA worker reference)",
      "recommended_asha_action": "string (practical step for ASHA worker e.g., measure BP, check urine protein, counsel on hydration, arrange urgent PHC visit)",
      "requires_doctor_referral": true | false
    }
  ]
}`;

  const userPrompt = `Patient Gestational Week: ${gestationalWeeks}\nVisit Transcript:\n"${transcript}"`;

  // First Attempt
  try {
    const rawResponse = await callGroqLlm(groq, systemPrompt, userPrompt);
    const parsed = parseAndValidateSymptomJson(rawResponse);
    return parsed;
  } catch (firstError) {
    console.warn(`⚠️ First LLM symptom extraction attempt failed: ${firstError.message}. Retrying once...`);

    // Retry Attempt
    try {
      const retrySystemPrompt = `${systemPrompt}\n\nIMPORTANT: Your previous response was invalid JSON (${firstError.message}). Output STRICT VALID JSON ONLY.`;
      const retryRawResponse = await callGroqLlm(groq, retrySystemPrompt, userPrompt);
      const parsedRetry = parseAndValidateSymptomJson(retryRawResponse);
      return parsedRetry;
    } catch (retryError) {
      console.error('❌ Retry for extractSymptoms also failed:', retryError.message);
      throw new Error(`Symptom Extraction LLM failed after 1 retry: ${retryError.message}`);
    }
  }
}

/**
 * Helper to call Groq LLM API
 */
async function callGroqLlm(groq, systemPrompt, userPrompt) {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
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
 * Validates and parses JSON response for symptom extraction
 */
function parseAndValidateSymptomJson(rawText) {
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

  if (typeof data.summary !== 'string') {
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

  return data;
}

/**
 * Fallback pattern-based symptom extractor for offline/testing mode
 */
function fallbackSymptomExtraction(transcript, gestationalWeeks) {
  const text = transcript.toLowerCase();
  const symptoms = [];

  if (text.includes('सूजन') || text.includes('swelling')) {
    symptoms.push({
      symptom_name: 'Pedal Edema (Foot Swelling)',
      severity: text.includes('सिरदर्द') || text.includes('headache') ? 'severe' : 'moderate',
      flag_description: 'Swelling reported in lower limbs at gestational week ' + gestationalWeeks + '.',
      recommended_asha_action: 'Measure blood pressure immediately. Check for urine albumin at Sub-Center.',
      requires_doctor_referral: true
    });
  }

  if (text.includes('सिरदर्द') || text.includes('headache')) {
    symptoms.push({
      symptom_name: 'Severe Headache & Blurred Vision',
      severity: 'severe',
      flag_description: 'Morning persistent headache and visual blurriness reported.',
      recommended_asha_action: 'Urgent BP check needed for pre-eclampsia warning flag. Refer to Primary Health Centre (PHC).',
      requires_doctor_referral: true
    });
  }

  if (text.includes('बुखार') || text.includes('fever')) {
    symptoms.push({
      symptom_name: 'Maternal Fever',
      severity: 'moderate',
      flag_description: 'High temperature / fever reported during visit.',
      recommended_asha_action: 'Check temperature with thermometer. Advise hydration and test for malaria/UTI at PHC.',
      requires_doctor_referral: true
    });
  }

  if (text.includes('दर्द') || text.includes('pain')) {
    symptoms.push({
      symptom_name: 'Abdominal Pain',
      severity: 'moderate',
      flag_description: 'Upper abdominal pain noted by patient.',
      recommended_asha_action: 'Monitor fetal heart rate and check for gastric vs uterine origin.',
      requires_doctor_referral: false
    });
  }

  if (symptoms.length === 0) {
    symptoms.push({
      symptom_name: 'Routine Checkup Observations',
      severity: 'mild',
      flag_description: 'Standard pregnancy progression reported with no emergency flags.',
      recommended_asha_action: 'Continue routine monthly checkups and advise balanced diet & IFA compliance.',
      requires_doctor_referral: false
    });
  }

  const hasSevere = symptoms.some(s => s.severity === 'severe');

  return {
    summary: hasSevere 
      ? 'CRITICAL ALERT: Visit flagged high-risk symptoms (headache/swelling) requiring immediate BP check and PHC referral.'
      : 'Visit screened successfully. Moderate/mild symptoms logged to risk timeline.',
    extracted_symptoms: symptoms
  };
}
