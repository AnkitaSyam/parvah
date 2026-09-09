import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, Plus, User, MapPin, Phone, Heart, ChevronRight, X, AlertCircle,
  Baby, CalendarClock, FileText, Loader2, Filter
} from 'lucide-react';

/**
 * Patient list.
 *
 * Risk used to be decided by `p.name === 'Rekha Devi' || p.gestational_weeks > 34`
 * — a hardcoded demo name — while patients.risk_level, the actual computed
 * field, went unused. Cards now reflect the real risk level, the real
 * gestational age (advanced from registration, not frozen at it), the care
 * stage, and what is overdue.
 */

const RISK = {
  alert:  { label: 'Alert',  color: '#DC2626', bg: 'rgba(220, 38, 38, 0.10)', border: 'rgba(220, 38, 38, 0.42)' },
  watch:  { label: 'Watch',  color: '#D97706', bg: 'rgba(217, 119, 6, 0.10)', border: 'rgba(217, 119, 6, 0.38)' },
  normal: { label: 'Normal', color: '#16A34A', bg: 'rgba(22, 163, 74, 0.10)', border: 'var(--border-color)' }
};

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];

export default function PatientList({
  patients = [],
  userCity,
  onAddPatient,
  onSelectPatient,
  onRecordDelivery,
  onOpenReferral,
  selectedPatientId
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState('all'); // all | antenatal | postpartum | attention
  const [showAddModal, setShowAddModal] = useState(false);

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gestationalWeeks, setGestationalWeeks] = useState('');
  const [locationOption, setLocationOption] = useState('');
  const [customVillage, setCustomVillage] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [gravida, setGravida] = useState('');
  const [para, setPara] = useState('');
  const [language, setLanguage] = useState('hi');

  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (showAddModal) {
      setLocationOption(userCity || 'Other');
      setCustomVillage('');
    }
  }, [showAddModal, userCity]);

  const filteredPatients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return patients.filter((p) => {
      if (term && !(
        p.name?.toLowerCase().includes(term) ||
        p.village?.toLowerCase().includes(term) ||
        p.baby_name?.toLowerCase().includes(term)
      )) return false;

      if (stageFilter === 'antenatal') return p.stage !== 'postpartum';
      if (stageFilter === 'postpartum') return p.stage === 'postpartum';
      if (stageFilter === 'attention') {
        return p.risk_level === 'alert' || p.risk_level === 'watch' ||
               p.overdue_count > 0 || p.refused_count > 0;
      }
      return true;
    }).sort((a, b) => {
      // Whoever needs attention first.
      const rank = { alert: 0, watch: 1, normal: 2 };
      const diff = (rank[a.risk_level] ?? 2) - (rank[b.risk_level] ?? 2);
      if (diff !== 0) return diff;
      return (b.overdue_count || 0) - (a.overdue_count || 0);
    });
  }, [patients, searchTerm, stageFilter]);

  const resetForm = () => {
    setName(''); setAge(''); setGestationalWeeks(''); setCustomVillage('');
    setContactPhone(''); setEmergencyContact(''); setBloodGroup('');
    setGravida(''); setPara(''); setLanguage('hi');
    setLocationOption(userCity || 'Other');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !age) return;

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      await onAddPatient({
        name: name.trim(),
        age: parseInt(age, 10),
        gestational_weeks: gestationalWeeks ? parseInt(gestationalWeeks, 10) : 12,
        gravida: gravida ? parseInt(gravida, 10) : 1,
        para: para ? parseInt(para, 10) : 0,
        village: locationOption === 'Other' ? customVillage.trim() : locationOption,
        contact_phone: contactPhone.trim(),
        emergency_contact: emergencyContact.trim(),
        blood_group: bloodGroup || 'Unknown',
        preferred_language: language
      });

      resetForm();
      setShowAddModal(false);
    } catch (err) {
      setErrorMsg(err.message || 'Could not register the patient. Check the details and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const counts = useMemo(() => ({
    all: patients.length,
    antenatal: patients.filter((p) => p.stage !== 'postpartum').length,
    postpartum: patients.filter((p) => p.stage === 'postpartum').length,
    attention: patients.filter((p) =>
      p.risk_level === 'alert' || p.risk_level === 'watch' || p.overdue_count > 0 || p.refused_count > 0
    ).length
  }), [patients]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Your patients</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Visible only to your account — enforced by row-level security in the database.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '230px' }}>
            <Search size={16} style={{
              position: 'absolute', left: '0.7rem', top: '50%',
              transform: 'translateY(-50%)', color: 'var(--text-muted)'
            }} />
            <input
              type="search"
              placeholder="Search name or village…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search patients"
              style={{
                width: '100%', padding: '0.55rem 0.7rem 0.55rem 2.1rem',
                background: 'var(--bg-card-glass)', border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)', color: 'var(--input-text)', fontSize: '0.85rem'
              }}
            />
          </div>

          <button className="btn btn-primary" onClick={() => { setErrorMsg(''); setShowAddModal(true); }}>
            <Plus size={18} /><span>Register patient</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={14} style={{ color: 'var(--text-muted)' }} />
        {[
          { key: 'all', label: 'All' },
          { key: 'attention', label: 'Needs attention' },
          { key: 'antenatal', label: 'Pregnant' },
          { key: 'postpartum', label: 'Postnatal' }
        ].map((f) => {
          const active = stageFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setStageFilter(f.key)}
              aria-pressed={active}
              style={{
                padding: '0.32rem 0.7rem', fontSize: '0.79rem', fontWeight: 600,
                borderRadius: 'var(--radius-full)', cursor: 'pointer',
                border: `1px solid ${active ? 'var(--color-primary)' : 'var(--border-color)'}`,
                background: active ? 'var(--color-primary-light)' : 'transparent',
                color: active ? 'var(--color-primary)' : 'var(--text-muted)',
                transition: 'all var(--transition-fast)'
              }}
            >
              {f.label} <span style={{ opacity: 0.6 }}>{counts[f.key]}</span>
            </button>
          );
        })}
      </div>

      {/* Cards */}
      {filteredPatients.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '3rem 1.5rem',
          border: '2px dashed var(--border-color)', borderRadius: 'var(--radius-md)',
          color: 'var(--text-muted)'
        }}>
          <User size={34} style={{ opacity: 0.3, marginBottom: '0.6rem' }} />
          <p style={{ fontWeight: 700, color: 'var(--text-main)' }}>
            {patients.length === 0 ? 'No patients registered yet' : 'No patients match this filter'}
          </p>
          <p style={{ fontSize: '0.84rem', marginTop: '0.25rem' }}>
            {patients.length === 0
              ? 'Register the first woman on your list to start recording visits.'
              : 'Try a different filter or clear the search.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.15rem' }}>
          {filteredPatients.map((p) => {
            const risk = RISK[p.risk_level] || RISK.normal;
            const isPostpartum = p.stage === 'postpartum';
            const isSelected = p.id === selectedPatientId;
            const weeks = p.current_gestational_weeks ?? p.gestational_weeks;

            return (
              <div
                key={p.id}
                className="glass-card"
                role="button"
                tabIndex={0}
                onClick={() => onSelectPatient(p)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectPatient(p); } }}
                style={{
                  padding: '1.15rem 1.25rem', cursor: 'pointer',
                  border: `1px solid ${isSelected ? 'var(--color-primary)' : risk.border}`,
                  boxShadow: isSelected ? 'var(--shadow-glow)' : 'var(--shadow-card)',
                  display: 'flex', flexDirection: 'column', gap: '0.8rem'
                }}
              >
                {/* Identity */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                      background: risk.bg, color: risk.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {isPostpartum ? <Baby size={20} /> : <User size={20} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{
                        fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>{p.name}</h3>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {p.age ? `${p.age} years` : 'Age not recorded'}
                        {p.gravida != null && ` · G${p.gravida}P${p.para ?? 0}`}
                      </span>
                    </div>
                  </div>

                  <span style={{
                    fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.05em', color: risk.color, background: risk.bg,
                    border: `1px solid ${risk.color}33`, padding: '0.16rem 0.45rem',
                    borderRadius: '3px', flexShrink: 0, whiteSpace: 'nowrap'
                  }}>{risk.label}</span>
                </div>

                {/* Stage */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)',
                  background: isPostpartum ? 'var(--color-secondary-light)' : 'var(--color-primary-light)',
                  fontSize: '0.8rem', fontWeight: 600
                }}>
                  {isPostpartum ? <Baby size={14} /> : <CalendarClock size={14} />}
                  <span>
                    {isPostpartum
                      ? `Day ${p.postpartum_day ?? '?'} postnatal${p.baby_name ? ` · ${p.baby_name}` : ''}`
                      : `Week ${weeks ?? '?'} of pregnancy`}
                  </span>
                </div>

                {/* Schedule headline */}
                {p.schedule_headline && (
                  <div style={{
                    fontSize: '0.79rem',
                    color: p.overdue_count > 0 ? '#DC2626' : 'var(--text-muted)',
                    fontWeight: p.overdue_count > 0 ? 600 : 400
                  }}>
                    {p.schedule_headline}
                  </div>
                )}

                {/* Contact */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem 0.5rem',
                  fontSize: '0.78rem', color: 'var(--text-muted)'
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', minWidth: 0 }}>
                    <MapPin size={13} style={{ color: 'var(--color-secondary)', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.village || 'No village'}
                    </span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Heart size={13} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                    <span>{p.blood_group && p.blood_group !== 'Unknown' ? p.blood_group : 'Blood group —'}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', gridColumn: 'span 2' }}>
                    <Phone size={13} style={{ flexShrink: 0 }} />
                    <span>{p.contact_phone || 'No phone number'}</span>
                  </span>
                </div>

                {/* Actions */}
                <div style={{
                  display: 'flex', gap: '0.4rem', flexWrap: 'wrap',
                  paddingTop: '0.65rem', borderTop: '1px solid var(--border-color)'
                }}>
                  {!isPostpartum && (
                    <button
                      className="btn btn-outline"
                      onClick={(e) => { e.stopPropagation(); onRecordDelivery?.(p); }}
                      style={{ padding: '0.32rem 0.6rem', fontSize: '0.76rem' }}
                    >
                      <Baby size={13} /><span>Record delivery</span>
                    </button>
                  )}

                  {(p.risk_level === 'alert' || p.risk_level === 'watch') && (
                    <button
                      className="btn btn-outline"
                      onClick={(e) => { e.stopPropagation(); onOpenReferral?.(p); }}
                      style={{
                        padding: '0.32rem 0.6rem', fontSize: '0.76rem',
                        borderColor: risk.color, color: risk.color
                      }}
                    >
                      <FileText size={13} /><span>Referral slip</span>
                    </button>
                  )}

                  <span style={{
                    marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.2rem',
                    fontSize: '0.76rem', fontWeight: 600, color: 'var(--color-secondary)'
                  }}>
                    Open <ChevronRight size={14} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Register patient modal */}
      {showAddModal && (
        <div
          role="dialog" aria-modal="true" aria-label="Register a new patient"
          onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) setShowAddModal(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(74, 29, 53, 0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem', overflowY: 'auto'
          }}
        >
          <form
            onSubmit={handleSubmit}
            className="glass-card"
            style={{
              background: 'var(--bg-card)', width: '100%', maxWidth: '560px',
              padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
              maxHeight: '90vh', overflowY: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Register a patient</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  She will be assigned to your caseload only.
                </p>
              </div>
              <button type="button" className="btn btn-outline" aria-label="Close"
                onClick={() => setShowAddModal(false)} style={{ padding: '0.35rem 0.55rem' }}>
                <X size={16} />
              </button>
            </div>

            {errorMsg && (
              <div style={{
                display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
                background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.25)',
                borderRadius: 'var(--radius-sm)', padding: '0.7rem 0.85rem', fontSize: '0.85rem'
              }}>
                <AlertCircle size={16} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: '2px' }} />
                <span>{errorMsg}</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.85rem' }}>
              <FormField label="Full name" required>
                <input type="text" value={name} required autoFocus
                  onChange={(e) => setName(e.target.value)} style={inputStyle} />
              </FormField>

              <FormField label="Age (years)" required hint="Under 18 or 35+ raises risk">
                <input type="number" value={age} required min="10" max="60"
                  onChange={(e) => setAge(e.target.value)} style={inputStyle} />
              </FormField>

              <FormField label="Weeks pregnant" hint="Leave blank if unsure">
                <input type="number" value={gestationalWeeks} min="1" max="45" placeholder="12"
                  onChange={(e) => setGestationalWeeks(e.target.value)} style={inputStyle} />
              </FormField>

              <FormField label="Blood group">
                <select value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} style={inputStyle}>
                  <option value="">Not known</option>
                  {BLOOD_GROUPS.filter((g) => g !== 'Unknown').map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </FormField>

              <FormField label="Pregnancies (G)" hint="Including this one">
                <input type="number" value={gravida} min="1" max="20" placeholder="1"
                  onChange={(e) => setGravida(e.target.value)} style={inputStyle} />
              </FormField>

              <FormField label="Births (P)" hint="4 or more raises risk">
                <input type="number" value={para} min="0" max="20" placeholder="0"
                  onChange={(e) => setPara(e.target.value)} style={inputStyle} />
              </FormField>
            </div>

            <FormField label="Village / area">
              {userCity ? (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <select value={locationOption} onChange={(e) => setLocationOption(e.target.value)}
                    style={{ ...inputStyle, flex: '1 1 140px' }}>
                    <option value={userCity}>{userCity}</option>
                    <option value="Other">Other…</option>
                  </select>
                  {locationOption === 'Other' && (
                    <input type="text" value={customVillage} placeholder="Village name"
                      onChange={(e) => setCustomVillage(e.target.value)}
                      style={{ ...inputStyle, flex: '2 1 180px' }} />
                  )}
                </div>
              ) : (
                <input type="text" value={customVillage} placeholder="Village name"
                  onChange={(e) => { setCustomVillage(e.target.value); setLocationOption('Other'); }}
                  style={inputStyle} />
              )}
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem' }}>
              <FormField label="Mobile number" hint="10 digits">
                <input type="tel" value={contactPhone} placeholder="98765 43210"
                  onChange={(e) => setContactPhone(e.target.value)} style={inputStyle} />
              </FormField>

              <FormField label="Emergency contact" hint="Family member">
                <input type="tel" value={emergencyContact} placeholder="98765 43210"
                  onChange={(e) => setEmergencyContact(e.target.value)} style={inputStyle} />
              </FormField>
            </div>

            <FormField label="Counselling language" hint="Scripts are written in this language">
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {[{ v: 'hi', l: 'हिन्दी Hindi' }, { v: 'en', l: 'English' }].map((o) => (
                  <button
                    key={o.v} type="button" onClick={() => setLanguage(o.v)}
                    aria-pressed={language === o.v}
                    style={{
                      padding: '0.45rem 0.85rem', fontSize: '0.84rem', fontWeight: 600,
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      border: `1px solid ${language === o.v ? 'var(--color-primary)' : 'var(--border-color)'}`,
                      background: language === o.v ? 'var(--color-primary-light)' : 'transparent',
                      color: language === o.v ? 'var(--color-primary)' : 'var(--text-main)'
                    }}
                  >{o.l}</button>
                ))}
              </div>
            </FormField>

            <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
              <button type="button" className="btn btn-outline"
                onClick={() => setShowAddModal(false)} disabled={isSubmitting}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting || !name.trim() || !age}>
                {isSubmitting
                  ? <><Loader2 size={16} className="spin" /><span>Saving…</span></>
                  : <><Plus size={16} /><span>Register</span></>}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '0.55rem 0.7rem',
  background: 'var(--input-bg)', border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-sm)', color: 'var(--input-text)',
  fontSize: '0.88rem', fontFamily: 'inherit'
};

function FormField({ label, hint, required, children }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: '0.78rem', fontWeight: 600,
        color: 'var(--text-main)', marginBottom: '0.3rem'
      }}>
        {label}{required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
      </label>
      {children}
      {hint && (
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{hint}</p>
      )}
    </div>
  );
}
