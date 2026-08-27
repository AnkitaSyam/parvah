import React, { useState } from 'react';
import { Activity, AlertTriangle, Calendar, Phone, Send, ShieldAlert, Check, Clock, Stethoscope, ChevronRight } from 'lucide-react';

export default function RiskTimelineView({ patient, timelineEntries = [], onTriggerSms, isDemo = false }) {
  const currentWeek = patient?.gestational_weeks || 26;
  const patientName = patient?.name || 'Rekha Devi';

  const defaultTimeline = [
    {
      id: 'rt-1',
      date_logged: '2026-07-18',
      gestational_week: 26,
      symptom_name: 'Pedal Edema (Foot Swelling)',
      severity: 'severe',
      flag_description: 'Noticeable swelling in both lower limbs with morning facial puffiness.',
      recommended_asha_action: 'Perform immediate blood pressure test. Check for urine albumin at Sub-Center.',
      requires_doctor_referral: true,
      sms_alert_sent: false
    },
    {
      id: 'rt-2',
      date_logged: '2026-07-18',
      gestational_week: 26,
      symptom_name: 'Severe Headache & Blurring of Vision',
      severity: 'severe',
      flag_description: 'Persistent throbbing frontal headache reported upon waking.',
      recommended_asha_action: 'High warning flag for pre-eclampsia. Arrange urgent PHC transportation.',
      requires_doctor_referral: true,
      sms_alert_sent: false
    },
    {
      id: 'rt-3',
      date_logged: '2026-06-28',
      gestational_week: 23,
      symptom_name: 'Mild Fatigue & Pale Conjunctiva',
      severity: 'moderate',
      flag_description: 'Reported feeling tired easily during household work.',
      recommended_asha_action: 'Counsel on daily IFA tablet consumption after food and diet rich in jaggery/spinach.',
      requires_doctor_referral: false,
      sms_alert_sent: true
    },
    {
      id: 'rt-4',
      date_logged: '2026-05-15',
      gestational_week: 17,
      symptom_name: 'Early Morning Nausea',
      severity: 'mild',
      flag_description: 'Standard first/second trimester morning sickness.',
      recommended_asha_action: 'Advise small frequent dry meals and adequate hydration.',
      requires_doctor_referral: false,
      sms_alert_sent: false
    }
  ];

  const entriesToDisplay = timelineEntries.length > 0 ? timelineEntries : (isDemo ? defaultTimeline : []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Patient Profile Banner */}
      <div className="glass-card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, #FFF9F3, #FCE3D7)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--color-secondary)', marginBottom: '0.25rem' }}>
              <Activity size={14} />
              <span>Assigned Patient Profile • RLS Enforced</span>
            </div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: '800' }}>{patientName}</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Age: {patient?.age || 24} • Village: {patient?.village || 'Rampur'} • Blood Group: {patient?.blood_group || 'B+'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ textAlign: 'right' }}>
              <span className="badge badge-severe" style={{ fontSize: '0.85rem', padding: '0.4rem 0.85rem' }}>
                Gestational Week {currentWeek} / 40
              </span>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Trimester: 2nd Trimester</p>
            </div>
          </div>
        </div>

        {/* Gestational Progress Timeline Bar */}
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
            <span>Week 1 (Conception)</span>
            <span style={{ color: 'var(--color-secondary)', fontWeight: '700' }}>Current: Week {currentWeek}</span>
            <span>Week 40 (Full Term)</span>
          </div>
          <div style={{ width: '100%', height: '10px', background: '#F0C9B8', borderRadius: '5px', overflow: 'hidden', position: 'relative' }}>
            <div style={{
              width: `${(currentWeek / 40) * 100}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--color-secondary), var(--color-primary))',
              borderRadius: '5px'
            }} />
          </div>
        </div>

      </div>

      {/* Risk Disclaimer */}
      <div style={{
        background: 'rgba(13, 148, 136, 0.1)',
        border: '1px solid rgba(13, 148, 136, 0.3)',
        borderRadius: 'var(--radius-sm)',
        padding: '0.85rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        fontSize: '0.85rem',
        color: '#2dd4bf'
      }}>
        <Stethoscope size={20} flexShrink={0} />
        <div>
          <strong>AI Safety Protocol Notice:</strong> Parvah AI extracts reported symptoms for risk tracking and does NOT make clinical diagnoses. All flags require ASHA worker field assessment & PHC medical referral.
        </div>
      </div>

      {/* Timeline List */}
      <div className="glass-card" style={{ padding: '1.75rem' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Clock size={20} color="var(--color-secondary)" />
          <span>Extracted Symptom & Risk Timeline</span>
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {entriesToDisplay.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '2.5rem 1.25rem',
              border: '2px dashed var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
              background: 'rgba(255, 255, 255, 0.02)'
            }}>
              <Clock size={36} style={{ color: 'rgba(59, 95, 224, 0.2)', marginBottom: '0.75rem', strokeWidth: 1.5 }} />
              <p style={{ fontSize: '0.9rem', fontWeight: '700', margin: 0, color: 'var(--text-main)' }}>No visits recorded yet</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>Record a field visit to begin tracking symptoms.</p>
            </div>
          ) : (
            entriesToDisplay.map((item, idx) => {
              const isSevere = item.severity === 'severe';

              return (
                <div key={item.id || idx} className="timeline-item">
                  <div className={`timeline-dot ${isSevere ? 'severe' : ''}`} />
                  
                  <div className="glass-card" style={{
                    padding: '1.25rem',
                    border: isSevere ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-color)',
                    background: isSevere ? 'rgba(239, 68, 68, 0.05)' : '#FFFDF9'
                  }}>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <h4 style={{ fontSize: '1.05rem', fontWeight: '700' }}>{item.symptom_name}</h4>
                          <span className={`badge badge-${item.severity}`}>
                            {item.severity} Risk
                          </span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Logged on: {item.date_logged} • Gestational Week {item.gestational_week}
                        </span>
                      </div>

                      {/* Twilio SMS Alert Trigger Button */}
                      <button
                        className={`btn ${isSevere ? 'btn-danger' : 'btn-outline'}`}
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                        onClick={() => onTriggerSms({
                          patientName,
                          phone: patient?.contact_phone || '+919876543210',
                          symptom: item.symptom_name,
                          action: item.recommended_asha_action,
                          id: item.id
                        })}
                      >
                        <Send size={14} />
                        <span>{item.sms_alert_sent ? 'SMS Alert Sent ✓' : 'Send Twilio SMS Alert'}</span>
                      </button>
                    </div>

                    <p style={{ fontSize: '0.875rem', color: 'var(--text-main)', marginBottom: '0.75rem' }}>
                      <strong>Observation Flag:</strong> {item.flag_description}
                    </p>

                    <div style={{
                      background: '#FFF3EC',
                      padding: '0.75rem 1rem',
                      borderRadius: 'var(--radius-sm)',
                      borderLeft: `4px solid ${isSevere ? '#f87171' : 'var(--color-secondary)'}`
                    }}>
                      <p style={{ fontSize: '0.825rem', color: 'var(--text-main)' }}>
                        <strong style={{ color: isSevere ? '#f87171' : 'var(--color-secondary)' }}>Recommended ASHA Action:</strong> {item.recommended_asha_action}
                      </p>
                    </div>

                    {item.requires_doctor_referral && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.75rem', color: '#f87171', fontSize: '0.75rem', fontWeight: '600' }}>
                        <AlertTriangle size={14} />
                        <span>Urgent Primary Health Centre (PHC) Medical Referral Required</span>
                      </div>
                    )}

                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}
