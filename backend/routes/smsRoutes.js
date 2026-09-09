import express from 'express';
import { requireAuth, asyncRoute } from '../middleware/auth.js';
import { rateLimit } from '../middleware/security.js';
import { sendSmsAlert } from '../services/twilioSMS.js';

const router = express.Router();

/**
 * This endpoint used to accept an arbitrary recipientPhone and an arbitrary
 * message body from any signed-in user, and send it on the project's Twilio
 * account — an open SMS relay with no rate limit.
 *
 * Now: the caller names a patient and a template. The recipient is derived
 * server-side from that patient's own record, and the body is composed here.
 * A client cannot choose either.
 */

const smsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'SMS limit reached for this hour. Contact the family by phone if this is urgent.'
});

const TEMPLATES = {
  danger_sign: {
    label: 'Danger sign — go to the facility',
    to: 'family',
    build: ({ patient, worker, detail }) =>
      `PARVAH: ${patient.name} ko turant jaanch ki zaroorat hai. ` +
      `${detail || 'Khatre ka lakshan mila hai.'} ` +
      `Kripya aaj hi PHC/aspatal jayein. Emergency: 108. ` +
      `- ASHA ${worker.name}${worker.phone ? ` (${worker.phone})` : ''}`
  },
  visit_due: {
    label: 'Visit due reminder',
    to: 'family',
    build: ({ patient, worker, detail }) =>
      `PARVAH: ${patient.name} ki agli jaanch baaki hai. ${detail || ''} ` +
      `Kripya nazdeeki sub-centre par sampark karein. ` +
      `- ASHA ${worker.name}${worker.phone ? ` (${worker.phone})` : ''}`.replace(/\s+/g, ' ')
  },
  immunization_due: {
    label: 'Immunization due reminder',
    to: 'family',
    build: ({ patient, worker, detail }) =>
      `PARVAH: ${patient.baby_name || 'Aapke bachche'} ka tika lagwana baaki hai. ${detail || ''} ` +
      `Tika jaanleva bimariyon se bachata hai. Agle tikakaran diwas par zaroor aayein. ` +
      `- ASHA ${worker.name}${worker.phone ? ` (${worker.phone})` : ''}`.replace(/\s+/g, ' ')
  },
  supervisor_escalation: {
    label: 'Escalate to supervisor (ANM)',
    to: 'emergency',
    build: ({ patient, worker, detail }) =>
      `PARVAH ESCALATION: ${patient.name}, ${patient.village || 'village n/a'}, ` +
      `${patient.stage === 'postpartum' ? 'postpartum' : `GA ${patient.gestational_weeks || '?'}w`}. ` +
      `Risk: ${(patient.risk_level || 'unknown').toUpperCase()}. ${detail || ''} ` +
      `Reported by ASHA ${worker.name}${worker.phone ? ` (${worker.phone})` : ''}`.replace(/\s+/g, ' ')
  }
};

/**
 * GET /api/sms/templates
 */
router.get('/templates', requireAuth, asyncRoute(async (req, res) => {
  return res.json({
    success: true,
    data: Object.entries(TEMPLATES).map(([key, t]) => ({ key, label: t.label, sends_to: t.to }))
  });
}));

/**
 * POST /api/sms/send-alert
 * Body: { patientId, template, detail?, riskTimelineId? }
 */
router.post('/send-alert', requireAuth, smsLimiter, asyncRoute(async (req, res) => {
  const { patientId, template, detail, riskTimelineId } = req.body;

  if (!patientId) {
    return res.status(400).json({ error: 'PATIENT_REQUIRED', message: 'Select a patient before sending a message.' });
  }

  const chosen = TEMPLATES[template];
  if (!chosen) {
    return res.status(400).json({
      error: 'TEMPLATE_INVALID',
      message: `Unknown template. Choose one of: ${Object.keys(TEMPLATES).join(', ')}.`
    });
  }

  // RLS confirms the worker owns this patient.
  const { data: patient, error: pErr } = await req.userClient
    .from('patients')
    .select('id, name, village, contact_phone, emergency_contact, gestational_weeks, risk_level, stage, baby_name')
    .eq('id', patientId)
    .maybeSingle();

  if (pErr) return res.status(400).json({ error: 'PATIENT_LOOKUP_FAILED', message: pErr.message });
  if (!patient) return res.status(404).json({ error: 'PATIENT_NOT_FOUND', message: 'That patient is not on your list.' });

  // The recipient comes from the patient record, never from the request.
  const recipient = chosen.to === 'emergency'
    ? (patient.emergency_contact || patient.contact_phone)
    : (patient.contact_phone || patient.emergency_contact);

  if (!recipient) {
    return res.status(400).json({
      error: 'NO_PHONE_ON_RECORD',
      message: `No phone number is saved for ${patient.name}. Add one to her record first.`
    });
  }

  const { data: profile } = await req.userClient
    .from('profiles')
    .select('full_name, phone_number')
    .eq('id', req.user.id)
    .maybeSingle();

  const worker = {
    name: profile?.full_name || 'ASHA',
    phone: profile?.phone_number || null
  };

  // Truncate free text so a caller cannot pad the body into many segments.
  const safeDetail = typeof detail === 'string' ? detail.trim().slice(0, 160) : '';
  const body = chosen.build({ patient, worker, detail: safeDetail }).slice(0, 480);

  const smsResult = await sendSmsAlert(recipient, body);

  if (riskTimelineId) {
    const { error: flagErr } = await req.userClient
      .from('risk_timeline')
      .update({ sms_alert_sent: true })
      .eq('id', riskTimelineId);
    if (flagErr) console.warn('Could not flag risk_timeline as notified:', flagErr.message);
  }

  return res.json({
    success: true,
    data: { ...smsResult, template, body, recipient_masked: recipient.replace(/\d(?=\d{4})/g, '•') }
  });
}));

export default router;
