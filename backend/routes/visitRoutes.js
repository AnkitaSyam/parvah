import express from 'express';
import multer from 'multer';
import { requireAuth, asyncRoute } from '../middleware/auth.js';
import { rateLimit } from '../middleware/security.js';
import {
  uploadAudioFile, getSignedAudioUrl, downloadToTempFile, removeTempFile,
  deleteAudioFile, MAX_AUDIO_BYTES, ALLOWED_AUDIO_MIME
} from '../services/storage.js';
import { transcribeAudio, TranscriptionError } from '../services/groqTranscription.js';
import { detectMyths } from '../services/groqMythDetector.js';
import { extractSymptoms } from '../services/groqSymptomExtractor.js';
import { calculateRiskScore } from '../services/riskScoring.js';
import { currentGestationalWeeks, postpartumDay } from '../services/careSchedule.js';

const router = express.Router();

/**
 * Audio is buffered in memory and streamed straight to private Supabase
 * Storage. It is never written to local disk, which was both a PHI exposure
 * (served publicly at /uploads) and unreliable (wiped on every redeploy).
 *
 * The size limit and MIME filter are enforced by multer *before* the file is
 * read, and requireAuth runs before multer, so an unauthenticated request can
 * no longer make the server buffer an arbitrary payload.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_AUDIO_MIME.includes(file.mimetype) || /^audio\//.test(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error(`Unsupported audio type "${file.mimetype}". Use WebM, MP3, WAV, M4A or OGG.`));
  }
});

/** Turns multer's terse errors into something a person can act on. */
function handleUploadErrors(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'FILE_TOO_LARGE',
        message: `That recording is larger than ${MAX_AUDIO_BYTES / 1048576} MB. Record a shorter visit or upload a compressed file.`
      });
    }
    return res.status(400).json({ error: 'UPLOAD_FAILED', message: err.message });
  }
  if (err) {
    return res.status(400).json({ error: 'UPLOAD_REJECTED', message: err.message });
  }
  next();
}

const processLimiter = rateLimit({
  windowMs: 60_000,
  max: 12,
  message: 'Too many analyses in the last minute. Wait a moment before running another.'
});

const uploadLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  message: 'Too many uploads in the last minute. Wait a moment and try again.'
});

/**
 * Determines the care stage for a visit from the patient record.
 */
function stageForPatient(patient) {
  return patient?.stage === 'postpartum' && patient?.delivery_date ? 'postpartum' : 'antenatal';
}

/**
 * POST /api/visits/upload
 * Stores the recording privately and creates the visit row.
 */
router.post(
  '/upload',
  requireAuth,
  uploadLimiter,
  upload.single('audio'),
  handleUploadErrors,
  asyncRoute(async (req, res) => {
    const { patient_id } = req.body;

    if (!patient_id) {
      return res.status(400).json({ error: 'PATIENT_REQUIRED', message: 'Select a patient before saving this visit.' });
    }

    // RLS confirms this worker owns the patient; a 404 here means either the
    // patient does not exist or it belongs to someone else — deliberately
    // indistinguishable, so the endpoint cannot be used to probe for ids.
    const { data: patient, error: patientError } = await req.userClient
      .from('patients')
      .select('id, stage, delivery_date')
      .eq('id', patient_id)
      .maybeSingle();

    if (patientError) {
      return res.status(400).json({ error: 'PATIENT_LOOKUP_FAILED', message: patientError.message });
    }
    if (!patient) {
      return res.status(404).json({ error: 'PATIENT_NOT_FOUND', message: 'That patient is not on your list.' });
    }

    let stored = null;
    if (req.file) {
      try {
        stored = await uploadAudioFile(req.file, patient_id);
      } catch (storageError) {
        return res.status(502).json({ error: 'STORAGE_FAILED', message: storageError.message });
      }
    }

    const { data: visit, error: insertError } = await req.userClient
      .from('visits')
      .insert([{
        patient_id,
        asha_worker_id: req.user.id,
        audio_storage_path: stored?.path || null,
        status: 'pending',
        stage: stageForPatient(patient),
        visit_date: new Date().toISOString().split('T')[0]
      }])
      .select()
      .single();

    if (insertError) {
      // Do not orphan the uploaded object if the row could not be written.
      if (stored?.path) await deleteAudioFile(stored.path);
      console.error('Failed to insert visit:', insertError);
      return res.status(400).json({ error: 'VISIT_CREATE_FAILED', message: insertError.message });
    }

    return res.status(201).json({ success: true, data: visit });
  })
);

/**
 * POST /api/visits/:id/process
 * Transcribe → (myth detection ‖ symptom extraction) → persist → rescore.
 */
router.post(
  '/:id/process',
  requireAuth,
  processLimiter,
  asyncRoute(async (req, res) => {
    const visitId = req.params.id;
    let tempAudioPath = null;

    const { data: visit, error: fetchError } = await req.userClient
      .from('visits')
      .select('*, patients(*)')
      .eq('id', visitId)
      .maybeSingle();

    if (fetchError) {
      return res.status(400).json({ error: 'VISIT_LOOKUP_FAILED', message: fetchError.message });
    }
    if (!visit) {
      return res.status(404).json({ error: 'VISIT_NOT_FOUND', message: 'That visit is not on your list.' });
    }

    const patient = visit.patients || {};
    const stage = visit.stage || stageForPatient(patient);
    const gestationalWeeks = currentGestationalWeeks(patient) ?? patient.gestational_weeks ?? 20;
    const ppDay = postpartumDay(patient);

    try {
      // ── 1. Transcription ──────────────────────────────────────────────
      let transcriptText = visit.transcript;
      let transcriptLanguage = visit.transcript_language || null;

      if (!transcriptText || !transcriptText.trim()) {
        const fallback = typeof req.body?.fallbackTranscript === 'string'
          ? req.body.fallbackTranscript.trim()
          : '';

        if (visit.audio_storage_path) {
          try {
            tempAudioPath = await downloadToTempFile(visit.audio_storage_path);
            const result = await transcribeAudio(tempAudioPath);
            transcriptText = result.transcript;
            transcriptLanguage = result.language;
          } catch (transcribeError) {
            // A typed transcription failure is reported, not silently replaced
            // with a mock transcript — that previously produced fabricated
            // clinical content for visits whose audio had been wiped.
            if (!fallback) {
              await req.userClient
                .from('visits')
                .update({ status: 'error', processing_error: transcribeError.message })
                .eq('id', visitId);

              const status = transcribeError instanceof TranscriptionError ? transcribeError.statusCode : 502;
              return res.status(status).json({
                error: transcribeError.errorType || 'TRANSCRIBE_FAILED',
                message: transcribeError.message
              });
            }
            console.warn(`Transcription failed (${transcribeError.message}); using the typed transcript instead.`);
            transcriptText = fallback;
          }
        } else if (fallback) {
          transcriptText = fallback;
        } else {
          return res.status(400).json({
            error: 'NO_CONTENT',
            message: 'This visit has no recording and no typed notes. Record audio or type what was discussed.'
          });
        }
      }

      await req.userClient
        .from('visits')
        .update({
          transcript: transcriptText,
          transcript_language: transcriptLanguage,
          status: 'transcribed',
          processing_error: null
        })
        .eq('id', visitId);

      // ── 2. Reference myths (last-resort context for the detector) ──────
      const { data: referenceMyths } = await req.userClient
        .from('pregnancy_myths')
        .select('id, external_id, myth_title, common_myth, medical_fact, counseling_guidance, category');

      // ── 3. Myth detection ‖ symptom extraction ─────────────────────────
      const language = patient.preferred_language || transcriptLanguage || 'hi';

      const [mythResult, symptomAnalysis] = await Promise.all([
        detectMyths(transcriptText, referenceMyths || [], { language, stage }),
        extractSymptoms(transcriptText, { stage, gestationalWeeks, postpartumDay: ppDay })
      ]);

      const detectedMythList = mythResult.detected_myths || [];
      const hesitancy = mythResult.immunization_hesitancy || null;

      // ── 4. Persist detected myths ──────────────────────────────────────
      // The LLM returns the catalog's *external_id* ("myth_papaya"), but
      // detected_myths.myth_id is a UUID foreign key. Writing the string
      // straight in failed with 22P02 on every matched myth, and the error
      // was swallowed — so no myth ever persisted. Resolve it here.
      const byExternalId = new Map((referenceMyths || []).map((m) => [m.external_id, m.id]));
      const byUuid = new Set((referenceMyths || []).map((m) => m.id));

      let insertedMyths = [];
      let mythPersistError = null;

      if (detectedMythList.length > 0) {
        const mythRows = detectedMythList.map((m) => {
          const raw = m.myth_id || null;
          const resolvedUuid = raw && byUuid.has(raw) ? raw : (raw ? byExternalId.get(raw) || null : null);

          return {
            visit_id: visitId,
            patient_id: visit.patient_id,
            asha_worker_id: visit.asha_worker_id,
            myth_id: resolvedUuid,
            myth_external_id: raw && !byUuid.has(raw) ? raw : null,
            extracted_quote: m.extracted_quote,
            explanation: m.explanation,
            counseling_script: m.counseling_script || null,
            severity_impact: m.severity_impact || 'medium'
          };
        });

        const { data: inserted, error: mythErr } = await req.userClient
          .from('detected_myths')
          .insert(mythRows)
          .select('*, pregnancy_myths(myth_title, category, medical_fact, source, source_url)');

        if (mythErr) {
          // Surfaced rather than swallowed.
          mythPersistError = mythErr.message;
          console.error('Failed to persist detected myths:', mythErr);
        } else {
          insertedMyths = inserted || [];
        }
      }

      // ── 5. Persist risk timeline entries ───────────────────────────────
      let insertedSymptoms = [];
      let symptomPersistError = null;
      const extracted = symptomAnalysis.extracted_symptoms || [];

      if (extracted.length > 0) {
        const riskRows = extracted.map((s) => ({
          patient_id: visit.patient_id,
          visit_id: visitId,
          asha_worker_id: visit.asha_worker_id,
          symptom_name: s.symptom_name,
          severity: s.severity,
          stage,
          gestational_week: stage === 'antenatal' ? gestationalWeeks : null,
          postpartum_day: stage === 'postpartum' ? ppDay : null,
          flag_description: s.flag_description,
          recommended_asha_action: s.recommended_asha_action,
          requires_doctor_referral: s.requires_doctor_referral
        }));

        const { data: insertedRisk, error: riskErr } = await req.userClient
          .from('risk_timeline')
          .insert(riskRows)
          .select();

        if (riskErr) {
          symptomPersistError = riskErr.message;
          console.error('Failed to persist risk timeline entries:', riskErr);
        } else {
          insertedSymptoms = insertedRisk || [];
        }
      }

      // ── 6. Immunization hesitancy → pending refusal record ─────────────
      if (hesitancy?.detected && stage === 'postpartum') {
        const { error: hesErr } = await req.userClient
          .from('immunization_records')
          .upsert({
            patient_id: visit.patient_id,
            asha_worker_id: visit.asha_worker_id,
            vaccine_code: (hesitancy.vaccines_mentioned?.[0] || 'GENERAL').toUpperCase(),
            status: 'refused',
            refusal_reason: hesitancy.stated_reason || 'Reluctance expressed during a home visit.',
            detected_from_visit_id: visitId,
            notes: hesitancy.counseling_script || null,
            updated_at: new Date().toISOString()
          }, { onConflict: 'patient_id,vaccine_code' });

        if (hesErr) console.error('Failed to record immunization hesitancy:', hesErr);
      }

      // ── 7. Rescore ─────────────────────────────────────────────────────
      let riskScoringResult = null;
      let scoringError = null;
      try {
        riskScoringResult = await calculateRiskScore(visit.patient_id);
      } catch (err) {
        scoringError = err.message;
        console.error(`Risk scoring failed for patient ${visit.patient_id}:`, err.message);
      }

      // ── 8. Finalise the visit ──────────────────────────────────────────
      const { data: finalVisit } = await req.userClient
        .from('visits')
        .update({ status: 'analyzed', summary: symptomAnalysis.summary })
        .eq('id', visitId)
        .select()
        .single();

      return res.json({
        success: true,
        data: {
          visit: finalVisit || visit,
          transcript: transcriptText,
          transcript_language: transcriptLanguage,
          stage,
          detected_myths: insertedMyths.length > 0 ? insertedMyths : detectedMythList,
          immunization_hesitancy: hesitancy,
          risk_timeline_entries: insertedSymptoms.length > 0 ? insertedSymptoms : extracted,
          summary: symptomAnalysis.summary,
          has_red_flag: symptomAnalysis.has_red_flag,
          analysis_mode: symptomAnalysis.mode,
          risk_scoring_breakdown: riskScoringResult,
          warnings: [
            mythPersistError && `Detected myths could not be saved: ${mythPersistError}`,
            symptomPersistError && `Symptoms could not be saved: ${symptomPersistError}`,
            scoringError && `Risk score could not be updated: ${scoringError}`
          ].filter(Boolean)
        }
      });
    } finally {
      await removeTempFile(tempAudioPath);
    }
  })
);

/**
 * GET /api/visits
 * All visits for the authenticated worker.
 */
router.get('/', requireAuth, asyncRoute(async (req, res) => {
  const { data: visits, error } = await req.userClient
    .from('visits')
    .select('*, patients(id, name, gestational_weeks, risk_level, stage, delivery_date), risk_timeline(*)')
    .order('visit_date', { ascending: false })
    .limit(200);

  if (error) {
    return res.status(400).json({ error: 'VISITS_FETCH_FAILED', message: error.message });
  }
  return res.json({ success: true, data: visits });
}));

/**
 * GET /api/visits/patient/:patientId
 */
router.get('/patient/:patientId', requireAuth, asyncRoute(async (req, res) => {
  const { data: visits, error } = await req.userClient
    .from('visits')
    .select('*')
    .eq('patient_id', req.params.patientId)
    .order('visit_date', { ascending: false });

  if (error) {
    return res.status(400).json({ error: 'VISITS_FETCH_FAILED', message: error.message });
  }
  return res.json({ success: true, data: visits });
}));

/**
 * GET /api/visits/:id
 * Full visit detail, including a short-lived signed URL for audio playback.
 */
router.get('/:id', requireAuth, asyncRoute(async (req, res) => {
  const visitId = req.params.id;

  const { data: visit, error: vErr } = await req.userClient
    .from('visits')
    .select('*, patients(*)')
    .eq('id', visitId)
    .maybeSingle();

  if (vErr) {
    return res.status(400).json({ error: 'VISIT_LOOKUP_FAILED', message: vErr.message });
  }
  if (!visit) {
    return res.status(404).json({ error: 'VISIT_NOT_FOUND', message: 'That visit is not on your list.' });
  }

  const [{ data: myths }, { data: symptoms }] = await Promise.all([
    req.userClient
      .from('detected_myths')
      .select('*, pregnancy_myths(myth_title, category, medical_fact, source, source_url)')
      .eq('visit_id', visitId),
    req.userClient
      .from('risk_timeline')
      .select('*')
      .eq('visit_id', visitId)
  ]);

  // RLS already proved ownership above, so signing here is safe.
  const audioUrl = visit.audio_storage_path
    ? await getSignedAudioUrl(visit.audio_storage_path)
    : null;

  return res.json({
    success: true,
    data: {
      ...visit,
      audio_url: audioUrl,
      detected_myths: myths || [],
      symptoms: symptoms || []
    }
  });
}));

export default router;
