import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Single-purpose function: Analyzes visit transcript against fixed pregnancy myth catalog.
 * Uses Groq LLM with strict JSON schema validation & 1-time retry on malformed JSON.
 *
 * @param {string} transcript - Transcribed visit text
 * @param {Array<Object>} referenceMyths - List of fixed reference myths from Supabase DB
 * @returns {Promise<Array<Object>>} Array of detected myth matches with counseling advice
 */
export async function detectMyths(transcript, referenceMyths = []) {
  if (!transcript || typeof transcript !== 'string') {
    throw new Error('detectMyths error: Valid transcript string is required.');
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey.includes('your_groq_api_key')) {
    console.warn('⚠️ GROQ_API_KEY missing. Returning offline myth analysis based on pattern matching.');
    return fallbackMythDetection(transcript, referenceMyths);
  }

  const groq = new Groq({ apiKey });

  const formattedReference = referenceMyths.map(m => `- ID: "${m.id}", Title: "${m.myth_title}", Myth: "${m.common_myth}"`).join('\n');

  const systemPrompt = `You are a medical maternal health analyst for rural India.
Your task is to analyze an ASHA worker's visit transcript and identify any pregnancy myths or harmful superstitions mentioned by the patient or family.

Reference Pregnancy Myths Database:
${formattedReference || 'No external database provided; match against standard rural Indian pregnancy myths (e.g. eclipse exposure, iron tablets making baby dark, eating less to keep baby small, saffron milk for skin color, ghee for lubrication, avoiding curd/cold water).'}

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
    console.warn(`⚠️ First LLM myth detection attempt failed or returned malformed JSON: ${firstError.message}. Retrying once...`);

    // Retry Attempt with explicit JSON instruction
    try {
      const retrySystemPrompt = `${systemPrompt}\n\nIMPORTANT: Your previous output failed JSON validation (${firstError.message}). You MUST output STRICT VALID JSON without markdown.`;
      const retryRawResponse = await callGroqLlm(groq, retrySystemPrompt, userPrompt);
      const parsedRetry = parseAndValidateMythJson(retryRawResponse);
      return parsedRetry.detected_myths;
    } catch (retryError) {
      console.error('❌ Retry for detectMyths also failed:', retryError.message);
      throw new Error(`Myth Detection LLM failed after 1 retry: ${retryError.message}`);
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
      model: 'llama-3.3-70b-versatile',
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
 * Fallback pattern-based myth detection when offline or missing API key
 */
function fallbackMythDetection(transcript, referenceMyths) {
  const detected = [];
  const text = transcript.toLowerCase();

  if (text.includes('सूर्यग्रहण') || text.includes('eclipse')) {
    const ref = referenceMyths.find(m => m.myth_title.includes('Eclipse')) || {};
    detected.push({
      myth_id: ref.id || null,
      myth_title: 'Eclipse Exposure Superstition',
      extracted_quote: 'सूर्यग्रहण के दौरान बाहर निकलने से बच्चे पर दाग पड़ता है',
      explanation: 'Eclipses do not harm unborn babies. Counsel family to allow normal daily activity and focus on IFA supplementation.',
      severity_impact: 'medium'
    });
  }

  if (text.includes('लोहे की गोली') || text.includes('आयरन') || text.includes('ifa') || text.includes('dark')) {
    const ref = referenceMyths.find(m => m.myth_title.includes('Iron')) || {};
    detected.push({
      myth_id: ref.id || null,
      myth_title: 'Iron Tablets Cause Dark Skin Color',
      extracted_quote: 'लोहे की गोली से बच्चे का रंग काला हो जाता है',
      explanation: 'IFA tablets prevent life-threatening maternal anemia and do not affect baby skin tone. Advise taking 1 tablet daily with water.',
      severity_impact: 'high'
    });
  }

  if (text.includes('घी') || text.includes('ghee')) {
    const ref = referenceMyths.find(m => m.myth_title.includes('Ghee')) || {};
    detected.push({
      myth_id: ref.id || null,
      myth_title: 'Excess Ghee Lubricates Delivery',
      extracted_quote: '9वें महीने में बहुत ज्यादा देसी घी पिला रहे हैं',
      explanation: 'Ghee enters the digestive system, not the birth canal. Excess fat causes severe diarrhea and digestion issues.',
      severity_impact: 'medium'
    });
  }

  if (text.includes('कम खाना') || text.includes('eat less')) {
    detected.push({
      myth_id: null,
      myth_title: 'Eating Less Keeps Baby Small',
      extracted_quote: 'eat very less food in the first trimester so the baby stays small',
      explanation: 'Restricting diet leads to severe low birth weight and anemia. Mother needs extra nutrition for fetal brain growth.',
      severity_impact: 'high'
    });
  }

  return detected;
}
