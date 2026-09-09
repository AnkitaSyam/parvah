import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import PatientList from './components/PatientList';
import VoiceRecorder from './components/VoiceRecorder';
import PatientBanner from './components/PatientBanner';
import RiskTimelineView from './components/RiskTimelineView';
import RiskExplainer from './components/RiskExplainer';
import MythDebunker from './components/MythDebunker';
import MythCatalog from './components/MythCatalog';
import CareSchedule from './components/CareSchedule';
import VaccinationTable from './components/VaccinationTable';
import VaccineFollowUp from './components/VaccineFollowUp';
import VitalsPanel from './components/VitalsPanel';
import GrowthTracker from './components/GrowthTracker';
import AuthModal from './components/AuthModal';
import SmsModal from './components/SmsModal';
import DeliveryModal from './components/DeliveryModal';
import ReferralSlip from './components/ReferralSlip';
import { supabase } from './lib/supabase';
import { api } from './lib/api';
import { useOutbox } from './lib/useOutbox';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showPatientDetail, setShowPatientDetail] = useState(false);
  const [user, setUser] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientTimeline, setPatientTimeline] = useState([]);
  const [detectedMyths, setDetectedMyths] = useState([]);
  const [allDetectedMyths, setAllDetectedMyths] = useState([]);
  const [visitHesitancy, setVisitHesitancy] = useState(null);
  const [profile, setProfile] = useState(null);
  const [allVisits, setAllVisits] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [riskRefreshKey, setRiskRefreshKey] = useState(0);
  const [hesitancyCount, setHesitancyCount] = useState(0);
  const [vaccineView, setVaccineView] = useState('followup'); // 'followup' | 'checklist'

  // Offline queue: record with no signal, upload when one returns.
  const outbox = useOutbox({ enabled: Boolean(user) });

  // Modals
  const [smsData, setSmsData] = useState(null);
  const [deliveryPatient, setDeliveryPatient] = useState(null);
  const [referralPatient, setReferralPatient] = useState(null);

  // ── Session ───────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => setUser(session?.user || null))
      .catch((err) => { console.error('Session check failed:', err); setUser(null); })
      .finally(() => setLoadingSession(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadPatients = useCallback(async () => {
    try {
      const data = await api.getPatients();
      setPatients(data || []);
      setLoadError('');

      // Keep the selection pointing at fresh data after a refresh.
      setSelectedPatient((prev) => {
        if (!prev) return data?.[0] || null;
        return data?.find((p) => p.id === prev.id) || data?.[0] || null;
      });
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  const loadWorkerData = useCallback(async () => {
    const results = await Promise.allSettled([
      api.getProfile(),
      api.getAllVisits(),
      api.getDetectedMyths(),
      api.getHesitancyList()
    ]);

    if (results[0].status === 'fulfilled') setProfile(results[0].value);
    if (results[1].status === 'fulfilled') setAllVisits(results[1].value || []);
    if (results[2].status === 'fulfilled') setAllDetectedMyths(results[2].value || []);
    if (results[3].status === 'fulfilled') setHesitancyCount(results[3].value?.length || 0);
  }, []);

  useEffect(() => {
    if (!user) {
      setPatients([]); setSelectedPatient(null); setProfile(null);
      setAllVisits([]); setAllDetectedMyths([]); setPatientTimeline([]);
      setDetectedMyths([]); setVisitHesitancy(null); setHesitancyCount(0);
      return;
    }
    loadPatients();
    loadWorkerData();
  }, [user, loadPatients, loadWorkerData]);

  // Per-patient detail
  useEffect(() => {
    if (!selectedPatient) {
      setPatientTimeline([]);
      setDetectedMyths([]);
      return;
    }

    let cancelled = false;

    (async () => {
      const [timeline, myths] = await Promise.allSettled([
        api.getPatientRiskTimeline(selectedPatient.id),
        api.getPatientMyths(selectedPatient.id)
      ]);
      if (cancelled) return;
      if (timeline.status === 'fulfilled') setPatientTimeline(timeline.value || []);
      if (myths.status === 'fulfilled') setDetectedMyths(myths.value || []);
    })();

    return () => { cancelled = true; };
  }, [selectedPatient?.id, riskRefreshKey]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAddPatient = async (data) => {
    const created = await api.createPatient(data);
    await loadPatients();
    setSelectedPatient(created);
    return created;
  };

  const handleSelectPatient = (p, tab) => {
    setSelectedPatient(p);
    if (tab) {
      setActiveTab(tab);
      if (tab === 'patients') {
        setShowPatientDetail(true);
      }
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'patients') {
      setShowPatientDetail(false);
    }
  };

  const handleAnalysisComplete = (analysis) => {
    if (analysis.detected_myths) setDetectedMyths(analysis.detected_myths);
    setVisitHesitancy(analysis.immunization_hesitancy || null);
    if (analysis.risk_timeline_entries) {
      setPatientTimeline((prev) => [...analysis.risk_timeline_entries, ...prev]);
    }
    // Risk level changed — refresh the list so cards and tiles agree.
    loadPatients();
    loadWorkerData();
    setRiskRefreshKey((k) => k + 1);
  };

  const handleDeliveryRecorded = async () => {
    await loadPatients();
    setRiskRefreshKey((k) => k + 1);
  };

  const handleMythAddressed = (mythId, isAddressed) => {
    setAllDetectedMyths((prev) =>
      prev.map((m) => m.id === mythId ? { ...m, is_addressed: isAddressed } : m));
  };

  const openSms = (data) => {
    setSmsData({
      ...data,
      patientId: data.patientId || selectedPatient?.id,
      patientName: data.patientName || selectedPatient?.name
    });
  };

  const alertCount = useMemo(
    () => patients.filter((p) => p.risk_level === 'alert').length,
    [patients]
  );

  const openMythCount = useMemo(
    () => allDetectedMyths.filter((m) => !m.is_addressed).length,
    [allDetectedMyths]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  if (loadingSession) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', height: '100vh',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-main)', color: 'var(--text-main)', gap: '1rem'
      }}>
        <div className="glass-card" style={{
          padding: '2rem', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: '1rem'
        }}>
          <div style={{
            width: '38px', height: '38px', borderRadius: '50%',
            border: '3px solid var(--color-primary-light)',
            borderTopColor: 'var(--color-primary)',
            animation: 'spin 1s linear infinite'
          }} />
          <p style={{ fontWeight: 600 }}>Checking your session…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthModal isOpen onAuthSuccess={setUser} />;
  }

  const fullName = profile?.full_name || user.email?.split('@')[0] || 'ASHA worker';

  return (
    <div className="app-container">
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        user={user}
        profile={profile}
        alertCount={alertCount}
        hesitancyCount={hesitancyCount}
        isOnline={outbox.isOnline}
        pendingSync={outbox.pending}
        syncing={outbox.syncing}
        onSync={outbox.sync}
        onLogout={async () => { await supabase.auth.signOut(); setUser(null); }}
      />

      {loadError && (
        <div style={{
          marginBottom: '1.25rem', padding: '0.85rem 1rem',
          background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.28)',
          borderRadius: 'var(--radius-sm)', fontSize: '0.88rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap'
        }}>
          <span>{loadError}</span>
          <button className="btn btn-outline" onClick={loadPatients}
            style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem' }}>Try again</button>
        </div>
      )}

      <main>
        {activeTab === 'dashboard' && (
          <Dashboard
            fullName={fullName}
            profile={profile}
            patients={patients}
            visits={allVisits}
            mythsOpen={openMythCount}
            setActiveTab={setActiveTab}
            setSelectedPatient={(p) => handleSelectPatient(p, 'patients')}
            onOpenReferral={setReferralPatient}
          />
        )}

        {activeTab === 'patients' && (
          showPatientDetail && selectedPatient ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              <div>
                <button
                  className="btn btn-outline"
                  onClick={() => setShowPatientDetail(false)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.45rem 0.9rem',
                    fontSize: '0.88rem'
                  }}
                >
                  <ArrowLeft size={16} />
                  <span>Back to patients</span>
                </button>
              </div>

              <PatientBanner
                patient={selectedPatient}
                onOpenReferral={() => setReferralPatient(selectedPatient)}
              />

              <RiskExplainer patient={selectedPatient} refreshKey={riskRefreshKey} />

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                gap: '1.5rem'
              }}>
                <VitalsPanel
                  patient={selectedPatient}
                  onSaved={() => { loadPatients(); setRiskRefreshKey((k) => k + 1); }}
                />
                <GrowthTracker
                  patient={selectedPatient}
                  onSaved={() => { loadPatients(); setRiskRefreshKey((k) => k + 1); }}
                />
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                gap: '1.5rem'
              }}>
                <RiskTimelineView
                  patient={selectedPatient}
                  timelineEntries={patientTimeline}
                  onTriggerSms={openSms}
                />
                <MythDebunker
                  detectedMyths={detectedMyths}
                  language={selectedPatient.preferred_language || 'hi'}
                  onAddressed={handleMythAddressed}
                />
              </div>
            </div>
          ) : (
            <PatientList
              patients={patients}
              userCity={profile?.city}
              selectedPatientId={selectedPatient?.id}
              onAddPatient={handleAddPatient}
              onSelectPatient={(p) => handleSelectPatient(p, 'patients')}
              onRecordDelivery={setDeliveryPatient}
              onOpenReferral={setReferralPatient}
            />
          )
        )}

        {activeTab === 'schedule' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {patients.length > 1 && (
              <div className="glass-card" style={{ padding: '0.9rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
                <label htmlFor="schedule-patient" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Patient:</label>
                <select
                  id="schedule-patient"
                  value={selectedPatient?.id || ''}
                  onChange={(e) => setSelectedPatient(patients.find((p) => p.id === e.target.value) || null)}
                  style={{
                    padding: '0.5rem 0.75rem', background: 'var(--input-bg)',
                    border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                    color: 'var(--input-text)', fontSize: '0.87rem', fontWeight: 600
                  }}
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.stage === 'postpartum' ? 'postnatal' : 'pregnant'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <CareSchedule
              patient={selectedPatient}
              onOpenSms={openSms}
              onNavigateTab={() => {
                setVaccineView('checklist');
                setActiveTab('vaccines');
              }}
            />
          </div>
        )}

        {activeTab === 'vaccines' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* View toggle header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              flexWrap: 'wrap', gap: '1rem'
            }}>
              <div className="glass-card" style={{
                padding: '0.3rem', display: 'inline-flex', gap: '0.25rem',
                borderRadius: 'var(--radius-full)'
              }}>
                <button
                  type="button"
                  className={`nav-pill ${vaccineView === 'followup' ? 'active' : ''}`}
                  onClick={() => setVaccineView('followup')}
                  style={{ padding: '0.45rem 1rem', fontSize: '0.84rem' }}
                >
                  <span>Follow-up</span>
                  {hesitancyCount > 0 && (
                    <span style={{
                      marginLeft: '0.35rem', minWidth: '18px', height: '18px', padding: '0 5px',
                      borderRadius: '9px',
                      background: vaccineView === 'followup' ? '#fff' : '#DC2626',
                      color: vaccineView === 'followup' ? '#DC2626' : '#fff',
                      fontSize: '0.68rem', fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {hesitancyCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className={`nav-pill ${vaccineView === 'checklist' ? 'active' : ''}`}
                  onClick={() => setVaccineView('checklist')}
                  style={{ padding: '0.45rem 1rem', fontSize: '0.84rem' }}
                >
                  Patient checklist
                </button>
              </div>

              {vaccineView === 'checklist' && patients.length > 1 && (
                <div className="glass-card" style={{
                  padding: '0.45rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.65rem'
                }}>
                  <label htmlFor="vaccines-patient" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Patient:</label>
                  <select
                    id="vaccines-patient"
                    value={selectedPatient?.id || ''}
                    onChange={(e) => setSelectedPatient(patients.find((p) => p.id === e.target.value) || null)}
                    style={{
                      padding: '0.4rem 0.7rem', background: 'var(--input-bg)',
                      border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                      color: 'var(--input-text)', fontSize: '0.85rem', fontWeight: 600
                    }}
                  >
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.stage === 'postpartum' ? 'postnatal' : 'pregnant'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {vaccineView === 'followup' ? (
              <VaccineFollowUp
                onOpenSms={openSms}
                onSelectPatient={(p) => {
                  const target = patients.find((pt) => pt.id === p.id);
                  if (!target) {
                    setLoadError("Could not open that patient's checklist — try refreshing the patient list.");
                    return;
                  }
                  setSelectedPatient(target);
                  setVaccineView('checklist');
                }}
                onCountChange={setHesitancyCount}
              />
            ) : (
              <VaccinationTable patient={selectedPatient} onOpenSms={openSms} />
            )}
          </div>
        )}

        {activeTab === 'recorder' && (
          <VoiceRecorder
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={setSelectedPatient}
            onAnalysisComplete={handleAnalysisComplete}
            setActiveTab={setActiveTab}
            isOnline={outbox.isOnline}
            onQueued={outbox.refreshCount}
          />
        )}

        {activeTab === 'myths' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            <MythDebunker
              detectedMyths={allDetectedMyths}
              hesitancy={visitHesitancy}
              language={selectedPatient?.preferred_language || 'hi'}
              onAddressed={handleMythAddressed}
            />
            <MythCatalog />
          </div>
        )}
      </main>

      <SmsModal
        isOpen={Boolean(smsData)}
        onClose={() => setSmsData(null)}
        alertData={smsData}
      />

      <DeliveryModal
        isOpen={Boolean(deliveryPatient)}
        patient={deliveryPatient}
        onClose={() => setDeliveryPatient(null)}
        onRecorded={handleDeliveryRecorded}
      />

      <ReferralSlip
        isOpen={Boolean(referralPatient)}
        patientId={referralPatient?.id}
        patientName={referralPatient?.name}
        onClose={() => setReferralPatient(null)}
      />
    </div>
  );
}
