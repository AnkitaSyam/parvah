import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { retrieveRelevantMyths } from './mythRetrieval.js';
import { findAffirmedMatches } from './clinicalText.js';

dotenv.config();

// Below this cosine similarity, we don't trust a myth as "detected" on its
// own -- it's still useful as LLM grounding context, but not strong enough
// evidence to report to the ASHA worker without the LLM's confirmation.
const SEMANTIC_FALLBACK_CONFIDENCE = 0.55;

const LANGUAGE_NAMES = {
  en: 'English',
  hi: 'Hindi (Devanagari script)',
  ml: 'Malayalam'
};

/**
 * Phrases indicating the family intends to skip or refuse immunization.
 * Vaccine *dates* are already answered by the MCP card and U-WIN; refusal is
 * the part that needs a person and an argument, so that is what we detect.
 */
const HESITANCY_CUES = [
  'not get the vaccine', 'not getting the vaccine', 'will not vaccinate',
  'refuse the vaccine', 'refusing vaccine', 'no vaccine', 'skip the vaccine',
  'against vaccination', 'vaccine causes', 'vaccine makes the baby sick',
  'injection will harm', 'no injection', 'not take the injection',
  'टीका नहीं', 'टीका नहीं लगवाएंगे', 'सुई नहीं', 'इंजेक्शन नहीं',
  'टीके से बुखार', 'टीका नुकसान', 'टीकाकरण नहीं'
];

/**
 * Single-purpose function: Analyzes visit transcript against the pregnancy
 * myth catalog and returns any myths mentioned by the patient or family.
 *
 * Flow:
 *  1. Semantically retrieve the myths most relevant to this transcript
 *     (pgvector cosine similarity) to use as focused LLM grounding context,
 *     instead of dumping the entire catalog into every prompt.
 *  2. Ask the LLM to confirm which of those (or others) are actually
 *     mentioned, with quotes, severity, and — new — a counselling script the
 *     ASHA worker can read aloud in the patient's own language.
 *  3. If the LLM is unavailable/broken, fall back to the semantic
 *     retrieval results directly (myths above a confidence threshold).
 *
 * @param {string} transcript - Transcribed visit text
 * @param {Array<Object>} [referenceMyths] - Full myth catalog (last-resort context)
 * @param {Object} [options]
 * @param {string} [options.language='hi'] - Patient's preferred language code
 * @param {string} [options.stage='antenatal'] - Care stage
 * @returns {Promise<{ detected_myths: Array, immunization_hesitancy: Object|null }>}
 */
export async function detectMyths(transcript, referenceMyths = [], options = {}) {
  if (!transcript || typeof transcript !== 'string') {
    throw new Error('detectMyths error: Valid transcript string is required.');
  }

  const language = options.language || 'hi';
  const stage = options.stage || 'antenatal';
  const languageName = LANGUAGE_NAMES[language] || LANGUAGE_NAMES.hi;

  // Step 1: semantic retrieval for grounding + fallback use.
  let retrievedMyths = [];
  let retrievalFailed = false;
  try {
    retrievedMyths = await retrieveRelevantMyths(transcript);
  } catch (retrievalError) {
    retrievalFailed = true;
    console.warn(`Semantic myth retrieval unavailable (${retrievalError.message}). ` +
      'Falling back to full myth catalog for LLM context. ' +
      'Have you run migration 004 and `npm run embed:myths`?');
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey.includes('your_groq_api_key')) {
    console.warn('GROQ_API_KEY missing. Returning offline myth analysis from semantic retrieval.');
    return {
      detected_myths: semanticFallbackDetection(retrievedMyths, referenceMyths, retrievalFailed),
      immunization_hesitancy: keywordHesitancyScan(transcript)
    };
  }

  const groq = new Groq({ apiKey });

  const contextMyths = retrievedMyths.length > 0 ? retrievedMyths : referenceMyths;

  const formattedReference = contextMyths
    .map(m => `- ID: "${m.external_id || m.id}", Title: "${m.myth_title}", Myth: "${m.common_myth}", Medical fact: "${m.medical_fact || ''}", Counselling guidance: "${m.counseling_guidance || ''}"`)
    .join('\n');

  const stageNote = stage === 'postpartum'
    ? 'This is a POSTNATAL visit. Watch for beliefs about colostrum, bathing the newborn, ' +
      'prelacteal feeds (honey, water, goat milk), confinement practices, and refusal of infant immunization.'
    : 'This is an ANTENATAL visit. Watch for beliefs about diet restriction, eclipses, iron tablets, ' +
      'reduced food intake, and avoidance of institutional delivery or ANC visits.';

  const systemPrompt = `You are a medical maternal health analyst supporting ASHA workers in rural India.
Analyse an ASHA worker's visit transcript and identify pregnancy or newborn-care myths and harmful
beliefs expressed by the patient or her family.

${stageNote}

Reference Myth Database (semantically retrieved for this transcript):
${formattedReference || 'No database rows supplied; match against standard rural Indian maternal myths (eclipse exposure, iron tablets darkening the baby, eating less to keep the baby small, discarding colostrum, ghee for easy delivery, avoiding papaya/curd, refusing immunization).'}

CRITICAL INSTRUCTIONS:
1. ONLY report beliefs that are explicitly expressed or referenced in the transcript.
   Do not report a myth merely because it is common. If the family states a CORRECT belief,
   do not report it as a myth.
2. For every myth, write "counseling_script": what the ASHA worker should actually SAY to the
   family, written in ${languageName}, in warm, respectful, everyday spoken language a person
   with limited formal schooling will understand. Address the family as "दीदी"/"sister" or the
   equivalent. Two to four sentences. Never shame the family for the belief. Lead with respect
   for the intention behind it, then give the correct information plainly, then say what to do.
3. Separately detect whether the family expresses reluctance to immunize the child.
4. Return ONLY a raw valid JSON object with NO markdown, NO backticks, and NO conversational text.
5. The JSON MUST adhere strictly to this schema:
{
  "detected_myths": [
    {
      "myth_id": "string or null (the reference ID above, exactly as given, if it matches)",
      "myth_title": "string (clear concise title, in English)",
      "extracted_quote": "string (the words from the transcript that express this belief)",
      "explanation": "string (in English, for the worker's record: why the belief is harmful and the evidence-based fact)",
      "counseling_script": "string (in ${languageName}, spoken directly to the family)",
      "severity_impact": "low" | "medium" | "high"
    }
  ],
  "immunization_hesitancy": {
    "detected": true | false,
    "vaccines_mentioned": ["string"],
    "stated_reason": "string (the family's own stated reason, or empty)",
    "counseling_script": "string (in ${languageName}, addressing that specific reason; empty if not detected)"
  }
}`;

  const userPrompt = `Visit Transcript:\n"${transcript}"`;

  // First Attempt
  try {
    const rawResponse = await callGroqLlm(groq, systemPrompt, userPrompt);
    return normalizeResult(parseAndValidateMythJson(rawResponse), transcript);
  } catch (firstError) {
    console.warn(`First LLM myth detection attempt failed or returned malformed JSON: ${firstError.message}. Retrying once...`);

    // Retry Attempt with explicit JSON instruction
    try {
      const retrySystemPrompt = `${systemPrompt}\n\nIMPORTANT: Your previous output failed JSON validation (${firstError.message}). You MUST output STRICT VALID JSON without markdown.`;
      const retryRawResponse = await callGroqLlm(groq, retrySystemPrompt, userPrompt);
      return normalizeResult(parseAndValidateMythJson(retryRawResponse), transcript);
    } catch (retryError) {
      console.warn('LLM retry for detectMyths also failed. Falling back to semantic myth retrieval:', retryError.message);
      return {
        detected_myths: semanticFallbackDetection(retrievedMyths, referenceMyths, retrievalFailed),
        immunization_hesitancy: keywordHesitancyScan(transcript)
      };
    }
  }
}

/**
 * Guarantees the hesitancy block is present and keyword-backstopped, so an
 * LLM that ignores the field does not silently drop a vaccine refusal.
 */
function normalizeResult(parsed, transcript) {
  let hesitancy = parsed.immunization_hesitancy;

  if (!hesitancy || hesitancy.detected !== true) {
    const keywordHit = keywordHesitancyScan(transcript);
    if (keywordHit) hesitancy = keywordHit;
  }

  return {
    detected_myths: parsed.detected_myths,
    immunization_hesitancy: hesitancy && hesitancy.detected ? hesitancy : null
  };
}

/**
 * Deterministic backstop for vaccine refusal, negation-aware so that
 * "they had no problem with the injection" is not read as a refusal.
 */
function keywordHesitancyScan(transcript) {
  for (const cue of HESITANCY_CUES) {
    if (findAffirmedMatches(transcript, cue).length > 0) {
      return {
        detected: true,
        vaccines_mentioned: [],
        stated_reason: '(detected by keyword match — see transcript)',
        counseling_script: 'दीदी, आपकी चिंता समझ आती है। टीका बच्चे को जानलेवा बीमारियों से बचाता है। ' +
          'टीके के बाद हल्का बुखार आना सामान्य है और एक-दो दिन में ठीक हो जाता है — यह इस बात का संकेत है ' +
          'कि टीका काम कर रहा है। अगले टीकाकरण दिवस पर मैं आपके साथ चलूंगी।',
        detected_by: 'keyword'
      };
    }
  }
  return null;
}

/**
 * Executes API call to Groq LLM
 */
async function callGroqLlm(groq, systemPrompt, userPrompt) {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: 'openai/gpt-oss-20b',
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    return completion.choices[0]?.message?.content || '';
  } catch (error) {
    throw new Error(`Groq API call error: ${error.message}`);
  }
}

/**
 * Validates and parses JSON response for myth detection
 */
function parseAndValidateMythJson(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty text received from LLM response.');
  }

  // Sanitize potential code fences
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

  if (!Array.isArray(data.detected_myths)) {
    throw new Error('Missing "detected_myths" array in JSON response.');
  }

  for (const myth of data.detected_myths) {
    if (!myth.myth_title || !myth.extracted_quote || !myth.explanation) {
      throw new Error('Myth object missing required fields (myth_title, extracted_quote, or explanation).');
    }
    if (!['low', 'medium', 'high'].includes(myth.severity_impact)) {
      myth.severity_impact = 'medium'; // default fallback
    }
    if (typeof myth.counseling_script !== 'string') {
      myth.counseling_script = '';
    }
  }

  return data;
}

/**
 * Offline/degraded-mode myth detection, used when the LLM is unavailable.
 *
 * Reports myths that semantic retrieval already found to be closely
 * related to the transcript (cosine similarity above
 * SEMANTIC_FALLBACK_CONFIDENCE). This scales with the myth catalog
 * automatically -- no hardcoded keyword list to maintain.
 *
 * If semantic retrieval itself isn't available yet (migration not run /
 * embeddings not backfilled), this returns an empty list rather than
 * silently guessing.
 */
function semanticFallbackDetection(retrievedMyths, referenceMyths, retrievalFailed) {
  if (retrievalFailed) {
    console.warn('Semantic fallback unavailable (retrieval failed). Returning no detected myths for this visit -- ' +
      'set up pgvector (migration 004) and run `npm run embed:myths` to enable offline myth detection.');
    return [];
  }

  const confident = retrievedMyths.filter(m => m.similarity >= SEMANTIC_FALLBACK_CONFIDENCE);

  if (confident.length === 0) {
    return [];
  }

  return confident.map(m => ({
    myth_id: m.external_id || m.id || null,
    myth_title: m.myth_title,
    extracted_quote: '(offline mode -- see full transcript; semantic match, no exact quote extracted)',
    explanation: m.medical_fact || m.counseling_guidance || 'This belief is not supported by medical evidence.',
    // In offline mode the catalog's own counselling guidance is the script.
    counseling_script: m.counseling_guidance || m.medical_fact || '',
    severity_impact: m.similarity >= 0.7 ? 'high' : 'medium',
    _mode: 'semantic_fallback',
    _similarity: m.similarity
  }));
}
