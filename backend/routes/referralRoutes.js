import express from 'express';
import { requireAuth, asyncRoute } from '../middleware/auth.js';
import { calculateRiskScore } from '../services/riskScoring.js';
import { currentGestationalWeeks, postpartumDay } from '../services/careSchedule.js';

const router = express.Router();

/**
 * The referral slip.
 *
 * Detection previously stopped at a risk score on a dashboard. This assembles
 * the handoff document — who she is, what was reported and when, what the
 * ASHA worker already checked, and what the facility should do — so a flagged
 * patient arrives at a PHC with something in her hand rather than a verbal
 * summary. Bilingual, because the worker and the family read Hindi and the
 * facility record is kept in English.
 */

const OUTCOME_LABEL = {
  live_birth: 'Live birth',
  stillbirth: 'Stillbirth',
  neonatal_death: 'Neonatal death'
};

const PLACE_LABEL = {
  institutional: 'Institutional',
  home: 'Home',
  in_transit: 'In transit'
};

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * GET /api/referrals/patient/:patientId
 * Builds a referral slip from the patient's current state and recent timeline.
 */
router.get('/patient/:patientId', requireAuth, asyncRoute(async (req, res) => {
  const { patientId } = req.params;

  const { data: patient, error: pErr } = await req.userClient
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .maybeSingle();

  if (pErr) return res.status(400).json({ error: 'PATIENT_LOOKUP_FAILED', message: pErr.message });
  if (!patient) return res.status(404).json({ error: 'PATIENT_NOT_FOUND', message: 'That patient is not on your list.' });

  const { data: profile } = await req.userClient
    .from('profiles')
    .select('full_name, phone_number, village_name, sub_center, city, state')
    .eq('id', req.user.id)
    .maybeSingle();

  // Only the last 21 days are clinically relevant to a referral decision.
  const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();

  const { data: timeline } = await req.userClient
    .from('risk_timeline')
    .select('*')
    .eq('patient_id', patientId)
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  const { data: myths } = await req.userClient
    .from('detected_myths')
    .select('extracted_quote, explanation, severity_impact, is_addressed, created_at')
    .eq('patient_id', patientId)
    .eq('is_addressed', false)
    .order('created_at', { ascending: false })
    .limit(5);

  let scoring = null;
  try {
    scoring = await calculateRiskScore(patientId);
  } catch (err) {
    console.warn(`Referral slip: risk score unavailable — ${err.message}`);
  }

  const entries = timeline || [];
  const severe = entries.filter((e) => e.severity === 'severe');
  const referable = entries.filter((e) => e.requires_doctor_referral);

  const stage = patient.stage === 'postpartum' ? 'postpartum' : 'antenatal';
  const ppDay = postpartumDay(patient);
  const gestWeeks = currentGestationalWeeks(patient);

  const urgency = severe.length > 0
    ? 'emergency'
    : (patient.risk_level === 'alert' ? 'urgent' : (patient.risk_level === 'watch' ? 'routine_priority' : 'routine'));

  const URGENCY_COPY = {
    emergency: {
      en: 'EMERGENCY — transport immediately. Call 108.',
      hi: 'आपातकाल — तुरंत ले जाएँ। 108 पर कॉल करें।'
    },
    urgent: {
      en: 'URGENT — refer today.',
      hi: 'अत्यावश्यक — आज ही रेफर करें।'
    },
    routine_priority: {
      en: 'PRIORITY — review within 48 hours.',
      hi: 'प्राथमिकता — 48 घंटे के भीतर जाँच कराएँ।'
    },
    routine: {
      en: 'ROUTINE — continue scheduled visits.',
      hi: 'सामान्य — निर्धारित जाँच जारी रखें।'
    }
  };

  const slip = {
    generated_at: new Date().toISOString(),
    urgency,
    urgency_text: URGENCY_COPY[urgency],

    patient: {
      name: patient.name,
      age: patient.age,
      village: patient.village,
      contact_phone: patient.contact_phone,
      emergency_contact: patient.emergency_contact,
      blood_group: patient.blood_group,
      gravida: patient.gravida,
      para: patient.para,
      stage,
      gestational_weeks: gestWeeks,
      postpartum_day: ppDay,
      delivery_date: formatDate(patient.delivery_date),
      delivery_outcome: OUTCOME_LABEL[patient.delivery_outcome] || null,
      delivery_place: PLACE_LABEL[patient.delivery_place] || null,
      baby_name: patient.baby_name,
      baby_birth_weight_kg: patient.baby_birth_weight_kg
    },

    referred_by: {
      name: profile?.full_name || 'ASHA Worker',
      phone: profile?.phone_number || null,
      sub_center: profile?.sub_center || profile?.village_name || null,
      district: [profile?.city, profile?.state].filter(Boolean).join(', ') || null
    },

    risk: {
      level: patient.risk_level,
      score: patient.current_risk_score,
      red_flag_triggered: Boolean(scoring?.red_flag_triggered),
      baseline_factors: scoring?.breakdown?.baseline_factors || []
    },

    // The clinical core: what was reported, when, and what was advised.
    findings: entries.slice(0, 12).map((e) => ({
      symptom: e.symptom_name,
      severity: e.severity,
      reported_on: formatDate(e.created_at || e.date_logged),
      days_ago: Math.max(0, Math.round((Date.now() - new Date(e.created_at || e.date_logged).getTime()) / 86400000)),
      description: e.flag_description,
      action_taken: e.recommended_asha_action,
      referral_advised: e.requires_doctor_referral,
      gestational_week: e.gestational_week,
      postpartum_day: e.postpartum_day
    })),

    danger_signs: severe.map((e) => e.symptom_name),
    referral_reasons: referable.map((e) => e.symptom_name),

    // Counselling still outstanding — useful context for the facility.
    open_counselling: (myths || []).map((m) => ({
      belief: m.extracted_quote,
      correction: m.explanation,
      severity: m.severity_impact
    })),

    checklist: stage === 'postpartum'
      ? [
          { en: 'Blood pressure measured', hi: 'रक्तचाप नापा गया' },
          { en: 'Bleeding / lochia assessed', hi: 'रक्तस्राव की जाँच' },
          { en: 'Temperature checked', hi: 'तापमान जाँचा गया' },
          { en: 'Breastfeeding observed', hi: 'स्तनपान देखा गया' },
          { en: 'Newborn weighed', hi: 'नवजात का वज़न लिया गया' }
        ]
      : [
          { en: 'Blood pressure measured', hi: 'रक्तचाप नापा गया' },
          { en: 'Urine albumin tested', hi: 'पेशाब में एल्ब्यूमिन जाँच' },
          { en: 'Haemoglobin checked', hi: 'हीमोग्लोबिन जाँचा गया' },
          { en: 'Weight recorded', hi: 'वज़न दर्ज किया गया' },
          { en: 'Foetal heart sounds heard', hi: 'बच्चे की धड़कन सुनी गई' }
        ]
  };

  return res.json({ success: true, data: slip });
}));

export default router;
