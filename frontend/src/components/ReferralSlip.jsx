import React, { useEffect, useState } from 'react';
import {
  X, Printer, AlertTriangle, Phone, MapPin, Calendar,
  ClipboardCheck, Share2, Loader2
} from 'lucide-react';
import { api } from '../lib/api';

/**
 * The referral slip — the handoff document.
 *
 * Detection previously stopped at a risk score on a dashboard. This turns
 * "the system flagged something" into a printable, shareable page that goes
 * with the patient to the PHC: who she is, what was reported and when, what
 * was already checked, and what the facility should do.
 *
 * Bilingual because the family reads Hindi and the facility record is English.
 */

const URGENCY_STYLE = {
  emergency:        { bg: '#FEE2E2', border: '#DC2626', text: '#991B1B' },
  urgent:           { bg: '#FEF3C7', border: '#D97706', text: '#92400E' },
  routine_priority: { bg: '#FEF9C3', border: '#CA8A04', text: '#854D0E' },
  routine:          { bg: '#DCFCE7', border: '#16A34A', text: '#166534' }
};

const SEVERITY_COLOR = { severe: '#DC2626', moderate: '#D97706', mild: '#16A34A' };

export default function ReferralSlip({ patientId, patientName, isOpen, onClose }) {
  const [slip, setSlip] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !patientId) return;

    let cancelled = false;
    setLoading(true);
    setError('');
    setSlip(null);

    api.getReferralSlip(patientId)
      .then((data) => { if (!cancelled) setSlip(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [isOpen, patientId]);

  if (!isOpen) return null;

  const handlePrint = () => window.print();

  const handleShare = async () => {
    if (!slip) return;
    const lines = [
      `PARVAH REFERRAL — ${slip.urgency_text.en}`,
      `Patient: ${slip.patient.name}, ${slip.patient.age ?? '?'} yrs, ${slip.patient.village || 'village n/a'}`,
      slip.patient.stage === 'postpartum'
        ? `Postpartum day ${slip.patient.postpartum_day ?? '?'}`
        : `Gestational age: ${slip.patient.gestational_weeks ?? '?'} weeks`,
      `Blood group: ${slip.patient.blood_group || 'unknown'}  |  G${slip.patient.gravida ?? '?'}P${slip.patient.para ?? '?'}`,
      '',
      slip.danger_signs.length ? `DANGER SIGNS: ${slip.danger_signs.join(', ')}` : 'No emergency danger signs recorded.',
      '',
      'Recent findings:',
      ...slip.findings.slice(0, 5).map((f) => `• ${f.symptom} (${f.severity}) — ${f.reported_on}`),
      '',
      `Referred by ASHA ${slip.referred_by.name}${slip.referred_by.phone ? ` (${slip.referred_by.phone})` : ''}`,
      slip.referred_by.sub_center ? `Sub-centre: ${slip.referred_by.sub_center}` : ''
    ].filter(Boolean).join('\n');

    if (navigator.share) {
      try {
        await navigator.share({ title: `Referral — ${slip.patient.name}`, text: lines });
        return;
      } catch {
        // User dismissed the share sheet; fall through to clipboard.
      }
    }

    try {
      await navigator.clipboard.writeText(lines);
      alert('Referral details copied. Paste them into WhatsApp or SMS.');
    } catch {
      alert('Could not copy automatically. Use Print to save a PDF instead.');
    }
  };

  const urgencyStyle = slip ? (URGENCY_STYLE[slip.urgency] || URGENCY_STYLE.routine) : URGENCY_STYLE.routine;

  return (
    <div
      className="referral-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Referral slip for ${patientName || 'patient'}`}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(74, 29, 53, 0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '2rem 1rem', overflowY: 'auto'
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .referral-overlay, .referral-overlay * { visibility: visible !important; }
          .referral-overlay {
            position: absolute !important; inset: 0 !important;
            background: #fff !important; backdrop-filter: none !important;
            padding: 0 !important; display: block !important;
          }
          .referral-sheet {
            box-shadow: none !important; border: none !important;
            max-width: 100% !important; border-radius: 0 !important;
          }
          .no-print { display: none !important; }
          .referral-sheet { page-break-inside: avoid; }
        }
      `}</style>

      <div
        className="referral-sheet"
        style={{
          background: '#ffffff', color: '#1a1a1a',
          width: '100%', maxWidth: '820px',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 24px 60px rgba(74, 29, 53, 0.28)',
          overflow: 'hidden'
        }}
      >
        {/* Toolbar */}
        <div
          className="no-print"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '0.75rem', padding: '0.85rem 1.25rem',
            borderBottom: '1px solid #e5e7eb', background: '#FAFAF9'
          }}
        >
          <strong style={{ fontSize: '0.95rem' }}>Referral slip</strong>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={handleShare} disabled={!slip}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}>
              <Share2 size={15} /><span>Share</span>
            </button>
            <button className="btn btn-primary" onClick={handlePrint} disabled={!slip}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}>
              <Printer size={15} /><span>Print</span>
            </button>
            <button className="btn btn-outline" onClick={onClose} aria-label="Close referral slip"
              style={{ padding: '0.4rem 0.6rem' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {loading && (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
            <Loader2 size={28} className="spin" style={{ marginBottom: '0.75rem' }} />
            <p>Building the referral slip…</p>
          </div>
        )}

        {error && (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <AlertTriangle size={28} style={{ color: '#DC2626', marginBottom: '0.5rem' }} />
            <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Could not build the slip</p>
            <p style={{ fontSize: '0.9rem', color: '#6b7280' }}>{error}</p>
          </div>
        )}

        {slip && (
          <div style={{ padding: '1.5rem 1.75rem 2rem' }}>

            {/* Letterhead */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              gap: '1rem', flexWrap: 'wrap', paddingBottom: '0.9rem',
              borderBottom: '2px solid #1a1a1a', marginBottom: '1rem'
            }}>
              <div>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
                  परवाह · Parvah
                </h2>
                <p style={{ fontSize: '0.78rem', color: '#4b5563', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Referral &amp; Handoff Slip · रेफरल पर्ची
                </p>
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#4b5563' }}>
                <div>{new Date(slip.generated_at).toLocaleString('en-IN', {
                  dateStyle: 'medium', timeStyle: 'short'
                })}</div>
                <div style={{ fontFamily: 'monospace' }}>ID {patientId?.slice(0, 8)}</div>
              </div>
            </div>

            {/* Urgency banner */}
            <div style={{
              background: urgencyStyle.bg,
              border: `2px solid ${urgencyStyle.border}`,
              borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1.25rem',
              display: 'flex', alignItems: 'center', gap: '0.75rem'
            }}>
              <AlertTriangle size={22} style={{ color: urgencyStyle.border, flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 800, color: urgencyStyle.text, fontSize: '1rem' }}>
                  {slip.urgency_text.en}
                </div>
                <div style={{ color: urgencyStyle.text, fontSize: '0.92rem' }}>
                  {slip.urgency_text.hi}
                </div>
              </div>
            </div>

            {/* Patient identity */}
            <SheetSection title="Patient · रोगी">
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '0.6rem 1.25rem'
              }}>
                <Field label="Name · नाम" value={slip.patient.name} strong />
                <Field label="Age · उम्र" value={slip.patient.age ? `${slip.patient.age} years` : '—'} />
                <Field label="Blood group" value={slip.patient.blood_group || '—'} />
                <Field label="G / P" value={`G${slip.patient.gravida ?? '?'} P${slip.patient.para ?? '?'}`} />
                {slip.patient.stage === 'postpartum' ? (
                  <>
                    <Field label="Postpartum day" value={slip.patient.postpartum_day ?? '—'} strong />
                    <Field label="Delivered" value={slip.patient.delivery_date || '—'} />
                    <Field label="Outcome" value={slip.patient.delivery_outcome || '—'} />
                    <Field label="Place" value={slip.patient.delivery_place || '—'} />
                    {slip.patient.baby_birth_weight_kg && (
                      <Field label="Birth weight" value={`${slip.patient.baby_birth_weight_kg} kg`}
                        strong={slip.patient.baby_birth_weight_kg < 2.5} />
                    )}
                  </>
                ) : (
                  <Field label="Gestational age" value={
                    slip.patient.gestational_weeks != null ? `${slip.patient.gestational_weeks} weeks` : '—'
                  } strong />
                )}
                <Field label="Village · गाँव" value={slip.patient.village || '—'} icon={<MapPin size={12} />} />
                <Field label="Contact" value={slip.patient.contact_phone || '—'} icon={<Phone size={12} />} />
              </div>
            </SheetSection>

            {/* Danger signs */}
            {slip.danger_signs.length > 0 && (
              <SheetSection title="Danger signs reported · खतरे के लक्षण">
                <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  {slip.danger_signs.map((sign, i) => (
                    <li key={i} style={{ color: '#991B1B', fontWeight: 700, fontSize: '0.94rem' }}>{sign}</li>
                  ))}
                </ul>
              </SheetSection>
            )}

            {/* Findings table */}
            <SheetSection title="Recent findings · हाल के लक्षण">
              {slip.findings.length === 0 ? (
                <p style={{ fontSize: '0.9rem', color: '#6b7280' }}>No symptoms logged in the last 21 days.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: '520px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #d1d5db' }}>
                        <Th>Symptom</Th><Th>Severity</Th><Th>Reported</Th><Th>Action taken by ASHA</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {slip.findings.map((f, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '0.45rem 0.5rem 0.45rem 0', fontWeight: 600 }}>{f.symptom}</td>
                          <td style={{ padding: '0.45rem 0.5rem' }}>
                            <span style={{
                              color: SEVERITY_COLOR[f.severity] || '#6b7280',
                              fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem'
                            }}>{f.severity}</span>
                          </td>
                          <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap', color: '#4b5563' }}>
                            {f.reported_on}
                            <span style={{ color: '#9ca3af' }}> ({f.days_ago}d)</span>
                          </td>
                          <td style={{ padding: '0.45rem 0 0.45rem 0.5rem', color: '#374151' }}>{f.action_taken}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SheetSection>

            {/* Checklist */}
            <SheetSection title="Checks completed by ASHA · आशा द्वारा की गई जाँच">
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.4rem'
              }}>
                {slip.checklist.map((c, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.86rem' }}>
                    <span style={{
                      width: '14px', height: '14px', border: '1.5px solid #6b7280',
                      borderRadius: '2px', flexShrink: 0, display: 'inline-block'
                    }} />
                    <span>{c.en} <span style={{ color: '#6b7280' }}>· {c.hi}</span></span>
                  </label>
                ))}
              </div>
            </SheetSection>

            {/* Outstanding counselling */}
            {slip.open_counselling.length > 0 && (
              <SheetSection title="Counselling still outstanding · बाकी परामर्श">
                <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {slip.open_counselling.map((c, i) => (
                    <li key={i} style={{ fontSize: '0.85rem', color: '#374151' }}>
                      <em>"{c.belief}"</em>
                    </li>
                  ))}
                </ul>
              </SheetSection>
            )}

            {/* Signature block */}
            <div style={{
              marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #d1d5db',
              display: 'flex', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap'
            }}>
              <div style={{ fontSize: '0.85rem' }}>
                <div style={{ color: '#6b7280', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Referred by · भेजने वाली
                </div>
                <div style={{ fontWeight: 700 }}>ASHA {slip.referred_by.name}</div>
                {slip.referred_by.phone && <div style={{ color: '#4b5563' }}>{slip.referred_by.phone}</div>}
                {slip.referred_by.sub_center && <div style={{ color: '#4b5563' }}>{slip.referred_by.sub_center}</div>}
                {slip.referred_by.district && <div style={{ color: '#4b5563' }}>{slip.referred_by.district}</div>}
              </div>
              <div style={{ fontSize: '0.85rem', minWidth: '190px' }}>
                <div style={{ color: '#6b7280', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Received at facility · प्राप्तकर्ता
                </div>
                <div style={{ borderBottom: '1px solid #9ca3af', height: '1.6rem', marginTop: '0.5rem' }} />
                <div style={{ color: '#9ca3af', fontSize: '0.72rem', marginTop: '0.15rem' }}>
                  Name, designation &amp; date
                </div>
              </div>
            </div>

            <p style={{
              marginTop: '1.25rem', fontSize: '0.72rem', color: '#9ca3af',
              borderTop: '1px dashed #e5e7eb', paddingTop: '0.6rem'
            }}>
              <ClipboardCheck size={11} style={{ display: 'inline', verticalAlign: '-1px' }} />{' '}
              Symptoms recorded by an ASHA worker and structured by Parvah. This is a screening
              handoff, not a diagnosis. Clinical assessment rests with the medical officer.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SheetSection({ title, children }) {
  return (
    <section style={{ marginBottom: '1.15rem' }}>
      <h3 style={{
        fontSize: '0.73rem', textTransform: 'uppercase', letterSpacing: '0.07em',
        color: '#6b7280', fontWeight: 700, marginBottom: '0.5rem',
        borderBottom: '1px solid #e5e7eb', paddingBottom: '0.25rem'
      }}>{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value, strong, icon }) {
  return (
    <div>
      <div style={{
        fontSize: '0.68rem', color: '#6b7280', textTransform: 'uppercase',
        letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '0.25rem'
      }}>
        {icon}{label}
      </div>
      <div style={{ fontWeight: strong ? 800 : 600, fontSize: strong ? '0.98rem' : '0.9rem' }}>
        {value}
      </div>
    </div>
  );
}

function Th({ children }) {
  return (
    <th style={{
      textAlign: 'left', padding: '0.35rem 0.5rem 0.35rem 0',
      fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em',
      color: '#6b7280', fontWeight: 700
    }}>{children}</th>
  );
}
