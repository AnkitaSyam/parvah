import { supabaseAdmin } from '../config/supabase.js';

/**
 * calculateRiskScore
 *
 * Computes a patient's current risk score and level from her recent symptom
 * history, with time decay so that a resolved problem stops dominating the
 * score while a persisting pattern accumulates.
 *
 * Rules:
 *   1. RED ALERT — a symptom graded `severe` within the alert window puts the
 *      patient at "alert" (score 10.0) immediately.
 *
 *      This previously also fired on `requires_doctor_referral`, which the
 *      offline extractor set on ordinary fever and headache — so any
 *      transcript containing the word "fever" produced a maximum-severity
 *      alert. Referral is now a scoring signal, not a detonator.
 *
 *   2. BASELINE — standing obstetric risk that does not decay:
 *      maternal age <18 or >=35, and grand multiparity (para >= 4).
 *
 *   3. SYMPTOM POINTS — per-symptom base points, with a doctor-referral
 *      surcharge, decayed linearly over a stage-dependent window:
 *        antenatal   21 days  (risk accumulates over weeks)
 *        postpartum  10 days  (the danger window is days, not weeks)
 *
 *   4. THRESHOLDS — >= 6.0 "alert", >= 3.0 "watch", else "normal".
 *
 * @param {string} patientId - UUID of the patient
 * @returns {Promise<Object>} Risk score breakdown object
 */

const ALERT_WINDOW_DAYS = 7;

const DECAY_WINDOW_DAYS = {
  antenatal: 21,
  postpartum: 10
};

// Symptom base points. Ordered most specific first — the first match wins.
const SYMPTOM_POINTS = [
  { match: ['blurred vision', 'vision', 'seeing spots'], points: 3.0 },
  { match: ['convulsion', 'seizure', 'fits'],            points: 4.0 },
  { match: ['bleeding', 'haemorrhage', 'hemorrhage'],    points: 4.0 },
  { match: ['sepsis', 'foul', 'discharge'],              points: 3.5 },
  { match: ['fetal movement', 'foetal movement'],        points: 3.5 },
  { match: ['breathing', 'breathless'],                  points: 3.0 },
  { match: ['pallor', 'anaemia', 'anemia'],              points: 2.5 },
  { match: ['headache'],                                 points: 2.0 },
  { match: ['swelling', 'edema', 'oedema'],              points: 2.0 },
  { match: ['fever'],                                    points: 2.0 },
  { match: ['mood', 'depression', 'mental'],             points: 2.0 },
  { match: ['abdominal pain', 'stomach pain'],           points: 2.0 },
  { match: ['fatigue', 'weakness', 'tired'],             points: 1.0 },
  { match: ['nausea', 'vomiting'],                       points: 1.0 },
  { match: ['breastfeeding', 'latch', 'milk'],           points: 0.5 }
];

// Symptom names that represent an explicitly clean visit.
const NO_FLAG_MARKERS = ['no flags', 'no symptoms', 'routine checkup', 'routine postnatal'];

const SEVERITY_MULTIPLIER = { mild: 0.6, moderate: 1.0, severe: 1.6 };

function basePointsFor(symptomName) {
  const name = (symptomName || '').toLowerCase();
  const entry = SYMPTOM_POINTS.find((e) => e.match.some((m) => name.includes(m)));
  return entry ? entry.points : 1.0;
}

function isNoFlagEntry(symptomName) {
  const name = (symptomName || '').toLowerCase();
  return NO_FLAG_MARKERS.some((m) => name.includes(m));
}

/**
 * Standing risk that does not decay with time.
 */
function baselineRisk(patient) {
  const factors = [];
  let points = 0;

  const age = Number(patient?.age);
  if (Number.isFinite(age)) {
    if (age < 18) {
      points += 1.5;
      factors.push({ factor: 'Adolescent pregnancy (under 18)', points: 1.5 });
    } else if (age >= 35) {
      points += 1.5;
      factors.push({ factor: 'Advanced maternal age (35 or over)', points: 1.5 });
    }
  }

  const para = Number(patient?.para);
  if (Number.isFinite(para) && para >= 4) {
    points += 1.0;
    factors.push({ factor: `Grand multiparity (para ${para})`, points: 1.0 });
  }

  return { points, factors };
}

export async function calculateRiskScore(patientId) {
  if (!patientId) {
    throw new Error('calculateRiskScore error: patientId is required.');
  }

  // 1. Fetch the patient (for baseline risk and stage) and her timeline.
  const { data: patient, error: patientError } = await supabaseAdmin
    .from('patients')
    .select('id, age, para, stage, delivery_date')
    .eq('id', patientId)
    .single();

  if (patientError) {
    throw new Error(`calculateRiskScore patient lookup error: ${patientError.message}`);
  }

  const { data, error } = await supabaseAdmin
    .from('risk_timeline')
    .select('*, visits(created_at, stage)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`calculateRiskScore database error: ${error.message}`);
  }

  const now = new Date();
  const patientStage = patient?.stage === 'postpartum' ? 'postpartum' : 'antenatal';
  const maxWindow = Math.max(DECAY_WINDOW_DAYS.antenatal, DECAY_WINDOW_DAYS.postpartum);
  const cutoffMax = new Date(now.getTime() - maxWindow * 24 * 60 * 60 * 1000);
  const cutoffAlert = new Date(now.getTime() - ALERT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const activeEntries = (data || [])
    .map((entry) => {
      const loggedAt = entry.visits?.created_at
        ? new Date(entry.visits.created_at)
        : new Date(entry.created_at);
      const stage = entry.stage || entry.visits?.stage || patientStage;
      return { ...entry, loggedAt, entryStage: stage };
    })
    .filter((entry) => entry.loggedAt >= cutoffMax);

  const baseline = baselineRisk(patient);

  // 2. Red-alert trigger: an affirmatively severe symptom in the alert window.
  const severeRecent = activeEntries.find(
    (entry) => entry.loggedAt >= cutoffAlert && entry.severity === 'severe'
  );

  if (severeRecent) {
    const finalScore = 10.0;
    const finalRiskLevel = 'alert';

    const { error: updateError } = await supabaseAdmin
      .from('patients')
      .update({
        current_risk_score: finalScore,
        risk_level: finalRiskLevel,
        updated_at: new Date().toISOString()
      })
      .eq('id', patientId);

    if (updateError) {
      throw new Error(`calculateRiskScore update error: ${updateError.message}`);
    }

    return {
      success: true,
      patient_id: patientId,
      current_risk_score: finalScore,
      risk_level: finalRiskLevel,
      red_flag_triggered: true,
      stage: patientStage,
      triggered_by: {
        symptom_name: severeRecent.symptom_name,
        severity: severeRecent.severity,
        requires_doctor_referral: severeRecent.requires_doctor_referral,
        visit_id: severeRecent.visit_id,
        flag_description: severeRecent.flag_description,
        recommended_asha_action: severeRecent.recommended_asha_action,
        logged_at: severeRecent.loggedAt
      },
      breakdown: {
        baseline_points: baseline.points,
        baseline_factors: baseline.factors,
        raw_points: 0,
        decayed_points: 0,
        final_total: finalScore,
        symptoms: []
      }
    };
  }

  // 3. Decayed symptom points.
  let totalDecayedScore = baseline.points;
  const symptomBreakdown = [];

  for (const entry of activeEntries) {
    if (isNoFlagEntry(entry.symptom_name)) continue;

    const windowDays = DECAY_WINDOW_DAYS[entry.entryStage] || DECAY_WINDOW_DAYS.antenatal;

    const daysAgo = Math.max(0, (now.getTime() - entry.loggedAt.getTime()) / (1000 * 60 * 60 * 24));
    if (daysAgo > windowDays) continue;

    const base = basePointsFor(entry.symptom_name);
    const severityMultiplier = SEVERITY_MULTIPLIER[entry.severity] ?? 1.0;
    const referralSurcharge = entry.requires_doctor_referral ? 1.0 : 0;

    const rawPoints = base * severityMultiplier + referralSurcharge;
    const decayMultiplier = Math.max(0, 1 - daysAgo / windowDays);
    const decayedPoints = rawPoints * decayMultiplier;

    totalDecayedScore += decayedPoints;

    symptomBreakdown.push({
      symptom_name: entry.symptom_name,
      severity: entry.severity,
      stage: entry.entryStage,
      visit_id: entry.visit_id,
      visit_date: entry.loggedAt,
      days_ago: parseFloat(daysAgo.toFixed(2)),
      decay_window_days: windowDays,
      base_points: base,
      severity_multiplier: severityMultiplier,
      referral_surcharge: referralSurcharge,
      raw_points: parseFloat(rawPoints.toFixed(4)),
      decay_multiplier: parseFloat(decayMultiplier.toFixed(4)),
      decayed_points: parseFloat(decayedPoints.toFixed(4))
    });
  }

  totalDecayedScore = parseFloat(totalDecayedScore.toFixed(2));

  let finalRiskLevel = 'normal';
  if (totalDecayedScore >= 6) {
    finalRiskLevel = 'alert';
  } else if (totalDecayedScore >= 3) {
    finalRiskLevel = 'watch';
  }

  const { error: updateError } = await supabaseAdmin
    .from('patients')
    .update({
      current_risk_score: totalDecayedScore,
      risk_level: finalRiskLevel,
      updated_at: new Date().toISOString()
    })
    .eq('id', patientId);

  if (updateError) {
    throw new Error(`calculateRiskScore db update error: ${updateError.message}`);
  }

  // Most-contributing symptom first, so the UI can explain the score.
  symptomBreakdown.sort((a, b) => b.decayed_points - a.decayed_points);

  return {
    success: true,
    patient_id: patientId,
    current_risk_score: totalDecayedScore,
    risk_level: finalRiskLevel,
    red_flag_triggered: false,
    stage: patientStage,
    thresholds: { watch: 3.0, alert: 6.0 },
    breakdown: {
      baseline_points: parseFloat(baseline.points.toFixed(2)),
      baseline_factors: baseline.factors,
      raw_points: parseFloat(symptomBreakdown.reduce((s, i) => s + i.raw_points, 0).toFixed(2)),
      decayed_points: parseFloat(symptomBreakdown.reduce((s, i) => s + i.decayed_points, 0).toFixed(2)),
      final_total: totalDecayedScore,
      symptoms: symptomBreakdown
    }
  };
}
