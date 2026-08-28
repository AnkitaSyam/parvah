import React, { useState, useRef, useEffect } from 'react';
import {
  Mic, Square, Play, Upload, Sparkles, CheckCircle,
  AlertCircle, FileText, RefreshCw, ShieldCheck,
  BookOpen, Activity, ClipboardList, ChevronRight, FileWarning
} from 'lucide-react';
import { api } from '../lib/api';

export default function VoiceRecorder({
  patients = [],
  isDemo = false,
  selectedPatient,
  onAnalysisComplete,
  setActiveTab
}) {
  const patientList = isDemo ? defaultPatientList : patients;

  const [patientId, setPatientId] = useState(selectedPatient?.id || '');
  const [inputMethod, setInputMethod] = useState('mic'); // 'mic' or 'upload'
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [sampleTranscript, setSampleTranscript] = useState('');
  const [isManuallyTyped, setIsManuallyTyped] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Processing States
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(''); // 'transcribing', 'detecting', 'extracting', 'done'
  const [analysisResult, setAnalysisResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const hasAudioSource = inputMethod === 'mic' ? !!audioBlob : !!audioFile;
  const isButtonDisabled = isProcessing || !hasAudioSource;

  const getButtonText = () => {
    if (isProcessing) return `Running AI Pipeline (${currentStep})...`;
    if (inputMethod === 'mic' && !audioBlob) return 'Run Groq AI Analysis (Record audio first)';
    if (inputMethod === 'upload' && !audioFile) return 'Run Groq AI Analysis (Select audio file first)';
    return 'Run Groq AI Analysis (Whisper + Myths + Symptoms)';
  };

  useEffect(() => {
    if (selectedPatient) {
      setPatientId(selectedPatient.id);
    } else if (patientList.length > 0) {
      setPatientId(patientList[0].id);
    } else {
      setPatientId('');
    }
  }, [selectedPatient, patients, isDemo]);


  // Tab switching clears any state left over from the other mode
  const handleTabChange = (mode) => {
    setInputMethod(mode);
    setAudioBlob(null);
    setAudioUrl(null);
    setAudioFile(null);
    setErrorMessage('');
  };

  const startRecording = async () => {
    try {
      setErrorMessage('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.warn('Microphone access unavailable or denied:', err.message);
      setErrorMessage('Microphone access unavailable. You can use the preset audio transcript samples or drag-and-drop an audio file instead.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  // Drag & drop handlers
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
      setErrorMessage('Invalid file type. Please upload an audio file.');
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files?.[0]) setAudioFile(e.target.files[0]);
  };

  const handleRunAiAnalysis = async () => {
    if (!isDemo && !patientId) {
      setErrorMessage('A patient must be selected to save this visit.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');
    setAnalysisResult(null);

    try {
      // 1. Determine active audio file
      let fileToUpload = null;
      if (inputMethod === 'mic') {
        if (audioBlob) {
          fileToUpload = new File([audioBlob], `visit-${Date.now()}.webm`, { type: 'audio/webm' });
        }
      } else {
        fileToUpload = audioFile;
      }

      // If we don't have an audio file but have sample transcript text, we can still process
      if (!fileToUpload && !sampleTranscript.trim()) {
        throw new Error('Please record audio, upload an audio file, or choose a sample transcript first.');
      }

      // Step 1: Upload audio or create visit entry
      setCurrentStep('transcribing');
      const uploadRes = await api.uploadVisitAudio(patientId, fileToUpload);
      const visitId = uploadRes.data.id;

      // Step 2: Trigger Groq AI pipeline
      setCurrentStep('detecting');
      await new Promise(r => setTimeout(r, 600)); // smooth visual transition

      setCurrentStep('extracting');
      const processRes = await api.processVisitAi(visitId, uploadRes.filePath, sampleTranscript);

      setCurrentStep('done');

      // Populate Whisper transcript directly in the textarea, preserving custom notes
      if (processRes.transcript) {
        if (!isManuallyTyped || !sampleTranscript.trim()) {
          setSampleTranscript(processRes.transcript);
        } else {
          setSampleTranscript(prev => `${prev.trim()}\n\n[AI Transcription]:\n${processRes.transcript}`);
        }
        setIsManuallyTyped(false); // Reset to false after auto-populating or appending
      }

      setAnalysisResult({
        id: visitId,
        transcript: processRes.transcript,
        summary: processRes.summary,
        detected_myths: processRes.detected_myths || [],
        risk_timeline_entries: processRes.risk_timeline_entries || []
      });

      if (onAnalysisComplete) {
        onAnalysisComplete(processRes);
      }
    } catch (err) {
      console.error('Analysis error:', err.message);
      setErrorMessage(err.message || 'AI processing encountered an issue. Try using a preset transcript.');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const severityStyle = (sev) => ({
    fontSize: '0.7rem',
    fontWeight: '700',
    textTransform: 'uppercase',
    padding: '0.15rem 0.45rem',
    borderRadius: '4px',
    marginLeft: 'auto',
    background: sev === 'severe'   ? 'rgba(239,68,68,0.2)'
              : sev === 'moderate' ? 'rgba(251,191,36,0.2)'
              :                      'rgba(74,222,128,0.15)',
    color:      sev === 'severe'   ? '#f87171'
              : sev === 'moderate' ? '#fbbf24'
              :                      '#4ade80'
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header with Patient Selector */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800' }}>Record Visit & AI Analyzer</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Record or upload ASHA field visit audio to transcribe and automatically extract clinical risk timelines & myths.
            </p>
          </div>

          {/* Patient Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Select Patient:</label>
            {patientList.length === 0 && !isDemo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <select
                  disabled
                  style={{
                    padding: '0.55rem 0.85rem',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-muted)',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    opacity: 0.7
                  }}
                >
                  <option>No patients assigned yet</option>
                </select>
                <button
                  className="btn btn-outline"
                  onClick={() => setActiveTab('patients')}
                  style={{ padding: '0.55rem 0.85rem', fontSize: '0.8rem' }}
                >
                  Add Patient
                </button>
              </div>
            ) : (
              <select
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                style={{
                  padding: '0.55rem 0.85rem',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--input-text)',
                  fontSize: '0.875rem',
                  fontWeight: '600'
                }}
              >
                {patientList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Wk {p.gestational_weeks})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        
        {/* Left Side: Audio Input Card */}
        <div className="glass-card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          
          {/* Method Selector Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem', width: '100%' }}>
            <button
              onClick={() => handleTabChange('mic')}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: 'transparent',
                border: 'none',
                borderBottom: inputMethod === 'mic' ? '2px solid var(--color-primary)' : 'none',
                color: inputMethod === 'mic' ? 'var(--color-primary)' : 'var(--text-muted)',
                fontWeight: '700',
                fontSize: '0.875rem',
                cursor: 'pointer'
              }}
            >
              Live Mic Recording
            </button>
            <button
              onClick={() => handleTabChange('upload')}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: 'transparent',
                border: 'none',
                borderBottom: inputMethod === 'upload' ? '2px solid var(--color-primary)' : 'none',
                color: inputMethod === 'upload' ? 'var(--color-primary)' : 'var(--text-muted)',
                fontWeight: '700',
                fontSize: '0.875rem',
                cursor: 'pointer'
              }}
            >
              Upload Audio File
            </button>
          </div>

          {/* Live Mic Panel */}
          {inputMethod === 'mic' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              <div style={{
                width: '90px',
                height: '90px',
                borderRadius: '50%',
                background: isRecording ? 'rgba(225, 29, 72, 0.2)' : 'var(--color-primary-light)',
                border: isRecording ? '2px solid var(--color-primary)' : '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem',
                position: 'relative',
                boxShadow: isRecording ? '0 0 30px rgba(225, 29, 72, 0.5)' : 'none'
              }}>
                {isRecording ? (
                  <div className="recording-pulse" style={{ width: '40px', height: '40px' }} />
                ) : (
                  <Mic size={40} color="var(--color-primary)" />
                )}
              </div>

              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '0.25rem' }}>
                {isRecording ? 'Recording Live Visit Audio...' : 'Tap Mic to Start Recording'}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                {isRecording ? `Duration: ${formatTime(recordingTime)}` : 'Record patient audio or select a preset field transcript on the right.'}
              </p>

              {/* Waveform visualizer simulation when recording */}
              {isRecording && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '40px', marginBottom: '1.25rem' }}>
                  <div className="wave-bar" />
                  <div className="wave-bar" />
                  <div className="wave-bar" />
                  <div className="wave-bar" />
                  <div className="wave-bar" />
                </div>
              )}

              {/* Record Control Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                {!isRecording ? (
                  <button className="btn btn-primary" onClick={startRecording}>
                    <Mic size={18} />
                    <span>Start Audio Recording</span>
                  </button>
                ) : (
                  <button className="btn btn-danger" onClick={stopRecording}>
                    <Square size={18} />
                    <span>Stop Recording</span>
                  </button>
                )}
              </div>

              {/* Audio Player Preview */}
              {audioUrl && !isRecording && (
                <div style={{ marginTop: '1.25rem', width: '100%' }}>
                  <audio controls src={audioUrl} style={{ width: '100%', borderRadius: 'var(--radius-sm)' }} />
                </div>
              )}
            </div>
          )}

          {/* Upload File Panel */}
          {inputMethod === 'upload' && (
            <div style={{ width: '100%' }}>
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                style={{
                  border: `2px dashed ${dragActive ? 'var(--color-primary)' : 'rgba(179,59,107,0.28)'}`,
                  borderRadius: '12px',
                  padding: '2rem 1rem',
                  textAlign: 'center',
                  background: dragActive ? 'rgba(225,29,72,0.05)' : 'var(--color-primary-light)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
              >
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileChange}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                />
                <Upload size={32} style={{ color: audioFile ? '#2dd4bf' : 'var(--color-primary)', marginBottom: '0.75rem', strokeWidth: 1.5 }} />
                {audioFile ? (
                  <div>
                    <p style={{ fontSize: '0.9rem', fontWeight: '600', color: '#2dd4bf', marginBottom: '0.25rem' }}>Selected: {audioFile.name}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{(audioFile.size / 1024).toFixed(1)} KB — click to replace</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--text-main)', marginBottom: '0.25rem' }}>Drag and drop, or click to browse</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action button inside Left Card */}
          <button
            className="btn btn-secondary"
            onClick={handleRunAiAnalysis}
            disabled={isButtonDisabled}
            style={{
              width: '100%',
              marginTop: '1.5rem',
              padding: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            {isProcessing ? (
              <RefreshCw size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Sparkles size={18} />
            )}
            <span>{getButtonText()}</span>
          </button>
        </div>

        {/* Right Side: Transcript / Preset Selection & Process Launcher */}
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <FileText size={20} color="var(--color-secondary)" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Patient Visit Notes / Transcript</h3>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Type custom visit notes, or leave blank to use the transcribed audio:
            </p>

            <textarea
              rows={5}
              placeholder="Live transcription will appear here, or type/paste visit notes..."
              value={sampleTranscript}
              onChange={(e) => {
                setSampleTranscript(e.target.value);
                setIsManuallyTyped(true);
              }}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: 'var(--input-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--input-text)',
                fontSize: '0.85rem',
                resize: 'vertical'
              }}
            />
          </div>

          {errorMessage && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              padding: '0.65rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8rem',
              marginTop: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}>
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

      </div>

      {/* AI Pipeline Live Status Stepper */}
      {isProcessing && (
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '0.75rem' }}>Groq AI Processing Sequence:</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <div style={{ padding: '0.6rem', borderRadius: 'var(--radius-sm)', background: currentStep === 'transcribing' ? 'var(--color-primary-light)' : 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
              <strong>1. Groq Whisper</strong>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Audio to Hindi/English text</p>
            </div>
            <div style={{ padding: '0.6rem', borderRadius: 'var(--radius-sm)', background: currentStep === 'detecting' ? 'var(--color-primary-light)' : 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
              <strong>2. Myth Detection</strong>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>JSON validation & 1 retry</p>
            </div>
            <div style={{ padding: '0.6rem', borderRadius: 'var(--radius-sm)', background: currentStep === 'extracting' ? 'var(--color-primary-light)' : 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
              <strong>3. Risk Timeline</strong>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Symptom & severity extraction</p>
            </div>
          </div>
        </div>
      )}

      {/* Upgraded AI Analysis Output Panel */}
      {analysisResult && (
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingTop: '1.75rem', borderTop: '1px solid var(--border-color)' }}>
          
          <div className="glass-card" style={{ padding: '1.5rem', border: '1px solid var(--color-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-secondary)', marginBottom: '0.5rem' }}>
              <CheckCircle size={22} style={{ color: '#2dd4bf' }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0 }}>AI Visit Processing Complete!</h3>
            </div>
            {analysisResult.id && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Visit ID:</span>
                <code style={{ fontSize: '0.78rem', color: 'var(--color-primary)', background: 'var(--color-primary-light)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>{analysisResult.id}</code>
              </div>
            )}
          </div>


          {/* AI Visit Summary */}
          {analysisResult.summary && (
            <div className="glass-card" style={{ padding: '1.25rem', borderLeft: '4px solid #818cf8', background: 'rgba(99,102,241,0.05)' }}>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                <ClipboardList size={18} style={{ color: '#818cf8', flexShrink: 0, marginTop: '0.1rem' }} />
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#818cf8', marginBottom: '0.25rem', textTransform: 'uppercase' }}>AI Visit Summary</div>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: '1.5' }}>{analysisResult.summary}</p>
                </div>
              </div>
            </div>
          )}

          {/* Detected Pregnancy Myths */}
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', color: '#fda4af' }}>
              <BookOpen size={18} />
              <h3 style={{ fontSize: '0.95rem', fontWeight: '700', margin: 0 }}>Detected Pregnancy Myths</h3>
            </div>
            {analysisResult.detected_myths.length === 0 ? (
              <div style={{ padding: '0.85rem 1rem', background: 'rgba(45,212,191,0.05)', border: '1px solid rgba(45,212,191,0.15)', borderRadius: '10px', color: '#2dd4bf', fontSize: '0.875rem', fontWeight: '600' }}>
                No pregnancy myths detected in this visit.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {analysisResult.detected_myths.map((m, i) => (
                  <div key={m.id || i} style={{ background: 'rgba(244,63,94,0.02)', border: '1px solid rgba(244,63,94,0.15)', borderRadius: '12px', padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <strong style={{ fontSize: '0.875rem', color: 'var(--text-main)' }}>{m.myth_title || 'Myth Detected'}</strong>
                      <span style={severityStyle(m.severity_impact)}>{m.severity_impact}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>"{m.extracted_quote}"</p>
                    <p style={{ margin: '0.45rem 0 0', fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.45' }}>{m.explanation}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Extracted Symptoms & Risk Flags */}
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', color: '#fbbf24' }}>
              <Activity size={18} />
              <h3 style={{ fontSize: '0.95rem', fontWeight: '700', margin: 0 }}>Extracted Symptoms &amp; Risk Flags</h3>
            </div>
            {analysisResult.risk_timeline_entries.length === 0 ? (
              <div style={{ padding: '0.85rem 1rem', background: 'rgba(45,212,191,0.05)', border: '1px solid rgba(45,212,191,0.15)', borderRadius: '10px', color: '#2dd4bf', fontSize: '0.875rem', fontWeight: '600' }}>
                No clinical symptoms flagged in this visit.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {analysisResult.risk_timeline_entries.map((s, i) => (
                  <div key={s.id || i} style={{ background: 'rgba(251,191,36,0.02)', border: `1px solid ${s.severity === 'severe' ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.15)'}`, borderRadius: '10px', padding: '0.9rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <strong style={{ fontSize: '0.875rem', color: 'var(--text-main)' }}>{s.symptom_name}</strong>
                      <span style={severityStyle(s.severity)}>{s.severity}</span>
                      {s.requires_doctor_referral && (
                        <span style={{ fontSize: '0.75rem', color: '#f43f5e', fontWeight: '700', marginLeft: '0.25rem' }}>⚠ Refer to Doctor</span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-muted)' }}>{s.flag_description}</p>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.825rem', color: '#2dd4bf', fontWeight: '500' }}>→ Recommended Action: {s.recommended_asha_action}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}

const defaultPatientList = [
  { id: 'demo-1', name: 'Rekha Devi', gestational_weeks: 26 },
  { id: 'demo-2', name: 'Sunita Sharma', gestational_weeks: 32 },
  { id: 'demo-3', name: 'Pooja Verma', gestational_weeks: 18 }
];
