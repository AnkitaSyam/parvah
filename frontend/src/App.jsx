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
import { supabase } from './lib/supabase';
import { api } from './lib/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const [patients, setPatients] = useState([]);
  const [isDemo, setIsDemo] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientTimeline, setPatientTimeline] = useState([]);
  const [patientVisits, setPatientVisits] = useState([]);
  const [detectedMyths, setDetectedMyths] = useState([]);
  const [fullName, setFullName] = useState('');
  const [allVisits, setAllVisits] = useState([]);
  const [mythsAddressedCount, setMythsAddressedCount] = useState(0);

  // Modals
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [smsData, setSmsData] = useState(null);
  const [isSmsOpen, setIsSmsOpen] = useState(false);

  // Check auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setLoadingSession(false);
    }).catch((err) => {
      console.error('Session verification error:', err);
      setUser(null);
      setLoadingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch Patients
  useEffect(() => {
    if (!user) {
      setPatients([]);
      setSelectedPatient(null);
      setIsDemo(false);
      return;
    }
    async function loadPatients() {
      try {
        const data = await api.getPatients();
        setIsDemo(false);
        if (data && data.length > 0) {
          setPatients(data);
          setSelectedPatient(data[0]);
        } else {
          setPatients([]);
          setSelectedPatient(null);
        }
      } catch (err) {
        console.warn('Backend API patient fetch fallback:', err.message);
        setIsDemo(true);
      }
    }
    loadPatients();
  }, [user, activeTab]);

  // Fetch dashboard and profile details
  useEffect(() => {
    if (!user) {
      setFullName('');
      setAllVisits([]);
      setMythsAddressedCount(0);
      return;
    }

    async function loadDashboardData() {
      try {
        const profile = await api.getProfile();
        if (profile && profile.full_name) {
          setFullName(profile.full_name);
        } else {
          setFullName(user.email.split('@')[0] || 'ASHA Worker');
        }
      } catch (err) {
        console.warn('Failed to load profile, using fallback:', err.message);
        setFullName(user.email.split('@')[0] || 'ASHA Worker');
      }

      try {
        const visitsData = await api.getAllVisits();
        if (visitsData) setAllVisits(visitsData);
      } catch (err) {
        console.warn('Failed to load all visits:', err.message);
      }

      try {
        const mythsData = await api.getDetectedMyths();
        if (mythsData) setMythsAddressedCount(mythsData.length);
      } catch (err) {
        console.warn('Failed to load detected myths:', err.message);
      }
    }

    if (activeTab === 'dashboard') {
      loadDashboardData();
    }
  }, [user, activeTab]);

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
    const created = await api.createPatient(newPatientData);
    setPatients((prev) => [created, ...prev]);
    setSelectedPatient(created);
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

  if (loadingSession) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-main)',
        color: 'var(--text-main)',
        gap: '1rem',
        fontFamily: 'var(--font-family-body)'
      }}>
        <div className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', border: '1px solid var(--border-color)' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: '3px solid var(--color-primary-light)',
            borderTopColor: 'var(--color-primary)',
            animation: 'spin 1s linear infinite'
          }}></div>
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}} />
          <p style={{ fontWeight: '600' }}>Confirming session status...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthModal
        isOpen={true}
        onClose={null}
        onAuthSuccess={(u) => setUser(u)}
      />
    );
  }

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
            fullName={fullName}
            patients={patients}
            visits={allVisits}
            mythsAddressed={mythsAddressedCount}
            isDemo={isDemo}
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
              isDemo={isDemo}
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
                  isDemo={isDemo}
                />
                <MythDebunker
                  detectedMyths={detectedMyths}
                  isDemo={isDemo}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'recorder' && (
          <VoiceRecorder
            patients={patients}
            isDemo={isDemo}
            selectedPatient={selectedPatient}
            onAnalysisComplete={handleAnalysisComplete}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === 'myths' && (
          <MythCatalog />
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
