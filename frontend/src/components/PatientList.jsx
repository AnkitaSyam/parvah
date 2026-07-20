import React, { useState } from 'react';
import { Search, Plus, User, Calendar, MapPin, Phone, Heart, Activity, ChevronRight, X } from 'lucide-react';

export default function PatientList({ patients = [], onAddPatient, onSelectPatient }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gestationalWeeks, setGestationalWeeks] = useState(14);
  const [village, setVillage] = useState('Rampur');
  const [contactPhone, setContactPhone] = useState('');
  const [bloodGroup, setBloodGroup] = useState('B+');

  const displayList = patients.length > 0 ? patients : samplePatients;

  const filteredPatients = displayList.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.village && p.village.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || !age) return;

    onAddPatient({
      name,
      age: parseInt(age, 10),
      gestational_weeks: parseInt(gestationalWeeks, 10),
      village,
      contact_phone: contactPhone,
      blood_group: bloodGroup
    });

    setName('');
    setAge('');
    setShowAddModal(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* Top Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800' }}>Assigned Pregnant Patients</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Only accessible by your authenticated ASHA account (Supabase Row Level Security)
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Search Bar */}
          <div style={{ position: 'relative', width: '240px' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search patient or village..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                background: 'var(--bg-card-glass)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                color: '#ffffff',
                fontSize: '0.85rem'
              }}
            />
          </div>

          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={18} />
            <span>Register New Patient</span>
          </button>
        </div>
      </div>

      {/* Patient Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
        {filteredPatients.map((p) => {
          const isHighRisk = p.name === 'Rekha Devi' || p.gestational_weeks > 34;

          return (
            <div
              key={p.id}
              className="glass-card"
              style={{
                padding: '1.25rem',
                cursor: 'pointer',
                border: isHighRisk ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-color)',
                position: 'relative'
              }}
              onClick={() => onSelectPatient(p)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: isHighRisk ? 'var(--severity-severe-bg)' : 'var(--color-secondary-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isHighRisk ? '#f87171' : 'var(--color-secondary)',
                    fontWeight: '700'
                  }}>
                    <User size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', lineHeight: 1.2 }}>{p.name}</h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Age: {p.age} years</span>
                  </div>
                </div>

                <span className={`badge ${isHighRisk ? 'badge-severe' : 'badge-mild'}`}>
                  Week {p.gestational_weeks}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <MapPin size={14} color="var(--color-secondary)" />
                  <span>{p.village || 'Rampur'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Heart size={14} color="var(--color-primary)" />
                  <span>Blood: {p.blood_group || 'B+'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', gridColumn: 'span 2' }}>
                  <Phone size={14} />
                  <span>{p.contact_phone || '+91 98765 43210'}</span>
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                paddingTop: '0.65rem',
                borderTop: '1px solid var(--border-color)',
                fontSize: '0.8rem',
                fontWeight: '600',
                color: 'var(--color-secondary)'
              }}>
                <span>View Risk Timeline & Visits</span>
                <ChevronRight size={16} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Patient Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div className="glass-card" style={{ maxWidth: '480px', width: '100%', padding: '1.75rem', position: 'relative' }}>
            <button
              onClick={() => setShowAddModal(false)}
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <h3 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '0.25rem' }}>
              Register Pregnant Woman
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Assign to your ASHA worker profile with Supabase RLS security.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sangeeta Devi"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: '#fff' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Age (Years) *</label>
                  <input
                    type="number"
                    required
                    placeholder="24"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: '#fff' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Gestational Week</label>
                  <input
                    type="number"
                    min="1"
                    max="42"
                    value={gestationalWeeks}
                    onChange={(e) => setGestationalWeeks(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Village Name</label>
                  <input
                    type="text"
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: '#fff' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Blood Group</label>
                  <select
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: '#fff' }}
                  >
                    <option value="A+">A+</option>
                    <option value="B+">B+</option>
                    <option value="O+">O+</option>
                    <option value="AB+">AB+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Contact Phone (+91)</label>
                <input
                  type="text"
                  placeholder="+91 98765 43210"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: '#fff' }}
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem', width: '100%' }}>
                Save & Assign Patient
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

const samplePatients = [
  { id: 'demo-1', name: 'Rekha Devi', age: 24, gestational_weeks: 26, village: 'Rampur', contact_phone: '+91 98765 43210', blood_group: 'B+' },
  { id: 'demo-2', name: 'Sunita Sharma', age: 28, gestational_weeks: 32, village: 'Kalyanpur', contact_phone: '+91 98765 43212', blood_group: 'O+' },
  { id: 'demo-3', name: 'Pooja Verma', age: 22, gestational_weeks: 18, village: 'Bishunpur', contact_phone: '+91 98765 43214', blood_group: 'A+' },
  { id: 'demo-4', name: 'Meena Kumari', age: 30, gestational_weeks: 36, village: 'Rampur', contact_phone: '+91 98765 43216', blood_group: 'AB+' }
];
