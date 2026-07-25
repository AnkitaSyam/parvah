import express from 'express';
import multer from 'multer';
import { supabase } from '../config/supabase.js';
import { uploadAudioFile } from '../services/storage.js';
import { transcribeAudio } from '../services/transcription.js';
import { checkMyths } from '../services/mythCheck.js';

const router = express.Router();

// Multer in-memory upload configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // Limit files to 10MB
  }
});

// UUID verification regex
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

/**
 * POST /api/calls/upload
 * Accepts multipart/form-data:
 * - audioFile: Audio recording file
 * - patientId: UUID of the patient
 * - source: "app_upload" | "asha_call"
 */
router.post('/upload', upload.single('audioFile'), async (req, res) => {
  try {
    const { patientId, source } = req.body;
    const file = req.file;

    // 1. Inputs validation
    if (!patientId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Missing patientId in request body.'
      });
    }

    if (!UUID_REGEX.test(patientId)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'patientId must be a valid UUID format.'
      });
    }

    if (!file) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Missing audioFile field in multipart/form-data.'
      });
    }

    if (source && !['app_upload', 'asha_call'].includes(source)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'source must be one of "app_upload" or "asha_call".'
      });
    }

    // 2. Validate patientId exists in the patients table and fetch preferred_language
    console.log(`🔍 Checking if patientId ${patientId} exists...`);
    let patient = null;
    let dbError = null;

    // Try to query including preferred_language
    const resLang = await supabase
      .from('patients')
      .select('id, preferred_language')
      .eq('id', patientId)
      .maybeSingle();

    patient = resLang.data;
    dbError = resLang.error;

    if (dbError && dbError.message.includes('preferred_language')) {
      console.warn('⚠️ Warning: preferred_language column not found in database. Defaulting to en.');
      const resFallback = await supabase
        .from('patients')
        .select('id')
        .eq('id', patientId)
        .maybeSingle();
      
      if (resFallback.error) {
        console.error('❌ Database query error during patient validation:', resFallback.error.message);
        return res.status(500).json({
          error: 'DATABASE_ERROR',
          message: `Failed to query patients database: ${resFallback.error.message}`
        });
      }
      patient = resFallback.data;
      if (patient) {
        patient.preferred_language = 'en';
      }
      dbError = null;
    } else if (dbError) {
      console.error('❌ Database query error during patient validation:', dbError.message);
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Failed to query patients database: ${dbError.message}`
      });
    }

    if (!patient) {
      console.warn(`⚠️ Patient with ID ${patientId} not found in patients table.`);
      return res.status(404).json({
        error: 'PATIENT_NOT_FOUND',
        message: `Patient with ID ${patientId} does not exist.`
      });
    }

    // 3. Upload file to private Supabase Storage
    console.log(`📦 Uploading audio file to Supabase storage...`);
    let storagePath;
    try {
      storagePath = await uploadAudioFile(file, patientId);
    } catch (uploadError) {
      console.error('❌ Storage upload service failed:', uploadError.message);
      return res.status(500).json({
        error: 'STORAGE_UPLOAD_ERROR',
        message: uploadError.message
      });
    }

    // 4. Transcribe using Groq Whisper service
    console.log(`🎙️ Transcribing audio file (Auto-Detect Language)...`);
    const transcriptionResult = await transcribeAudio(file.buffer, file.originalname, file.mimetype);

    // If Groq transcription service returned an error structure
    if (transcriptionResult.error) {
      console.error('❌ Transcription service failed with status:', transcriptionResult.statusCode);
      return res.status(transcriptionResult.statusCode).json({
        error: transcriptionResult.errorType,
        message: transcriptionResult.message
      });
    }

    // Determine target language using priority rules:
    // 1. If Whisper's detected language is 'en', 'hi', or 'ml', use that
    // 2. Otherwise, use the patient's preferred_language field
    // 3. If neither is available, default to 'en'
    const detectedLang = transcriptionResult.language || 'en';
    const patientPreferredLang = patient.preferred_language || 'en';
    
    let targetLanguage = 'en';
    if (['en', 'hi', 'ml'].includes(detectedLang)) {
      targetLanguage = detectedLang;
    } else if (['en', 'hi', 'ml'].includes(patientPreferredLang)) {
      targetLanguage = patientPreferredLang;
    } else {
      targetLanguage = 'en';
    }

    console.log(`🎯 Resolved languages - Detected: ${detectedLang} | Preferred: ${patientPreferredLang} | Target: ${targetLanguage}`);

    // Check transcript for myths with resolved target language
    const mythsMatched = await checkMyths(transcriptionResult.transcript, targetLanguage);

    // 5. Log the call record in Supabase
    console.log(`💾 Storing call log to database calls table...`);
    const { data: callRecord, error: callErr } = await supabase
      .from('calls')
      .insert([
        {
          patient_id: patientId,
          source: source || 'app_upload',
          transcript: transcriptionResult.transcript,
          myths_flagged: mythsMatched,
          symptoms_extracted: []
        }
      ])
      .select()
      .maybeSingle();

    if (callErr) {
      console.warn('⚠️ Warning: Failed to insert call log into database:', callErr.message);
    } else {
      console.log('✅ Call log stored successfully, ID:', callRecord?.id);
    }

    // 6. Success response containing transcript, storagePath, and myth translations
    console.log(`🎉 Pipeline completed successfully!`);
    return res.status(200).json({
      transcript: transcriptionResult.transcript,
      storagePath: storagePath,
      detectedLanguage: detectedLang,
      targetLanguage: targetLanguage,
      myths: mythsMatched
    });

  } catch (error) {
    console.error('❌ Unhandled route exception in /api/calls/upload:', error.message);
    return res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: error.message || 'An unexpected server error occurred.'
    });
  }
});

export default router;
