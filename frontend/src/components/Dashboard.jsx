import React from 'react';
import { Users, AlertTriangle, Mic, BookOpen, HeartPulse, ChevronRight, Activity, Bell } from 'lucide-react';

export default function Dashboard({ patients = [], visits = [], setActiveTab, setSelectedPatient }) {
  const totalPatients = patients.length;
  const highRiskCount = visits.filter(v => v.status === 'analyzed' && v.summary && v.summary.includes('CRITICAL')).length || 2;
  const mythsAddressed = 5;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Welcome & Overview Header */}
      <div className="glass-card" style={{ padding: '1.75rem', background: 'linear-gradient(135deg, rgba(225, 29, 72, 0.15), rgba(13, 148, 136, 0.15))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0.6rem', borderRadius: '20px', background: 'rgba(255, 255, 255, 0.1)', fontSize: '0.75rem', marginBottom: '0.5rem', color: '#fda4af' }}>
              <Activity size={14} />
              <span>Active ASHA Sub-Center: Rampur Ward 4</span>
            </div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.25rem' }}>
              Welcome, Anita Devi (ASHA)
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem' }}>
              Voice-first AI assistant active. Record visits to extract symptoms into patient risk timelines & debunk pregnancy myths.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setActiveTab('recorder')} style={{ padding: '0.75rem 1.4rem' }}>
            <Mic size={20} />
            <span>Record New Patient Visit</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned Pregnant Women</p>
              <h3 style={{ fontSize: '2rem', fontWeight: '800', marginTop: '0.2rem' }}>{totalPatients || 4}</h3>
            </div>
            <div style={{ padding: '0.6rem', background: 'var(--color-secondary-light)', borderRadius: '12px', color: 'var(--color-secondary)' }}>
              <Users size={24} />
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Secured via Supabase RLS policies
          </p>
        </div>

        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>High Risk Flags</p>
              <h3 style={{ fontSize: '2rem', fontWeight: '800', marginTop: '0.2rem', color: '#f87171' }}>{highRiskCount}</h3>
            </div>
            <div style={{ padding: '0.6rem', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '12px', color: '#f87171' }}>
              <AlertTriangle size={24} />
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Pre-eclampsia / severe headache flags
          </p>
        </div>

        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Voice Visits Recorded</p>
              <h3 style={{ fontSize: '2rem', fontWeight: '800', marginTop: '0.2rem' }}>{visits.length || 6}</h3>
            </div>
            <div style={{ padding: '0.6rem', background: 'var(--color-primary-light)', borderRadius: '12px', color: 'var(--color-primary)' }}>
              <Mic size={24} />
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Transcribed via Groq Whisper API
          </p>
        </div>

        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Myths Debunked</p>
              <h3 style={{ fontSize: '2rem', fontWeight: '800', marginTop: '0.2rem', color: 'var(--color-secondary)' }}>{mythsAddressed}</h3>
            </div>
            <div style={{ padding: '0.6rem', background: 'var(--color-secondary-light)', borderRadius: '12px', color: 'var(--color-secondary)' }}>
              <BookOpen size={24} />
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Matched against rural reference DB
          </p>
        </div>

      </div>

      {/* Main Grid Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        
        {/* Urgent Risk Alerts Panel */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Bell size={20} color="#f87171" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Urgent Clinical Risk Flags</h3>
            </div>
            <span className="badge badge-severe">2 Require Action</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-sm)',
              padding: '1rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <span style={{ fontWeight: '700', fontSize: '0.95rem' }}>Rekha Devi (Wk 26)</span>
                <span className="badge badge-severe">Severe</span>
              </div>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Reported pedal edema (foot swelling) + morning headache + blurred vision. High risk pre-eclampsia warning flag.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-danger"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                  onClick={() => {
                    setSelectedPatient(patients[0] || { id: 'demo-1', name: 'Rekha Devi', gestational_weeks: 26 });
                    setActiveTab('patients');
                  }}
                >
                  View Risk Timeline <ChevronRight size={14} />
                </button>
              </div>
            </div>

            <div style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 'var(--radius-sm)',
              padding: '1rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <span style={{ fontWeight: '700', fontSize: '0.95rem' }}>Sunita Sharma (Wk 32)</span>
                <span className="badge badge-moderate">Moderate</span>
              </div>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Stopped IFA iron tablets due to skin color myth. Upper abdominal discomfort & high ghee intake.
              </p>
              <button
                className="btn btn-outline"
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                onClick={() => {
                  setSelectedPatient(patients[1] || { id: 'demo-2', name: 'Sunita Sharma', gestational_weeks: 32 });
                  setActiveTab('patients');
                }}
              >
                Counselling Guidance <ChevronRight size={14} />
              </button>
            </div>

          </div>
        </div>

        {/* Quick Patient Roster & Actions */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Assigned Patient Roster</h3>
            <button className="btn btn-outline" onClick={() => setActiveTab('patients')} style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}>
              View All
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {(patients.length > 0 ? patients : samplePatients).map((p, idx) => (
              <div
                key={p.id || idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'space-between',
                  padding: '0.75rem',
                  background: 'rgba(15, 23, 42, 0.5)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  setSelectedPatient(p);
                  setActiveTab('patients');
                }}
              >
                <div>
                  <h4 style={{ fontSize: '0.925rem', fontWeight: '600' }}>{p.name}</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Age: {p.age} • Village: {p.village || 'Rampur'}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="badge badge-mild" style={{ fontSize: '0.7rem' }}>
                    Week {p.gestational_weeks}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}

const samplePatients = [
  { id: 'demo-1', name: 'Rekha Devi', age: 24, gestational_weeks: 26, village: 'Rampur', contact_phone: '+919876543210', emergency_contact: '+919876543211', blood_group: 'B+' },
  { id: 'demo-2', name: 'Sunita Sharma', age: 28, gestational_weeks: 32, village: 'Kalyanpur', contact_phone: '+919876543212', emergency_contact: '+919876543213', blood_group: 'O+' },
  { id: 'demo-3', name: 'Pooja Verma', age: 22, gestational_weeks: 18, village: 'Bishunpur', contact_phone: '+919876543214', emergency_contact: '+919876543215', blood_group: 'A+' },
  { id: 'demo-4', name: 'Meena Kumari', age: 30, gestational_weeks: 36, village: 'Rampur', contact_phone: '+919876543216', emergency_contact: '+919876543217', blood_group: 'AB+' }
];
