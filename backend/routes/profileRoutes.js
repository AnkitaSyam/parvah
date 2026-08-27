import express from 'express';
import { createUserClient } from '../config/supabase.js';

const router = express.Router();

/**
 * GET /api/profile
 * Retrieves the profile of the authenticated ASHA worker
 */
router.get('/', async (req, res) => {
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

    const { data: profile, error } = await userClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error.message);
      return res.status(400).json({ error: `Failed to retrieve profile: ${error.message}` });
    }

    return res.json({ success: true, data: profile });
  } catch (err) {
    console.error('Server error in GET /api/profile:', err.message);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

export default router;
