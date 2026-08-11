/**
 * backend/routes/calls.js
 *
 * DEPRECATED PIPELINE — this router is kept only so that any
 * external integrations or tests that still hit /api/calls/upload
 * receive a clear 301 redirect to the canonical visits pipeline.
 *
 * The single source of truth for audio upload + AI analysis is:
 *   POST /api/visits/upload      → create visit record & upload audio
 *   POST /api/visits/:id/process → transcribe + myth-check + symptom extract
 *
 * UploadTest.jsx has been updated to use the visits pipeline directly.
 */

import express from 'express';

const router = express.Router();

router.post('/upload', (req, res) => {
  return res.status(301).json({
    error: 'PIPELINE_DEPRECATED',
    message:
      'POST /api/calls/upload is retired. Use POST /api/visits/upload ' +
      'followed by POST /api/visits/:id/process for the full ' +
      'transcription + myth-check + symptom-extraction pipeline.',
    canonical_upload: '/api/visits/upload',
    canonical_process: '/api/visits/:id/process'
  });
});

export default router;
