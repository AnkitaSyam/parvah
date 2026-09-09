import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import { securityHeaders, rateLimit, buildCorsOrigin } from './middleware/security.js';
import patientRoutes from './routes/patientRoutes.js';
import visitRoutes from './routes/visitRoutes.js';
import mythRoutes from './routes/mythRoutes.js';
import smsInboundRoutes from './routes/smsInboundRoutes.js';
import smsRoutes from './routes/smsRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import immunizationRoutes from './routes/immunizationRoutes.js';
import referralRoutes from './routes/referralRoutes.js';
import vitalsRoutes from './routes/vitalsRoutes.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1); // correct req.ip behind a PaaS load balancer

app.use(securityHeaders);

app.use(cors({
  origin: buildCorsOrigin(),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  maxAge: 86400
}));

// 50mb was inherited from when base64 audio was posted as JSON. Audio now goes
// through multipart to private storage, so the JSON body can be small — which
// also removes a trivial memory-exhaustion vector.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Blanket limiter; individual routes add tighter limits of their own.
app.use('/api', rateLimit({
  windowMs: 60_000,
  max: 240,
  message: 'Too many requests. Slow down and try again shortly.'
}));

/**
 * NOTE: there is deliberately no express.static('/uploads') mount.
 *
 * Visit audio is a recorded medical conversation. It previously sat on local
 * disk and was served publicly with CORS wide open — anyone with a filename
 * could download a patient's consultation. Audio now lives in a private
 * Supabase Storage bucket and is reached only through a short-lived signed
 * URL issued by GET /api/visits/:id after RLS has proved ownership.
 */

function envStatus() {
  const set = (v, placeholder) => Boolean(v && !v.includes(placeholder));
  return {
    groq: set(process.env.GROQ_API_KEY, 'your_groq'),
    supabase: set(process.env.SUPABASE_SERVICE_ROLE_KEY, 'your-supabase'),
    twilio: set(process.env.TWILIO_ACCOUNT_SID, 'AC_your_twilio')
  };
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/health', (req, res) => {
  const env = envStatus();
  return res.json({
    status: env.supabase ? 'healthy' : 'degraded',
    service: 'Parvah Maternal Health Backend',
    timestamp: new Date().toISOString(),
    features: {
      transcription: env.groq ? 'live' : 'simulated (no GROQ_API_KEY)',
      myth_detection: env.groq ? 'live' : 'semantic-retrieval fallback',
      sms: env.twilio ? 'live' : 'simulated (no Twilio credentials)',
      database: env.supabase ? 'connected' : 'missing SUPABASE_SERVICE_ROLE_KEY'
    },
    env
  });
});

app.use('/api/patients', patientRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/myths', mythRoutes);
app.use('/api/sms/inbound', smsInboundRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/immunizations', immunizationRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/vitals', vitalsRoutes);

// The deprecated /api/calls pipeline. Kept as a clear signpost.
app.post('/api/calls/upload', (req, res) => {
  res.status(410).json({
    error: 'PIPELINE_RETIRED',
    message: 'Use POST /api/visits/upload, then POST /api/visits/:id/process.'
  });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: `No API route matches ${req.method} ${req.originalUrl}.` });
});

// Error handler. Must keep all four parameters for Express to recognise it.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled backend exception:', err);

  if (err?.message?.includes('is not allowed by ALLOWED_ORIGINS')) {
    return res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED', message: err.message });
  }

  const isProduction = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: 'INTERNAL_ERROR',
    message: isProduction
      ? 'Something went wrong on our side. Try again.'
      : (err.message || 'Unknown error')
  });
});

// A crash after a response has been sent leaves the worker in an unknown
// state; log loudly rather than dying silently mid-visit.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    const env = envStatus();
    console.log(`\n🌸 Parvah backend listening on http://localhost:${PORT}`);
    console.log(`   health   → http://localhost:${PORT}/api/health`);
    console.log(`   groq     → ${env.groq ? '✅ live' : '⚠️  not configured (simulated transcription)'}`);
    console.log(`   supabase → ${env.supabase ? '✅ connected' : '❌ SUPABASE_SERVICE_ROLE_KEY missing'}`);
    console.log(`   twilio   → ${env.twilio ? '✅ live' : '⚠️  not configured (SMS will be simulated)'}\n`);
  });
}

export default app;
