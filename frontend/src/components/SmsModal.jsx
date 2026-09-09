import React, { useState, useEffect } from 'react';
import { Send, CheckCircle2, AlertCircle, X, MessageSquare, Loader2, Shield } from 'lucide-react';
import { api } from '../lib/api';

/**
 * SMS alert.
 *
 * The old version let the user type any destination number and any message
 * body, which the backend forwarded to Twilio — an open SMS relay. The
 * recipient is now derived server-side from the patient's own record and the
 * body is composed from a fixed template, so this screen chooses *which*
 * message to send, not who receives it or what it says.
 */

const TEMPLATE_META = {
  danger_sign:           { label: 'Danger sign — go to the facility', tone: 'urgent' },
  visit_due:             { label: 'Visit due reminder',               tone: 'normal' },
  immunization_due:      { label: 'Immunization reminder',            tone: 'normal' },
  supervisor_escalation: { label: 'Escalate to supervisor (ANM)',     tone: 'urgent' }
};

export default function SmsModal({ isOpen, onClose, alertData }) {
  const [templates, setTemplates] = useState([]);
  const [template, setTemplate] = useState('danger_sign');
  const [detail, setDetail] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    setResult(null);
    setError('');
    setTemplate(alertData?.template || 'danger_sign');
    setDetail(alertData?.detail || '');

    api.getSmsTemplates()
      .then(setTemplates)
      .catch(() => setTemplates(
        Object.entries(TEMPLATE_META).map(([key, m]) => ({ key, label: m.label }))
      ));
  }, [isOpen, alertData]);

  if (!isOpen) return null;

  const patientName = alertData?.patientName || 'this patient';
  const patientId = alertData?.patientId;

  const handleSend = async () => {
    if (!patientId) {
      setError('No patient selected for this message.');
      return;
    }

    setSending(true);
    setError('');

    try {
      const res = await api.sendSmsAlert({
        patientId,
        template,
        detail: detail.trim() || undefined,
        riskTimelineId: alertData?.riskTimelineId
      });
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Send an SMS alert"
      onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(74, 29, 53, 0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem', overflowY: 'auto'
      }}
    >
      <div className="glass-card" style={{
        background: 'var(--bg-card)', width: '100%', maxWidth: '480px',
        padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem'
      }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              fontSize: '0.72rem', color: 'var(--color-secondary)', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>
              <MessageSquare size={13} /><span>Send a message</span>
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '0.15rem' }}>{patientName}</h3>
          </div>
          <button className="btn btn-outline" onClick={onClose} aria-label="Close"
            style={{ padding: '0.35rem 0.55rem' }}>
            <X size={16} />
          </button>
        </div>

        {result ? (
          <div style={{
            textAlign: 'center', padding: '1.5rem 1rem',
            background: 'rgba(22, 163, 74, 0.08)', border: '1px solid rgba(22, 163, 74, 0.28)',
            borderRadius: 'var(--radius-sm)'
          }}>
            <CheckCircle2 size={34} style={{ color: '#16A34A', marginBottom: '0.5rem' }} />
            <p style={{ fontWeight: 700, marginBottom: '0.2rem' }}>
              {result.simulated ? 'Message simulated' : 'Message sent'}
            </p>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              Sent to {result.recipient_masked}
            </p>
            {result.simulated && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.45rem' }}>
                Twilio is not configured, so nothing was actually delivered.
              </p>
            )}
            <div style={{
              marginTop: '0.85rem', padding: '0.7rem 0.85rem', textAlign: 'left',
              background: 'var(--input-bg)', borderRadius: 'var(--radius-sm)',
              fontSize: '0.82rem', border: '1px solid var(--border-color)'
            }}>
              {result.body}
            </div>
            <button className="btn btn-primary" onClick={onClose} style={{ marginTop: '1rem' }}>
              Done
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div style={{
                display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
                background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.25)',
                borderRadius: 'var(--radius-sm)', padding: '0.7rem 0.85rem', fontSize: '0.85rem'
              }}>
                <AlertCircle size={16} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: '2px' }} />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Which message?
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {(templates.length > 0 ? templates : Object.entries(TEMPLATE_META).map(([key, m]) => ({ key, ...m })))
                  .map((t) => {
                    const active = template === t.key;
                    const urgent = TEMPLATE_META[t.key]?.tone === 'urgent';
                    return (
                      <button
                        key={t.key} type="button" onClick={() => setTemplate(t.key)}
                        aria-pressed={active}
                        style={{
                          textAlign: 'left', padding: '0.6rem 0.8rem', cursor: 'pointer',
                          borderRadius: 'var(--radius-sm)', fontSize: '0.86rem', fontWeight: 600,
                          border: `1px solid ${active ? 'var(--color-primary)' : 'var(--border-color)'}`,
                          background: active ? 'var(--color-primary-light)' : 'transparent',
                          color: active ? 'var(--color-primary)' : 'var(--text-main)',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem'
                        }}
                      >
                        <span>{t.label}</span>
                        {urgent && (
                          <span style={{
                            fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
                            color: '#DC2626', background: 'rgba(220,38,38,0.1)',
                            padding: '0.1rem 0.35rem', borderRadius: '3px'
                          }}>urgent</span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>

            <div>
              <label htmlFor="sms-detail" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Add a detail (optional)
              </label>
              <textarea
                id="sms-detail"
                value={detail}
                maxLength={160}
                rows={2}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="e.g. Sujan aur sir dard hai"
                style={{
                  width: '100%', padding: '0.6rem 0.75rem', resize: 'vertical',
                  background: 'var(--input-bg)', border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--input-text)',
                  fontSize: '0.86rem', fontFamily: 'inherit'
                }}
              />
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: '0.15rem' }}>
                {detail.length}/160
              </div>
            </div>

            <div style={{
              display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
              fontSize: '0.76rem', color: 'var(--text-muted)',
              background: 'var(--color-primary-light)', borderRadius: 'var(--radius-sm)',
              padding: '0.6rem 0.75rem'
            }}>
              <Shield size={14} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--color-primary)' }} />
              <span>
                The number comes from {patientName}'s own record — it cannot be
                typed here. Add or correct it on her patient card.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={onClose} disabled={sending}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSend} disabled={sending || !patientId}>
                {sending
                  ? <><Loader2 size={16} className="spin" /><span>Sending…</span></>
                  : <><Send size={16} /><span>Send message</span></>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
