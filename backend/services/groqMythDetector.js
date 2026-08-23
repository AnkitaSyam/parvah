import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { retrieveRelevantMyths } from './mythRetrieval.js';

dotenv.config();

// Below this cosine similarity, we don't trust a myth as "detected" on its
// own -- it's still useful as LLM grounding context, but not strong enough
// evidence to report to the ASHA worker without the LLM's confirmation.
const SEMANTIC_FALLBACK_CONFIDENCE = 0.55;

/**
 * Single-purpose function: Analyzes visit transcript against the pregnancy
 * myth catalog and returns any myths mentioned by the patient or family.
 *
 * Flow:
 *  1. Semantically retrieve the myths most relevant to this transcript
 *     (pgvector cosine similarity) to use as focused LLM grounding context,
 *     instead of dumping the entire catalog into every prompt.
 *  2. Ask the LLM to confirm which of those (or others) are actually
 *     mentioned, with quotes and severity.
 *  3. If the LLM is unavailable/broken, fall back to the semantic
 *     retrieval results directly (myths above a confidence threshold),
 *     rather than a hardcoded keyword list -- this scales automatically
 *     as the myth catalog grows, with no code changes required.
 *
 * @param {string} transcript - Transcribed visit text
 * @param {Array<Object>} [referenceMyths] - Full myth catalog from Supabase
 *   (legacy param, used only as a last-resort context source if semantic
 *   retrieval itself fails, e.g. embeddings not yet backfilled).
 * @returns {Promise<Array<Object>>} Array of detected myth matches with counseling advice
 */
export async function detectMyths(transcript, referenceMyths = []) {
  if (!transcript || typeof transcript !== 'string') {
    throw new Error('detectMyths error: Valid transcript string is required.');
  }

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
    return semanticFallbackDetection(retrievedMyths, referenceMyths, retrievalFailed);
  }

  const groq = new Groq({ apiKey });

  // Prefer the focused, semantically-relevant myth list; fall back to the
  // full catalog only if retrieval itself isn't set up yet.
  const contextMyths = retrievedMyths.length > 0
    ? retrievedMyths
    : referenceMyths;

  const formattedReference = contextMyths
    .map(m => `- ID: "${m.external_id || m.id}", Title: "${m.myth_title}", Myth: "${m.common_myth}"`)
    .join('\n');

  const systemPrompt = `You are a medical maternal health analyst for rural India.
Your task is to analyze an ASHA worker's visit transcript and identify any pregnancy myths or harmful superstitions mentioned by the patient or family.

Reference Pregnancy Myths Database:
${formattedReference || 'No external database provided; match against standard rural Indian pregnancy myths (e.g. eclipse exposure, iron tablets making baby dark, eating less to keep baby small, saffron milk for skin color, ghee for lubrication, avoiding curd/cold water, avoiding papaya).'}

CRITICAL INSTRUCTIONS:
1. ONLY detect myths that are explicitly mentioned or referenced in the transcript.
2. Return ONLY a raw valid JSON object with NO markdown formatting, NO backticks, and NO conversational text.
3. The JSON MUST adhere strictly to this schema:
{
  "detected_myths": [
    {
      "myth_id": "string or null (matching reference ID if applicable)",
      "myth_title": "string (clear concise title)",
      "extracted_quote": "string (exact or paraphrased quote from transcript)",
      "explanation": "string (why this belief is harmful and what evidence-based medical fact ASHA worker should explain)",
      "severity_impact": "low" | "medium" | "high"
    }
  ]
}`;

  const userPrompt = `Visit Transcript:\n"${transcript}"`;

  // First Attempt
  try {
    const rawResponse = await callGroqLlm(groq, systemPrompt, userPrompt);
    const parsed = parseAndValidateMythJson(rawResponse);
    return parsed.detected_myths;
  } catch (firstError) {
    console.warn(`First LLM myth detection attempt failed or returned malformed JSON: ${firstError.message}. Retrying once...`);

    // Retry Attempt with explicit JSON instruction
    try {
      const retrySystemPrompt = `${systemPrompt}\n\nIMPORTANT: Your previous output failed JSON validation (${firstError.message}). You MUST output STRICT VALID JSON without markdown.`;
      const retryRawResponse = await callGroqLlm(groq, retrySystemPrompt, userPrompt);
      const parsedRetry = parseAndValidateMythJson(retryRawResponse);
      return parsedRetry.detected_myths;
    } catch (retryError) {
      console.warn('LLM retry for detectMyths also failed. Falling back to semantic myth retrieval:', retryError.message);
      return semanticFallbackDetection(retrievedMyths, referenceMyths, retrievalFailed);
    }
  }
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
  }

  return data;
}

/**
 * Offline/degraded-mode myth detection, used when the LLM is unavailable.
 *
 * Reports myths that semantic retrieval already found to be closely
 * related to the transcript (cosine similarity above
 * SEMANTIC_FALLBACK_CONFIDENCE). This scales with the myth catalog
 * automatically -- no hardcoded keyword list to maintain, so newly seeded
 * myths (like papaya) are covered without a code change.
 *
 * If semantic retrieval itself isn't available yet (migration not run /
 * embeddings not backfilled), this returns an empty list rather than
 * silently guessing -- that's a more honest failure mode than a stale
 * keyword list that quietly misses things.
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
    severity_impact: m.similarity >= 0.7 ? 'high' : 'medium',
    _mode: 'semantic_fallback',
    _similarity: m.similarity
  }));
}
