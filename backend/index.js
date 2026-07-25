import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { supabase } from './config/supabase.js';
import { groq } from './config/groq.js';
import callsRouter from './routes/calls.js';
import patientRoutes from './routes/patientRoutes.js';
import visitRoutes from './routes/visitRoutes.js';
import mythRoutes from './routes/mythRoutes.js';
import smsRoutes from './routes/smsRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const uploadsPath = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// Health route
app.get('/health', (req, res) => {
  return res.json({ status: 'ok' });
});

app.get('/api/health', (req, res) => {
  return res.json({
    status: 'healthy',
    service: 'Parvah Maternal Health Backend',
    timestamp: new Date().toISOString(),
    env: {
      hasGroqKey: Boolean(process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.includes('your_groq')),
      hasTwilioKey: Boolean(process.env.TWILIO_ACCOUNT_SID && !process.env.TWILIO_ACCOUNT_SID.includes('AC_your_twilio')),
      hasSupabaseKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('your-supabase'))
    }
  });
});

// Mount routes
app.use('/api/calls', callsRouter);
app.use('/api/patients', patientRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/myths', mythRoutes);
app.use('/api/sms', smsRoutes);

app.use((err, req, res, next) => {
  console.error('Unhandled Backend Exception:', err.stack);
  res.status(500).json({
    error: 'An internal server error occurred.',
    message: err.message
  });
});

// App listener
app.listen(PORT, () => {
  console.log(`🚀 Parvah Server listening on http://localhost:${PORT}`);
  console.log(`📡 GET /health -> http://localhost:${PORT}/health`);
});

export default app;
