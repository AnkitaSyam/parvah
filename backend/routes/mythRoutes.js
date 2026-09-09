import express from 'express';
import { requireAuth, asyncRoute } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/myths
 * The pregnancy myth reference catalog.
 */
router.get('/', requireAuth, asyncRoute(async (req, res) => {
  const { data: myths, error } = await req.userClient
    .from('pregnancy_myths')
    .select('id, external_id, myth_title, common_myth, medical_fact, counseling_guidance, category, source, source_url')
    .order('category', { ascending: true });

  if (error) {
    return res.status(400).json({ error: 'MYTHS_FETCH_FAILED', message: error.message });
  }
  return res.json({ success: true, data: myths });
}));

/**
 * GET /api/myths/detected
 * Every myth detected across this worker's caseload.
 */
router.get('/detected', requireAuth, asyncRoute(async (req, res) => {
  const { data: detected, error } = await req.userClient
    .from('detected_myths')
    .select('*, patients(id, name, village), pregnancy_myths(myth_title, category, medical_fact, source, source_url)')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(400).json({ error: 'DETECTED_MYTHS_FETCH_FAILED', message: error.message });
  }
  return res.json({ success: true, data: detected });
}));

/**
 * PATCH /api/myths/detected/:id
 * Marks a detected myth as counselled.
 *
 * "Mark as Counselled" was previously component state that vanished on
 * refresh — detected_myths.is_addressed existed in the schema and no endpoint
 * ever wrote to it, so cross-visit follow-up was not actually tracked.
 */
router.patch('/detected/:id', requireAuth, asyncRoute(async (req, res) => {
  const { is_addressed } = req.body;

  if (typeof is_addressed !== 'boolean') {
    return res.status(400).json({
      error: 'INVALID_BODY',
      message: 'Send { "is_addressed": true } or { "is_addressed": false }.'
    });
  }

  const { data, error } = await req.userClient
    .from('detected_myths')
    .update({
      is_addressed,
      addressed_at: is_addressed ? new Date().toISOString() : null
    })
    .eq('id', req.params.id)
    .select()
    .maybeSingle();

  if (error) {
    return res.status(400).json({ error: 'MYTH_UPDATE_FAILED', message: error.message });
  }
  if (!data) {
    return res.status(404).json({ error: 'MYTH_NOT_FOUND', message: 'That detection is not on your list.' });
  }

  return res.json({ success: true, data });
}));

export default router;
