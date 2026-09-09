import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic, Square, Upload, Sparkles, CheckCircle, AlertCircle, FileText,
  RefreshCw, Activity, ClipboardList, Loader2, Baby, CalendarClock,
  Trash2, ShieldAlert, Syringe, CloudOff, Inbox
} from 'lucide-react';
import { api } from '../lib/api';
import { queueVisit } from '../lib/outbox';

/**
 * Record a visit and run the AI pipeline.
 *
 * The progress indicator used to be theatre: it advanced on a hardcoded
 * `await sleep(600)` rather than on pipeline state, so it showed "detecting"
 * before the request had even been sent. Steps now reflect what the client
 * actually knows — upload finished, analysis in flight, result received —
 * and a failure names the stage it failed at.
 */

const STEPS = [
  { key: 'upload',   label: 'Saving the recording',  icon: Upload },
  { key: 'analyze',  label: 'Transcribing & analysing', icon: Sparkles },
  { key: 'done',     label: 'Saved to her record',   icon: CheckCircle }
];

const SEVERITY = {
  severe:   { color: '#DC2626', bg: 'rgba(220, 38, 38, 0.10)', label: 'Severe' },
  moderate: { color: '#D97706', bg: 'rgba(217, 119, 6, 0.10)', label: 'Moderate' },
  mild:     { color: '#16A34A', bg: 'rgba(22, 163, 74, 0.10)', label: 'Mild' }
};

const MAX_MB = 25;

function formatMentionedVitals(vitals) {
  if (!vitals) return [];
  const items = [];

  if (vitals.systolic_bp != null && vitals.diastolic_bp != null) {
    items.push({ label: 'BP', value: `${vitals.systolic_bp}/${vitals.diastolic_bp} mmHg` });
  } else if (vitals.systolic_bp != null) {
    items.push({ label: 'Systolic BP', value: `${vitals.systolic_bp} mmHg` });
  } else if (vitals.diastolic_bp != null) {
    items.push({ label: 'Diastolic BP', value: `${vitals.diastolic_bp} mmHg` });
  }

  if (vitals.pulse_bpm != null) {
    items.push({ label: 'Pulse', value: `${vitals.pulse_bpm} bpm` });
  }

  if (vitals.temperature_c != null) {
    items.push({ label: 'Temperature', value: `${vitals.temperature_c} °C` });
  }

  if (vitals.weight_kg != null) {
    items.push({ label: 'Weight', value: `${vitals.weight_kg} kg` });
  }

  if (vitals.hemoglobin_gdl != null) {
    items.push({ label: 'Haemoglobin', value: `${vitals.hemoglobin_gdl} g/dL` });
  }

  if (vitals.urine_albumin) {
    items.push({ label: 'Urine Albumin', value: vitals.urine_albumin });
  }

  if (vitals.fundal_height_cm != null) {
    items.push({ label: 'Fundal Height', value: `${vitals.fundal_height_cm} cm` });
  }

  return items;
}

export default function VoiceRecorder({
  patients = [],
  selectedPatient,
  onSelectPatient,
  onAnalysisComplete,
  setActiveTab,
  isOnline = true,
  onQueued
}) {
  const [patientId, setPatientId] = useState(selectedPatient?.id || patients[0]?.id || '');
  const [inputMethod, setInputMethod] = useState('mic');

  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(null);
  const [result, setResult] = useState(null);
  const [mentionedVitals, setMentionedVitals] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [queuedNotice, setQueuedNotice] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  const patient = patients.find((p) => p.id === patientId) || selectedPatient;
  const isPostpartum = patient?.stage === 'postpartum';

  useEffect(() => {
    if (selectedPatient?.id) {
      setPatientId(selectedPatient.id);
    } else if (patients.length > 0) {
      setPatientId((prev) => (prev && patients.some((p) => p.id === prev) ? prev : patients[0].id));
    } else {
      setPatientId('');
    }
  }, [selectedPatient?.id, patients]);

  const handlePatientChange = (newId) => {
    setPatientId(newId);
    const found = patients.find((p) => p.id === newId);
    if (found && onSelectPatient) onSelectPatient(found);
  };

  // Release the object URL and stop any live mic track on unmount.
  useEffect(() => () => {
    clearInterval(timerRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [audioUrl]);

  const hasAudio = Boolean(audioBlob) || Boolean(audioFile);
  const hasNotes = notes.trim().length > 0;
  const canSubmit = Boolean(patientId) && !isRecording && (hasAudio || hasNotes) && !isProcessing;

  const clearAudio = useCallback(() => {
    setAudioBlob(null);
    setAudioFile(null);
    setRecordingTime(0);
    setAudioUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
  }, []);

  const switchMethod = (mode) => {
    setInputMethod(mode);
    setErrorMessage('');
  };

  const startRecording = async () => {
    setErrorMessage('');
    // Clear any existing uploaded file so capture remains mutually exclusive
    setAudioFile(null);
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: audioChunksRef.current[0]?.type || 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
      };

      recorder.start();
      if (notes) setNotes('');
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch (err) {
      setErrorMessage(
        err.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow it in your browser settings, upload a file, or type what was discussed below.'
          : 'No microphone is available. Upload an audio file or type what was discussed below.'
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const acceptFile = (file) => {
    if (!file) return;
    if (!(file.type.startsWith('audio/') || /\.(mp3|wav|webm|m4a|ogg|flac)$/i.test(file.name))) {
      setErrorMessage('That is not an audio file. Use MP3, WAV, M4A, OGG or WebM.');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setErrorMessage(`That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_MB} MB — record a shorter visit.`);
      return;
    }
    setErrorMessage('');
    // Clear any existing mic recording so capture remains mutually exclusive
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setRecordingTime(0);
    setAudioFile(file);
    if (notes) setNotes('');
  };

  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };

  /**
   * Saves the visit to the offline queue instead of uploading it. Used both
   * when the device is offline and when an upload fails mid-request, so a
   * recording made in a village is never lost.
   */
  const saveToOutbox = async (blob) => {
    await queueVisit({
      patientId,
      patientName: patient?.name,
      audioBlob: blob,
      notes: notes.trim()
    });

    clearAudio();
    setNotes('');
    setCurrentStep(null);
    setQueuedNotice(
      `Saved on this phone. It will upload automatically when you have a signal${
        patient?.name ? ` — ${patient.name}'s visit` : ''}.`
    );
    onQueued?.();
  };

  const runAnalysis = async () => {
    if (!patientId) {
      setErrorMessage('Select a patient before saving this visit.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');
    setQueuedNotice('');
    setResult(null);
    setMentionedVitals(null);

    try {
      // Whichever audio source is non-null is the intended file (mutually exclusive)
      const file = audioBlob
        ? new File([audioBlob], `visit-${Date.now()}.webm`, { type: audioBlob.type || 'audio/webm' })
        : (audioFile || null);

      if (!file && !hasNotes) {
        throw new Error('Record audio, upload a file, or type what was discussed.');
      }

      // No signal — queue rather than fail. The worker's work is preserved
      // and she can carry on to the next house.
      if (!isOnline) {
        await saveToOutbox(file);
        return;
      }

      setCurrentStep('upload');
      const uploadRes = await api.uploadVisitAudio(patientId, file);
      const visitId = uploadRes.data.id;

      setCurrentStep('analyze');
      const analysis = await api.processVisitAi(visitId, notes.trim() || undefined);

      setCurrentStep('done');
      setResult(analysis);

      // Extract any measurements mentioned in the transcript or notes for read-only reference
      const textToScan = (analysis.transcript || notes || '').trim();
      if (textToScan) {
        try {
          const parsed = await api.parseVitals(textToScan);
          if (parsed?.found > 0 && parsed.vitals) {
            setMentionedVitals(parsed.vitals);
          } else {
            setMentionedVitals(null);
          }
        } catch (vitalsErr) {
          console.warn('Could not parse mentioned vitals:', vitalsErr?.message);
          setMentionedVitals(null);
        }
      } else {
        setMentionedVitals(null);
      }

      onAnalysisComplete?.(analysis);
    } catch (err) {
      // The connection dropped mid-upload. Queue it rather than lose it —
      // this is the common case at the edge of coverage, where the browser
      // still reports itself online.
      if (err.code === 'NETWORK_ERROR') {
        try {
          const blob = audioBlob || audioFile;
          await saveToOutbox(blob);
          return;
        } catch (queueError) {
          setErrorMessage(`Could not reach the server, and saving to this phone also failed: ${queueError.message}`);
          setCurrentStep(null);
          return;
        }
      }

      const stage = currentStep === 'upload' ? 'while saving the recording' : 'during analysis';
      setErrorMessage(`${err.message} (failed ${stage})`);
      setCurrentStep(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const startOver = () => {
    clearAudio();
    setNotes('');
    setResult(null);
    setMentionedVitals(null);
    setErrorMessage('');
    setCurrentStep(null);
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.35rem' }}>

      {/* Header + patient selector */}
      <div className="glass-card" style={{ padding: '1.35rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Record a visit</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>
              Speak naturally in Hindi or English. Parvah transcribes the conversation,
              flags danger signs and checks what the family believes.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            {patients.length === 0 ? (
              <button className="btn btn-primary" onClick={() => setActiveTab('patients')}>
                Register a patient first
              </button>
            ) : (
              <>
                <label htmlFor="visit-patient" style={{ fontSize: '0.83rem', fontWeight: 600 }}>Patient:</label>
                <select
                  id="visit-patient"
                  value={patientId}
                  onChange={(e) => handlePatientChange(e.target.value)}
                  style={{
                    padding: '0.55rem 0.8rem', background: 'var(--input-bg)',
                    border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                    color: 'var(--input-text)', fontSize: '0.87rem', fontWeight: 600
                  }}
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.stage === 'postpartum'
                        ? `day ${p.postpartum_day ?? '?'} postnatal`
                        : `week ${p.current_gestational_weeks ?? p.gestational_weeks ?? '?'}`}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        {patient && (
          <div style={{
            marginTop: '0.85rem', padding: '0.55rem 0.85rem', borderRadius: 'var(--radius-sm)',
            background: isPostpartum ? 'var(--color-secondary-light)' : 'var(--color-primary-light)',
            fontSize: '0.83rem', display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap'
          }}>
            {isPostpartum ? <Baby size={15} /> : <CalendarClock size={15} />}
            <strong>{isPostpartum ? 'Postnatal visit' : 'Antenatal visit'}</strong>
            <span style={{ color: 'var(--text-muted)' }}>
              — checking {isPostpartum
                ? 'bleeding, sepsis, mood and newborn danger signs'
                : 'pre-eclampsia, bleeding, fetal movement and anaemia'}.
            </span>
          </div>
        )}
      </div>

      {/* Progress */}
      {(isProcessing || result) && (
        <div className="glass-card" style={{ padding: '1.1rem 1.35rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {STEPS.map((step, i) => {
              const stepIndex = STEPS.findIndex((s) => s.key === currentStep);
              const state = stepIndex > i ? 'done' : stepIndex === i ? (result ? 'done' : 'active') : 'pending';
              const Icon = step.icon;

              return (
                <div key={step.key} style={{
                  flex: '1 1 150px', display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)',
                  background: state === 'pending' ? 'transparent' : 'var(--color-primary-light)',
                  border: `1px solid ${state === 'active' ? 'var(--color-primary)' : 'var(--border-color)'}`,
                  opacity: state === 'pending' ? 0.5 : 1
                }}>
                  {state === 'active'
                    ? <Loader2 size={16} className="spin" style={{ color: 'var(--color-primary)' }} />
                    : <Icon size={16} style={{ color: state === 'done' ? '#16A34A' : 'var(--text-muted)' }} />}
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isOnline && (
        <div style={{
          display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
          background: 'rgba(217, 119, 6, 0.09)', border: '1px solid rgba(217, 119, 6, 0.3)',
          borderRadius: 'var(--radius-sm)', padding: '0.85rem 1rem', fontSize: '0.88rem'
        }}>
          <CloudOff size={17} style={{ color: '#D97706', flexShrink: 0, marginTop: '1px' }} />
          <span>
            <strong>No signal.</strong> You can still record — the visit is saved on this
            phone and uploads by itself when a connection returns.
          </span>
        </div>
      )}

      {queuedNotice && (
        <div style={{
          display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
          background: 'rgba(22, 163, 74, 0.08)', border: '1px solid rgba(22, 163, 74, 0.28)',
          borderRadius: 'var(--radius-sm)', padding: '0.85rem 1rem', fontSize: '0.88rem'
        }}>
          <Inbox size={17} style={{ color: '#16A34A', flexShrink: 0, marginTop: '1px' }} />
          <span>{queuedNotice}</span>
        </div>
      )}

      {errorMessage && (
        <div style={{
          display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
          background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.28)',
          borderRadius: 'var(--radius-sm)', padding: '0.85rem 1rem', fontSize: '0.88rem'
        }}>
          <AlertCircle size={17} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: '1px' }} />
          <span>{errorMessage}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: '1.35rem' }}>

        {/* Capture */}
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '1.35rem' }}>
            {[{ k: 'mic', l: 'Record', hasData: Boolean(audioBlob) }, { k: 'upload', l: 'Upload a file', hasData: Boolean(audioFile) }].map(({ k, l, hasData }) => (
              <button
                key={k}
                onClick={() => switchMethod(k)}
                aria-pressed={inputMethod === k}
                style={{
                  flex: 1, padding: '0.7rem', background: 'transparent', border: 'none',
                  borderBottom: inputMethod === k ? '2px solid var(--color-primary)' : '2px solid transparent',
                  color: inputMethod === k ? 'var(--color-primary)' : 'var(--text-muted)',
                  fontWeight: 700, fontSize: '0.87rem', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
                }}
              >
                <span>{l}</span>
                {hasData && (
                  <span style={{
                    width: '7px', height: '7px', borderRadius: '50%',
                    background: '#16A34A', display: 'inline-block'
                  }} title="Audio ready" />
                )}
              </button>
            ))}
          </div>

          {inputMethod === 'mic' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{
                width: '88px', height: '88px', borderRadius: '50%', marginBottom: '1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isRecording ? 'rgba(220, 38, 38, 0.14)' : 'var(--color-primary-light)',
                border: `2px solid ${isRecording ? 'var(--color-danger)' : 'var(--border-color)'}`,
                boxShadow: isRecording ? '0 0 28px rgba(220, 38, 38, 0.35)' : 'none',
                transition: 'all var(--transition-normal)'
              }}>
                <Mic size={38} style={{ color: isRecording ? 'var(--color-danger)' : 'var(--color-primary)' }} />
              </div>

              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                {isRecording ? 'Recording…' : audioBlob ? 'Recording ready' : 'Tap to start'}
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.15rem' }}>
                {isRecording
                  ? formatTime(recordingTime)
                  : audioBlob
                    ? `${formatTime(recordingTime)} captured`
                    : 'Record the whole conversation, including what the family says.'}
              </p>

              {isRecording && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', height: '34px', marginBottom: '1.1rem' }}>
                  {[0, 1, 2, 3, 4].map((i) => <div key={i} className="wave-bar" />)}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                {!isRecording ? (
                  <button className="btn btn-primary" onClick={startRecording} disabled={isProcessing}>
                    <Mic size={17} /><span>{audioBlob ? 'Record again' : 'Start recording'}</span>
                  </button>
                ) : (
                  <button className="btn btn-danger" onClick={stopRecording}>
                    <Square size={17} /><span>Stop</span>
                  </button>
                )}
                {audioBlob && !isRecording && (
                  <button className="btn btn-outline" onClick={clearAudio} disabled={isProcessing}>
                    <Trash2 size={16} /><span>Discard</span>
                  </button>
                )}
              </div>

              {audioUrl && !isRecording && (
                <audio controls src={audioUrl} style={{ width: '100%', marginTop: '1.15rem', borderRadius: 'var(--radius-sm)' }} />
              )}

              {audioBlob && !isRecording && (
                <button
                  className="btn btn-primary"
                  onClick={runAnalysis}
                  disabled={!canSubmit}
                  style={{ width: '100%', marginTop: '1.15rem', justifyContent: 'center' }}
                >
                  {isProcessing
                    ? <><Loader2 size={17} className="spin" /><span>{isOnline ? 'Analysing…' : 'Saving…'}</span></>
                    : isOnline
                      ? <><Sparkles size={17} /><span>Analyse visit</span></>
                      : <><Inbox size={17} /><span>Save for later</span></>}
                </button>
              )}
            </div>
          ) : (
            <div>
              <div
                onDragEnter={handleDrag} onDragOver={handleDrag}
                onDragLeave={handleDrag} onDrop={handleDrop}
                style={{
                  position: 'relative', textAlign: 'center', cursor: 'pointer',
                  border: `2px dashed ${dragActive ? 'var(--color-primary)' : 'var(--border-color)'}`,
                  borderRadius: 'var(--radius-md)', padding: '2rem 1rem',
                  background: dragActive ? 'var(--color-primary-light)' : 'transparent',
                  transition: 'all var(--transition-fast)'
                }}
              >
                <input
                  type="file" accept="audio/*" aria-label="Choose an audio file"
                  onChange={(e) => acceptFile(e.target.files?.[0])}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                />
                <Upload size={30} style={{
                  color: audioFile ? '#16A34A' : 'var(--color-primary)',
                  marginBottom: '0.7rem', strokeWidth: 1.5
                }} />
                <p style={{ fontWeight: 700, fontSize: '0.93rem' }}>
                  {audioFile ? audioFile.name : 'Drop an audio file here'}
                </p>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  {audioFile
                    ? `${(audioFile.size / 1048576).toFixed(1)} MB — ready`
                    : `MP3, WAV, M4A, OGG or WebM · up to ${MAX_MB} MB`}
                </p>
              </div>

              {audioFile && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.9rem' }}>
                  <button
                    className="btn btn-primary"
                    onClick={runAnalysis}
                    disabled={!canSubmit}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {isProcessing
                      ? <><Loader2 size={17} className="spin" /><span>{isOnline ? 'Analysing…' : 'Saving…'}</span></>
                      : isOnline
                        ? <><Sparkles size={17} /><span>Analyse visit</span></>
                        : <><Inbox size={17} /><span>Save for later</span></>}
                  </button>
                  <button className="btn btn-outline" onClick={clearAudio} disabled={isProcessing}
                    style={{ width: '100%' }}>
                    <Trash2 size={15} /><span>Choose a different file</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notes + run */}
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <h3 style={{
              fontSize: '1rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: '0.4rem'
            }}>
              <FileText size={16} style={{ color: 'var(--color-secondary)' }} />
              <span>Visit notes</span>
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Optional. If there is no recording, Parvah analyses these notes instead —
              useful when the microphone is unavailable.
            </p>
          </div>

          <textarea
            value={notes}
            onChange={(e) => {
              const val = e.target.value;
              if (val.trim().length > 0 && hasAudio) {
                clearAudio();
              }
              setNotes(val);
            }}
            rows={9}
            placeholder="e.g. Pairon me sujan hai, sir dard theek nahi ho raha. Saas kehti hain ki iron ki goli se bachche ka rang kaala ho jayega…"
            style={{
              width: '100%', flex: 1, minHeight: '150px', resize: 'vertical',
              padding: '0.75rem 0.85rem', background: 'var(--input-bg)',
              border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
              color: 'var(--input-text)', fontSize: '0.88rem', lineHeight: 1.6,
              fontFamily: 'inherit'
            }}
          />

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={runAnalysis}
              disabled={!canSubmit}
              style={{ flex: '1 1 200px', justifyContent: 'center' }}
            >
              {isProcessing
                ? <><Loader2 size={17} className="spin" /><span>{isOnline ? 'Analysing…' : 'Saving…'}</span></>
                : isOnline
                  ? <><Sparkles size={17} /><span>Analyse visit</span></>
                  : <><Inbox size={17} /><span>Save for later</span></>}
            </button>

            {(result || hasAudio || hasNotes) && !isProcessing && (
              <button className="btn btn-outline" onClick={startOver}>
                <RefreshCw size={15} /><span>Start over</span>
              </button>
            )}
          </div>

          {!canSubmit && !isProcessing && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              {!patientId ? 'Select a patient to continue.' : 'Record audio, upload a file, or type notes.'}
            </p>
          )}
        </div>
      </div>

      {/* Results */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

          {result.warnings?.length > 0 && (
            <div style={{
              background: 'rgba(217, 119, 6, 0.09)', border: '1px solid rgba(217, 119, 6, 0.3)',
              borderRadius: 'var(--radius-sm)', padding: '0.8rem 1rem', fontSize: '0.85rem'
            }}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
                <AlertCircle size={15} />Some parts did not save
              </strong>
              <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* Summary */}
          <div className="glass-card" style={{
            padding: '1.3rem 1.5rem',
            borderLeft: `4px solid ${result.has_red_flag ? '#DC2626' : '#16A34A'}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem' }}>
              {result.has_red_flag
                ? <ShieldAlert size={19} style={{ color: '#DC2626' }} />
                : <CheckCircle size={19} style={{ color: '#16A34A' }} />}
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>
                {result.has_red_flag ? 'Emergency sign detected' : 'Visit analysed'}
              </h3>
              {result.analysis_mode?.startsWith('offline') && (
                <span className="badge badge-moderate" style={{ fontSize: '0.65rem' }}>offline mode</span>
              )}
            </div>
            <p style={{ fontSize: '0.92rem' }}>{result.summary}</p>

            {result.risk_scoring_breakdown && (
              <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                Risk level is now <strong style={{ color: 'var(--text-main)' }}>
                  {result.risk_scoring_breakdown.risk_level}
                </strong> (score {result.risk_scoring_breakdown.current_risk_score}).
              </p>
            )}
          </div>

          {/* Transcript */}
          {result.transcript && (
            <details className="glass-card" style={{ padding: '1rem 1.35rem' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.92rem' }}>
                Full transcript
                {result.transcript_language && (
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
                    (detected: {result.transcript_language})
                  </span>
                )}
              </summary>
              <p style={{ marginTop: '0.7rem', fontSize: '0.88rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {result.transcript}
              </p>
            </details>
          )}

          {/* Measurements mentioned */}
          {mentionedVitals && (() => {
            const items = formatMentionedVitals(mentionedVitals);
            if (items.length === 0) return null;

            return (
              <div className="glass-card" style={{ padding: '1.2rem 1.5rem' }}>
                <h3 style={{
                  fontSize: '1rem', fontWeight: 700, marginBottom: '0.65rem',
                  display: 'flex', alignItems: 'center', gap: '0.45rem'
                }}>
                  <Activity size={16} style={{ color: 'var(--color-primary)' }} />
                  <span>Measurements mentioned</span>
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                  {items.map((item, idx) => (
                    <div key={idx} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                      padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-sm)',
                      background: 'var(--color-primary-light)', border: '1px solid var(--border-color)',
                      fontSize: '0.84rem'
                    }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{item.label}:</span>
                      <strong style={{ color: 'var(--text-main)', fontWeight: 700 }}>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Symptoms */}
          {result.risk_timeline_entries?.length > 0 && (
            <div className="glass-card" style={{ padding: '1.3rem 1.5rem' }}>
              <h3 style={{
                fontSize: '1rem', fontWeight: 700, marginBottom: '0.85rem',
                display: 'flex', alignItems: 'center', gap: '0.4rem'
              }}>
                <Activity size={16} style={{ color: 'var(--color-primary)' }} />
                <span>Symptoms recorded ({result.risk_timeline_entries.length})</span>
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {result.risk_timeline_entries.map((s, i) => {
                  const sev = SEVERITY[s.severity] || SEVERITY.mild;
                  return (
                    <div key={s.id || i} style={{
                      padding: '0.75rem 0.9rem', borderRadius: 'var(--radius-sm)',
                      background: sev.bg, border: `1px solid ${sev.color}28`
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                        <strong style={{ fontSize: '0.92rem' }}>{s.symptom_name}</strong>
                        <span style={{
                          fontSize: '0.63rem', fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.05em', color: sev.color,
                          border: `1px solid ${sev.color}44`, padding: '0.08rem 0.35rem', borderRadius: '3px'
                        }}>{sev.label}</span>
                        {s.subject === 'newborn' && (
                          <span className="badge badge-moderate" style={{ fontSize: '0.62rem' }}>newborn</span>
                        )}
                        {s.requires_doctor_referral && (
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#DC2626' }}>
                            → refer
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '0.84rem', marginBottom: '0.3rem' }}>{s.flag_description}</p>
                      <p style={{
                        fontSize: '0.84rem', fontWeight: 600, color: 'var(--color-primary)',
                        display: 'flex', gap: '0.3rem', alignItems: 'flex-start'
                      }}>
                        <ClipboardList size={13} style={{ flexShrink: 0, marginTop: '3px' }} />
                        <span>{s.recommended_asha_action}</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Hesitancy */}
          {result.immunization_hesitancy?.detected && (
            <div className="glass-card" style={{
              padding: '1.1rem 1.35rem', borderLeft: '4px solid #B91C1C',
              display: 'flex', gap: '0.6rem', alignItems: 'flex-start'
            }}>
              <Syringe size={17} style={{ color: '#B91C1C', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ fontSize: '0.93rem', color: '#991B1B' }}>Vaccine hesitancy detected</strong>
                <p style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
                  {result.immunization_hesitancy.stated_reason || 'The family expressed reluctance to immunize.'}
                  {' '}It has been logged for follow-up — open the Myths tab for the counselling script.
                </p>
              </div>
            </div>
          )}

          {/* Myths */}
          {result.detected_myths?.length > 0 && (
            <div className="glass-card" style={{ padding: '1.3rem 1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                {result.detected_myths.length} belief{result.detected_myths.length === 1 ? '' : 's'} to counsel
              </h3>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                Counselling scripts — with a play-aloud button — are on the Myths tab.
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {result.detected_myths.map((m, i) => (
                  <li key={m.id || i} style={{ fontSize: '0.87rem' }}>
                    {m.myth_title || m.pregnancy_myths?.myth_title || 'Belief detected'}
                  </li>
                ))}
              </ul>
              <button className="btn btn-outline" onClick={() => setActiveTab('myths')}
                style={{ marginTop: '0.85rem', fontSize: '0.83rem' }}>
                <span>Open counselling scripts</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
