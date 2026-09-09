/**
 * backend/services/groqTranscription.js
 *
 * The single transcription service.
 *
 * There were previously two: this one (returned a bare string, threw on
 * error) and services/transcription.js (returned { transcript, language },
 * returned error *objects* instead of throwing). Only this one was wired up,
 * so the language detection in the other was dead code — which is why every
 * downstream prompt assumed Hindi. They are merged here.
 */

import fs from 'fs';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

export class TranscriptionError extends Error {
  constructor(message, { errorType = 'TRANSCRIBE_API_ERROR', statusCode = 502 } = {}) {
    super(message);
    this.name = 'TranscriptionError';
    this.errorType = errorType;
    this.statusCode = statusCode;
  }
}

const WHISPER_PROMPT =
  'Recording of a home visit by an ASHA community health worker in rural India. ' +
  'The conversation is with a pregnant or recently delivered woman and her family, ' +
  'in Hindi, Hinglish or English. Topics include pregnancy symptoms, bleeding, swelling, ' +
  'fever, blood pressure, fetal movement, breastfeeding, newborn care, immunization, ' +
  'diet, and traditional beliefs about pregnancy.';

function mapLanguage(raw) {
  const lang = (raw || '').toLowerCase();
  if (lang.includes('hindi') || lang === 'hi') return 'hi';
  if (lang.includes('malayalam') || lang === 'ml') return 'ml';
  if (lang.includes('english') || lang === 'en') return 'en';
  if (lang.includes('marathi') || lang === 'mr') return 'mr';
  if (lang.includes('bengali') || lang === 'bn') return 'bn';
  if (lang.includes('tamil') || lang === 'ta') return 'ta';
  if (lang.includes('telugu') || lang === 'te') return 'te';
  return lang || 'en';
}

/**
 * Transcribes a visit recording with Groq Whisper.
 *
 * Language is auto-detected rather than forced, because ASHA visits are
 * routinely code-switched Hindi/English and forcing `language: 'hi'`
 * degraded English segments.
 *
 * @param {string} audioFilePath - Absolute path to the audio file
 * @returns {Promise<{ transcript: string, language: string, duration: number|null }>}
 * @throws {TranscriptionError}
 */
export async function transcribeAudio(audioFilePath) {
  if (!audioFilePath) {
    throw new TranscriptionError('No audio file was provided to transcribe.', {
      errorType: 'NO_AUDIO',
      statusCode: 400
    });
  }

  const apiKey = process.env.GROQ_API_KEY;

  // Offline / demo mode: no key configured.
  if (!apiKey || apiKey.includes('your_groq_api_key')) {
    console.warn('⚠️ GROQ_API_KEY not configured — returning a simulated visit transcript.');
    return { transcript: generateMockTranscript(), language: 'hi', duration: null, simulated: true };
  }

  if (!fs.existsSync(audioFilePath)) {
    throw new TranscriptionError(`The recording could not be found at ${audioFilePath}.`, {
      errorType: 'AUDIO_NOT_FOUND',
      statusCode: 404
    });
  }

  try {
    const groq = new Groq({ apiKey });

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(audioFilePath),
      model: 'whisper-large-v3',
      prompt: WHISPER_PROMPT,
      temperature: 0.0,
      response_format: 'verbose_json'
    });

    if (!transcription?.text?.trim()) {
      throw new TranscriptionError('The recording produced no speech. Check the microphone and try again.', {
        errorType: 'EMPTY_TRANSCRIPT',
        statusCode: 422
      });
    }

    const language = mapLanguage(transcription.language);
    console.log(`✅ Transcribed ${audioFilePath} (language: ${transcription.language} → ${language})`);

    return {
      transcript: transcription.text.trim(),
      language,
      duration: transcription.duration ?? null,
      simulated: false
    };
  } catch (error) {
    if (error instanceof TranscriptionError) throw error;

    if (error.status === 429) {
      throw new TranscriptionError('Groq is rate limiting this account. Wait a moment and try again.', {
        errorType: 'RATE_LIMIT', statusCode: 429
      });
    }
    if (error.status === 401 || error.status === 403) {
      throw new TranscriptionError('Groq rejected the API key. Check GROQ_API_KEY in backend/.env.', {
        errorType: 'BAD_API_KEY', statusCode: 502
      });
    }
    if (error.status === 400 || /format|mime|type|decode/i.test(error.message || '')) {
      throw new TranscriptionError('That audio format could not be read. Record again or upload MP3, WAV, M4A or WebM.', {
        errorType: 'INVALID_FILE_FORMAT', statusCode: 400
      });
    }
    if (error.code === 'ETIMEDOUT' || /timeout|deadline/i.test(error.message || '')) {
      throw new TranscriptionError('Transcription timed out. Try a shorter recording.', {
        errorType: 'TIMEOUT', statusCode: 504
      });
    }

    throw new TranscriptionError(`Transcription failed: ${error.message}`, {
      errorType: 'TRANSCRIBE_API_ERROR', statusCode: 502
    });
  }
}

/**
 * Realistic demo transcript used when no API key is configured, so the
 * pipeline can be exercised end-to-end offline. Deliberately contains both
 * an affirmed danger sign and a negated one, so the negation handling in
 * services/clinicalText.js is visible in a no-key demo.
 */
function generateMockTranscript() {
  return [
    'नमस्ते दीदी, मैं आशा कार्यकर्ता हूँ। आपकी तबीयत कैसी है?',
    'बहन, पिछले चार दिन से पैरों में बहुत सूजन है और सिरदर्द भी ठीक नहीं हो रहा।',
    'खून नहीं बह रहा है, और दौरे भी नहीं आए।',
    'सासू माँ कहती हैं कि आयरन की गोली खाने से बच्चे का रंग काला हो जाएगा, इसलिए मैंने गोली खाना बंद कर दिया।',
    'और वो कहती हैं कि कम खाना खाओ तो बच्चा छोटा रहेगा और डिलीवरी आसान होगी।',
    'ठीक है दीदी, मैं आपका ब्लड प्रेशर नापती हूँ और आपको सही जानकारी देती हूँ।'
  ].join(' ');
}
