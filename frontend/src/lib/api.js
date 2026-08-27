import { supabase } from './supabase';

const API_BASE_URL = '/api';

/**
 * Gets authorization headers with current Supabase session token
 */
async function getAuthHeaders() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    let token = session?.access_token;

    if (session && session.expires_at) {
      const now = Math.floor(Date.now() / 1000);
      // If the token is within 10 seconds of expiring, refresh it
      if (session.expires_at - now < 10) {
        const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshedSession) {
          token = refreshedSession.access_token;
        }
      }
    }

    if (!token) {
      throw new Error('No active authentication session found.');
    }

    return {
      'Authorization': `Bearer ${token}`
    };
  } catch (error) {
    console.error('Error getting auth session header:', error.message);
    throw error;
  }
}

/**
 * API Client methods with try/catch error handling & async/await
 */
export const api = {
  // Patients API
  getPatients: async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/patients`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch patients');
      return json.data;
    } catch (err) {
      console.error('api.getPatients error:', err.message);
      throw err;
    }
  },

  createPatient: async (patientData) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/patients`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(patientData)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create patient');
      return json.data;
    } catch (err) {
      console.error('api.createPatient error:', err);
      throw err;
    }
  },

  getPatientRiskTimeline: async (patientId) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/patients/${patientId}/risk-timeline`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch risk timeline');
      return json.data;
    } catch (err) {
      console.error('api.getPatientRiskTimeline error:', err.message);
      throw err;
    }
  },

  /**
   * getPatientCalls — canonical method for fetching a patient's visit records.
   * Hits GET /api/patients/:id/calls, which queries the visits table with
   * detected_myths and risk_timeline joined. Enforces per-worker RLS.
   */
  getPatientCalls: async (patientId) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/patients/${patientId}/calls`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch patient calls');
      return json.data;
    } catch (err) {
      console.error('api.getPatientCalls error:', err.message);
      throw err;
    }
  },

  // Visits & AI API
  uploadVisitAudio: async (patientId, audioFile) => {
    try {
      const headers = await getAuthHeaders();
      const formData = new FormData();
      formData.append('patient_id', patientId);
      if (audioFile) {
        formData.append('audio', audioFile);
      }

      const res = await fetch(`${API_BASE_URL}/visits/upload`, {
        method: 'POST',
        headers,
        body: formData
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to upload visit audio');
      return json;
    } catch (err) {
      console.error('api.uploadVisitAudio error:', err.message);
      throw err;
    }
  },

  processVisitAi: async (visitId, audioFilePath, fallbackTranscript) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/visits/${visitId}/process`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioFilePath, fallbackTranscript })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to process visit AI analysis');
      return json.data;
    } catch (err) {
      console.error('api.processVisitAi error:', err.message);
      throw err;
    }
  },

  getPatientVisits: async (patientId) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/visits/patient/${patientId}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch patient visits');
      return json.data;
    } catch (err) {
      console.error('api.getPatientVisits error:', err.message);
      throw err;
    }
  },

  getVisitDetails: async (visitId) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/visits/${visitId}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch visit details');
      return json.data;
    } catch (err) {
      console.error('api.getVisitDetails error:', err.message);
      throw err;
    }
  },

  // Pregnancy Myths Catalog API
  getMythsCatalog: async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/myths`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch myths catalog');
      return json.data;
    } catch (err) {
      console.error('api.getMythsCatalog error:', err.message);
      throw err;
    }
  },

  // Twilio SMS API
  sendSmsAlert: async (recipientPhone, message, riskTimelineId) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/sms/send-alert`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientPhone, message, riskTimelineId })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to dispatch SMS alert');
      return json.data;
    } catch (err) {
      console.error('api.sendSmsAlert error:', err.message);
      throw err;
    }
  },

  // Profile API
  getProfile: async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/profile`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch profile');
      return json.data;
    } catch (err) {
      console.error('api.getProfile error:', err.message);
      throw err;
    }
  },

  // All visits for current worker
  getAllVisits: async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/visits`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch visits');
      return json.data;
    } catch (err) {
      console.error('api.getAllVisits error:', err.message);
      throw err;
    }
  },

  // All detected myths for current worker
  getDetectedMyths: async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/myths/detected`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch detected myths');
      return json.data;
    } catch (err) {
      console.error('api.getDetectedMyths error:', err.message);
      throw err;
    }
  }
};
