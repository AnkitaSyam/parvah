import { supabaseAdmin } from '../config/supabase.js';

/**
 * calculateRiskScore
 * 
 * Computes a patient's current risk score and risk level based on the history
 * of symptoms logged in the last 21 days.
 * 
 * Rules:
 *   1. Severe red-flag symptom in the last 7 days -> Immediately set to "alert" and return (score 10.0).
 *   2. Base points assigned to non-severe symptoms:
 *      - headache: 2 points
 *      - swelling / edema: 2 points
 *      - blurred vision: 3 points
 *      - fatigue: 1 point
 *      - nausea / vomiting: 1 point
 *      - others: 1 point
 *      - routine/normal logs: 0 points
 *   3. Linear decay applied over a 21-day window: multiplier = (1 - daysAgo / 21).
 *   4. Sum of decayed points:
 *      - >= 6.0: "alert"
 *      - >= 3.0: "watch"
 *      - < 3.0: "normal"
 *   5. Updates the patients table current_risk_score and risk_level.
 * 
 * @param {string} patientId - UUID of the patient
 * @returns {Promise<Object>} Risk score breakdown object
 */
export async function calculateRiskScore(patientId) {
  if (!patientId) {
    throw new Error('calculateRiskScore error: patientId is required.');
  }

  // 1. Fetch risk timeline entries with visit metadata
  const { data, error } = await supabaseAdmin
    .from('risk_timeline')
    .select('*, visits(created_at)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`calculateRiskScore database error: ${error.message}`);
  }

  const now = new Date();
  const cutoff21Days = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
  const cutoff7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Filter entries to those associated with visits created in the last 21 days
  const activeEntries = (data || []).map(entry => {
    const visitCreatedAt = entry.visits?.created_at ? new Date(entry.visits.created_at) : new Date(entry.created_at);
    return { ...entry, visitCreatedAt };
  }).filter(entry => entry.visitCreatedAt >= cutoff21Days);

  // 2. Severe red-flag trigger check (last 7 days)
  const severeLast7Days = activeEntries.find(entry => 
    entry.visitCreatedAt >= cutoff7Days && 
    (entry.severity === 'severe' || entry.requires_doctor_referral === true)
  );

  if (severeLast7Days) {
    const finalRiskLevel = 'alert';
    const finalScore = 10.0;

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
      triggered_by: {
        symptom_name: severeLast7Days.symptom_name,
        severity: severeLast7Days.severity,
        requires_doctor_referral: severeLast7Days.requires_doctor_referral,
        visit_id: severeLast7Days.visit_id,
        logged_at: severeLast7Days.visitCreatedAt
      },
      breakdown: {
        raw_points: 0,
        decayed_points: 0,
        final_total: 0,
        symptoms: []
      }
    };
  }

  // 3. Regular points mapping and linear decay logic
  let totalDecayedScore = 0;
  const symptomBreakdown = [];

  for (const entry of activeEntries) {
    const symptomName = entry.symptom_name.toLowerCase();

    // Skip normal routine checkups
    if (symptomName.includes('no flags') || symptomName.includes('no symptoms') || symptomName.includes('routine checkup')) {
      continue;
    }

    // Base point assignment
    let basePoints = 1; // Default for other symptoms
    if (symptomName.includes('headache')) {
      basePoints = 2;
    } else if (symptomName.includes('swelling') || symptomName.includes('edema')) {
      basePoints = 2;
    } else if (symptomName.includes('blurred vision') || symptomName.includes('vision')) {
      basePoints = 3;
    } else if (symptomName.includes('fatigue')) {
      basePoints = 1;
    } else if (symptomName.includes('nausea') || symptomName.includes('vomiting')) {
      basePoints = 1;
    }

    // Calculate linear decay
    const msDiff = now.getTime() - entry.visitCreatedAt.getTime();
    const daysAgo = Math.max(0, msDiff / (1000 * 60 * 60 * 24));
    const decayMultiplier = Math.max(0, 1 - daysAgo / 21);
    const decayedPoints = basePoints * decayMultiplier;

    totalDecayedScore += decayedPoints;

    symptomBreakdown.push({
      symptom_name: entry.symptom_name,
      visit_id: entry.visit_id,
      visit_date: entry.visitCreatedAt,
      days_ago: parseFloat(daysAgo.toFixed(2)),
      raw_points: basePoints,
      decay_multiplier: parseFloat(decayMultiplier.toFixed(4)),
      decayed_points: parseFloat(decayedPoints.toFixed(4))
    });
  }

  totalDecayedScore = parseFloat(totalDecayedScore.toFixed(2));

  // Determine risk level based on thresholds
  let finalRiskLevel = 'normal';
  if (totalDecayedScore >= 6) {
    finalRiskLevel = 'alert';
  } else if (totalDecayedScore >= 3) {
    finalRiskLevel = 'watch';
  }

  // Update patient details in database
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

  return {
    success: true,
    patient_id: patientId,
    current_risk_score: totalDecayedScore,
    risk_level: finalRiskLevel,
    red_flag_triggered: false,
    breakdown: {
      raw_points: symptomBreakdown.reduce((sum, item) => sum + item.raw_points, 0),
      decayed_points: parseFloat(symptomBreakdown.reduce((sum, item) => sum + item.decayed_points, 0).toFixed(4)),
      final_total: totalDecayedScore,
      symptoms: symptomBreakdown
    }
  };
}
