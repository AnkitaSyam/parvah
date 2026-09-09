/**
 * backend/services/vitals.js
 *
 * Grading and voice extraction for maternal vitals.
 *
 * Until now the risk model inferred pre-eclampsia risk from the *words*
 * "swelling" and "headache" while the numbers that actually define it — blood
 * pressure and urine albumin — had nowhere to live. Six of the fourteen red
 * flags instruct a measurement; this is where the answer goes.
 *
 * Grading is deterministic and threshold-based. No model is involved: the
 * cutoffs come from published protocol, so the same reading always produces
 * the same action, and the reasoning can be shown to a clinician.
 *
 * Thresholds:
 *   BP        >=160/110 severe hypertension · >=140/90 raised · <90/60 low
 *             (WHO ANC guideline; NHM ANC & Skilled Attendance at Birth)
 *   Hb        <7 severe · 7-9.9 moderate · 10-10.9 mild anaemia
 *             (Anemia Mukt Bharat, pregnancy cutoffs)
 *   Temp      >=38.0 C fever
 *   Pulse     >110 tachycardia · <50 bradycardia
 *   Albumin   2+ or more with raised BP = pre-eclampsia concern
 */

const ALBUMIN_SCALE = { nil: 0, trace: 1, '1+': 2, '2+': 3, '3+': 4, '4+': 5 };

export const URINE_ALBUMIN_OPTIONS = Object.keys(ALBUMIN_SCALE);

/**
 * Grades a set of vitals into risk-timeline findings.
 *
 * @param {Object} vitals
 * @param {Object} [context] - { stage, gestationalWeeks, postpartumDay }
 * @returns {{ findings: Array, highest_severity: string|null, has_emergency: boolean }}
 */
export function gradeVitals(vitals = {}, context = {}) {
  const findings = [];
  const stage = context.stage === 'postpartum' ? 'postpartum' : 'antenatal';

  const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const systolic = num(vitals.systolic_bp);
  const diastolic = num(vitals.diastolic_bp);
  const hb = num(vitals.hemoglobin_gdl);
  const temp = num(vitals.temperature_c);
  const pulse = num(vitals.pulse_bpm);
  const albumin = vitals.urine_albumin || null;
  const albuminLevel = albumin ? (ALBUMIN_SCALE[albumin] ?? 0) : null;

  const push = (f) => findings.push({ ...f, source: 'vitals' });

  // ── Blood pressure ────────────────────────────────────────────────────────
  if (systolic !== null && diastolic !== null) {
    const raised = systolic >= 140 || diastolic >= 90;
    const severe = systolic >= 160 || diastolic >= 110;
    const bp = `${systolic}/${diastolic} mmHg`;

    if (severe) {
      push({
        symptom_name: 'Severe Hypertension',
        severity: 'severe',
        requires_doctor_referral: true,
        flag_description:
          `Blood pressure ${bp} — at or above 160/110. This is severe hypertension and, ` +
          `${stage === 'postpartum' ? 'postpartum, ' : ''}carries an immediate risk of eclampsia and stroke.`,
        recommended_asha_action:
          'Do not wait for a repeat reading. Call 108 and refer to an FRU now. Keep her lying on her left side and note the time the reading was taken.'
      });
    } else if (raised) {
      // Proteinuria alongside raised BP is the pre-eclampsia definition, so
      // the pair is graded higher than either alone.
      const withProteinuria = albuminLevel !== null && albuminLevel >= 3;

      push({
        symptom_name: withProteinuria ? 'Raised Blood Pressure with Proteinuria' : 'Raised Blood Pressure',
        severity: withProteinuria ? 'severe' : 'moderate',
        requires_doctor_referral: true,
        flag_description: withProteinuria
          ? `Blood pressure ${bp} with urine albumin ${albumin}. Raised BP together with proteinuria meets the definition of pre-eclampsia.`
          : `Blood pressure ${bp} — at or above 140/90. Raised BP in ${stage === 'postpartum' ? 'the postpartum period' : 'pregnancy'} requires assessment.`,
        recommended_asha_action: withProteinuria
          ? 'Refer to an FRU today — not the next scheduled visit. Carry the referral slip with both readings on it.'
          : 'Rest her for 15 minutes and repeat the reading. If still at or above 140/90, test urine for albumin and refer to the PHC the same day.'
      });
    } else if (systolic < 90 || diastolic < 60) {
      push({
        symptom_name: 'Low Blood Pressure',
        severity: 'moderate',
        requires_doctor_referral: false,
        flag_description:
          `Blood pressure ${bp} — below 90/60. Common in mid-pregnancy, but with bleeding or ` +
          `breathlessness it can indicate shock.`,
        recommended_asha_action:
          'Have her lie down and take fluids. If she is bleeding, breathless, or her pulse is above 110, treat it as shock and call 108.'
      });
    }
  }

  // ── Proteinuria on its own ────────────────────────────────────────────────
  if (albuminLevel !== null && albuminLevel >= 3 && !(systolic >= 140 || diastolic >= 90)) {
    push({
      symptom_name: 'Proteinuria',
      severity: 'moderate',
      requires_doctor_referral: true,
      flag_description:
        `Urine albumin ${albumin} without raised blood pressure. May indicate kidney involvement ` +
        `or early pre-eclampsia before the blood pressure rises.`,
      recommended_asha_action: 'Refer to the PHC for a repeat urine test and blood pressure check within 48 hours.'
    });
  }

  // ── Haemoglobin ───────────────────────────────────────────────────────────
  if (hb !== null) {
    if (hb < 7) {
      push({
        symptom_name: 'Severe Anaemia',
        severity: 'severe',
        requires_doctor_referral: true,
        flag_description:
          `Haemoglobin ${hb} g/dL — below 7. Severe anaemia sharply raises the risk of ` +
          `haemorrhagic death at delivery and of cardiac failure.`,
        recommended_asha_action:
          'Refer to an FRU for assessment and possible transfusion. Do not manage with IFA tablets alone. Ensure delivery is planned at a facility with blood available.'
      });
    } else if (hb < 10) {
      push({
        symptom_name: 'Moderate Anaemia',
        severity: 'moderate',
        requires_doctor_referral: true,
        flag_description: `Haemoglobin ${hb} g/dL — moderate anaemia (7 to 9.9).`,
        recommended_asha_action:
          'Refer to the PHC for the Anemia Mukt Bharat treatment protocol. Reinforce daily IFA after food, never with tea or milk, and counsel on iron-rich foods.'
      });
    } else if (hb < 11) {
      push({
        symptom_name: 'Mild Anaemia',
        severity: 'mild',
        requires_doctor_referral: false,
        flag_description: `Haemoglobin ${hb} g/dL — mild anaemia (10 to 10.9).`,
        recommended_asha_action:
          'Reinforce daily IFA compliance and iron-rich foods. Recheck haemoglobin at the next ANC contact.'
      });
    }
  }

  // ── Temperature ───────────────────────────────────────────────────────────
  if (temp !== null && temp >= 38) {
    const high = temp >= 39;
    push({
      symptom_name: 'Fever on Examination',
      severity: high || stage === 'postpartum' ? 'severe' : 'moderate',
      requires_doctor_referral: true,
      flag_description:
        `Temperature ${temp} °C.` +
        (stage === 'postpartum'
          ? ' Fever after delivery suggests puerperal sepsis until proven otherwise.'
          : ' Fever in pregnancy may indicate infection requiring treatment.'),
      recommended_asha_action: stage === 'postpartum'
        ? 'Check for foul-smelling lochia and uterine tenderness. Refer to an FRU the same day for IV antibiotics.'
        : 'Refer to the PHC the same day for malaria and UTI testing. Encourage fluids during transport.'
    });
  }

  // ── Pulse ─────────────────────────────────────────────────────────────────
  if (pulse !== null) {
    if (pulse > 110) {
      push({
        symptom_name: 'Tachycardia',
        severity: 'moderate',
        requires_doctor_referral: true,
        flag_description:
          `Pulse ${pulse} bpm — above 110. With bleeding, pallor or low blood pressure this is a sign of shock.`,
        recommended_asha_action:
          'Check for bleeding and pallor and recheck blood pressure. If she is bleeding or the BP is low, call 108 immediately.'
      });
    } else if (pulse < 50) {
      push({
        symptom_name: 'Bradycardia',
        severity: 'moderate',
        requires_doctor_referral: true,
        flag_description: `Pulse ${pulse} bpm — below 50.`,
        recommended_asha_action: 'Recheck after five minutes of rest. If it remains below 50, refer to the PHC.'
      });
    }
  }

  const order = { mild: 0, moderate: 1, severe: 2 };
  const highest = findings.reduce(
    (acc, f) => (acc === null || order[f.severity] > order[acc] ? f.severity : acc),
    null
  );

  return {
    findings,
    highest_severity: highest,
    has_emergency: findings.some((f) => f.severity === 'severe')
  };
}

/**
 * Compares two weight readings to describe the trend, for the UI.
 */
export function weightTrend(current, previous, daysApart) {
  if (current == null || previous == null || !daysApart) return null;
  const delta = Number((current - previous).toFixed(2));
  const perWeek = Number(((delta / daysApart) * 7).toFixed(2));
  return {
    delta_kg: delta,
    per_week_kg: perWeek,
    direction: delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Voice extraction
// ─────────────────────────────────────────────────────────────────────────────

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
  // Hindi / Hinglish numerals that appear in spoken readings
  ek: 1, do: 2, teen: 3, char: 4, paanch: 5, panch: 5, chhe: 6, cheh: 6,
  saat: 7, aath: 8, nau: 9, das: 10, sau: 100, chalis: 40, chaalis: 40,
  pachas: 50, pachaas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90
};

/**
 * Converts a spoken number phrase to a value: "one forty" → 140,
 * "one hundred forty" → 140, "ek sau chalis" → 140.
 */
function spokenToNumber(phrase) {
  const words = phrase.toLowerCase().split(/[\s-]+/).filter(Boolean);
  const values = [];

  for (const w of words) {
    if (/^\d+$/.test(w)) { values.push(parseInt(w, 10)); continue; }
    if (w in NUMBER_WORDS) { values.push(NUMBER_WORDS[w]); continue; }
    // Speech runs on past the number — "ninety hai", "ninety mmHg". Stop at
    // the first word that is not a numeral rather than discarding the whole
    // reading. Every result is range-checked by the caller, so a truncated
    // parse fails safe.
    break;
  }

  if (values.length === 0) return null;
  if (values.length === 1) return values[0];

  // "one hundred forty" / "ek sau chalis"
  const hundredIdx = values.findIndex((v) => v === 100);
  if (hundredIdx > 0) {
    const base = values[hundredIdx - 1] * 100;
    const rest = values.slice(hundredIdx + 1).reduce((a, b) => a + b, 0);
    return base + rest;
  }

  // "one forty" → 1 and 40 → 140. Only valid when the first digit is small
  // and the second is a round tens value.
  if (values.length === 2 && values[0] <= 2 && values[1] >= 10) {
    return values[0] * 100 + values[1];
  }

  return values.reduce((a, b) => a + b, 0);
}

const SPOKEN = '(?:\\d{1,3}|[a-z]+(?:[\\s-][a-z]+){0,3})';

/**
 * Parses vitals mentioned in a visit transcript.
 *
 * ASHA workers say the numbers out loud — "BP one forty by ninety hai",
 * "Hb seven point two". This pre-fills the form so the worker confirms rather
 * than retypes; nothing is stored until she does.
 *
 * Deterministic on purpose: a misheard blood pressure drives a wrong referral,
 * so this is regex over the transcript rather than a model guess, and every
 * value is range-checked before being offered.
 *
 * @param {string} transcript
 * @returns {{ vitals: Object, matches: Array<{field, raw, value}> }}
 */
export function parseVitalsFromText(transcript) {
  const vitals = {};
  const matches = [];
  if (!transcript || typeof transcript !== 'string') return { vitals, matches };

  const text = transcript.toLowerCase();

  const record = (field, value, raw, min, max) => {
    if (value === null || !Number.isFinite(value)) return;
    if (value < min || value > max) return; // implausible — almost always mishearing
    if (vitals[field] !== undefined) return; // first mention wins
    vitals[field] = value;
    matches.push({ field, raw: raw.trim(), value });
  };

  // ── Blood pressure: "bp 140/90", "bp one forty by ninety", "बीपी 140 बटा 90"
  const bpPattern = new RegExp(
    `(?:bp|b\\.p\\.?|blood\\s*pressure|बीपी|रक्तचाप)\\s*(?:is|hai|:)?\\s*` +
    `(${SPOKEN})\\s*(?:\\/|by|over|bata|बटा|पर)\\s*(${SPOKEN})`,
    'i'
  );
  const bp = text.match(bpPattern);
  if (bp) {
    const sys = spokenToNumber(bp[1]);
    const dia = spokenToNumber(bp[2]);
    // Only accept a pair that is internally consistent.
    if (sys && dia && sys > dia) {
      record('systolic_bp', sys, bp[0], 60, 260);
      record('diastolic_bp', dia, bp[0], 30, 180);
    }
  }

  // Bare "140/90" with no label, when no labelled reading was found.
  if (vitals.systolic_bp === undefined) {
    const bare = text.match(/\b(\d{2,3})\s*\/\s*(\d{2,3})\b/);
    if (bare) {
      const sys = parseInt(bare[1], 10);
      const dia = parseInt(bare[2], 10);
      if (sys > dia && sys >= 60 && sys <= 260 && dia >= 30 && dia <= 180) {
        record('systolic_bp', sys, bare[0], 60, 260);
        record('diastolic_bp', dia, bare[0], 30, 180);
      }
    }
  }

  // ── Haemoglobin: "hb 7.2", "haemoglobin seven point two", "एचबी 9"
  const hbMatch = text.match(
    /(?:hb|h\.b\.?|haemoglobin|hemoglobin|एचबी|हीमोग्लोबिन)\s*(?:is|hai|:)?\s*(\d{1,2}(?:[.,]\d)?)/i
  );
  if (hbMatch) {
    record('hemoglobin_gdl', parseFloat(hbMatch[1].replace(',', '.')), hbMatch[0], 2, 20);
  } else {
    const hbSpoken = text.match(
      /(?:hb|haemoglobin|hemoglobin|एचबी)\s*(?:is|hai|:)?\s*([a-z]+)(?:\s*point\s*([a-z0-9]+))?/i
    );
    if (hbSpoken) {
      const whole = spokenToNumber(hbSpoken[1]);
      const frac = hbSpoken[2] ? spokenToNumber(hbSpoken[2]) : 0;
      if (whole !== null) {
        record('hemoglobin_gdl', parseFloat(`${whole}.${frac ?? 0}`), hbSpoken[0], 2, 20);
      }
    }
  }

  // ── Weight: "weight 52 kg", "vazan 52 kilo", "वजन 52"
  const wt = text.match(
    /(?:weight|wt|vazan|vajan|वजन|वज़न)\s*(?:is|hai|:)?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:kg|kilo|किलो)?/i
  );
  if (wt) record('weight_kg', parseFloat(wt[1].replace(',', '.')), wt[0], 25, 200);

  // ── Temperature: "temperature 38.5", "bukhar 101 fahrenheit"
  const tempC = text.match(
    /(?:temp(?:erature)?|तापमान)\s*(?:is|hai|:)?\s*(\d{2,3}(?:[.,]\d)?)\s*(?:c|celsius|centigrade|°c)?/i
  );
  if (tempC) {
    const raw = parseFloat(tempC[1].replace(',', '.'));
    // A reading in the 95-108 range was spoken in Fahrenheit.
    const celsius = raw > 60 ? Number((((raw - 32) * 5) / 9).toFixed(1)) : raw;
    record('temperature_c', celsius, tempC[0], 30, 45);
  }

  // ── Pulse: "pulse 96", "nabz 96"
  const pulse = text.match(/(?:pulse|heart\s*rate|nabz|नब्ज|नाड़ी)\s*(?:is|hai|:)?\s*(\d{2,3})/i);
  if (pulse) record('pulse_bpm', parseInt(pulse[1], 10), pulse[0], 30, 220);

  // ── Urine albumin: "albumin 2 plus", "urine albumin trace"
  const alb = text.match(
    /(?:albumin|protein|urine)\s*(?:albumin|protein)?\s*(?:is|hai|:)?\s*(nil|trace|[1-4]\s*\+|[1-4]\s*plus)/i
  );
  if (alb) {
    const raw = alb[1].toLowerCase().replace(/\s+/g, '').replace('plus', '+');
    if (raw in ALBUMIN_SCALE) {
      vitals.urine_albumin = raw;
      matches.push({ field: 'urine_albumin', raw: alb[0].trim(), value: raw });
    }
  }

  // ── Fundal height: "fundal height 28 cm"
  const fh = text.match(/(?:fundal\s*height|fundus|सर्वोच्च)\s*(?:is|hai|:)?\s*(\d{1,2}(?:[.,]\d)?)\s*(?:cm)?/i);
  if (fh) record('fundal_height_cm', parseFloat(fh[1].replace(',', '.')), fh[0], 5, 50);

  return { vitals, matches };
}
