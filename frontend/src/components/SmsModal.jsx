import React, { useState, useEffect } from 'react';
import { Send, CheckCircle2, AlertCircle, X, Phone, MessageSquare } from 'lucide-react';
import { api } from '../lib/api';

export default function SmsModal({ isOpen, onClose, alertData }) {
  const [phone, setPhone] = useState('+919876543210');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sentResult, setSentResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (alertData) {
      setPhone(alertData.phone || '+919876543210');
      setMessage(
        `[PARVAH HIGH RISK ALERT] Patient ${alertData.patientName || 'Rekha Devi'} logged high risk symptom: ${alertData.symptom || 'Pedal Edema & Headache'}. Recommended Action: ${alertData.action || 'BP Check & PHC Referral'}. - ASHA Sub-Center`
      );
    }
  }, [alertData]);

  if (!isOpen) return null;

  const handleSend = async (e) => {
    e.preventDefault();
    setSending(true);
    setErrorMsg('');
    setSentResult(null);

    try {
      const res = await api.sendSmsAlert(phone, message, alertData?.id);
      setSentResult(res);
    } catch (err) {
      console.error('SMS send error:', err.message);
      setErrorMsg(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '1rem'
    }}>
      <div className="glass-card" style={{ maxWidth: '480px', width: '100%', padding: '1.75rem', position: 'relative' }}>
        
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem' }}>
          <div style={{ padding: '0.5rem', background: 'var(--color-primary-light)', borderRadius: '10px', color: 'var(--color-primary)' }}>
            <Send size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '700' }}>Twilio SMS Alert Dispatch</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Send urgent notification to family or medical supervisor</p>
          </div>
        </div>

        {sentResult ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <CheckCircle2 size={48} color="var(--color-secondary)" style={{ margin: '0 auto 0.75rem auto' }} />
            <h4 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.25rem' }}>SMS Alert Sent Successfully!</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              SID: {sentResult.sid} • {sentResult.simulated ? 'Simulated SMS' : 'Live Twilio Network'}
            </p>
            <button className="btn btn-secondary" onClick={onClose} style={{ width: '100%' }}>
              Close Modal
            </button>
          </div>
        ) : (
          <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            
            {errorMsg && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '0.65rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertCircle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                Recipient Phone Number (+91)
              </label>
              <div style={{ position: 'relative' }}>
                <Phone size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.2rem', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: '0.9rem' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                SMS Message Text
              </label>
              <textarea
                rows={4}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                style={{ width: '100%', padding: '0.65rem', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: '0.85rem' }}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={sending} style={{ width: '100%', marginTop: '0.5rem' }}>
              {sending ? 'Dispatching SMS...' : 'Dispatch Twilio SMS Now'}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
