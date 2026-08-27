import express from 'express';
import { supabaseAdmin, createUserClient } from '../config/supabase.js';

const router = express.Router();

/**
 * GET /api/patients
 * Retrieves patients assigned to the authenticated ASHA worker
 */
router.get('/', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing.' });
    }

    const token = authHeader.replace('Bearer ', '');
    const userClient = createUserClient(token);

    const { data: patients, error } = await userClient
      .from('patients')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching patients:', error.message);
      return res.status(400).json({ error: `Failed to retrieve patients: ${error.message}` });
    }

    return res.json({ success: true, data: patients });
  } catch (err) {
    console.error('Server error in GET /api/patients:', err.message);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

/**
 * POST /api/patients
 * Registers a new pregnant patient assigned to the current ASHA worker
 */
router.post('/', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing.' });
    }

    const token = authHeader.replace('Bearer ', '');
    const userClient = createUserClient(token);

    // Get current user id
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid authentication session.' });
    }

    const { name, age, gestational_weeks, gravida, para, village, contact_phone, emergency_contact, blood_group } = req.body;

    if (!name || !age) {
      return res.status(400).json({ error: 'Patient name and age are required.' });
    }

    const { data: newPatient, error: insertError } = await userClient
      .from('patients')
      .insert([
        {
          asha_worker_id: user.id,
          name,
          gestational_weeks: parseInt(gestational_weeks || 12, 10),
          gravida: parseInt(gravida || 1, 10),
          para: parseInt(para || 0, 10),
          village: village || '',
          contact_phone: contact_phone || '',
          emergency_contact: emergency_contact || '',
          blood_group: blood_group || 'Unknown'
        }
      ])
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting patient:', JSON.stringify(insertError, null, 2));
      return res.status(400).json({ error: `Failed to create patient record: ${insertError.message}` });
    }

    return res.status(201).json({ success: true, data: newPatient });
  } catch (err) {
    console.error('Server error in POST /api/patients:', err.message);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

/**
 * GET /api/patients/:id/risk-timeline
 * Retrieves risk timeline entries for a specific patient
 */
router.get('/:id/risk-timeline', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing.' });
    }

    const token = authHeader.replace('Bearer ', '');
    const userClient = createUserClient(token);
    const patientId = req.params.id;

    const { data: timeline, error } = await userClient
      .from('risk_timeline')
      .select('*')
      .eq('patient_id', patientId)
      .order('date_logged', { ascending: true });

    if (error) {
      console.error('Error fetching risk timeline:', error.message);
      return res.status(400).json({ error: `Failed to retrieve risk timeline: ${error.message}` });
    }

    return res.json({ success: true, data: timeline });
  } catch (err) {
    console.error('Server error in GET /api/patients/:id/risk-timeline:', err.message);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

/**
 * GET /api/patients/:id/calls
 * Canonical route: retrieves all visit records for a specific patient.
 * Uses the visits table (the complete pipeline source of truth).
 * RLS enforces per-worker isolation via the user-bound Supabase client.
 */
router.get('/:id/calls', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing.' });
    }

    const token = authHeader.replace('Bearer ', '');
    const userClient = createUserClient(token);
    const patientId = req.params.id;

    const { data: visits, error } = await userClient
      .from('visits')
      .select('*, detected_myths(*), risk_timeline(*)')
      .eq('patient_id', patientId)
      .order('visit_date', { ascending: false });

    if (error) {
      console.error('Error fetching patient calls (visits):', error.message);
      return res.status(400).json({ error: `Failed to retrieve patient calls: ${error.message}` });
    }

    return res.json({ success: true, data: visits });
  } catch (err) {
    console.error('Server error in GET /api/patients/:id/calls:', err.message);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

export default router;
