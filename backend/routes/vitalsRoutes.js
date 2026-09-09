import express from 'express';
import { requireAuth, asyncRoute } from '../middleware/auth.js';
import { gradeVitals, parseVitalsFromText, weightTrend, URINE_ALBUMIN_OPTIONS } from '../services/vitals.js';
import { calculateRiskScore } from '../services/riskScoring.js';
import { currentGestationalWeeks, postpartumDay } from '../services/careSchedule.js';
import {
  buildGrowthSummary, classifyWeightForAge, ageInDays, growthToRiskEntry
} from '../services/childGrowth.js';

const router = express.Router();

const VITAL_FIELDS = [
  'systolic_bp', 'diastolic_bp', 'pulse_bpm', 'temperature_c',
  'weight_kg', 'hemoglobin_gdl', 'urine_albumin', 'fundal_height_cm'
];

/** Coerces a numeric field, returning undefined for blanks and NaN for junk. */
function numeric(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

// ═══════════════════════════════════════════════════════════════════════════
// Maternal vitals
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/vitals
 * Records a set of vitals, grades them, and writes any concerning finding to
 * the risk timeline so it flows into the same risk score as everything else.
 *
 * Body: { patient_id, visit_id?, source?, notes?, ...vitals }
 */
router.post('/', requireAuth, asyncRoute(async (req, res) => {
  const { patient_id, visit_id, source, notes } = req.body;

  if (!patient_id) {
    return res.status(400).json({ error: 'PATIENT_REQUIRED', message: 'Select a patient before saving vitals.' });
  }

  const { data: patient, error: pErr } = await req.userClient
    .from('patients')
    .select('*')
    .eq('id', patient_id)
    .maybeSingle();

  if (pErr) return res.status(400).json({ error: 'PATIENT_LOOKUP_FAILED', message: pErr.message });
  if (!patient) return res.status(404).json({ error: 'PATIENT_NOT_FOUND', message: 'That patient is not on your list.' });

  // Collect and validate the supplied fields.
  const vitals = {};
  for (const field of VITAL_FIELDS) {
    if (field === 'urine_albumin') {
      if (req.body.urine_albumin) {
        if (!URINE_ALBUMIN_OPTIONS.includes(req.body.urine_albumin)) {
          return res.status(400).json({
            error: 'ALBUMIN_INVALID',
            message: `Urine albumin must be one of: ${URINE_ALBUMIN_OPTIONS.join(', ')}.`
          });
        }
        vitals.urine_albumin = req.body.urine_albumin;
      }
      continue;
    }

    const n = numeric(req.body[field]);
    if (n === undefined) continue;
    if (Number.isNaN(n)) {
      return res.status(400).json({ error: 'VALUE_INVALID', message: `"${field}" must be a number.` });
    }
    vitals[field] = n;
  }

  if (Object.keys(vitals).length === 0) {
    return res.status(400).json({ error: 'NOTHING_TO_SAVE', message: 'Enter at least one measurement.' });
  }

  // A half-entered blood pressure cannot be graded and is usually a mistake.
  const hasSys = vitals.systolic_bp !== undefined;
  const hasDia = vitals.diastolic_bp !== undefined;
  if (hasSys !== hasDia) {
    return res.status(400).json({
      error: 'BP_INCOMPLETE',
      message: 'Enter both the upper and lower blood pressure readings, or neither.'
    });
  }
  if (hasSys && hasDia && vitals.systolic_bp <= vitals.diastolic_bp) {
    return res.status(400).json({
      error: 'BP_ORDER',
      message: 'The upper reading must be higher than the lower one — they may have been swapped.'
    });
  }

  const stage = patient.stage === 'postpartum' ? 'postpartum' : 'antenatal';
  const gestWeek = currentGestationalWeeks(patient);
  const ppDay = postpartumDay(patient);

  const { data: saved, error: insertError } = await req.userClient
    .from('visit_vitals')
    .insert([{
      patient_id,
      visit_id: visit_id || null,
      asha_worker_id: req.user.id,
      stage,
      gestational_week: stage === 'antenatal' ? gestWeek : null,
      postpartum_day: stage === 'postpartum' ? ppDay : null,
      source: source === 'voice' ? 'voice' : 'manual',
      notes: notes || null,
      ...vitals
    }])
    .select()
    .single();

  if (insertError) {
    console.error('Failed to save vitals:', insertError);
    return res.status(400).json({ error: 'VITALS_SAVE_FAILED', message: insertError.message });
  }

  // Grade and push findings into the risk timeline.
  const graded = gradeVitals(vitals, { stage, gestationalWeeks: gestWeek, postpartumDay: ppDay });

  let riskEntries = [];
  if (graded.findings.length > 0) {
    const rows = graded.findings.map((f) => ({
      patient_id,
      visit_id: visit_id || null,
      asha_worker_id: req.user.id,
      symptom_name: f.symptom_name,
      severity: f.severity,
      stage,
      gestational_week: stage === 'antenatal' ? gestWeek : null,
      postpartum_day: stage === 'postpartum' ? ppDay : null,
      flag_description: f.flag_description,
      recommended_asha_action: f.recommended_asha_action,
      requires_doctor_referral: f.requires_doctor_referral
    }));

    const { data: inserted, error: riskErr } = await req.userClient
      .from('risk_timeline')
      .insert(rows)
      .select();

    if (riskErr) console.error('Failed to write vitals findings to the timeline:', riskErr);
    else riskEntries = inserted || [];
  }

  let scoring = null;
  try {
    scoring = await calculateRiskScore(patient_id);
  } catch (err) {
    console.error('Risk rescoring after vitals failed:', err.message);
  }

  return res.status(201).json({
    success: true,
    data: {
      vitals: saved,
      grading: graded,
      risk_timeline_entries: riskEntries,
      risk_scoring_breakdown: scoring
    }
  });
}));

/**
 * GET /api/vitals/patient/:patientId
 * Vitals history with the weight trend between the two most recent readings.
 */
router.get('/patient/:patientId', requireAuth, asyncRoute(async (req, res) => {
  const { data, error } = await req.userClient
    .from('visit_vitals')
    .select('*')
    .eq('patient_id', req.params.patientId)
    .order('recorded_at', { ascending: false })
    .limit(50);

  if (error) return res.status(400).json({ error: 'VITALS_FETCH_FAILED', message: error.message });

  const records = data || [];
  const withWeight = records.filter((r) => r.weight_kg != null);
  let trend = null;

  if (withWeight.length >= 2) {
    const days = Math.round(
      (new Date(withWeight[0].recorded_at) - new Date(withWeight[1].recorded_at)) / 86400000
    );
    trend = weightTrend(Number(withWeight[0].weight_kg), Number(withWeight[1].weight_kg), days);
  }

  return res.json({
    success: true,
    data: { records, latest: records[0] || null, weight_trend: trend }
  });
}));

/**
 * POST /api/vitals/parse
 * Extracts vitals mentioned in a transcript so the form can be pre-filled.
 * Nothing is stored — the worker confirms the values before they are saved.
 */
router.post('/parse', requireAuth, asyncRoute(async (req, res) => {
  const { transcript } = req.body;

  if (!transcript || typeof transcript !== 'string') {
    return res.status(400).json({ error: 'TRANSCRIPT_REQUIRED', message: 'Send the transcript text to scan.' });
  }

  const { vitals, matches } = parseVitalsFromText(transcript);

  return res.json({
    success: true,
    data: {
      vitals,
      matches,
      found: matches.length,
      // Made explicit so no caller mistakes this for a saved record.
      requires_confirmation: true
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// Infant growth
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/vitals/growth/:patientId
 */
router.get('/growth/:patientId', requireAuth, asyncRoute(async (req, res) => {
  const { data: patient, error: pErr } = await req.userClient
    .from('patients')
    .select('*')
    .eq('id', req.params.patientId)
    .maybeSingle();

  if (pErr) return res.status(400).json({ error: 'PATIENT_LOOKUP_FAILED', message: pErr.message });
  if (!patient) return res.status(404).json({ error: 'PATIENT_NOT_FOUND', message: 'That patient is not on your list.' });

  if (patient.stage !== 'postpartum' || patient.delivery_outcome !== 'live_birth') {
    return res.json({
      success: true,
      data: { points: [], status: 'not_applicable', message: 'Growth monitoring begins once a live birth is recorded.' }
    });
  }

  const { data: records, error } = await req.userClient
    .from('child_growth')
    .select('*')
    .eq('patient_id', patient.id)
    .order('measured_on', { ascending: true });

  if (error) return res.status(400).json({ error: 'GROWTH_FETCH_FAILED', message: error.message });

  return res.json({ success: true, data: buildGrowthSummary(patient, records || []) });
}));

/**
 * POST /api/vitals/growth
 * Records an infant weight, classifies it, detects faltering against the
 * previous measurement, and flags a concerning result to the risk timeline.
 *
 * Body: { patient_id, weight_kg, measured_on?, length_cm?, muac_cm?, visit_id?, notes? }
 */
router.post('/growth', requireAuth, asyncRoute(async (req, res) => {
  const { patient_id, weight_kg, measured_on, length_cm, muac_cm, visit_id, notes } = req.body;

  if (!patient_id) {
    return res.status(400).json({ error: 'PATIENT_REQUIRED', message: 'Select a patient before saving a weight.' });
  }

  const weight = numeric(weight_kg);
  if (weight === undefined || Number.isNaN(weight)) {
    return res.status(400).json({ error: 'WEIGHT_REQUIRED', message: "Enter the baby's weight in kilograms." });
  }
  if (weight < 0.3 || weight > 30) {
    return res.status(400).json({ error: 'WEIGHT_RANGE', message: 'Enter a weight between 0.3 and 30 kg.' });
  }

  const { data: patient, error: pErr } = await req.userClient
    .from('patients')
    .select('*')
    .eq('id', patient_id)
    .maybeSingle();

  if (pErr) return res.status(400).json({ error: 'PATIENT_LOOKUP_FAILED', message: pErr.message });
  if (!patient) return res.status(404).json({ error: 'PATIENT_NOT_FOUND', message: 'That patient is not on your list.' });

  if (patient.stage !== 'postpartum' || !patient.delivery_date) {
    return res.status(400).json({
      error: 'NO_DELIVERY_RECORDED',
      message: 'Record the delivery first — the age of the baby is needed to interpret the weight.'
    });
  }

  const measuredOn = measured_on || new Date().toISOString().split('T')[0];
  const measuredDate = new Date(measuredOn);

  if (Number.isNaN(measuredDate.getTime())) {
    return res.status(400).json({ error: 'DATE_INVALID', message: 'That measurement date could not be read.' });
  }

  const today = new Date(); today.setHours(23, 59, 59, 999);
  if (measuredDate > today) {
    return res.status(400).json({ error: 'DATE_IN_FUTURE', message: 'The measurement date cannot be in the future.' });
  }
  if (measuredDate < new Date(patient.delivery_date)) {
    return res.status(400).json({ error: 'DATE_BEFORE_BIRTH', message: 'The measurement date is before the date of birth.' });
  }

  const days = ageInDays(patient.delivery_date, measuredOn);
  const wfa = classifyWeightForAge({ weightKg: weight, ageDays: days, sex: patient.baby_sex });

  // Previous measurement, for faltering detection.
  const { data: existing } = await req.userClient
    .from('child_growth')
    .select('*')
    .eq('patient_id', patient_id)
    .order('measured_on', { ascending: true });

  const priorPoints = (existing || []).filter((r) => r.measured_on !== measuredOn);

  const { data: saved, error: insertError } = await req.userClient
    .from('child_growth')
    .upsert({
      patient_id,
      visit_id: visit_id || null,
      asha_worker_id: req.user.id,
      measured_on: measuredOn,
      age_days: days,
      weight_kg: weight,
      length_cm: numeric(length_cm) ?? null,
      muac_cm: numeric(muac_cm) ?? null,
      classification: wfa.classification,
      notes: notes || null
    }, { onConflict: 'patient_id,measured_on' })
    .select()
    .single();

  if (insertError) {
    console.error('Failed to save growth measurement:', insertError);
    return res.status(400).json({ error: 'GROWTH_SAVE_FAILED', message: insertError.message });
  }

  const summary = buildGrowthSummary(patient, [...priorPoints, saved]);

  // Persist the faltering flag computed against the full history.
  if (summary.latest?.faltering !== saved.faltering) {
    await req.userClient
      .from('child_growth')
      .update({ faltering: Boolean(summary.latest?.faltering) })
      .eq('id', saved.id);
  }

  // Flag a concerning result to the timeline so it reaches the risk score.
  let riskEntry = null;
  const entry = growthToRiskEntry(summary, {
    patientId: patient_id,
    visitId: visit_id,
    ashaWorkerId: req.user.id,
    postpartumDay: days
  });

  if (entry) {
    const { data: inserted, error: riskErr } = await req.userClient
      .from('risk_timeline')
      .insert([entry])
      .select()
      .single();

    if (riskErr) console.error('Failed to flag growth concern:', riskErr);
    else riskEntry = inserted;

    try { await calculateRiskScore(patient_id); } catch { /* non-fatal */ }
  }

  return res.status(201).json({
    success: true,
    data: { measurement: saved, summary, risk_timeline_entry: riskEntry }
  });
}));

export default router;
