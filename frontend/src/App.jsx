import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import PatientList from './components/PatientList';
import VoiceRecorder from './components/VoiceRecorder';
import RiskTimelineView from './components/RiskTimelineView';
import MythDebunker from './components/MythDebunker';
import MythCatalog from './components/MythCatalog';
import AuthModal from './components/AuthModal';
import SmsModal from './components/SmsModal';
import UploadTest from './pages/UploadTest';
import { supabase } from './lib/supabase';
import { api } from './lib/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState({
    id: '11111111-1111-1111-1111-111111111111',
    email: 'asha.anita@parvah.health'
  });

  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientTimeline, setPatientTimeline] = useState([]);
  const [patientVisits, setPatientVisits] = useState([]);
  const [detectedMyths, setDetectedMyths] = useState([]);

  // Modals
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [smsData, setSmsData] = useState(null);
  const [isSmsOpen, setIsSmsOpen] = useState(false);

  // Check auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'asha.anita@parvah.health'
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch Patients
  useEffect(() => {
    async function loadPatients() {
      try {
        const data = await api.getPatients();
        if (data && data.length > 0) {
          setPatients(data);
          setSelectedPatient(data[0]);
        }
      } catch (err) {
        console.warn('Backend API patient fetch fallback:', err.message);
      }
    }
    loadPatients();
  }, [user]);

  // Load timeline & visits when selectedPatient changes
  useEffect(() => {
    if (selectedPatient) {
      async function loadPatientDetails() {
        try {
          const timeline = await api.getPatientRiskTimeline(selectedPatient.id);
          if (timeline) setPatientTimeline(timeline);

          const visits = await api.getPatientVisits(selectedPatient.id);
          if (visits) setPatientVisits(visits);
        } catch (err) {
          console.warn('Patient timeline load warning:', err.message);
        }
      }
      loadPatientDetails();
    }
  }, [selectedPatient]);

  const handleAddPatient = async (newPatientData) => {
    try {
      const created = await api.createPatient(newPatientData);
      setPatients((prev) => [created, ...prev]);
      setSelectedPatient(created);
    } catch (err) {
      console.warn('Patient creation fallback: adding locally', err.message);
      const mockCreated = { id: 'p-' + Date.now(), ...newPatientData };
      setPatients((prev) => [mockCreated, ...prev]);
      setSelectedPatient(mockCreated);
    }
  };

  const handleAnalysisComplete = (analysisData) => {
    if (analysisData.detected_myths) {
      setDetectedMyths(analysisData.detected_myths);
    }
    if (analysisData.risk_timeline_entries) {
      setPatientTimeline((prev) => [...analysisData.risk_timeline_entries, ...prev]);
    }
  };

  const handleOpenSmsModal = (alertInfo) => {
    setSmsData(alertInfo);
    setIsSmsOpen(true);
  };

  return (
    <div className="app-container">
      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        onLogout={async () => {
          await supabase.auth.signOut();
          setUser(null);
        }}
      />

      {/* Tab Content */}
      <main>
        {activeTab === 'dashboard' && (
          <Dashboard
            patients={patients}
            visits={patientVisits}
            setActiveTab={setActiveTab}
            setSelectedPatient={(p) => {
              setSelectedPatient(p);
              setActiveTab('patients');
            }}
          />
        )}

        {activeTab === 'patients' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <PatientList
              patients={patients}
              onAddPatient={handleAddPatient}
              onSelectPatient={(p) => setSelectedPatient(p)}
            />

            {/* Selected Patient Risk Timeline & Myths Split */}
            {selectedPatient && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginTop: '1rem' }}>
                <RiskTimelineView
                  patient={selectedPatient}
                  timelineEntries={patientTimeline}
                  onTriggerSms={handleOpenSmsModal}
                />
                <MythDebunker
                  detectedMyths={detectedMyths}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'recorder' && (
          <VoiceRecorder
            patients={patients}
            selectedPatient={selectedPatient}
            onAnalysisComplete={handleAnalysisComplete}
          />
        )}

        {activeTab === 'myths' && (
          <MythCatalog />
        )}

        {activeTab === 'pipeline' && (
          <UploadTest />
        )}
      </main>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={(u) => setUser(u)}
      />

      <SmsModal
        isOpen={isSmsOpen}
        onClose={() => setIsSmsOpen(false)}
        alertData={smsData}
      />
    </div>
  );
}
