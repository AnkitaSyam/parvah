import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

import patientRoutes from './routes/patientRoutes.js';
import visitRoutes from './routes/visitRoutes.js';
import mythRoutes from './routes/mythRoutes.js';
import smsRoutes from './routes/smsRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body Parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static directory for uploaded audio files
const uploadsPath = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// Health Check Endpoint
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

// Mount Routes
app.use('/api/patients', patientRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/myths', mythRoutes);
app.use('/api/sms', smsRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Backend Exception:', err.stack);
  res.status(500).json({
    error: 'An internal server error occurred.',
    message: err.message
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Parvah Maternal Health API Server running on port ${PORT}`);
  console.log(`📡 Health Check URL: http://localhost:${PORT}/api/health`);
});
