import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  console.warn('⚠️ GROQ_API_KEY is missing in backend/.env.');
}

// Server Groq Client
export const groq = new Groq({
  apiKey: apiKey || 'placeholder-groq-key'
});
