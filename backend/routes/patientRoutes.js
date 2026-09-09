import express from 'express';
import { requireAuth, asyncRoute } from '../middleware/auth.js';
import { buildCareSchedule, scheduleHeadline, currentGestationalWeeks, postpartumDay } from '../services/careSchedule.js';
import { calculateRiskScore } from '../services/riskScoring.js';

const router = express.Router();

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];
const LANGUAGES = ['en', 'hi'];

/** Coerces a value to an integer within range, or returns null. */
function intInRange(value, min, max) {
  if (value === undefined || value === null || value === '') return null;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/** Indian mobile numbers, tolerant of spaces, +91 and a leading 0. */
function normalizePhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/[^\d]/g, '');
  const local = digits.replace(/^(91|0)/, '');
  if (local.length !== 10) return null;
  return `+91${local}`;
}

/**
 * GET /api/patients
 * Patients assigned to the authenticated ASHA worker, each with a derived
 * care-schedule headline so the list can show what is actually due.
 */
router.get('/', requireAuth, asyncRoute(async (req, res) => {
  const { data: patients, error } = await req.userClient
    .from('patients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(400).json({ error: 'PATIENTS_FETCH_FAILED', message: error.message });
  }

  const ids = (patients || []).map((p) => p.id);
  let recordsByPatient = new Map();

  if (ids.length > 0) {
    const { data: records } = await req.userClient
      .from('immunization_records')
      .select('*')
      .in('patient_id', ids);

    recordsByPatient = (records || []).reduce((map, r) => {
      if (!map.has(r.patient_id)) map.set(r.patient_id, []);
      map.get(r.patient_id).push(r);
      return map;
    }, new Map());
  }

  const enriched = (patients || []).map((p) => {
    const schedule = buildCareSchedule(p, recordsByPatient.get(p.id) || []);
    return {
      ...p,
      current_gestational_weeks: currentGestationalWeeks(p),
      postpartum_day: postpartumDay(p),
      schedule_headline: scheduleHeadline(schedule),
      overdue_count: schedule.overdue_count,
      due_count: schedule.due_count,
      refused_count: schedule.refused_count
    };
  });

  return res.json({ success: true, data: enriched });
}));

/**
 * POST /api/patients
 * Registers a new patient assigned to the current ASHA worker.
 */
router.post('/', requireAuth, asyncRoute(async (req, res) => {
  const {
    name, age, gestational_weeks, gravida, para, village,
    contact_phone, emergency_contact, blood_group, preferred_language
  } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'NAME_REQUIRED', message: "Enter the patient's name." });
  }

  // Age was previously required, validated, and then silently dropped from
  // the insert — the column did not exist. It is now stored and feeds the
  // baseline risk score (<18 and >=35 both raise obstetric risk).
  const parsedAge = intInRange(age, 10, 60);
  if (parsedAge === null) {
    return res.status(400).json({ error: 'AGE_INVALID', message: 'Enter an age between 10 and 60.' });
  }

  const phone = normalizePhone(contact_phone);
  if (phone === null) {
    return res.status(400).json({ error: 'PHONE_INVALID', message: 'Enter a 10-digit mobile number, or leave it blank.' });
  }

  const emergencyPhone = normalizePhone(emergency_contact);
  if (emergencyPhone === null) {
    return res.status(400).json({ error: 'EMERGENCY_PHONE_INVALID', message: 'Enter a 10-digit emergency number, or leave it blank.' });
  }

  const { data: newPatient, error: insertError } = await req.userClient
    .from('patients')
    .insert([{
      asha_worker_id: req.user.id,
      name: String(name).trim(),
      age: parsedAge,
      gestational_weeks: intInRange(gestational_weeks, 1, 45) ?? 12,
      gravida: intInRange(gravida, 1, 20) ?? 1,
      para: intInRange(para, 0, 20) ?? 0,
      village: village ? String(village).trim() : '',
      contact_phone: phone,
      emergency_contact: emergencyPhone,
      blood_group: BLOOD_GROUPS.includes(blood_group) ? blood_group : 'Unknown',
      preferred_language: LANGUAGES.includes(preferred_language) ? preferred_language : 'hi',
      stage: 'antenatal'
    }])
    .select()
    .single();

  if (insertError) {
    console.error('Failed to create patient:', insertError);
    return res.status(400).json({ error: 'PATIENT_CREATE_FAILED', message: insertError.message });
  }

  return res.status(201).json({ success: true, data: newPatient });
}));

/**
 * PATCH /api/patients/:id
 * Updates editable demographic fields.
 */
router.patch('/:id', requireAuth, asyncRoute(async (req, res) => {
  const allowed = ['name', 'age', 'gestational_weeks', 'gravida', 'para', 'village',
                   'contact_phone', 'emergency_contact', 'blood_group', 'preferred_language'];

  const updates = {};
  for (const key of allowed) {
    if (req.body[key] === undefined) continue;

    if (key === 'age') {
      const v = intInRange(req.body.age, 10, 60);
      if (v === null) return res.status(400).json({ error: 'AGE_INVALID', message: 'Enter an age between 10 and 60.' });
      updates.age = v;
    } else if (['gestational_weeks', 'gravida', 'para'].includes(key)) {
      updates[key] = intInRange(req.body[key], 0, 45);
    } else if (['contact_phone', 'emergency_contact'].includes(key)) {
      const p = normalizePhone(req.body[key]);
      if (p === null) return res.status(400).json({ error: 'PHONE_INVALID', message: 'Enter a 10-digit mobile number, or leave it blank.' });
      updates[key] = p;
    } else {
      updates[key] = req.body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'NOTHING_TO_UPDATE', message: 'No editable fields were supplied.' });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await req.userClient
    .from('patients')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .maybeSingle();

  if (error) return res.status(400).json({ error: 'PATIENT_UPDATE_FAILED', message: error.message });
  if (!data) return res.status(404).json({ error: 'PATIENT_NOT_FOUND', message: 'That patient is not on your list.' });

  // Age changes move the baseline risk, so rescore.
  if (updates.age !== undefined) {
    try { await calculateRiskScore(req.params.id); } catch { /* non-fatal */ }
  }

  return res.json({ success: true, data });
}));

/**
 * POST /api/patients/:id/delivery
 * Records the delivery and moves the patient from antenatal to postpartum
 * care. This is the transition the app previously had no concept of — the
 * record simply stopped at delivery, which is where most maternal deaths
 * actually occur.
 */
router.post('/:id/delivery', requireAuth, asyncRoute(async (req, res) => {
  const {
    delivery_date, delivery_outcome, delivery_place,
    baby_name, baby_sex, baby_birth_weight_kg
  } = req.body;

  if (!delivery_date) {
    return res.status(400).json({ error: 'DATE_REQUIRED', message: 'Enter the date of delivery.' });
  }

  const delivered = new Date(delivery_date);
  if (Number.isNaN(delivered.getTime())) {
    return res.status(400).json({ error: 'DATE_INVALID', message: 'That delivery date could not be read.' });
  }

  const today = new Date(); today.setHours(23, 59, 59, 999);
  if (delivered > today) {
    return res.status(400).json({ error: 'DATE_IN_FUTURE', message: 'The delivery date cannot be in the future.' });
  }

  if (!['live_birth', 'stillbirth', 'neonatal_death'].includes(delivery_outcome)) {
    return res.status(400).json({ error: 'OUTCOME_REQUIRED', message: 'Select the delivery outcome.' });
  }

  if (delivery_place && !['institutional', 'home', 'in_transit'].includes(delivery_place)) {
    return res.status(400).json({ error: 'PLACE_INVALID', message: 'Select where the delivery took place.' });
  }

  const weight = baby_birth_weight_kg === undefined || baby_birth_weight_kg === null || baby_birth_weight_kg === ''
    ? null
    : Number(baby_birth_weight_kg);

  if (weight !== null && (!Number.isFinite(weight) || weight < 0.3 || weight > 7)) {
    return res.status(400).json({ error: 'WEIGHT_INVALID', message: 'Enter a birth weight between 0.3 and 7 kg.' });
  }

  const { data, error } = await req.userClient
    .from('patients')
    .update({
      stage: 'postpartum',
      delivery_date: delivered.toISOString().split('T')[0],
      delivery_outcome,
      delivery_place: delivery_place || null,
      baby_name: baby_name ? String(baby_name).trim() : null,
      baby_sex: ['female', 'male', 'other'].includes(baby_sex) ? baby_sex : null,
      baby_birth_weight_kg: weight,
      updated_at: new Date().toISOString()
    })
    .eq('id', req.params.id)
    .select()
    .maybeSingle();

  if (error) return res.status(400).json({ error: 'DELIVERY_UPDATE_FAILED', message: error.message });
  if (!data) return res.status(404).json({ error: 'PATIENT_NOT_FOUND', message: 'That patient is not on your list.' });

  // Low birth weight is an HBNC danger sign in its own right and warrants
  // extra visits, so log it to the timeline rather than leaving it as a field.
  if (weight !== null && weight < 2.5 && delivery_outcome === 'live_birth') {
    await req.userClient.from('risk_timeline').insert([{
      patient_id: data.id,
      visit_id: null,
      asha_worker_id: req.user.id,
      symptom_name: 'Low Birth Weight Newborn',
      severity: weight < 2.0 ? 'severe' : 'moderate',
      stage: 'postpartum',
      postpartum_day: 0,
      flag_description: `Baby born at ${weight} kg. Below 2.5 kg requires extra thermal care, feeding support and closer HBNC follow-up.`,
      recommended_asha_action: 'Ensure skin-to-skin (kangaroo mother care) and exclusive breastfeeding. Weigh at every visit. Refer if the baby is not gaining weight or feeds poorly.',
      requires_doctor_referral: weight < 2.0
    }]).then(({ error: e }) => { if (e) console.error('Low birth weight flag failed:', e.message); });
  }

  const schedule = buildCareSchedule(data, []);
  return res.json({ success: true, data, schedule });
}));

/**
 * DELETE /api/patients/:id
 */
router.delete('/:id', requireAuth, asyncRoute(async (req, res) => {
  const { data, error } = await req.userClient
    .from('patients')
    .delete()
    .eq('id', req.params.id)
    .select()
    .maybeSingle();

  if (error) return res.status(400).json({ error: 'PATIENT_DELETE_FAILED', message: error.message });
  if (!data) return res.status(404).json({ error: 'PATIENT_NOT_FOUND', message: 'That patient is not on your list.' });

  return res.json({ success: true, data });
}));

/**
 * GET /api/patients/:id/schedule
 * ANC / HBNC / immunization schedule with what is due, overdue or refused.
 */
router.get('/:id/schedule', requireAuth, asyncRoute(async (req, res) => {
  const { data: patient, error } = await req.userClient
    .from('patients')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) return res.status(400).json({ error: 'PATIENT_LOOKUP_FAILED', message: error.message });
  if (!patient) return res.status(404).json({ error: 'PATIENT_NOT_FOUND', message: 'That patient is not on your list.' });

  const { data: records } = await req.userClient
    .from('immunization_records')
    .select('*')
    .eq('patient_id', patient.id);

  const schedule = buildCareSchedule(patient, records || []);

  return res.json({
    success: true,
    data: { ...schedule, headline: scheduleHeadline(schedule) }
  });
}));

/**
 * GET /api/patients/:id/risk-timeline
 */
router.get('/:id/risk-timeline', requireAuth, asyncRoute(async (req, res) => {
  const { data: timeline, error } = await req.userClient
    .from('risk_timeline')
    .select('*')
    .eq('patient_id', req.params.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json({ error: 'TIMELINE_FETCH_FAILED', message: error.message });
  return res.json({ success: true, data: timeline });
}));

/**
 * GET /api/patients/:id/risk-score
 * Recomputes and returns the full explainable breakdown.
 */
router.get('/:id/risk-score', requireAuth, asyncRoute(async (req, res) => {
  const { data: patient, error } = await req.userClient
    .from('patients')
    .select('id')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) return res.status(400).json({ error: 'PATIENT_LOOKUP_FAILED', message: error.message });
  if (!patient) return res.status(404).json({ error: 'PATIENT_NOT_FOUND', message: 'That patient is not on your list.' });

  const breakdown = await calculateRiskScore(req.params.id);
  return res.json({ success: true, data: breakdown });
}));

/**
 * GET /api/patients/:id/myths
 */
router.get('/:id/myths', requireAuth, asyncRoute(async (req, res) => {
  const { data: myths, error } = await req.userClient
    .from('detected_myths')
    .select('*, pregnancy_myths(myth_title, category, medical_fact, source, source_url)')
    .eq('patient_id', req.params.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json({ error: 'MYTHS_FETCH_FAILED', message: error.message });
  return res.json({ success: true, data: myths });
}));

/**
 * GET /api/patients/:id/calls
 * Canonical route for a patient's visit records.
 */
router.get('/:id/calls', requireAuth, asyncRoute(async (req, res) => {
  const { data: visits, error } = await req.userClient
    .from('visits')
    .select('*, detected_myths(*), risk_timeline(*)')
    .eq('patient_id', req.params.id)
    .order('visit_date', { ascending: false });

  if (error) return res.status(400).json({ error: 'VISITS_FETCH_FAILED', message: error.message });
  return res.json({ success: true, data: visits });
}));

export default router;
