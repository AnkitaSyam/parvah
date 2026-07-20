import React, { useEffect, useState } from 'react';
import { supabase } from './supabase/config';

export default function App() {
  const [supabaseInitialized, setSupabaseInitialized] = useState(false);

  useEffect(() => {
    // Confirm Supabase client initializes without error on load
    if (supabase) {
      setSupabaseInitialized(true);
    }
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f172a',
      color: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      <div style={{
        maxWidth: '560px',
        width: '100%',
        background: 'rgba(30, 41, 59, 0.85)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '2.5rem',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #e11d48, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '1.25rem'
          }}>
            🪷
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', margin: 0 }}>
            Parvah Client
          </h1>
        </div>

        <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          Maternal Health AI Platform for Rural India (ASHA Worker Network)
        </p>

        <div style={{
          background: 'rgba(13, 148, 136, 0.15)',
          border: '1px solid rgba(13, 148, 136, 0.4)',
          borderRadius: '10px',
          padding: '1rem',
          color: '#2dd4bf',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span>✓ Frontend application skeleton loaded successfully.</span>
        </div>

        <div style={{ marginTop: '1.25rem', fontSize: '0.825rem', color: '#94a3b8' }}>
          <p>• Supabase Client: {supabaseInitialized ? 'Initialized without errors ✓' : 'Initializing...'}</p>
          <p>• Backend Health Endpoint: <code>/health</code></p>
        </div>
      </div>
    </div>
  );
}
