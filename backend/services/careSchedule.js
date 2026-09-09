/**
 * backend/services/careSchedule.js
 *
 * Turns a patient's dates into the visits and doses that are actually due.
 *
 * `gestational_weeks` was previously stored and used for nothing but a prompt
 * variable. This derives three schedules from it and from `delivery_date`:
 *
 *   1. ANC  — India's four-visit antenatal schedule, plus TT/Td and IFA.
 *   2. HBNC — postnatal home visits on days 1, 3, 7, 14, 21, 28 and 42.
 *   3. NIS  — the National Immunization Schedule for the infant.
 *
 * Due dates are computed rather than stored, so the schedule stays correct if
 * a date is corrected later. Only what actually happened — a dose given, or
 * refused — is persisted (public.immunization_records).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function addDays(date, days) {
  const d = new Date(date.getTime() + days * MS_PER_DAY);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISODate(date) {
  return date.toISOString().split('T')[0];
}

function daysBetween(from, to) {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Estimates the date the patient reached a given gestational week, working
 * back from the gestational age recorded at registration.
 */
function conceptionAnchor(patient) {
  const registered = patient.created_at ? new Date(patient.created_at) : new Date();
  registered.setHours(0, 0, 0, 0);
  const weeksAtRegistration = Number(patient.gestational_weeks) || 12;
  // Day zero of the pregnancy (LMP), estimated.
  return addDays(registered, -weeksAtRegistration * 7);
}

/**
 * Current gestational age in weeks, advanced from the registration date.
 */
export function currentGestationalWeeks(patient) {
  if (!patient) return null;
  if (patient.stage === 'postpartum') return null;
  const lmp = conceptionAnchor(patient);
  const weeks = Math.floor(daysBetween(lmp, startOfToday()) / 7);
  return Math.max(0, Math.min(45, weeks));
}

/**
 * Days elapsed since delivery, or null when the patient has not delivered.
 */
export function postpartumDay(patient) {
  if (!patient?.delivery_date) return null;
  const delivered = new Date(patient.delivery_date);
  delivered.setHours(0, 0, 0, 0);
  return Math.max(0, daysBetween(delivered, startOfToday()));
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule definitions
// ─────────────────────────────────────────────────────────────────────────────

// India's four-visit ANC schedule (MoHFW). Weeks are inclusive windows.
const ANC_VISITS = [
  { code: 'ANC-1', label: 'First ANC visit',  fromWeek: 4,  toWeek: 12, note: 'Register the pregnancy, confirm gestational age, start IFA, first Hb and BP.' },
  { code: 'ANC-2', label: 'Second ANC visit', fromWeek: 14, toWeek: 26, note: 'BP, weight, foetal heart sounds, anaemia check, TT/Td status.' },
  { code: 'ANC-3', label: 'Third ANC visit',  fromWeek: 28, toWeek: 34, note: 'BP, foetal growth, danger-sign counselling, birth preparedness plan.' },
  { code: 'ANC-4', label: 'Fourth ANC visit', fromWeek: 36, toWeek: 40, note: 'Confirm delivery facility, malpresentation check, final danger-sign review.' }
];

const ANC_INTERVENTIONS = [
  { code: 'TT-1',  label: 'TT/Td first dose',  fromWeek: 4,  toWeek: 16, note: 'Give as early in pregnancy as possible.' },
  { code: 'TT-2',  label: 'TT/Td second dose', fromWeek: 8,  toWeek: 20, note: 'Give at least 4 weeks after TT-1 and at least 4 weeks before delivery.' },
  { code: 'IFA',   label: 'IFA supplementation', fromWeek: 14, toWeek: 40, note: '180 tablets total — one daily from the second trimester through delivery.' },
  { code: 'CA',    label: 'Calcium supplementation', fromWeek: 14, toWeek: 40, note: 'Two 500 mg tablets daily from 14 weeks to 6 months postpartum.' }
];

// HBNC home-visit schedule (MoHFW). Institutional deliveries start at day 3;
// home deliveries add visits on days 1 and 2.
const HBNC_INSTITUTIONAL_DAYS = [3, 7, 14, 21, 28, 42];
const HBNC_HOME_DAYS = [1, 2, 3, 7, 14, 21, 28, 42];

const HBNC_NOTES = {
  1:  'Weigh the baby, check temperature and feeding, assess the mother for bleeding.',
  2:  'Check cord, feeding and warmth. Reassess maternal bleeding and BP.',
  3:  'Weigh the baby, check for jaundice, confirm exclusive breastfeeding.',
  7:  'Assess weight gain and cord healing. Ask the mother about mood and sleep.',
  14: 'Weigh the baby. Reinforce exclusive breastfeeding. Check maternal anaemia.',
  21: 'Growth check and immunization readiness. Discuss family planning.',
  28: 'Complete newborn assessment. Confirm the 6-week immunization plan.',
  42: 'Final postnatal visit. Screen the mother for depression (EPDS) and confirm contraception.'
};

// National Immunization Schedule — infant doses, by age in days from birth.
const IMMUNIZATION_SCHEDULE = [
  { code: 'BCG',        label: 'BCG',                     ageDays: 0,   window: 14,  protects: 'Tuberculosis' },
  { code: 'HEPB-0',     label: 'Hepatitis B (birth dose)', ageDays: 0,  window: 1,   protects: 'Hepatitis B' },
  { code: 'OPV-0',      label: 'OPV-0',                   ageDays: 0,   window: 15,  protects: 'Polio' },
  { code: 'PENTA-1',    label: 'Pentavalent-1',           ageDays: 42,  window: 28,  protects: 'Diphtheria, pertussis, tetanus, Hep B, Hib' },
  { code: 'OPV-1',      label: 'OPV-1',                   ageDays: 42,  window: 28,  protects: 'Polio' },
  { code: 'RVV-1',      label: 'Rotavirus-1',             ageDays: 42,  window: 28,  protects: 'Rotavirus diarrhoea' },
  { code: 'FIPV-1',     label: 'fIPV-1',                  ageDays: 42,  window: 28,  protects: 'Polio' },
  { code: 'PCV-1',      label: 'PCV-1',                   ageDays: 42,  window: 28,  protects: 'Pneumococcal pneumonia' },
  { code: 'PENTA-2',    label: 'Pentavalent-2',           ageDays: 70,  window: 28,  protects: 'Diphtheria, pertussis, tetanus, Hep B, Hib' },
  { code: 'OPV-2',      label: 'OPV-2',                   ageDays: 70,  window: 28,  protects: 'Polio' },
  { code: 'RVV-2',      label: 'Rotavirus-2',             ageDays: 70,  window: 28,  protects: 'Rotavirus diarrhoea' },
  { code: 'PENTA-3',    label: 'Pentavalent-3',           ageDays: 98,  window: 28,  protects: 'Diphtheria, pertussis, tetanus, Hep B, Hib' },
  { code: 'OPV-3',      label: 'OPV-3',                   ageDays: 98,  window: 28,  protects: 'Polio' },
  { code: 'RVV-3',      label: 'Rotavirus-3',             ageDays: 98,  window: 28,  protects: 'Rotavirus diarrhoea' },
  { code: 'FIPV-2',     label: 'fIPV-2',                  ageDays: 98,  window: 28,  protects: 'Polio' },
  { code: 'PCV-2',      label: 'PCV-2',                   ageDays: 98,  window: 28,  protects: 'Pneumococcal pneumonia' },
  { code: 'MR-1',       label: 'Measles-Rubella-1',       ageDays: 273, window: 90,  protects: 'Measles, rubella' },
  { code: 'PCV-B',      label: 'PCV booster',             ageDays: 273, window: 90,  protects: 'Pneumococcal pneumonia' },
  { code: 'JE-1',       label: 'JE-1 (endemic districts)', ageDays: 273, window: 90, protects: 'Japanese encephalitis' },
  { code: 'VITA-1',     label: 'Vitamin A (1st dose)',    ageDays: 273, window: 90,  protects: 'Vitamin A deficiency' },
  { code: 'MR-2',       label: 'Measles-Rubella-2',       ageDays: 480, window: 120, protects: 'Measles, rubella' },
  { code: 'DPT-B1',     label: 'DPT booster-1',           ageDays: 480, window: 120, protects: 'Diphtheria, pertussis, tetanus' },
  { code: 'OPV-B',      label: 'OPV booster',             ageDays: 480, window: 120, protects: 'Polio' },
  { code: 'JE-2',       label: 'JE-2 (endemic districts)', ageDays: 480, window: 120, protects: 'Japanese encephalitis' }
];

export const IMMUNIZATION_CATALOG = IMMUNIZATION_SCHEDULE;

// ─────────────────────────────────────────────────────────────────────────────
// Builders
// ─────────────────────────────────────────────────────────────────────────────

function statusFor(dueDate, windowDays, today) {
  const overdueBy = daysBetween(dueDate, today);
  if (overdueBy > windowDays) return { status: 'overdue', days: overdueBy - windowDays };
  if (overdueBy >= 0) return { status: 'due', days: overdueBy };
  return { status: 'upcoming', days: -overdueBy };
}

/**
 * Antenatal schedule for a patient still carrying.
 */
function buildAntenatalSchedule(patient, today) {
  const lmp = conceptionAnchor(patient);
  const weeks = currentGestationalWeeks(patient);

  const asItem = (entry, kind) => {
    const dueDate = addDays(lmp, entry.fromWeek * 7);
    const windowDays = (entry.toWeek - entry.fromWeek) * 7;
    const { status, days } = statusFor(dueDate, windowDays, today);
    return {
      kind,
      code: entry.code,
      label: entry.label,
      note: entry.note,
      due_date: toISODate(dueDate),
      window_days: windowDays,
      target: `Weeks ${entry.fromWeek}–${entry.toWeek}`,
      status,
      days
    };
  };

  return {
    stage: 'antenatal',
    gestational_weeks: weeks,
    items: [
      ...ANC_VISITS.map((v) => asItem(v, 'anc_visit')),
      ...ANC_INTERVENTIONS.map((v) => asItem(v, 'intervention'))
    ]
  };
}

/**
 * Postnatal + infant immunization schedule for a delivered patient.
 */
function buildPostpartumSchedule(patient, today, immunizationRecords = []) {
  const delivered = new Date(patient.delivery_date);
  delivered.setHours(0, 0, 0, 0);
  const day = postpartumDay(patient);

  const hbncDays = patient.delivery_place === 'home' ? HBNC_HOME_DAYS : HBNC_INSTITUTIONAL_DAYS;

  const hbncItems = hbncDays.map((d) => {
    const dueDate = addDays(delivered, d);
    const { status, days } = statusFor(dueDate, 2, today);
    return {
      kind: 'hbnc_visit',
      code: `HBNC-D${d}`,
      label: `HBNC home visit — day ${d}`,
      note: HBNC_NOTES[d] || 'Routine postnatal home visit.',
      due_date: toISODate(dueDate),
      window_days: 2,
      target: `Day ${d} after delivery`,
      status,
      days
    };
  });

  // Immunization is only tracked for a live birth.
  const recordByCode = new Map(immunizationRecords.map((r) => [r.vaccine_code, r]));
  const immunizationItems = patient.delivery_outcome === 'live_birth'
    ? IMMUNIZATION_SCHEDULE.map((v) => {
        const dueDate = addDays(delivered, v.ageDays);
        const record = recordByCode.get(v.code);
        const computed = statusFor(dueDate, v.window, today);

        let status = computed.status;
        if (record?.status === 'given') status = 'given';
        else if (record?.status === 'refused') status = 'refused';
        else if (record?.status === 'unavailable') status = 'unavailable';

        return {
          kind: 'immunization',
          code: v.code,
          label: v.label,
          note: `Protects against: ${v.protects}.`,
          due_date: toISODate(dueDate),
          window_days: v.window,
          target: v.ageDays === 0 ? 'At birth' : `${Math.round(v.ageDays / 7)} weeks`,
          status,
          days: computed.days,
          record_id: record?.id || null,
          given_date: record?.given_date || null,
          refusal_reason: record?.refusal_reason || null
        };
      })
    : [];

  return {
    stage: 'postpartum',
    postpartum_day: day,
    items: [...hbncItems, ...immunizationItems]
  };
}

/**
 * Full care schedule for a patient, with the next actionable item surfaced.
 *
 * @param {Object} patient
 * @param {Array}  [immunizationRecords]
 * @returns {Object}
 */
export function buildCareSchedule(patient, immunizationRecords = []) {
  if (!patient) throw new Error('buildCareSchedule error: patient is required.');

  const today = startOfToday();

  const schedule = patient.stage === 'postpartum' && patient.delivery_date
    ? buildPostpartumSchedule(patient, today, immunizationRecords)
    : buildAntenatalSchedule(patient, today);

  const rank = { overdue: 0, due: 1, upcoming: 2, given: 3, refused: 0, unavailable: 1 };
  const actionable = schedule.items
    .filter((i) => ['overdue', 'due', 'refused'].includes(i.status))
    .sort((a, b) => (rank[a.status] - rank[b.status]) || (b.days - a.days));

  return {
    ...schedule,
    items: schedule.items.sort((a, b) => new Date(a.due_date) - new Date(b.due_date)),
    actionable,
    next_action: actionable[0] || schedule.items.find((i) => i.status === 'upcoming') || null,
    overdue_count: schedule.items.filter((i) => i.status === 'overdue').length,
    due_count: schedule.items.filter((i) => i.status === 'due').length,
    refused_count: schedule.items.filter((i) => i.status === 'refused').length
  };
}

/**
 * One-line summary for a patient card, e.g.
 *   "ANC-3 due this week · TT-2 overdue by 9 days"
 */
export function scheduleHeadline(schedule) {
  if (!schedule?.actionable?.length) {
    const next = schedule?.next_action;
    return next ? `${next.code} upcoming in ${next.days} day${next.days === 1 ? '' : 's'}` : 'No visits due';
  }

  return schedule.actionable
    .slice(0, 2)
    .map((i) => {
      if (i.status === 'overdue') return `${i.code} overdue by ${i.days} day${i.days === 1 ? '' : 's'}`;
      if (i.status === 'refused') return `${i.code} refused`;
      return `${i.code} due now`;
    })
    .join(' · ');
}
