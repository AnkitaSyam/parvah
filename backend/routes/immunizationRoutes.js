import express from 'express';
import { requireAuth, asyncRoute } from '../middleware/auth.js';
import { IMMUNIZATION_CATALOG, buildCareSchedule } from '../services/careSchedule.js';

const router = express.Router();

const VALID_CODES = new Set(IMMUNIZATION_CATALOG.map((v) => v.code).concat('GENERAL'));
const VALID_STATUS = ['pending', 'given', 'refused', 'unavailable'];

/**
 * GET /api/immunizations/catalog
 * India's National Immunization Schedule, as reference data.
 */
router.get('/catalog', requireAuth, asyncRoute(async (req, res) => {
  return res.json({ success: true, data: IMMUNIZATION_CATALOG });
}));

/**
 * GET /api/immunizations/patient/:patientId
 * Every dose for one child, merged with the computed due dates.
 */
router.get('/patient/:patientId', requireAuth, asyncRoute(async (req, res) => {
  const { data: patient, error: pErr } = await req.userClient
    .from('patients')
    .select('*')
    .eq('id', req.params.patientId)
    .maybeSingle();

  if (pErr) return res.status(400).json({ error: 'PATIENT_LOOKUP_FAILED', message: pErr.message });
  if (!patient) return res.status(404).json({ error: 'PATIENT_NOT_FOUND', message: 'That patient is not on your list.' });

  if (patient.stage !== 'postpartum') {
    return res.json({
      success: true,
      data: { items: [], message: 'Immunization tracking begins once the delivery is recorded.' }
    });
  }

  const { data: records, error } = await req.userClient
    .from('immunization_records')
    .select('*')
    .eq('patient_id', patient.id);

  if (error) return res.status(400).json({ error: 'IMMUNIZATION_FETCH_FAILED', message: error.message });

  const schedule = buildCareSchedule(patient, records || []);
  const items = schedule.items.filter((i) => i.kind === 'immunization');

  return res.json({
    success: true,
    data: {
      items,
      given: items.filter((i) => i.status === 'given').length,
      due: items.filter((i) => i.status === 'due').length,
      overdue: items.filter((i) => i.status === 'overdue').length,
      refused: items.filter((i) => i.status === 'refused').length,
      total: items.length
    }
  });
}));

/**
 * PUT /api/immunizations/patient/:patientId/:vaccineCode
 * Marks a dose given, refused or unavailable.
 *
 * Refusals matter more than dates here: a due date is already on the MCP card
 * and in U-WIN, but a family declining a dose is what actually needs a person
 * and an argument — and it is what the myth detector can surface from audio.
 */
router.put('/patient/:patientId/:vaccineCode', requireAuth, asyncRoute(async (req, res) => {
  const { patientId, vaccineCode } = req.params;
  const { status, given_date, refusal_reason, notes } = req.body;

  const code = String(vaccineCode).toUpperCase();

  if (!VALID_CODES.has(code)) {
    return res.status(400).json({ error: 'UNKNOWN_VACCINE', message: `"${code}" is not in the National Immunization Schedule.` });
  }
  if (!VALID_STATUS.includes(status)) {
    return res.status(400).json({ error: 'STATUS_INVALID', message: `Status must be one of: ${VALID_STATUS.join(', ')}.` });
  }
  if (status === 'given' && !given_date) {
    return res.status(400).json({ error: 'DATE_REQUIRED', message: 'Enter the date the dose was given.' });
  }

  // Confirms ownership through RLS before writing.
  const { data: patient, error: pErr } = await req.userClient
    .from('patients')
    .select('id, stage')
    .eq('id', patientId)
    .maybeSingle();

  if (pErr) return res.status(400).json({ error: 'PATIENT_LOOKUP_FAILED', message: pErr.message });
  if (!patient) return res.status(404).json({ error: 'PATIENT_NOT_FOUND', message: 'That patient is not on your list.' });

  const { data, error } = await req.userClient
    .from('immunization_records')
    .upsert({
      patient_id: patientId,
      asha_worker_id: req.user.id,
      vaccine_code: code,
      status,
      given_date: status === 'given' ? given_date : null,
      refusal_reason: status === 'refused' ? (refusal_reason || 'No reason recorded.') : null,
      notes: notes || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'patient_id,vaccine_code' })
    .select()
    .single();

  if (error) {
    console.error('Failed to save immunization record:', error);
    return res.status(400).json({ error: 'IMMUNIZATION_SAVE_FAILED', message: error.message });
  }

  return res.json({ success: true, data });
}));

/**
 * GET /api/immunizations/hesitancy
 * Every refusal across the worker's caseload — the follow-up worklist.
 */
router.get('/hesitancy', requireAuth, asyncRoute(async (req, res) => {
  const { data, error } = await req.userClient
    .from('immunization_records')
    .select('*, patients(id, name, village, baby_name, delivery_date)')
    .eq('status', 'refused')
    .order('updated_at', { ascending: false });

  if (error) return res.status(400).json({ error: 'HESITANCY_FETCH_FAILED', message: error.message });
  return res.json({ success: true, data });
}));

export default router;
