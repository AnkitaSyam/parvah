import React from 'react';
import { Users, AlertTriangle, Mic, BookOpen, HeartPulse, ChevronRight, Activity, Bell } from 'lucide-react';

export default function Dashboard({ patients = [], visits = [], setActiveTab, setSelectedPatient }) {
  const totalPatients = patients.length;
  const highRiskCount = visits.filter(v => v.status === 'analyzed' && v.summary && v.summary.includes('CRITICAL')).length || 2;
  const mythsAddressed = 5;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Welcome & Overview Header */}
      <div className="glass-card" style={{ padding: '1.75rem', background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-secondary-light))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0.65rem', borderRadius: '20px', background: '#ffffff', border: '1px solid rgba(59, 95, 224, 0.15)', fontSize: '0.75rem', marginBottom: '0.5rem', color: 'var(--color-primary)', fontWeight: '600' }}>
              <Activity size={14} />
              <span>Active ASHA Sub-Center: Rampur Ward 4</span>
            </div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.25rem', color: 'var(--text-main)' }}>
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
        
        {/* Card 1: Assigned Women */}
        <div style={{ padding: '1.25rem 1.5rem', background: '#FDF2F8', borderRadius: 'var(--radius-md)', border: '1px solid rgba(214, 36, 122, 0.1)', boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ color: '#D6247A', fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Assigned Women</p>
              <h3 style={{ fontSize: '2.25rem', fontWeight: '800', color: 'var(--text-main)', lineHeight: '1' }}>{totalPatients || 42}</h3>
            </div>
            <div style={{ width: '42px', height: '42px', background: '#ffffff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D6247A', boxShadow: '0 2px 8px rgba(214, 36, 122, 0.15)' }}>
              <Users size={22} />
            </div>
          </div>
        </div>

        {/* Card 2: High Risk Flags */}
        <div style={{ padding: '1.25rem 1.5rem', background: '#FEF2F2', borderRadius: 'var(--radius-md)', border: '1px solid rgba(220, 38, 38, 0.1)', boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ color: '#DC2626', fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>High Risk Flags</p>
              <h3 style={{ fontSize: '2.25rem', fontWeight: '800', color: 'var(--text-main)', lineHeight: '1' }}>{highRiskCount || 3}</h3>
            </div>
            <div style={{ width: '42px', height: '42px', background: '#ffffff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626', boxShadow: '0 2px 8px rgba(220, 38, 38, 0.15)' }}>
              <AlertTriangle size={22} />
            </div>
          </div>
        </div>

        {/* Card 3: Voice Visits */}
        <div style={{ padding: '1.25rem 1.5rem', background: '#EFF6FF', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59, 95, 224, 0.1)', boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ color: '#3B5FE0', fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Voice Visits</p>
              <h3 style={{ fontSize: '2.25rem', fontWeight: '800', color: 'var(--text-main)', lineHeight: '1' }}>{visits.length || 18}</h3>
            </div>
            <div style={{ width: '42px', height: '42px', background: '#ffffff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3B5FE0', boxShadow: '0 2px 8px rgba(59, 95, 224, 0.15)' }}>
              <Mic size={22} />
            </div>
          </div>
        </div>

        {/* Card 4: Myths Debunked */}
        <div style={{ padding: '1.25rem 1.5rem', background: '#F5F3FF', borderRadius: 'var(--radius-md)', border: '1px solid rgba(139, 92, 246, 0.1)', boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ color: '#7c3aed', fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Myths Debunked</p>
              <h3 style={{ fontSize: '2.25rem', fontWeight: '800', color: 'var(--text-main)', lineHeight: '1' }}>{mythsAddressed || 12}</h3>
            </div>
            <div style={{ width: '42px', height: '42px', background: '#ffffff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed', boxShadow: '0 2px 8px rgba(139, 92, 246, 0.15)' }}>
              <BookOpen size={22} />
            </div>
          </div>
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
            
            {/* Rekha Devi Card */}
            <div style={{
              background: '#FFF5F5',
              border: '1px solid rgba(220, 38, 38, 0.08)',
              borderLeft: '4px solid var(--color-danger)',
              borderRadius: 'var(--radius-sm)',
              padding: '1rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <span style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-main)' }}>Rekha Devi (Wk 26)</span>
                <span className="badge badge-severe">Severe</span>
              </div>
              <p style={{ fontSize: '0.825rem', color: '#b91c1c', marginBottom: '0.5rem', fontWeight: '500' }}>
                Reported pedal edema (foot swelling) + morning headache + blurred vision. High risk pre-eclampsia warning flag.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn"
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.4rem 0.8rem',
                    background: '#9C2464',
                    color: '#ffffff',
                    boxShadow: '0 2px 6px rgba(156, 36, 100, 0.2)'
                  }}
                  onClick={() => {
                    setSelectedPatient(patients[0] || { id: 'demo-1', name: 'Rekha Devi', gestational_weeks: 26 });
                    setActiveTab('patients');
                  }}
                >
                  <span>View Risk Timeline</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Sunita Sharma Card */}
            <div style={{
              background: '#FFFBEB',
              border: '1px solid rgba(245, 158, 11, 0.08)',
              borderLeft: '4px solid var(--color-danger)',
              borderRadius: 'var(--radius-sm)',
              padding: '1rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <span style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-main)' }}>Sunita Sharma (Wk 32)</span>
                <span className="badge badge-moderate">Moderate</span>
              </div>
              <p style={{ fontSize: '0.825rem', color: '#b45309', marginBottom: '0.5rem', fontWeight: '500' }}>
                Stopped IFA iron tablets due to skin color myth. Upper abdominal discomfort & high ghee intake.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn"
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.4rem 0.8rem',
                    background: '#9C2464',
                    color: '#ffffff',
                    boxShadow: '0 2px 6px rgba(156, 36, 100, 0.2)'
                  }}
                  onClick={() => {
                    setSelectedPatient(patients[1] || { id: 'demo-2', name: 'Sunita Sharma', gestational_weeks: 32 });
                    setActiveTab('patients');
                  }}
                >
                  <span>Counselling Guidance</span>
                  <ChevronRight size={14} />
                </button>
              </div>
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
                  justifyContent: 'space-between',
                  padding: '0.75rem',
                  background: '#FFF9F3',
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
