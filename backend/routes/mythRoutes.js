import express from 'express';
import { supabaseAdmin, createUserClient } from '../config/supabase.js';

const router = express.Router();

/**
 * GET /api/myths
 * Retrieves the fixed pregnancy myths reference database
 */
router.get('/', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing.' });
    }

    const { data: myths, error } = await supabaseAdmin
      .from('pregnancy_myths')
      .select('*')
      .order('category', { ascending: true });

    if (error) {
      console.error('Error fetching pregnancy myths catalog:', error.message);
      return res.status(400).json({ error: `Failed to fetch myths database: ${error.message}` });
    }

    return res.json({ success: true, data: myths });
  } catch (err) {
    console.error('Server error in GET /api/myths:', err.message);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

/**
 * GET /api/myths/detected
 * Retrieves all detected myths for the authenticated ASHA worker
 */
router.get('/detected', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing.' });
    }

    const token = authHeader.replace('Bearer ', '');
    const userClient = createUserClient(token);

    const { data: detected, error } = await userClient
      .from('detected_myths')
      .select('*');

    if (error) {
      console.error('Error fetching detected myths:', error.message);
      return res.status(400).json({ error: `Failed to fetch detected myths: ${error.message}` });
    }

    return res.json({ success: true, data: detected });
  } catch (err) {
    console.error('Server error in GET /api/myths/detected:', err.message);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

export default router;
