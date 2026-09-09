# Parvah Backend
Maternal & Child Health Express API with Groq, Supabase, and Twilio.

## Inbound SMS Webhook (`POST /api/sms/inbound`)

Handles incoming text messages from mothers and families:
1. **Emergency Bypass (Checked first):** Scans for obstetric red flags using `scanRedFlags`. If danger signs are detected, immediately replies via TwiML advising 108/hospital referral, dispatches an SMS alert to the woman's assigned ASHA worker, and logs to `sms_alerts` (`alert_type: 'emergency'`).
2. **Myth Correction:** If no danger signs are found, checks the message against the pregnancy myth database via `detectMyths`. Returns an SMS-length counseling script via TwiML and logs to `sms_alerts` (`alert_type: 'myth'`).
3. **Neutral Advice:** Any other inbound inquiry receives a neutral healthcare acknowledgment advising them to contact their ASHA worker, logged to `sms_alerts` (`alert_type: 'neutral'`).

### Twilio Configuration
1. Set webhook URL in Twilio Console: `POST https://<your-domain>/api/sms/inbound`.
2. For local development, run a tunnel (e.g. `ngrok http 5000`) and set `PUBLIC_BASE_URL=https://<your-tunnel>.ngrok-free.app` in `backend/.env` for Twilio request signature verification.
3. Test locally without Twilio by running: `node scripts/testInboundSms.js`.
