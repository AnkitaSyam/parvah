/**
 * backend/services/childGrowth.js
 *
 * Infant growth monitoring.
 *
 * Immunization was tracked to age two but weight was not — a child can
 * receive every dose on schedule and still be wasting. This closes the other
 * half of the first-1,000-days arc.
 *
 * Two signals, deliberately ordered:
 *
 *   1. FALTERING (primary) — weight loss, or no gain, between consecutive
 *      measurements. Computed from the child's own trajectory, so it needs no
 *      reference table and cannot be wrong because of a lookup error. It is
 *      also the more actionable signal at a home visit: "she has not gained
 *      in three weeks" prompts a feeding assessment today.
 *
 *   2. UNDERWEIGHT (secondary) — weight-for-age against WHO cutoffs. Useful
 *      for reporting and for spotting a child who was small from birth.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NOTE ON THE REFERENCE TABLE
 * The table below is an ABRIDGED extract of the WHO Child Growth Standards
 * weight-for-age values (median, -2SD, -3SD), at monthly points to 12 months
 * and quarterly to 24. Values between points are linearly interpolated.
 *
 * Verify these against the official WHO tables before any clinical use:
 * https://www.who.int/tools/child-growth-standards/standards/weight-for-age
 *
 * Faltering detection above does not depend on this table.
 * ─────────────────────────────────────────────────────────────────────────
 */

// [ageMonths, -3SD, -2SD, median]
const WFA_GIRLS = [
  [0,  2.0, 2.4,  3.2], [1,  2.7, 3.2,  4.2], [2,  3.4, 3.9,  5.1],
  [3,  4.0, 4.5,  5.8], [4,  4.4, 5.0,  6.4], [5,  4.8, 5.4,  6.9],
  [6,  5.1, 5.7,  7.3], [7,  5.3, 6.0,  7.6], [8,  5.6, 6.3,  7.9],
  [9,  5.8, 6.5,  8.2], [10, 5.9, 6.7,  8.5], [11, 6.1, 6.9,  8.7],
  [12, 6.3, 7.0,  8.9], [15, 6.7, 7.6,  9.6], [18, 7.2, 8.1, 10.2],
  [21, 7.6, 8.6, 10.9], [24, 8.1, 9.0, 11.5]
];

const WFA_BOYS = [
  [0,  2.1, 2.5,  3.3], [1,  2.9, 3.4,  4.5], [2,  3.8, 4.3,  5.6],
  [3,  4.4, 5.0,  6.4], [4,  4.9, 5.6,  7.0], [5,  5.3, 6.0,  7.5],
  [6,  5.7, 6.4,  7.9], [7,  5.9, 6.7,  8.3], [8,  6.2, 6.9,  8.6],
  [9,  6.4, 7.1,  8.9], [10, 6.6, 7.4,  9.2], [11, 6.8, 7.6,  9.4],
  [12, 6.9, 7.7,  9.6], [15, 7.4, 8.3, 10.3], [18, 7.8, 8.8, 10.9],
  [21, 8.2, 9.2, 11.5], [24, 8.6, 9.7, 12.2]
];

const MS_PER_DAY = 86400000;

function interpolate(table, ageMonths) {
  if (ageMonths <= table[0][0]) return table[0];
  const last = table[table.length - 1];
  if (ageMonths >= last[0]) return last;

  for (let i = 0; i < table.length - 1; i += 1) {
    const [a0, l3a, l2a, ma] = table[i];
    const [a1, l3b, l2b, mb] = table[i + 1];
    if (ageMonths >= a0 && ageMonths <= a1) {
      const t = (ageMonths - a0) / (a1 - a0);
      return [ageMonths, l3a + (l3b - l3a) * t, l2a + (l2b - l2a) * t, ma + (mb - ma) * t];
    }
  }
  return last;
}

/**
 * Days between a birth date and a measurement date.
 */
export function ageInDays(birthDate, measuredOn = new Date()) {
  if (!birthDate) return null;
  const b = new Date(birthDate); b.setHours(0, 0, 0, 0);
  const m = new Date(measuredOn); m.setHours(0, 0, 0, 0);
  if (Number.isNaN(b.getTime()) || Number.isNaN(m.getTime())) return null;
  return Math.max(0, Math.round((m - b) / MS_PER_DAY));
}

/**
 * Classifies weight-for-age against the WHO cutoffs.
 *
 * Returns 'unknown' rather than guessing when the child's sex is unrecorded —
 * the cutoffs differ enough between boys and girls to matter, and a wrong
 * classification is worse than an absent one.
 *
 * @returns {{ classification: string, cutoffs: Object|null, age_months: number|null }}
 */
export function classifyWeightForAge({ weightKg, ageDays, sex }) {
  if (!Number.isFinite(weightKg) || !Number.isFinite(ageDays)) {
    return { classification: 'unknown', cutoffs: null, age_months: null };
  }

  const ageMonths = Number((ageDays / 30.4375).toFixed(2));

  if (sex !== 'male' && sex !== 'female') {
    return { classification: 'unknown', cutoffs: null, age_months: ageMonths };
  }

  // Beyond the table's range the classification is not defined here.
  if (ageMonths > 24.5) {
    return { classification: 'unknown', cutoffs: null, age_months: ageMonths };
  }

  const [, minus3, minus2, median] = interpolate(sex === 'male' ? WFA_BOYS : WFA_GIRLS, ageMonths);
  const cutoffs = {
    severe_below: Number(minus3.toFixed(2)),
    underweight_below: Number(minus2.toFixed(2)),
    median: Number(median.toFixed(2))
  };

  let classification = 'normal';
  if (weightKg < minus3) classification = 'severely_underweight';
  else if (weightKg < minus2) classification = 'underweight';
  else if (weightKg > median * 1.35) classification = 'above_normal';

  return { classification, cutoffs, age_months: ageMonths };
}

/**
 * Expected minimum weight gain per week, by age. A newborn should regain
 * birth weight by day 14 and then gain steadily; growth slows with age.
 */
function expectedWeeklyGainKg(ageDays) {
  if (ageDays <= 90) return 0.15;   // 0-3 months: ~150 g/week
  if (ageDays <= 180) return 0.10;  // 3-6 months
  if (ageDays <= 365) return 0.06;  // 6-12 months
  return 0.04;                      // 12-24 months
}

/**
 * Detects growth faltering between two consecutive measurements.
 *
 * @param {{weight_kg:number, measured_on:string, age_days:number}} current
 * @param {{weight_kg:number, measured_on:string, age_days:number}} previous
 * @returns {{ faltering: boolean, reason: string|null, delta_kg: number, days: number }|null}
 */
export function detectFaltering(current, previous) {
  if (!current || !previous) return null;

  const days = Math.round(
    (new Date(current.measured_on) - new Date(previous.measured_on)) / MS_PER_DAY
  );
  if (!Number.isFinite(days) || days <= 0) return null;

  const delta = Number((current.weight_kg - previous.weight_kg).toFixed(3));

  // Newborns lose up to ~7% in the first days and regain it by day 14, so
  // early weight loss is only concerning past that point.
  const isEarlyNewborn = (current.age_days ?? 0) <= 14;

  if (delta < 0 && !isEarlyNewborn) {
    return {
      faltering: true,
      reason: `Lost ${Math.abs(delta)} kg since the last measurement ${days} days ago.`,
      delta_kg: delta, days
    };
  }

  if (delta < 0 && isEarlyNewborn) {
    const lossPct = Math.abs(delta) / previous.weight_kg;
    if (lossPct > 0.1) {
      return {
        faltering: true,
        reason: `Lost ${(lossPct * 100).toFixed(0)}% of birth weight — more than the normal 7 to 10%.`,
        delta_kg: delta, days
      };
    }
    return { faltering: false, reason: null, delta_kg: delta, days };
  }

  // No meaningful gain over at least two weeks.
  if (days >= 14) {
    const expected = (expectedWeeklyGainKg(current.age_days ?? 0) * days) / 7;
    if (delta < expected * 0.5) {
      return {
        faltering: true,
        reason: `Gained only ${delta} kg in ${days} days — about half the expected ${expected.toFixed(2)} kg.`,
        delta_kg: delta, days
      };
    }
  }

  return { faltering: false, reason: null, delta_kg: delta, days };
}

/**
 * Builds the full growth picture for one child: each measurement classified
 * and compared to the one before, plus the current status and any action.
 *
 * @param {Object} patient - needs delivery_date and baby_sex
 * @param {Array} records - child_growth rows, any order
 */
export function buildGrowthSummary(patient, records = []) {
  const birthDate = patient?.delivery_date || null;
  const sex = patient?.baby_sex || null;

  const points = [...records]
    .sort((a, b) => new Date(a.measured_on) - new Date(b.measured_on))
    .map((r) => {
      const days = r.age_days ?? ageInDays(birthDate, r.measured_on);
      const weight = Number(r.weight_kg);
      const wfa = classifyWeightForAge({ weightKg: weight, ageDays: days, sex });
      return {
        id: r.id,
        measured_on: r.measured_on,
        age_days: days,
        age_months: wfa.age_months,
        weight_kg: weight,
        length_cm: r.length_cm ?? null,
        muac_cm: r.muac_cm ?? null,
        classification: wfa.classification,
        cutoffs: wfa.cutoffs
      };
    });

  // Compare each point with the one before it.
  for (let i = 1; i < points.length; i += 1) {
    const f = detectFaltering(points[i], points[i - 1]);
    points[i].faltering = f?.faltering || false;
    points[i].faltering_reason = f?.reason || null;
    points[i].delta_kg = f?.delta_kg ?? null;
    points[i].days_since_previous = f?.days ?? null;
  }
  if (points.length > 0) {
    points[0].faltering = false;
    points[0].faltering_reason = null;
    points[0].delta_kg = null;
  }

  const latest = points[points.length - 1] || null;

  // Birth weight is a growth data point in its own right.
  const birthWeight = patient?.baby_birth_weight_kg ? Number(patient.baby_birth_weight_kg) : null;

  let status = 'no_data';
  let action = null;

  if (latest) {
    if (latest.faltering) {
      status = 'faltering';
      action = 'Observe a full breastfeed and correct the latch. Weigh again in 7 days. Refer to the PHC if there is still no gain, or immediately if the baby is feeding poorly or lethargic.';
    } else if (latest.classification === 'severely_underweight') {
      status = 'severely_underweight';
      action = 'Refer to the nearest NRC or PHC for assessment. Check MUAC and look for oedema of both feet.';
    } else if (latest.classification === 'underweight') {
      status = 'underweight';
      action = 'Counsel on age-appropriate feeding and continue monthly weighing. Refer if the weight does not improve by the next contact.';
    } else if (latest.classification === 'unknown') {
      status = 'unclassified';
      action = sex ? null : "Record the baby's sex on the patient card so weight-for-age can be classified.";
    } else {
      status = 'normal';
    }
  }

  return {
    birth_weight_kg: birthWeight,
    low_birth_weight: birthWeight !== null && birthWeight < 2.5,
    sex,
    points,
    latest,
    status,
    recommended_action: action,
    measurement_count: points.length,
    next_weighing_due: latest
      ? new Date(new Date(latest.measured_on).getTime() + 30 * MS_PER_DAY).toISOString().split('T')[0]
      : null
  };
}

/**
 * Turns a concerning growth measurement into a risk-timeline entry, so growth
 * flows into the same risk score as everything else rather than sitting in a
 * separate silo.
 */
export function growthToRiskEntry(summary, { patientId, visitId, ashaWorkerId, postpartumDay }) {
  if (!summary?.latest) return null;
  if (!['faltering', 'severely_underweight', 'underweight'].includes(summary.status)) return null;

  const severe = summary.status === 'severely_underweight' ||
    (summary.status === 'faltering' && (summary.latest.age_days ?? 999) <= 60);

  const label = {
    faltering: 'Growth Faltering (Newborn)',
    underweight: 'Underweight for Age (Newborn)',
    severely_underweight: 'Severely Underweight for Age (Newborn)'
  }[summary.status];

  return {
    patient_id: patientId,
    visit_id: visitId || null,
    asha_worker_id: ashaWorkerId,
    symptom_name: label,
    severity: severe ? 'severe' : 'moderate',
    stage: 'postpartum',
    gestational_week: null,
    postpartum_day: postpartumDay ?? summary.latest.age_days ?? null,
    flag_description: summary.latest.faltering_reason
      || `Weight ${summary.latest.weight_kg} kg at ${Math.round(summary.latest.age_months ?? 0)} months is below the WHO weight-for-age cutoff of ${summary.latest.cutoffs?.underweight_below ?? '—'} kg.`,
    recommended_asha_action: summary.recommended_action,
    requires_doctor_referral: severe
  };
}
