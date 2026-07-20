import express from 'express';
import { sendSmsAlert } from '../services/twilioSMS.js';
import { createUserClient } from '../config/supabase.js';

const router = express.Router();

/**
 * POST /api/sms/send-alert
 * Dispatches an SMS notification to patient/family or medical supervisor
 */
router.post('/send-alert', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing.' });
    }

    const token = authHeader.replace('Bearer ', '');
    const userClient = createUserClient(token);

    const { recipientPhone, message, riskTimelineId } = req.body;

    if (!recipientPhone || !message) {
      return res.status(400).json({ error: 'recipientPhone and message body are required.' });
    }

    const smsResult = await sendSmsAlert(recipientPhone, message);

    // If riskTimelineId provided, mark SMS as sent
    if (riskTimelineId) {
      await userClient
        .from('risk_timeline')
        .update({ sms_alert_sent: true })
        .eq('id', riskTimelineId);
    }

    return res.json({
      success: true,
      data: smsResult
    });
  } catch (err) {
    console.error('Server error in POST /api/sms/send-alert:', err.message);
    return res.status(500).json({ error: `SMS alert failed: ${err.message}` });
  }
});

export default router;
