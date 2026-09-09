import express from 'express';
import { requireAuth, asyncRoute } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/profile
 * The authenticated ASHA worker's own profile.
 *
 * The profiles row is created by the on_auth_user_created trigger
 * (migration 009). This backfills it for accounts created before that
 * trigger existed, so the client no longer needs the three duplicated
 * insert-and-retry paths it used to carry.
 */
router.get('/', requireAuth, asyncRoute(async (req, res) => {
  const { data: profile, error } = await req.userClient
    .from('profiles')
    .select('*')
    .eq('id', req.user.id)
    .maybeSingle();

  if (error) {
    return res.status(400).json({ error: 'PROFILE_FETCH_FAILED', message: error.message });
  }

  if (profile) {
    return res.json({ success: true, data: profile });
  }

  const meta = req.user.user_metadata || {};
  const { data: created, error: insertError } = await req.userClient
    .from('profiles')
    .insert({
      id: req.user.id,
      full_name: meta.full_name || req.user.email?.split('@')[0] || 'ASHA Worker',
      phone_number: meta.phone_number || null,
      village_name: meta.village_name || null,
      city: meta.city || null,
      state: meta.state || null,
      pincode: meta.pincode || null,
      age: Number.isFinite(parseInt(meta.age, 10)) ? parseInt(meta.age, 10) : null
    })
    .select()
    .single();

  if (insertError) {
    console.error('Profile backfill failed:', insertError);
    return res.status(400).json({ error: 'PROFILE_CREATE_FAILED', message: insertError.message });
  }

  return res.json({ success: true, data: created });
}));

/**
 * PATCH /api/profile
 */
router.patch('/', requireAuth, asyncRoute(async (req, res) => {
  const allowed = ['full_name', 'phone_number', 'village_name', 'sub_center', 'age', 'city', 'state', 'pincode'];

  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (updates.pincode && !/^\d{6}$/.test(String(updates.pincode))) {
    return res.status(400).json({ error: 'PINCODE_INVALID', message: 'Enter a 6-digit PIN code.' });
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'NOTHING_TO_UPDATE', message: 'No editable fields were supplied.' });
  }

  const { data, error } = await req.userClient
    .from('profiles')
    .update(updates)
    .eq('id', req.user.id)
    .select()
    .maybeSingle();

  if (error) {
    return res.status(400).json({ error: 'PROFILE_UPDATE_FAILED', message: error.message });
  }

  return res.json({ success: true, data });
}));

export default router;
