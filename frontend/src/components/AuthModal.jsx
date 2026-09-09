import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, AlertCircle, User, Phone, MapPin, Hash, Loader2, ShieldCheck } from 'lucide-react';

/**
 * Sign in / sign up.
 *
 * This file was 554 lines, most of it three duplicated attempts to insert the
 * profiles row from the browser — each catching Postgres error codes (42703,
 * PGRST204) and retrying with fewer columns, i.e. the client discovering its
 * own schema at runtime. The profiles row is now created by the
 * on_auth_user_created trigger (migration 009), with GET /api/profile
 * backfilling older accounts, so all of that is gone.
 */

const INDIAN_STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan',
  'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [subCenter, setSubCenter] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [notice, setNotice] = useState('');

  if (!isOpen) return null;

  const validateSignUp = () => {
    if (!fullName.trim()) return 'Enter your name.';
    if (password.length < 8) return 'Choose a password of at least 8 characters.';
    if (phoneNumber && !/^\d{10}$/.test(phoneNumber.replace(/\D/g, '').replace(/^(91|0)/, ''))) {
      return 'Enter a 10-digit mobile number, or leave it blank.';
    }
    if (pincode && !/^\d{6}$/.test(pincode)) return 'PIN code must be exactly 6 digits.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setNotice('');

    if (isSignUp) {
      const problem = validateSignUp();
      if (problem) { setErrorMsg(problem); return; }
    }

    setLoading(true);

    try {
      if (isSignUp) {
        // The trigger reads these from raw_user_meta_data to build the profile.
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              phone_number: phoneNumber.trim(),
              sub_center: subCenter.trim(),
              city: city.trim(),
              state,
              pincode: pincode.trim()
            }
          }
        });

        if (error) throw error;

        // Email confirmation on → no session yet.
        if (!data.session) {
          setNotice('Check your email for a confirmation link, then sign in.');
          setIsSignUp(false);
          return;
        }

        onAuthSuccess(data.user);
        onClose?.();
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) throw error;

        onAuthSuccess(data.user);
        onClose?.();
      }
    } catch (err) {
      const message = err.message || 'Something went wrong.';
      setErrorMsg(
        /invalid login credentials/i.test(message)
          ? 'That email and password do not match an account.'
          : /already registered/i.test(message)
            ? 'An account already exists for that email. Sign in instead.'
            : message
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(74, 29, 53, 0.58)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem', overflowY: 'auto'
    }}>
      <div className="glass-card" style={{
        maxWidth: '440px', width: '100%', padding: '2rem',
        position: 'relative', maxHeight: '92vh', overflowY: 'auto'
      }}>
        {onClose && (
          <button onClick={onClose} aria-label="Close"
            style={{
              position: 'absolute', top: '1rem', right: '1rem',
              background: 'none', border: 'none', color: 'var(--text-muted)',
              fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1
            }}>✕</button>
        )}

        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: '58px', height: '58px', borderRadius: '50%',
            background: '#ffffff', margin: '0 auto 0.7rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--border-color)', overflow: 'hidden', padding: '4px'
          }}>
            <img src="/logo.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>
            परवाह <span style={{ color: 'var(--color-secondary)', fontSize: '1rem' }}>Parvah</span>
          </h2>
          <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            {isSignUp
              ? 'Create your ASHA worker account'
              : 'Sign in to your patient list'}
          </p>
        </div>

        {errorMsg && (
          <div style={{
            display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '1rem',
            background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.25)',
            borderRadius: 'var(--radius-sm)', padding: '0.7rem 0.85rem', fontSize: '0.85rem'
          }}>
            <AlertCircle size={16} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: '2px' }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {notice && (
          <div style={{
            display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '1rem',
            background: 'rgba(22, 163, 74, 0.08)', border: '1px solid rgba(22, 163, 74, 0.25)',
            borderRadius: 'var(--radius-sm)', padding: '0.7rem 0.85rem', fontSize: '0.85rem'
          }}>
            <ShieldCheck size={16} style={{ color: '#16A34A', flexShrink: 0, marginTop: '2px' }} />
            <span>{notice}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {isSignUp && (
            <InputRow icon={User} label="Your name" required>
              <input type="text" value={fullName} required autoComplete="name"
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Sunita Devi" style={inputStyle} />
            </InputRow>
          )}

          <InputRow icon={Mail} label="Email" required>
            <input type="email" value={email} required autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" style={inputStyle} />
          </InputRow>

          <InputRow icon={Lock} label="Password" required
            hint={isSignUp ? 'At least 8 characters' : undefined}>
            <input type="password" value={password} required
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" style={inputStyle} />
          </InputRow>

          {isSignUp && (
            <>
              <InputRow icon={Phone} label="Mobile number">
                <input type="tel" value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="98765 43210" style={inputStyle} />
              </InputRow>

              <InputRow icon={MapPin} label="Sub-centre">
                <input type="text" value={subCenter}
                  onChange={(e) => setSubCenter(e.target.value)}
                  placeholder="e.g. Rampur Ward 4" style={inputStyle} />
              </InputRow>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
                <InputRow icon={MapPin} label="District / city">
                  <input type="text" value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Varanasi" style={inputStyle} />
                </InputRow>

                <InputRow icon={Hash} label="PIN code">
                  <input type="text" value={pincode} inputMode="numeric" maxLength={6}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                    placeholder="221001" style={inputStyle} />
                </InputRow>
              </div>

              <InputRow icon={MapPin} label="State">
                <select value={state} onChange={(e) => setState(e.target.value)} style={inputStyle}>
                  <option value="">Select a state</option>
                  {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </InputRow>
            </>
          )}

          <button type="submit" className="btn btn-primary" disabled={loading}
            style={{ marginTop: '0.35rem', justifyContent: 'center', padding: '0.7rem' }}>
            {loading
              ? <><Loader2 size={17} className="spin" /><span>Please wait…</span></>
              : <span>{isSignUp ? 'Create account' : 'Sign in'}</span>}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: '1.1rem', color: 'var(--text-muted)' }}>
          {isSignUp ? 'Already have an account?' : 'New here?'}{' '}
          <button
            type="button"
            onClick={() => { setIsSignUp(!isSignUp); setErrorMsg(''); setNotice(''); }}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--color-primary)', fontWeight: 700, fontSize: '0.85rem'
            }}
          >
            {isSignUp ? 'Sign in' : 'Create an account'}
          </button>
        </p>

        <p style={{
          textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)',
          marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px dashed var(--border-color)',
          display: 'flex', gap: '0.35rem', alignItems: 'center', justifyContent: 'center'
        }}>
          <ShieldCheck size={12} />
          <span>Your patient records are visible only to your account.</span>
        </p>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '0.6rem 0.75rem',
  background: 'var(--input-bg)', border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-sm)', color: 'var(--input-text)',
  fontSize: '0.9rem', fontFamily: 'inherit'
};

function InputRow({ icon: Icon, label, hint, required, children }) {
  return (
    <div>
      <label style={{
        display: 'flex', alignItems: 'center', gap: '0.3rem',
        fontSize: '0.79rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.3rem'
      }}>
        <Icon size={13} style={{ color: 'var(--color-secondary)' }} />
        <span>{label}</span>
        {required && <span style={{ color: 'var(--color-danger)' }}>*</span>}
      </label>
      {children}
      {hint && <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{hint}</p>}
    </div>
  );
}
