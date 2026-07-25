import React, { useState } from 'react';
import { Upload, AudioLines, FileWarning, Sparkles, CheckCircle, ShieldCheck, Languages, BookOpen, AlertTriangle } from 'lucide-react';

export default function UploadTest() {
  const [patientId, setPatientId] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [storagePath, setStoragePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('');
  const [myths, setMyths] = useState([]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('audio/') || file.name.endsWith('.mp3') || file.name.endsWith('.wav') || file.name.endsWith('.webm') || file.name.endsWith('.m4a') || file.name.endsWith('.ogg')) {
        setAudioFile(file);
      } else {
        setErrorMsg('Invalid file type. Please upload an audio file.');
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setAudioFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patientId.trim()) {
      setErrorMsg('Validation: A valid Patient ID (UUID) is required.');
      return;
    }
    if (!audioFile) {
      setErrorMsg('Validation: An audio visit recording file is required.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setTranscript('');
    setStoragePath('');
    setDetectedLanguage('');
    setTargetLanguage('');
    setMyths([]);

    const formData = new FormData();
    formData.append('audioFile', audioFile);
    formData.append('patientId', patientId.trim());
    formData.append('source', 'app_upload');

    try {
      console.log('Sending request to /api/calls/upload...');
      const response = await fetch('/api/calls/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || `HTTP error! Status: ${response.status}`);
      }

      setTranscript(data.transcript);
      setStoragePath(data.storagePath);
      setDetectedLanguage(data.detectedLanguage || 'en');
      setTargetLanguage(data.targetLanguage || 'en');
      setMyths(data.myths || []);
      console.log('Upload and transcription completed successfully.');
    } catch (err) {
      console.error('Error during upload/transcription:', err);
      setErrorMsg(err.message || 'An error occurred during submission.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      maxWidth: '650px',
      width: '100%',
      margin: '1.5rem auto',
      background: 'rgba(30, 41, 59, 0.75)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '16px',
      padding: '2.25rem',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      color: '#f8fafc'
    }}>
      
      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
        <div style={{
          padding: '0.6rem',
          background: 'rgba(225, 29, 72, 0.15)',
          borderRadius: '12px',
          color: '#e11d48',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <AudioLines size={24} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '800', margin: 0, letterSpacing: '-0.02em' }}>
            Audio-to-Text Pipeline Test
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0.1rem 0 0 0' }}>
            Verify storage upload paths and Groq Whisper transcription isolation.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Patient ID Input */}
        <div>
          <label htmlFor="patientId" style={{
            display: 'block',
            fontSize: '0.85rem',
            fontWeight: '600',
            marginBottom: '0.5rem',
            color: '#cbd5e1'
          }}>
            Patient ID (UUID)
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="patientId"
              type="text"
              placeholder="e.g. 415125c3-237c-475c-9c88-8ce3427ebde5"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              required
            />
          </div>
        </div>

        {/* Drag and Drop File Input Container */}
        <div>
          <label style={{
            display: 'block',
            fontSize: '0.85rem',
            fontWeight: '600',
            marginBottom: '0.5rem',
            color: '#cbd5e1'
          }}>
            Audio Recording File
          </label>
          
          <div 
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragActive ? '#e11d48' : 'rgba(255, 255, 255, 0.15)'}`,
              borderRadius: '12px',
              padding: '2rem 1rem',
              textAlign: 'center',
              background: dragActive ? 'rgba(225, 29, 72, 0.05)' : 'rgba(15, 23, 42, 0.3)',
              cursor: 'pointer',
              transition: 'all 0.2s ease-in-out',
              position: 'relative'
            }}
          >
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              style={{
                position: 'absolute',
                top: 0, left: 0, width: '100%', height: '100%',
                opacity: 0, cursor: 'pointer'
              }}
            />
            
            <Upload size={32} style={{ color: audioFile ? '#2dd4bf' : '#94a3b8', marginBottom: '0.75rem', strokeWidth: 1.5 }} />
            
            {audioFile ? (
              <div>
                <p style={{ fontSize: '0.9rem', fontWeight: '600', color: '#2dd4bf', marginBottom: '0.25rem' }}>
                  Selected: {audioFile.name}
                </p>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  Size: {(audioFile.size / 1024).toFixed(1)} KB • Tap or drag to replace
                </p>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: '500', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Drag and drop your audio file here, or click to browse
                </p>
                <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Supports WebM, MP3, WAV, M4A, OGG
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Error Message Panel */}
        {errorMsg && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            padding: '0.85rem 1rem',
            borderRadius: '10px',
            fontSize: '0.85rem',
            lineHeight: '1.4'
          }}>
            <FileWarning size={18} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
            <div>
              <strong style={{ display: 'block', marginBottom: '0.15rem' }}>Pipeline Failure</strong>
              {errorMsg}
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.85rem',
            background: loading ? '#475569' : 'linear-gradient(135deg, #e11d48, #f43f5e)',
            color: '#fff',
            fontWeight: '700',
            fontSize: '0.95rem',
            border: 'none',
            borderRadius: '10px',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'transform 0.1s, box-shadow 0.2s',
            boxShadow: loading ? 'none' : '0 4px 18px rgba(225, 29, 72, 0.35)'
          }}
        >
          {loading ? (
            <>
              <div style={{
                width: '18px',
                height: '18px',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }} />
              <span>Running Pipeline...</span>
            </>
          ) : (
            <>
              <Sparkles size={18} />
              <span>Upload & Transcribe Audio</span>
            </>
          )}
        </button>
      </form>

      {/* Output Panel */}
      {(transcript || storagePath) && (
        <div style={{
          marginTop: '2.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          paddingTop: '1.75rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          
          {/* Storage Path display */}
          {storagePath && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', color: '#2dd4bf' }}>
                <ShieldCheck size={18} />
                <h3 style={{ fontSize: '0.925rem', fontWeight: '700', margin: 0 }}>
                  Uploaded Storage Path
                </h3>
              </div>
              <code style={{
                display: 'block',
                padding: '0.65rem 0.85rem',
                background: '#0f172a',
                borderRadius: '8px',
                fontSize: '0.8rem',
                color: '#38bdf8',
                overflowX: 'auto',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                fontFamily: 'monospace'
              }}>
                {storagePath}
              </code>
            </div>
          )}

          {/* Transcript output textarea */}
          {transcript && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', color: '#2dd4bf' }}>
                <CheckCircle size={18} />
                <h3 style={{ fontSize: '0.925rem', fontWeight: '700', margin: 0 }}>
                  Whisper Transcription Text
                </h3>
              </div>
              <textarea
                readOnly
                rows={4}
                value={transcript}
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  background: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  color: '#f8fafc',
                  fontSize: '0.9rem',
                  lineHeight: '1.5',
                  resize: 'none',
                  outline: 'none'
                }}
              />
            </div>
          )}

          {/* Language Code Indicators */}
          {detectedLanguage && (
            <div style={{
              display: 'flex',
              gap: '0.75rem',
              background: 'rgba(15, 23, 42, 0.4)',
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              alignItems: 'center'
            }}>
              <Languages size={18} style={{ color: '#818cf8' }} />
              <div style={{ fontSize: '0.85rem', color: '#cbd5e1', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <span>Detected language: <strong style={{ color: '#818cf8', background: 'rgba(129, 140, 248, 0.15)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>{detectedLanguage}</strong></span>
                <span>Resolved target: <strong style={{ color: '#2dd4bf', background: 'rgba(45, 212, 191, 0.15)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>{targetLanguage}</strong></span>
              </div>
            </div>
          )}

          {/* Matched Pregnancy Myths */}
          {detectedLanguage && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', color: '#fda4af' }}>
                <BookOpen size={18} />
                <h3 style={{ fontSize: '0.925rem', fontWeight: '700', margin: 0 }}>
                  Pregnancy Myth Verification Results
                </h3>
              </div>

              {myths.length === 0 ? (
                <div style={{
                  padding: '1rem',
                  background: 'rgba(45, 212, 191, 0.1)',
                  border: '1px solid rgba(45, 212, 191, 0.25)',
                  borderRadius: '10px',
                  color: '#2dd4bf',
                  fontSize: '0.875rem',
                  fontWeight: '600'
                }}>
                  No pregnancy myths or harmful superstitions detected in this visit recording.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {myths.map((m, index) => (
                    <div
                      key={m.mythId || index}
                      style={{
                        background: 'rgba(15, 23, 42, 0.5)',
                        border: '1px solid rgba(244, 63, 94, 0.25)',
                        borderRadius: '12px',
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f43f5e' }}>
                        <AlertTriangle size={18} />
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700' }}>
                          Matched: {m.mythId ? m.mythId.replace('myth_', '').replace('_', ' ').toUpperCase() : 'Pregnancy Myth'}
                        </h4>
                      </div>

                      {/* Side-by-Side Translation Layout */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '1rem',
                        marginTop: '0.25rem'
                      }}>
                        {/* English Column */}
                        <div style={{
                          background: 'rgba(30, 41, 59, 0.5)',
                          padding: '0.85rem 1rem',
                          borderRadius: '8px',
                          border: '1px solid rgba(255,255,255,0.05)'
                        }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                            English Correction (Standard)
                          </div>
                          <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.5', color: '#e2e8f0' }}>
                            {m.correctionTextEn}
                          </p>
                        </div>

                        {/* Local Language Column */}
                        {m.targetLanguage !== 'en' && (
                          <div style={{
                            background: 'rgba(99, 102, 241, 0.1)',
                            padding: '0.85rem 1rem',
                            borderRadius: '8px',
                            border: '1px solid rgba(99, 102, 241, 0.2)'
                          }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#a5b4fc', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                              Localized ({m.targetLanguage.toUpperCase()}) - Colloquial Spoken
                            </div>
                            <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.5', color: '#e0e7ff', fontStyle: 'italic' }}>
                              "{m.correctionTextLocal}"
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* Embedded CSS animation for loading spinner */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
