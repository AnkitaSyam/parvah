import React, { useState } from 'react';
import {
  Upload, AudioLines, FileWarning, Sparkles, CheckCircle,
  ShieldCheck, BookOpen, AlertTriangle, Activity, ClipboardList
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function UploadTest() {
  const [patientId, setPatientId] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [myths, setMyths] = useState([]);
  const [symptoms, setSymptoms] = useState([]);
  const [visitSummary, setVisitSummary] = useState('');
  const [visitId, setVisitId] = useState(null);

  // ─── helpers ───────────────────────────────────────────────────────────────
  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    let token = session?.access_token;

    if (session && session.expires_at) {
      const now = Math.floor(Date.now() / 1000);
      // If the token is within 10 seconds of expiring, refresh it
      if (session.expires_at - now < 10) {
        const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshedSession) {
          token = refreshedSession.access_token;
        }
      }
    }

    if (!token) {
      throw new Error('No active authentication session found. Please log in.');
    }

    return `Bearer ${token}`;
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith('audio/') || /\.(mp3|wav|webm|m4a|ogg)$/i.test(file.name))) {
      setAudioFile(file);
    } else {
      setErrorMsg('Invalid file type. Please upload an audio file.');
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files?.[0]) setAudioFile(e.target.files[0]);
  };

  // ─── submit: two-step visits pipeline ──────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patientId.trim()) { setErrorMsg('Validation: A valid Patient ID (UUID) is required.'); return; }
    if (!audioFile)         { setErrorMsg('Validation: An audio visit recording file is required.'); return; }

    setLoading(true);
    setErrorMsg('');
    setTranscript('');
    setMyths([]);
    setSymptoms([]);
    setVisitSummary('');
    setVisitId(null);

    const authHeader = await getAuthHeader();

    try {
      // Step 1 ── upload audio + create visit record
      setLoadingStep('Uploading audio to storage…');
      const formData = new FormData();
      formData.append('audio', audioFile);
      formData.append('patient_id', patientId.trim());

      const uploadRes  = await fetch('/api/visits/upload', {
        method: 'POST',
        headers: { Authorization: authHeader },
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || `Upload failed (${uploadRes.status})`);

      const createdVisitId = uploadData.data?.id;
      if (!createdVisitId) throw new Error('Visit record created but ID not returned by server.');
      setVisitId(createdVisitId);

      // Step 2 ── run full AI pipeline (transcription + myth-check + symptom extraction via Promise.all)
      setLoadingStep('Running AI pipeline — transcription + myth-check + symptom extraction (parallel)…');
      const processRes  = await fetch(`/api/visits/${createdVisitId}/process`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioFilePath: uploadData.filePath }),
      });
      const processData = await processRes.json();
      if (!processRes.ok) throw new Error(processData.error || `AI processing failed (${processRes.status})`);

      setTranscript(processData.data?.transcript || '');
      setMyths(processData.data?.detected_myths || []);
      setSymptoms(processData.data?.risk_timeline_entries || []);
      setVisitSummary(processData.data?.summary || '');
      console.log('✅ Full pipeline complete. Visit ID:', createdVisitId);
    } catch (err) {
      console.error('Pipeline error:', err);
      setErrorMsg(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // ─── severity badge helper ──────────────────────────────────────────────────
  const severityStyle = (sev) => ({
    fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase',
    padding: '0.1rem 0.4rem', borderRadius: '4px', marginLeft: 'auto',
    background: sev === 'severe'   ? 'rgba(239,68,68,0.2)'
              : sev === 'moderate' ? 'rgba(251,191,36,0.2)'
              :                      'rgba(74,222,128,0.15)',
    color:      sev === 'severe'   ? '#f87171'
              : sev === 'moderate' ? '#fbbf24'
              :                      '#4ade80',
  });

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      maxWidth: '680px', width: '100%', margin: '1.5rem auto',
      background: 'linear-gradient(145deg, #FFFDF9, #FCE4D8)', backdropFilter: 'blur(16px)',
      border: '1px solid rgba(179,59,107,0.18)', borderRadius: '16px',
      padding: '2.25rem', boxShadow: '0 25px 50px -12px rgba(105,43,65,0.16)', color: 'var(--text-main)'
    }}>

      {/* ── Title ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
        <div style={{ padding: '0.6rem', background: 'rgba(225,29,72,0.15)', borderRadius: '12px', color: '#e11d48', display: 'flex' }}>
          <AudioLines size={24} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '800', margin: 0 }}>Full Pipeline Integration Test</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.1rem 0 0' }}>
            Visits pipeline: upload → transcription + myth-check + symptom extraction (Promise.all)
          </p>
        </div>
      </div>

      {/* ── Form ── */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* Patient ID */}
        <div>
          <label htmlFor="patientId" style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
            Patient ID (UUID)
          </label>
          <input
            id="patientId" type="text"
            placeholder="e.g. 415125c3-237c-475c-9c88-8ce3427ebde5"
            value={patientId} onChange={(e) => setPatientId(e.target.value)}
            style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--input-text)', fontSize: '0.9rem', outline: 'none' }}
            required
          />
        </div>

        {/* Drag-drop audio */}
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
            Audio Recording File
          </label>
          <div
            onDragEnter={handleDrag} onDragOver={handleDrag}
            onDragLeave={handleDrag} onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragActive ? '#e11d48' : 'rgba(179,59,107,0.28)'}`,
              borderRadius: '12px', padding: '2rem 1rem', textAlign: 'center',
              background: dragActive ? 'rgba(225,29,72,0.05)' : '#FFF6F0',
              cursor: 'pointer', transition: 'all 0.2s', position: 'relative'
            }}
          >
            <input type="file" accept="audio/*" onChange={handleFileChange}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
            <Upload size={32} style={{ color: audioFile ? '#2dd4bf' : 'var(--color-primary)', marginBottom: '0.75rem', strokeWidth: 1.5 }} />
            {audioFile ? (
              <div>
                <p style={{ fontSize: '0.9rem', fontWeight: '600', color: '#2dd4bf', marginBottom: '0.25rem' }}>Selected: {audioFile.name}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{(audioFile.size / 1024).toFixed(1)} KB — tap to replace</p>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--text-main)', marginBottom: '0.25rem' }}>Drag and drop, or click to browse</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>WebM, MP3, WAV, M4A, OGG</p>
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {errorMsg && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '0.85rem 1rem', borderRadius: '10px', fontSize: '0.85rem' }}>
            <FileWarning size={18} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
            <div><strong style={{ display: 'block', marginBottom: '0.1rem' }}>Pipeline Failure</strong>{errorMsg}</div>
          </div>
        )}

        {/* Submit */}
        <button type="submit" disabled={loading} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          padding: '0.85rem', background: loading ? '#B98091' : 'linear-gradient(135deg, #B33B6B, #D06B32)',
          color: '#fff', fontWeight: '700', fontSize: '0.95rem', border: 'none', borderRadius: '10px',
          cursor: loading ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : '0 4px 18px rgba(225,29,72,0.35)'
        }}>
          {loading ? (
            <>
              <div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span>{loadingStep || 'Running…'}</span>
            </>
          ) : (
            <><Sparkles size={18} /><span>Upload &amp; Run Full AI Pipeline</span></>
          )}
        </button>
      </form>

      {/* ── Output Panel ── */}
      {(transcript || visitId) && (
          <div style={{ marginTop: '2.25rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingTop: '1.75rem', borderTop: '1px solid var(--border-color)' }}>

          {/* Visit ID */}
          {visitId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={16} style={{ color: '#2dd4bf' }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Visit ID:</span>
              <code style={{ fontSize: '0.78rem', color: 'var(--color-primary)', background: '#FCE7D9', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>{visitId}</code>
            </div>
          )}

          {/* Transcript */}
          {transcript && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', color: '#2dd4bf' }}>
                <CheckCircle size={18} />
                <h3 style={{ fontSize: '0.925rem', fontWeight: '700', margin: 0 }}>Whisper Transcription</h3>
              </div>
              <textarea readOnly rows={4} value={transcript} style={{ width: '100%', padding: '0.85rem', background: '#FFF8F2', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-main)', fontSize: '0.9rem', lineHeight: '1.5', resize: 'none', outline: 'none' }} />
            </div>
          )}

          {/* Visit Summary */}
          {visitSummary && (
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
              <ClipboardList size={18} style={{ color: '#818cf8', flexShrink: 0, marginTop: '0.1rem' }} />
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#a5b4fc', marginBottom: '0.25rem', textTransform: 'uppercase' }}>AI Visit Summary</div>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#e0e7ff', lineHeight: '1.5' }}>{visitSummary}</p>
              </div>
            </div>
          )}

          {/* Detected Myths */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', color: '#fda4af' }}>
              <BookOpen size={18} />
              <h3 style={{ fontSize: '0.925rem', fontWeight: '700', margin: 0 }}>Detected Pregnancy Myths</h3>
            </div>
            {myths.length === 0 ? (
              <div style={{ padding: '0.85rem 1rem', background: 'rgba(45,212,191,0.1)', border: '1px solid rgba(45,212,191,0.25)', borderRadius: '10px', color: '#2dd4bf', fontSize: '0.875rem', fontWeight: '600' }}>
                No pregnancy myths detected in this visit.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {myths.map((m, i) => (
                  <div key={m.id || i} style={{ background: '#FFF9F5', border: '1px solid rgba(244,63,94,0.25)', borderRadius: '12px', padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <AlertTriangle size={16} style={{ color: '#f43f5e' }} />
                      <strong style={{ fontSize: '0.875rem', color: 'var(--text-main)' }}>{m.myth_title || 'Myth Detected'}</strong>
                      <span style={severityStyle(m.severity_impact)}>{m.severity_impact}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>"{m.extracted_quote}"</p>
                    <p style={{ margin: '0.45rem 0 0', fontSize: '0.82rem', color: 'var(--text-main)', lineHeight: '1.45' }}>{m.explanation}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Extracted Symptoms */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', color: '#fbbf24' }}>
              <Activity size={18} />
              <h3 style={{ fontSize: '0.925rem', fontWeight: '700', margin: 0 }}>Extracted Symptoms &amp; Risk Flags</h3>
            </div>
            {symptoms.length === 0 ? (
              <div style={{ padding: '0.85rem 1rem', background: 'rgba(45,212,191,0.1)', border: '1px solid rgba(45,212,191,0.25)', borderRadius: '10px', color: '#2dd4bf', fontSize: '0.875rem', fontWeight: '600' }}>
                No clinical symptoms flagged in this visit.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {symptoms.map((s, i) => (
                  <div key={s.id || i} style={{ background: '#FFF9F5', border: `1px solid ${s.severity === 'severe' ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.25)'}`, borderRadius: '10px', padding: '0.9rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <strong style={{ fontSize: '0.875rem', color: 'var(--text-main)' }}>{s.symptom_name}</strong>
                      <span style={severityStyle(s.severity)}>{s.severity}</span>
                      {s.requires_doctor_referral && (
                        <span style={{ fontSize: '0.7rem', color: '#f43f5e', fontWeight: '700', marginLeft: '0.25rem' }}>⚠ Refer to Doctor</span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.flag_description}</p>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#2dd4bf' }}>→ {s.recommended_asha_action}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
