import Groq from 'groq-sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Single-purpose function: Transcribes an audio visit recording using Groq Whisper.
 * @param {string} audioFilePath - Absolute file path of recorded audio
 * @param {string} [language='hi'] - Target language or default auto-detect ('hi' for Hindi, 'en' for English)
 * @returns {Promise<string>} Transcribed text string
 */
export async function transcribeAudio(audioFilePath, language = 'hi') {
  if (!audioFilePath) {
    throw new Error('transcribeAudio error: Invalid audioFilePath provided.');
  }

  const apiKey = process.env.GROQ_API_KEY;

  // Fallback for offline development / demonstration if Groq key is placeholder
  if (!apiKey || apiKey.includes('your_groq_api_key')) {
    console.warn('⚠️ GROQ_API_KEY not configured. Returning simulated Hindi/English ASHA visit transcript for testing.');
    return generateMockTranscript();
  }

  try {
    const groq = new Groq({ apiKey });

    if (!fs.existsSync(audioFilePath)) {
      throw new Error(`Audio file not found at path: ${audioFilePath}`);
    }

    const audioStream = fs.createReadStream(audioFilePath);

    const transcription = await groq.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-large-v3',
      prompt: 'Patient visit recording by ASHA health worker in rural India discussing pregnancy symptoms, eating habits, myths, fever, swelling, and blood pressure.',
      temperature: 0.0,
      response_format: 'json',
    });

    if (!transcription || !transcription.text) {
      throw new Error('Groq transcription API returned an empty text response.');
    }

    return transcription.text.trim();
  } catch (error) {
    console.error('❌ Error in transcribeAudio:', error.message);
    throw new Error(`Failed to transcribe audio visit: ${error.message}`);
  }
}

/**
 * Provides a realistic sample transcript for testing/demo purposes when API keys are unconfigured.
 */
function generateMockTranscript() {
  const sampleTranscripts = [
    `नमस्ते दीदी। मरीज रेखा देवी, उम्र 24 वर्ष, गर्भावस्था का 26वां हफ्ता है। मरीज ने बताया कि पिछले 3 दिनों से उसके पैरों में काफी सूजन (swelling) है और सुबह उठने पर तेज सिरदर्द रहता है। उसकी सास का कहना है कि सूर्यग्रहण के दौरान बाहर निकलने से बच्चे पर दाग पड़ता है इसलिए उसे बाहर नहीं निकलने दिया। इसके अलावा, सास ने उसे फॉलिक एसिड और आयरन की गोलियां (IFA tablets) खाने से मना किया है क्योंकि उनका मानना है कि लोहे की गोली से बच्चे का रंग काला हो जाता है। मरीज ने थोड़ा धुंधला दिखने (blurred vision) की भी शिकायत की। बीपी की जांच की जरूरत है।`,
    `मरीज सुनीता शर्मा, 28 वर्ष, 32 हफ्ते की गर्भवती। मरीज का कहना है कि उसके पेट के ऊपरी हिस्से में तेज दर्द है और उसे बुखार (fever) महसूस हो रहा है। रिश्तेदार उसे 9वें महीने में बहुत ज्यादा देसी घी पिला रहे हैं ताकि डिलीवरी आसानी से हो जाए। उन्होंने कहा कि डॉक्टर के दिए आयरन सिरप को बंद कर दिया है। मरीज ने बच्चे की हलचल (fetal movement) कम होने की बात भी कही।`,
    `ASHA visit log: Patient Sunita, age 22, 18 weeks pregnant. Patient reported mild nausea and tiredness. Her mother-in-law advised her to eat very less food in the first trimester so the baby stays small and delivery is easy. Also she was advised not to eat curd or drink cold water because it will give the fetus a severe cold. No high-risk warning symptoms present today, BP normal.`
  ];
  return sampleTranscripts[Math.floor(Math.random() * sampleTranscripts.length)];
}
