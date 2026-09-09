import express from 'express';
import twilio from 'twilio';
import { rateLimit } from '../middleware/security.js';
import { supabaseAdmin } from '../config/supabase.js';
import { scanRedFlags } from '../services/groqSymptomExtractor.js';
import { detectMyths } from '../services/groqMythDetector.js';
import { sendSmsAlert } from '../services/twilioSMS.js';

const router = express.Router();

/**
 * Validates that an incoming webhook request genuinely originated from Twilio.
 *
 * Twilio computes an HMAC-SHA1 signature using the account's AUTH_TOKEN, the exact URL
 * Twilio requested, and the POST form body parameters, sent in the X-Twilio-Signature header.
 *
 * Note: Behind reverse proxies or tunnels (ngrok, Render, Cloudflare, etc.), req.protocol
 * or req.get('host') might reflect the internal container/port rather than the public URL
 * Twilio contacted. In production or local tunneling, set PUBLIC_BASE_URL (e.g. https://xyz.ngrok-free.app)
 * in .env so the reconstructed URL matches what Twilio signed.
 */
function validateTwilioSignature(req, res, next) {
  // In automated test environments or when Twilio credentials are not configured,
  // skip validation so simulated test requests can run cleanly without a mock signature.
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.SKIP_TWILIO_VALIDATION === 'true' ||
    !process.env.TWILIO_AUTH_TOKEN
  ) {
    return next();
  }

  const signature = req.headers['x-twilio-signature'];
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  const publicBaseUrl = process.env.PUBLIC_BASE_URL;
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const fullUrl = publicBaseUrl
    ? `${publicBaseUrl.replace(/\/$/, '')}${req.originalUrl}`
    : `${protocol}://${host}${req.originalUrl}`;

  const isValid = twilio.validateRequest(authToken, signature, fullUrl, req.body || {});
  if (!isValid) {
    console.warn(`[SMS Inbound] Invalid Twilio signature from IP ${req.ip}. Evaluated URL: ${fullUrl}`);
    return res.status(403).type('text/plain').send('Forbidden: Invalid Twilio signature');
  }

  return next();
}

/**
 * Public unauthenticated rate limiter keyed by sender phone number.
 */
const inboundSmsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 30,                  // max 30 inbound SMS per phone per hour
  message: 'Too many messages received from this number. Please wait before texting again.',
  keyGenerator: (req) => req.body?.From || null
});

/**
 * Looks up a registered patient by phone number using service-role client.
 * Matches req.body.From against contact_phone OR emergency_contact.
 *
 * Note: If multiple patients share the same phone number (e.g. household phone),
 * we select the most recently updated record.
 */
async function lookupPatientByPhone(phone) {
  if (!phone) return null;

  const cleaned = phone.replace(/\s+/g, '');
  const digitsOnly = phone.replace(/\D/g, '');
  const last10 = digitsOnly.slice(-10);

  // Match exact number as sent, cleaned, digits only, and with/without +91
  const phoneVariants = Array.from(new Set([
    phone,
    cleaned,
    digitsOnly,
    last10 ? `+91${last10}` : null,
    last10 || null
  ])).filter(Boolean);

  const orFilter = phoneVariants
    .flatMap((v) => [`contact_phone.eq.${v}`, `emergency_contact.eq.${v}`])
    .join(',');

  try {
    const { data: patients, error } = await supabaseAdmin
      .from('patients')
      .select('id, name, stage, preferred_language, asha_worker_id, contact_phone, emergency_contact, gestational_weeks, baby_name, updated_at, created_at')
      .or(orFilter)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.warn('[SMS Inbound] Error during patient lookup:', error.message);
      return null;
    }

    return patients?.[0] || null;
  } catch (err) {
    console.warn('[SMS Inbound] Exception during patient lookup:', err.message);
    return null;
  }
}

function getEmergencyReply(lang) {
  if (lang === 'en') {
    return 'EMERGENCY: Danger sign detected. Please call 108 or go to the nearest hospital/PHC immediately. Your ASHA worker has been alerted.';
  }
  if (lang === 'ml') {
    return 'അടിയന്തരാവസ്ഥ: അപകട ലക്ഷണം കണ്ടെത്തി. ഉടൻ തന്നെ 108-ൽ വിളിക്കുകയോ അടുത്തുള്ള ആശുപത്രിയിൽ പോകുകയോ ചെയ്യുക. നിങ്ങളുടെ ആശാ പ്രവർത്തകയെ അറിയിച്ചിട്ടുണ്ട്.';
  }
  // Default Hindi
  return 'आपातकालीन चेतावनी: खतरे का लक्षण मिला है। कृपया तुरंत 108 पर कॉल करें या नजदीकी अस्पताल/PHC जाएं। आपकी आशा कार्यकर्ता को सूचित कर दिया गया है।';
}

function getNeutralReply(lang) {
  if (lang === 'en') {
    return 'Thank you for reaching out to Parvah. For medical advice or questions about your pregnancy or baby, please contact your local ASHA worker or visit your nearest health centre.';
  }
  if (lang === 'ml') {
    return 'പർവാഹുമായി ബന്ധപ്പെട്ടതിന് നന്ദി. ആരോഗ്യപരമായ സംശയങ്ങൾക്കും ഉപദേശങ്ങൾക്കുമായി ദയവായി നിങ്ങളുടെ ആശാ പ്രവർത്തകയുമായോ അടുത്തുള്ള ആരോഗ്യ കേന്ദ്രവുമായോ ബന്ധപ്പെടുക.';
  }
  // Default Hindi
  return 'परवाह से संपर्क करने के लिए धन्यवाद। किसी भी चिकित्सीय सलाह या स्वास्थ्य संबंधी जानकारी के लिए कृपया अपनी आशा दीदी या नजदीकी स्वास्थ्य केंद्र से संपर्क करें।';
}

/**
 * Notifies the assigned ASHA worker when an emergency sign is detected from an inbound text.
 */
async function notifyAshaWorkerOfEmergency(patient, senderPhone, redFlags) {
  if (!patient?.asha_worker_id) return;

  try {
    const { data: workerProfile, error } = await supabaseAdmin
      .from('profiles')
      .select('full_name, phone_number')
      .eq('id', patient.asha_worker_id)
      .maybeSingle();

    if (error || !workerProfile?.phone_number) {
      console.warn('[SMS Inbound] Could not fetch ASHA worker phone for alert:', error?.message);
      return;
    }

    const symptoms = redFlags.map((r) => r.rfEntry?.symptom).filter(Boolean).join(', ');
    const workerPhone = workerProfile.phone_number;
    const workerName = workerProfile.full_name || 'ASHA';

    const alertMessage =
      `PARVAH EMERGENCY ALERT: ${patient.name} (${patient.contact_phone || senderPhone}) ne khatre ka lakshan bheja hai: ` +
      `${symptoms || 'Obstetric danger sign'}. Kripya turant sampark karein ya 108 ambulance bhejein. - ASHA ${workerName}`;

    await sendSmsAlert(workerPhone, alertMessage.slice(0, 480));
  } catch (err) {
    console.error('[SMS Inbound] Failed to dispatch emergency notification to ASHA worker:', err.message);
  }
}

/**
 * POST /api/sms/inbound
 *
 * Inbound SMS webhook called by Twilio.
 * Flow:
 *  1. Rate limits and validates Twilio signature.
 *  2. Looks up patient by phone number.
 *  3. EMERGENCY BYPASS: Runs scanRedFlags(). If emergency found, sends urgent TwiML reply,
 *     alerts assigned ASHA worker via SMS, logs to sms_alerts (alert_type: 'emergency').
 *  4. MYTH CORRECTION: If no emergency, calls detectMyths(). If myth detected, replies with
 *     counseling_script via TwiML, logs to sms_alerts (alert_type: 'myth').
 *  5. NEUTRAL: If nothing detected, sends neutral healthcare advice guidance, logs to sms_alerts
 *     (alert_type: 'neutral').
 *
 * NOTE: Strictly scoped to myth-checking. Does NOT call extractSymptoms or write to risk_timeline.
 */
router.post('/', inboundSmsLimiter, validateTwilioSignature, async (req, res) => {
  const from = (req.body?.From || '').trim();
  const body = (req.body?.Body || '').trim();

  const twiml = new twilio.twiml.MessagingResponse();

  if (!body) {
    twiml.message(getNeutralReply('hi'));
    return res.type('text/xml').send(twiml.toString());
  }

  try {
    // 1. Patient lookup
    const patient = await lookupPatientByPhone(from);
    const stage = patient?.stage || 'antenatal';
    const lang = patient?.preferred_language || 'hi';

    // 2. Emergency bypass: Checked FIRST before any myth logic
    const redFlags = scanRedFlags(body, stage);

    if (redFlags.length > 0) {
      const emergencyReply = getEmergencyReply(lang);

      // Insert row into sms_alerts
      await supabaseAdmin.from('sms_alerts').insert({
        phone_number: from,
        message: body,
        alert_type: 'emergency',
        patient_id: patient?.id || null
      });

      // Notify ASHA worker if a registered patient was matched
      if (patient) {
        await notifyAshaWorkerOfEmergency(patient, from, redFlags);
      }

      twiml.message(emergencyReply);
      return res.type('text/xml').send(twiml.toString());
    }

    // 3. Myth-correction path (only reached if no red flag matched)
    const mythResult = await detectMyths(body, [], { language: lang, stage });
    const detectedMyths = mythResult?.detected_myths || [];

    if (detectedMyths.length > 0) {
      // Pick highest severity or first detected myth
      const severityRank = { severe: 3, high: 3, moderate: 2, medium: 2, mild: 1, low: 1 };
      const sorted = [...detectedMyths].sort((a, b) =>
        (severityRank[b.severity_impact || b.severity] || 0) -
        (severityRank[a.severity_impact || a.severity] || 0)
      );

      const topMyth = sorted[0];
      const replyText = (
        topMyth.counseling_script ||
        topMyth.medical_fact ||
        topMyth.myth_title ||
        ''
      ).slice(0, 480);

      await supabaseAdmin.from('sms_alerts').insert({
        phone_number: from,
        message: body,
        alert_type: 'myth',
        patient_id: patient?.id || null
      });

      twiml.message(replyText);
      return res.type('text/xml').send(twiml.toString());
    }

    // 4. Neutral acknowledgment path
    const neutralReply = getNeutralReply(lang);

    await supabaseAdmin.from('sms_alerts').insert({
      phone_number: from,
      message: body,
      alert_type: 'neutral',
      patient_id: patient?.id || null
    });

    twiml.message(neutralReply);
    return res.type('text/xml').send(twiml.toString());
  } catch (err) {
    console.error('[SMS Inbound] Error handling inbound SMS:', err);

    twiml.message(getNeutralReply('hi'));
    return res.type('text/xml').send(twiml.toString());
  }
});

export default router;
