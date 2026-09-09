import React from 'react';
import { Activity, Baby, FileText } from 'lucide-react';

const RISK_BADGE = { alert: 'badge-severe', watch: 'badge-moderate', normal: 'badge-mild' };

function trimesterOf(week) {
  if (week == null) return null;
  if (week <= 13) return '1st trimester';
  if (week <= 27) return '2nd trimester';
  return '3rd trimester';
}

export default function PatientBanner({ patient, onOpenReferral }) {
  if (!patient) return null;

  const isPostpartum = patient.stage === 'postpartum';
  const week = patient.current_gestational_weeks ?? patient.gestational_weeks;
  const ppDay = patient.postpartum_day;
  const progressPct = isPostpartum
    ? Math.min(100, ((ppDay ?? 0) / 42) * 100)
    : Math.min(100, ((week ?? 0) / 40) * 100);

  return (
    <div className="glass-card" style={{
      padding: '1.35rem 1.5rem',
      background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-secondary-light))'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            fontSize: '0.72rem', color: 'var(--color-secondary)', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.15rem'
          }}>
            {isPostpartum ? <Baby size={13} /> : <Activity size={13} />}
            <span>{isPostpartum ? 'Postnatal care' : 'Antenatal care'}</span>
          </div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800 }}>{patient.name}</h2>
          <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
            {patient.age ? `${patient.age} years` : 'Age not recorded'}
            {' · '}{patient.village || 'Village not recorded'}
            {' · '}{patient.blood_group && patient.blood_group !== 'Unknown'
              ? patient.blood_group : 'Blood group not recorded'}
          </p>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span className={`badge ${RISK_BADGE[patient.risk_level] || 'badge-mild'}`}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
            {(patient.risk_level || 'normal').toUpperCase()}
            {patient.current_risk_score != null && ` · ${patient.current_risk_score}`}
          </span>
          <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            {isPostpartum
              ? `Day ${ppDay ?? '?'} after delivery`
              : trimesterOf(week) || 'Gestational age unknown'}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div style={{ marginTop: '1.15rem' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem'
        }}>
          <span>{isPostpartum ? 'Delivery' : 'Week 1'}</span>
          <span style={{ color: 'var(--color-secondary)', fontWeight: 700 }}>
            {isPostpartum ? `Day ${ppDay ?? '?'}` : `Week ${week ?? '?'}`}
          </span>
          <span>{isPostpartum ? 'Day 42' : 'Week 40'}</span>
        </div>
        <div style={{
          width: '100%', height: '9px', background: 'rgba(179, 59, 107, 0.15)',
          borderRadius: '5px', overflow: 'hidden'
        }}>
          <div style={{
            width: `${progressPct}%`, height: '100%',
            background: 'linear-gradient(90deg, var(--color-secondary), var(--color-primary))',
            borderRadius: '5px', transition: 'width 0.4s ease'
          }} />
        </div>
      </div>

      {(patient.risk_level === 'alert' || patient.risk_level === 'watch') && onOpenReferral && (
        <button className="btn btn-primary" onClick={onOpenReferral}
          style={{ marginTop: '1rem', fontSize: '0.84rem' }}>
          <FileText size={15} /><span>Generate referral slip</span>
        </button>
      )}
    </div>
  );
}
