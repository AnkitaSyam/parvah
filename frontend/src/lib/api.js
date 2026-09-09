import { supabase } from './supabase';

/**
 * API base URL.
 *
 * This was hardcoded to '/api', which only worked because of the Vite dev
 * proxy — a production build had no backend at all, while VITE_API_BASE_URL
 * sat defined in .env.example and unread.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/** Thrown for any non-2xx response, carrying the server's error code. */
export class ApiError extends Error {
  constructor(message, { code, status } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  let token = session?.access_token;

  // Refresh a little before expiry rather than 10 seconds before, which was
  // tight enough that slow requests failed mid-flight.
  if (session?.expires_at) {
    const secondsLeft = session.expires_at - Math.floor(Date.now() / 1000);
    if (secondsLeft < 60) {
      const { data: { session: refreshed }, error } = await supabase.auth.refreshSession();
      if (!error && refreshed) token = refreshed.access_token;
    }
  }

  if (!token) {
    throw new ApiError('Your session has ended. Sign in again to continue.', { code: 'NO_SESSION', status: 401 });
  }

  return { Authorization: `Bearer ${token}` };
}

/**
 * Single request path for every call — one place that attaches auth, parses
 * the response and turns an error payload into a typed ApiError. Previously
 * each of ~14 methods repeated this and logged to the console on the way past.
 */
async function request(path, { method = 'GET', body, isFormData = false, signal } = {}) {
  const headers = await getAuthHeaders();

  if (body && !isFormData) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
      signal
    });
  } catch (networkError) {
    if (networkError.name === 'AbortError') throw networkError;
    throw new ApiError(
      'Could not reach the server. Check your connection — your work is saved on this device.',
      { code: 'NETWORK_ERROR' }
    );
  }

  let payload = null;
  const text = await response.text();
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = { message: text }; }
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.message || payload?.error || `Request failed (${response.status})`,
      { code: payload?.error, status: response.status }
    );
  }

  return payload;
}

export const api = {
  // ── Patients ──────────────────────────────────────────────────────────────
  getPatients: () => request('/patients').then((r) => r.data),
  createPatient: (patient) => request('/patients', { method: 'POST', body: patient }).then((r) => r.data),
  updatePatient: (id, updates) => request(`/patients/${id}`, { method: 'PATCH', body: updates }).then((r) => r.data),
  deletePatient: (id) => request(`/patients/${id}`, { method: 'DELETE' }).then((r) => r.data),

  /** Records the delivery and moves the patient into postpartum care. */
  recordDelivery: (id, delivery) =>
    request(`/patients/${id}/delivery`, { method: 'POST', body: delivery }).then((r) => r.data),

  getPatientRiskTimeline: (id) => request(`/patients/${id}/risk-timeline`).then((r) => r.data),
  getPatientMyths: (id) => request(`/patients/${id}/myths`).then((r) => r.data),
  getPatientCalls: (id) => request(`/patients/${id}/calls`).then((r) => r.data),

  /** Full explainable risk breakdown — per-symptom points, decay, baseline. */
  getRiskScore: (id) => request(`/patients/${id}/risk-score`).then((r) => r.data),

  /** ANC / HBNC / immunization schedule with what is due, overdue or refused. */
  getSchedule: (id) => request(`/patients/${id}/schedule`).then((r) => r.data),

  // ── Visits & AI ───────────────────────────────────────────────────────────
  uploadVisitAudio: (patientId, audioFile) => {
    const formData = new FormData();
    formData.append('patient_id', patientId);
    if (audioFile) formData.append('audio', audioFile);
    return request('/visits/upload', { method: 'POST', body: formData, isFormData: true });
  },

  processVisitAi: (visitId, fallbackTranscript) =>
    request(`/visits/${visitId}/process`, { method: 'POST', body: { fallbackTranscript } }).then((r) => r.data),

  getPatientVisits: (id) => request(`/visits/patient/${id}`).then((r) => r.data),
  getVisitDetails: (id) => request(`/visits/${id}`).then((r) => r.data),
  getAllVisits: () => request('/visits').then((r) => r.data),

  // ── Myths ─────────────────────────────────────────────────────────────────
  getMythsCatalog: () => request('/myths').then((r) => r.data),
  getDetectedMyths: () => request('/myths/detected').then((r) => r.data),

  /** Persists the "counselled" flag — previously component state only. */
  setMythAddressed: (id, isAddressed) =>
    request(`/myths/detected/${id}`, { method: 'PATCH', body: { is_addressed: isAddressed } }).then((r) => r.data),

  // ── Immunization ──────────────────────────────────────────────────────────
  getImmunizations: (patientId) => request(`/immunizations/patient/${patientId}`).then((r) => r.data),
  getImmunizationCatalog: () => request('/immunizations/catalog').then((r) => r.data),

  setImmunizationStatus: (patientId, vaccineCode, payload) =>
    request(`/immunizations/patient/${patientId}/${vaccineCode}`, { method: 'PUT', body: payload }).then((r) => r.data),

  /** Every vaccine refusal across the caseload — the follow-up worklist. */
  getHesitancyList: () => request('/immunizations/hesitancy').then((r) => r.data),

  // ── Vitals ────────────────────────────────────────────────────────────────
  getVitals: (patientId) => request(`/vitals/patient/${patientId}`).then((r) => r.data),

  /** Saves a reading, grades it against protocol, and rescores her risk. */
  saveVitals: (payload) => request('/vitals', { method: 'POST', body: payload }).then((r) => r.data),

  /**
   * Extracts vitals the worker said aloud ("BP one forty by ninety").
   * Returns candidates only — nothing is stored until she confirms them.
   */
  parseVitals: (transcript) =>
    request('/vitals/parse', { method: 'POST', body: { transcript } }).then((r) => r.data),

  // ── Infant growth ─────────────────────────────────────────────────────────
  getGrowth: (patientId) => request(`/vitals/growth/${patientId}`).then((r) => r.data),
  saveGrowth: (payload) => request('/vitals/growth', { method: 'POST', body: payload }).then((r) => r.data),

  // ── Referral ──────────────────────────────────────────────────────────────
  getReferralSlip: (patientId) => request(`/referrals/patient/${patientId}`).then((r) => r.data),

  // ── SMS ───────────────────────────────────────────────────────────────────
  getSmsTemplates: () => request('/sms/templates').then((r) => r.data),

  /**
   * The recipient is derived server-side from the patient record — the client
   * can no longer choose an arbitrary destination number.
   */
  sendSmsAlert: ({ patientId, template, detail, riskTimelineId }) =>
    request('/sms/send-alert', {
      method: 'POST',
      body: { patientId, template, detail, riskTimelineId }
    }).then((r) => r.data),

  // ── Profile ───────────────────────────────────────────────────────────────
  getProfile: () => request('/profile').then((r) => r.data),
  updateProfile: (updates) => request('/profile', { method: 'PATCH', body: updates }).then((r) => r.data),

  health: () => request('/health')
};
