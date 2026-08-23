import React, { useState, useRef } from 'react';
import { Mic, Square, Play, Upload, Sparkles, CheckCircle2, AlertCircle, FileText, RefreshCw, Volume2 } from 'lucide-react';
import { api } from '../lib/api';

export default function VoiceRecorder({ patients = [], selectedPatient, onAnalysisComplete }) {
  const [patientId, setPatientId] = useState(selectedPatient?.id || 'demo-1');
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [sampleTranscript, setSampleTranscript] = useState('');
  
  // Processing States
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(''); // 'transcribing', 'detecting', 'extracting', 'done'
  const [analysisResult, setAnalysisResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const sampleTranscriptsList = [
    {
      label: 'Sample 1 (Hindi): High Risk Pre-eclampsia & Solar Eclipse Myth',
      value: `नमस्ते दीदी। मरीज रेखा देवी, उम्र 24 वर्ष, गर्भावस्था का 26वां हफ्ता है। मरीज ने बताया कि पिछले 3 दिनों से उसके पैरों में काफी सूजन (swelling) है और सुबह उठने पर तेज सिरदर्द रहता है। उसकी सास का कहना है कि सूर्यग्रहण के दौरान बाहर निकलने से बच्चे पर दाग पड़ता है इसलिए उसे बाहर नहीं निकलने दिया। इसके अलावा, सास ने उसे फॉलिक एसिड और आयरन की गोलियां (IFA tablets) खाने से मना किया है क्योंकि उनका मानना है कि लोहे की गोली से बच्चे का रंग काला हो जाता है। मरीज ने थोड़ा धुंधला दिखने (blurred vision) की भी शिकायत की। बीपी की जांच की जरूरत है।`
    },
    {
      label: 'Sample 2 (Hindi): High Ghee Myth & Upper Abdominal Pain',
      value: `मरीज सुनीता शर्मा, 28 वर्ष, 32 हफ्ते की गर्भवती। मरीज का कहना है कि उसके पेट के ऊपरी हिस्से में तेज दर्द है और उसे बुखार महसूस हो रहा है। रिश्तेदार उसे 9वें महीने में बहुत ज्यादा देसी घी पिला रहे हैं ताकि डिलीवरी आसानी से हो जाए। उन्होंने कहा कि डॉक्टर के दिए आयरन सिरप को बंद कर दिया है। मरीज ने बच्चे की हलचल कम होने की बात भी कही।`
    },
    {
      label: 'Sample 3 (English): Eating Less Myth & Routine Symptoms',
      value: `ASHA visit log: Patient Sunita, age 22, 18 weeks pregnant. Patient reported mild nausea and tiredness. Her mother-in-law advised her to eat very less food in the first trimester so the baby stays small and delivery is easy. Also she was advised not to eat curd or drink cold water because it will give the fetus a severe cold. No high-risk warning symptoms present today, BP normal.`
    }
  ];

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
      setErrorMessage('Microphone access unavailable. You can use the preset audio transcript samples below to test AI analysis.');
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

  const handleRunAiAnalysis = async () => {
    setIsProcessing(true);
    setErrorMessage('');
    setAnalysisResult(null);

    try {
      // Step 1: Upload audio or create visit entry
      setCurrentStep('transcribing');
      let audioFile = null;
      if (audioBlob) {
        audioFile = new File([audioBlob], `visit-${Date.now()}.webm`, { type: 'audio/webm' });
      }

      const uploadRes = await api.uploadVisitAudio(patientId, audioFile);
      const visitId = uploadRes.data.id;

      // Step 2: Trigger Groq AI pipeline
      setCurrentStep('detecting');
      await new Promise(r => setTimeout(r, 600)); // smooth visual transition

      setCurrentStep('extracting');
      const processRes = await api.processVisitAi(visitId, uploadRes.filePath, sampleTranscript);

      setCurrentStep('done');
      setAnalysisResult(processRes);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800' }}>Voice Visit Recorder & AI Analyzer</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Record ASHA field visit audio. Groq Whisper transcribes and LLM detects pregnancy myths & risk timeline symptoms.
            </p>
          </div>

          {/* Patient Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Select Patient:</label>
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
              {(patients.length > 0 ? patients : defaultPatientList).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Wk {p.gestational_weeks})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        
        {/* Audio Recording Studio Card */}
        <div className="glass-card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          
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
            {isRecording ? `Duration: ${formatTime(recordingTime)}` : 'Record patient audio or select a preset field transcript below.'}
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

        {/* Transcript / Preset Selection & Process Launcher */}
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <FileText size={20} color="var(--color-secondary)" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Visit Transcript / Preset Selector</h3>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Select a pre-loaded rural field visit transcript or type custom notes:
            </p>

            <select
              onChange={(e) => setSampleTranscript(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem',
                background: 'var(--input-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--input-text)',
                fontSize: '0.8rem',
                marginBottom: '0.75rem'
              }}
            >
              <option value="">-- Choose Sample Field Visit Transcript --</option>
              {sampleTranscriptsList.map((st, i) => (
                <option key={i} value={st.value}>{st.label}</option>
              ))}
            </select>

            <textarea
              rows={5}
              placeholder="Live transcription will appear here, or type/paste visit notes..."
              value={sampleTranscript}
              onChange={(e) => setSampleTranscript(e.target.value)}
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

          <button
            className="btn btn-secondary"
            onClick={handleRunAiAnalysis}
            disabled={isProcessing}
            style={{ width: '100%', marginTop: '1rem', padding: '0.85rem' }}
          >
            {isProcessing ? (
              <>
                <RefreshCw size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                <span>Running AI Pipeline ({currentStep})...</span>
              </>
            ) : (
              <>
                <Sparkles size={18} />
                <span>Run Groq AI Analysis (Whisper + Myths + Symptoms)</span>
              </>
            )}
          </button>
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

      {/* Analysis Output Banner */}
      {analysisResult && (
        <div className="glass-card" style={{ padding: '1.5rem', border: '1px solid var(--color-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-secondary)', marginBottom: '0.75rem' }}>
            <CheckCircle2 size={22} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: '700' }}>AI Visit Processing Complete!</h3>
          </div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '1rem' }}>
            <strong>Summary:</strong> {analysisResult.summary}
          </p>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <span className="badge badge-mild">
              {analysisResult.detected_myths?.length || 0} Myths Flagged
            </span>
            <span className="badge badge-severe">
              {analysisResult.risk_timeline_entries?.length || 0} Symptoms Logged
            </span>
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
