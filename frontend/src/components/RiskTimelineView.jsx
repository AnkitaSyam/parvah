import React from 'react';
import {
  Activity, Calendar, Send, ShieldAlert, Check,
  Stethoscope, Info
} from 'lucide-react';

/**
 * Risk timeline for one patient.
 *
 * Previously fell back to a hardcoded demo patient ("Rekha Devi", week 26,
 * "2nd Trimester", four invented symptoms) whenever real data was absent, and
 * always rendered the severe badge regardless of actual risk. Everything here
 * now comes from the record.
 */

const SEVERITY = {
  severe:   { color: '#DC2626', bg: 'rgba(220, 38, 38, 0.10)', label: 'Severe',   badge: 'badge-severe' },
  moderate: { color: '#D97706', bg: 'rgba(217, 119, 6, 0.10)', label: 'Moderate', badge: 'badge-moderate' },
  mild:     { color: '#16A34A', bg: 'rgba(22, 163, 74, 0.10)', label: 'Mild',     badge: 'badge-mild' }
};

function formatDate(value) {
  if (!value) return 'Date unknown';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Date unknown';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function RiskTimelineView({
  patient,
  timelineEntries = [],
  onTriggerSms
}) {
  if (!patient) {
    return (
      <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Activity size={30} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
        <p style={{ fontSize: '0.9rem' }}>Select a patient to see her risk timeline.</p>
      </div>
    );
  }

  const entries = [...timelineEntries].sort((a, b) =>
    new Date(b.created_at || b.date_logged || 0) - new Date(a.created_at || a.date_logged || 0));

  const severeCount = entries.filter((e) => e.severity === 'severe').length;

  return (
    <div className="glass-card" style={{ padding: '1.3rem 1.5rem' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem'
      }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Calendar size={17} style={{ color: 'var(--color-primary)' }} />
          <span>Risk timeline</span>
        </h3>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
          {severeCount > 0 && ` · ${severeCount} severe`}
        </span>
      </div>

      {entries.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '2rem 1rem',
          border: '2px dashed var(--border-color)', borderRadius: 'var(--radius-sm)',
          color: 'var(--text-muted)'
        }}>
          <Stethoscope size={30} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
          <p style={{ fontWeight: 700, color: 'var(--text-main)' }}>No symptoms recorded yet</p>
          <p style={{ fontSize: '0.83rem', marginTop: '0.2rem' }}>
            Record a visit and symptoms will be extracted into this timeline automatically.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {entries.map((entry, i) => {
            const sev = SEVERITY[entry.severity] || SEVERITY.mild;

            return (
              <div key={entry.id || i} style={{
                padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm)',
                background: sev.bg, borderLeft: `3px solid ${sev.color}`,
                border: `1px solid ${sev.color}22`, borderLeftWidth: '3px'
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.3rem'
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.93rem' }}>{entry.symptom_name}</strong>
                      <span style={{
                        fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.05em', color: sev.color,
                        border: `1px solid ${sev.color}44`, padding: '0.08rem 0.35rem', borderRadius: '3px'
                      }}>{sev.label}</span>
                      {entry.requires_doctor_referral && (
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, color: '#DC2626',
                          display: 'inline-flex', alignItems: 'center', gap: '0.2rem'
                        }}>
                          <ShieldAlert size={12} />Refer
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.12rem' }}>
                      {formatDate(entry.created_at || entry.date_logged)}
                      {entry.gestational_week != null && ` · week ${entry.gestational_week}`}
                      {entry.postpartum_day != null && ` · day ${entry.postpartum_day} postnatal`}
                    </div>
                  </div>

                  {entry.sms_alert_sent ? (
                    <span style={{
                      fontSize: '0.72rem', color: '#16A34A', fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', gap: '0.22rem', flexShrink: 0
                    }}>
                      <Check size={13} />Family notified
                    </span>
                  ) : entry.requires_doctor_referral && onTriggerSms ? (
                    <button
                      className="btn btn-outline"
                      onClick={() => onTriggerSms({
                        patientId: patient.id,
                        patientName: patient.name,
                        template: 'danger_sign',
                        detail: entry.symptom_name,
                        riskTimelineId: entry.id
                      })}
                      style={{ padding: '0.28rem 0.6rem', fontSize: '0.74rem', flexShrink: 0 }}
                    >
                      <Send size={12} /><span>Alert family</span>
                    </button>
                  ) : null}
                </div>

                <p style={{ fontSize: '0.85rem', marginBottom: '0.3rem' }}>{entry.flag_description}</p>

                <p style={{
                  fontSize: '0.84rem', fontWeight: 600, color: 'var(--color-primary)',
                  display: 'flex', gap: '0.3rem', alignItems: 'flex-start'
                }}>
                  <Stethoscope size={13} style={{ flexShrink: 0, marginTop: '3px' }} />
                  <span>{entry.recommended_asha_action}</span>
                </p>
              </div>
            );
          })}
        </div>
      )}

      <p style={{
        marginTop: '1rem', paddingTop: '0.7rem', borderTop: '1px dashed var(--border-color)',
        fontSize: '0.74rem', color: 'var(--text-muted)',
        display: 'flex', gap: '0.4rem', alignItems: 'flex-start'
      }}>
        <Info size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
        <span>
          Symptoms are extracted from what was said during the visit. Parvah records
          and flags — it does not diagnose. Clinical decisions rest with the medical officer.
        </span>
      </p>
    </div>
  );
}
