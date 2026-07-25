import fs from 'fs';
import path from 'path';
import os from 'os';
import { groq } from '../config/groq.js';

/**
 * Transcribes audio from a buffer or file path using Groq's Whisper API.
 * Cleans up any created temporary files on success or failure.
 *
 * @param {Buffer|string} fileBufferOrPath - Audio file buffer or absolute path
 * @param {string} [originalname='audio.webm'] - Original name of the uploaded file
 * @param {string} [mimetype='audio/webm'] - Mime type of the uploaded file
 * @returns {Promise<Object>} Transcript object: { transcript: string, language: string }
 *                           or error object if failed: { error: true, errorType: string, statusCode: number, message: string }
 */
export async function transcribeAudio(fileBufferOrPath, originalname = 'audio.webm', mimetype = 'audio/webm') {
  let tempFilePath = null;
  let audioStream = null;

  try {
    // 1. Identify input and prepare temporary file if it's a buffer
    if (typeof fileBufferOrPath === 'string') {
      tempFilePath = fileBufferOrPath;
      if (!fs.existsSync(tempFilePath)) {
        throw new Error(`Audio file not found at path: ${tempFilePath}`);
      }
      audioStream = fs.createReadStream(tempFilePath);
    } else if (Buffer.isBuffer(fileBufferOrPath)) {
      const tempDir = os.tmpdir();
      const uniqueName = `transcribe-${Date.now()}-${originalname}`;
      tempFilePath = path.join(tempDir, uniqueName);
      fs.writeFileSync(tempFilePath, fileBufferOrPath);
      audioStream = fs.createReadStream(tempFilePath);
    } else {
      throw new Error('Invalid transcription input. Expected a file path string or Buffer.');
    }

    // 2. Perform Groq API Whisper call
    console.log(`🎙️ Sending audio file to Groq Whisper (model: whisper-large-v3)...`);
    const transcription = await groq.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-large-v3',
      temperature: 0.0,
      response_format: 'verbose_json',
    });

    // 3. Cleanup temp file if created from buffer
    if (Buffer.isBuffer(fileBufferOrPath) && tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    if (!transcription || !transcription.text) {
      throw new Error('Groq Whisper API returned an empty text response.');
    }

    const rawLang = (transcription.language || 'english').toLowerCase();
    let detectedLanguageCode = 'en';
    if (rawLang.includes('hindi') || rawLang === 'hi') {
      detectedLanguageCode = 'hi';
    } else if (rawLang.includes('malayalam') || rawLang === 'ml') {
      detectedLanguageCode = 'ml';
    } else if (rawLang.includes('english') || rawLang === 'en') {
      detectedLanguageCode = 'en';
    } else {
      detectedLanguageCode = rawLang;
    }

    console.log(`✅ Transcription completed. Detected language: ${rawLang} -> mapped to code: ${detectedLanguageCode}`);
    return {
      transcript: transcription.text.trim(),
      language: detectedLanguageCode
    };

  } catch (error) {
    // Cleanup temporary file in case of error
    if (Buffer.isBuffer(fileBufferOrPath) && tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupErr) {
        console.error('Failed to cleanup temporary audio file:', cleanupErr.message);
      }
    }

    console.error('❌ Error during Groq Whisper transcription:', error.message);

    // Map specific Groq/network API errors explicitly
    let errorType = 'TRANSCRIBE_API_ERROR';
    let statusCode = 500;

    if (error.status === 429) {
      errorType = 'RATE_LIMIT_ERROR';
      statusCode = 429;
    } else if (error.status === 400 || error.message.includes('format') || error.message.includes('mime') || error.message.includes('type')) {
      errorType = 'INVALID_FILE_FORMAT';
      statusCode = 400;
    } else if (error.code === 'ETIMEOUT' || error.message.includes('timeout') || error.message.includes('deadline')) {
      errorType = 'TIMEOUT_ERROR';
      statusCode = 504;
    }

    return {
      error: true,
      errorType,
      statusCode,
      message: error.message || 'An error occurred during Groq Whisper transcription.'
    };
  }
}
