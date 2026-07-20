import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './config/supabase.js';
import { groq } from './config/groq.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health route
app.get('/health', (req, res) => {
  return res.json({ status: 'ok' });
});

// App listener
app.listen(PORT, () => {
  console.log(`🚀 Parvah Server listening on http://localhost:${PORT}`);
  console.log(`📡 GET /health -> http://localhost:${PORT}/health`);
});

export default app;
