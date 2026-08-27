import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { supabaseAdmin, createUserClient } from '../config/supabase.js';
import { transcribeAudio } from '../services/groqTranscription.js';
import { detectMyths } from '../services/groqMythDetector.js';
import { extractSymptoms } from '../services/groqSymptomExtractor.js';
import { calculateRiskScore } from '../services/riskScoring.js';

const router = express.Router();

// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `visit-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ storage });

/**
 * POST /api/visits/upload
 * Uploads audio recording file and creates visit entry
 */
router.post('/upload', upload.single('audio'), async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing.' });
    }

    const token = authHeader.replace('Bearer ', '');
    const userClient = createUserClient(token);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid user authentication session.' });
    }

    const { patient_id } = req.body;
    if (!patient_id) {
      return res.status(400).json({ error: 'patient_id is required.' });
    }

    const audioFilePath = req.file ? req.file.path : null;

    const { data: visit, error: insertError } = await userClient
      .from('visits')
      .insert([
        {
          patient_id,
          asha_worker_id: user.id,
          audio_url: audioFilePath ? `/uploads/${path.basename(audioFilePath)}` : null,
          status: 'pending',
          visit_date: new Date().toISOString().split('T')[0]
        }
      ])
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting visit:', insertError.message);
      return res.status(400).json({ error: `Failed to create visit log: ${insertError.message}` });
    }

    return res.status(201).json({
      success: true,
      data: visit,
      filePath: audioFilePath
    });
  } catch (err) {
    console.error('Server error in POST /api/visits/upload:', err.message);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

/**
 * POST /api/visits/:id/process
 * Orchestrates Groq AI processing (Transcription -> Myth Detection -> Symptom Extraction & Risk Timeline update)
 * Keeps transcription and analysis decoupled into separate functions.
 */
router.post('/:id/process', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing.' });
    }

    const token = authHeader.replace('Bearer ', '');
    const userClient = createUserClient(token);
    const visitId = req.params.id;

    // 1. Fetch visit details
    const { data: visit, error: fetchError } = await userClient
      .from('visits')
      .select('*, patients(*)')
      .eq('id', visitId)
      .single();

    if (fetchError || !visit) {
      return res.status(404).json({ error: `Visit record not found: ${fetchError?.message}` });
    }

    let audioPath = req.body.audioFilePath;
    if (!audioPath && visit.audio_url) {
      audioPath = path.join(process.cwd(), visit.audio_url);
    }

    // 2. STEP A: Single-purpose Audio Transcription
    let transcriptText = visit.transcript;
    if (!transcriptText || transcriptText.trim() === '') {
      console.log(`🎙️ Initiating Groq Whisper transcription for Visit ID: ${visitId}`);
      try {
        transcriptText = await transcribeAudio(audioPath);
      } catch (transcribeError) {
        console.warn(`Transcription error: ${transcribeError.message}. Proceeding with default transcript.`);
        transcriptText = req.body.fallbackTranscript || 'Patient presented for routine maternal checkup during pregnancy.';
      }
    }

    // Update visit with transcript & status
    await userClient
      .from('visits')
      .update({ transcript: transcriptText, status: 'transcribed' })
      .eq('id', visitId);

    // 3. Fetch reference myths from Database
    const { data: referenceMyths } = await userClient
      .from('pregnancy_myths')
      .select('*');

    // 4+5. Run Myth Detection AND Symptom Extraction concurrently via Promise.all
    console.log(`🔀 Running myth-check + symptom extraction in parallel for Visit ID: ${visitId}`);
    const gestationalWeeks = visit.patients?.gestational_weeks || 20;

    const [detectedMythList, symptomAnalysis] = await Promise.all([
      detectMyths(transcriptText, referenceMyths || []),
      extractSymptoms(transcriptText, gestationalWeeks)
    ]);

    // Persist myth detection results
    const insertedMyths = [];
    if (detectedMythList && detectedMythList.length > 0) {
      const mythRows = detectedMythList.map(m => ({
        visit_id: visitId,
        patient_id: visit.patient_id,
        asha_worker_id: visit.asha_worker_id,
        myth_id: m.myth_id || null,
        extracted_quote: m.extracted_quote,
        explanation: m.explanation,
        severity_impact: m.severity_impact || 'medium'
      }));

      const { data: inserted, error: mythErr } = await userClient
        .from('detected_myths')
        .insert(mythRows)
        .select();

      if (!mythErr && inserted) {
        insertedMyths.push(...inserted);
      }
    }

    const insertedSymptoms = [];
    if (symptomAnalysis.extracted_symptoms && symptomAnalysis.extracted_symptoms.length > 0) {
      const riskRows = symptomAnalysis.extracted_symptoms.map(s => ({
        patient_id: visit.patient_id,
        visit_id: visitId,
        asha_worker_id: visit.asha_worker_id,
        symptom_name: s.symptom_name,
        severity: s.severity,
        gestational_week: gestationalWeeks,
        flag_description: s.flag_description,
        recommended_asha_action: s.recommended_asha_action,
        requires_doctor_referral: s.requires_doctor_referral
      }));

      const { data: insertedRisk, error: riskErr } = await userClient
        .from('risk_timeline')
        .insert(riskRows)
        .select();

      if (!riskErr && insertedRisk) {
        insertedSymptoms.push(...insertedRisk);
      }
    }

    // Calculate new progressive risk score for the patient
    let riskScoringResult = null;
    try {
      console.log(`📈 Calculating progressive risk score for patient: ${visit.patient_id}`);
      riskScoringResult = await calculateRiskScore(visit.patient_id);
    } catch (scoringError) {
      console.error(`⚠️ Risk scoring failed: ${scoringError.message}`);
    }

    // Update final visit status and summary
    const { data: finalVisit, error: updateErr } = await userClient
      .from('visits')
      .update({
        status: 'analyzed',
        summary: symptomAnalysis.summary
      })
      .eq('id', visitId)
      .select()
      .single();

    return res.json({
      success: true,
      data: {
        visit: finalVisit || visit,
        transcript: transcriptText,
        detected_myths: insertedMyths.length > 0 ? insertedMyths : detectedMythList,
        risk_timeline_entries: insertedSymptoms.length > 0 ? insertedSymptoms : symptomAnalysis.extracted_symptoms,
        summary: symptomAnalysis.summary,
        risk_scoring_breakdown: riskScoringResult
      }
    });

  } catch (err) {
    console.error('Server error in POST /api/visits/:id/process:', err.message);
    return res.status(500).json({ error: `AI processing failed: ${err.message}` });
  }
});

/**
 * GET /api/visits
 * Retrieves all visits for the authenticated ASHA worker
 */
router.get('/', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing.' });
    }

    const token = authHeader.replace('Bearer ', '');
    const userClient = createUserClient(token);

    const { data: visits, error } = await userClient
      .from('visits')
      .select('*, patients(name, gestational_weeks, risk_level), risk_timeline(*)')
      .order('visit_date', { ascending: false });

    if (error) {
      console.error('Error fetching all visits:', error.message);
      return res.status(400).json({ error: `Failed to retrieve visits: ${error.message}` });
    }

    return res.json({ success: true, data: visits });
  } catch (err) {
    console.error('Server error in GET /api/visits:', err.message);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

/**
 * GET /api/visits/patient/:patientId
 * Retrieves visit history for a specific patient
 */
router.get('/patient/:patientId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing.' });
    }

    const token = authHeader.replace('Bearer ', '');
    const userClient = createUserClient(token);
    const patientId = req.params.patientId;

    const { data: visits, error } = await userClient
      .from('visits')
      .select('*')
      .eq('patient_id', patientId)
      .order('visit_date', { ascending: false });

    if (error) {
      console.error('Error fetching patient visits:', error.message);
      return res.status(400).json({ error: `Failed to retrieve visits: ${error.message}` });
    }

    return res.json({ success: true, data: visits });
  } catch (err) {
    console.error('Server error in GET /api/visits/patient/:patientId:', err.message);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

/**
 * GET /api/visits/:id
 * Retrieves full single visit details including detected myths & symptoms
 */
router.get('/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing.' });
    }

    const token = authHeader.replace('Bearer ', '');
    const userClient = createUserClient(token);
    const visitId = req.params.id;

    const { data: visit, error: vErr } = await userClient
      .from('visits')
      .select('*, patients(*)')
      .eq('id', visitId)
      .single();

    if (vErr || !visit) {
      return res.status(404).json({ error: 'Visit record not found.' });
    }

    const { data: myths } = await userClient
      .from('detected_myths')
      .select('*, pregnancy_myths(*)')
      .eq('visit_id', visitId);

    const { data: symptoms } = await userClient
      .from('risk_timeline')
      .select('*')
      .eq('visit_id', visitId);

    return res.json({
      success: true,
      data: {
        ...visit,
        detected_myths: myths || [],
        symptoms: symptoms || []
      }
    });
  } catch (err) {
    console.error('Server error in GET /api/visits/:id:', err.message);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

export default router;
