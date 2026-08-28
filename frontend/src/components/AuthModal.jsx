import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Shield, Mail, Lock, UserCheck, AlertCircle, User, Phone, Calendar, MapPin, Building, Hash } from 'lucide-react';

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [age, setAge] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      if (isSignUp) {
        // Validate age range
        const parsedAge = parseInt(age, 10);
        if (isNaN(parsedAge) || parsedAge < 18 || parsedAge > 70) {
          throw new Error('Age must be a number between 18 and 70.');
        }

        // Validate PIN code
        if (!/^\d{6}$/.test(pincode)) {
          throw new Error('PIN Code must be exactly 6 digits.');
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone_number: phoneNumber,
              age: parsedAge,
              city,
              state,
              pincode
            }
          }
        });
        if (error) throw error;

        // If there's an immediate session, insert profile
        if (data.user && data.session) {
          try {
            const { error: profileError } = await supabase
              .from('profiles')
              .insert({
                id: data.user.id,
                full_name: fullName,
                phone_number: phoneNumber,
                age: parsedAge,
                city,
                state,
                pincode
              });
            if (profileError) {
              console.warn('Profile creation with age failed:', profileError.message);
              if (profileError.code === '42703' || profileError.code === 'PGRST204') { // Column does not exist
                const { error: retryError } = await supabase
                  .from('profiles')
                  .insert({
                    id: data.user.id,
                    full_name: fullName,
                    phone_number: phoneNumber
                  });
                if (retryError) {
                  console.warn('Profile creation retry without age failed:', retryError.message);
                }
              }
            }
          } catch (profileErr) {
            console.warn('Profile creation exception during signup:', profileErr.message);
          }
        }

        onAuthSuccess(data.user);
        if (onClose) onClose();
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;

        if (data.user) {
          try {
            const { data: profile, error: fetchError } = await supabase
              .from('profiles')
              .select('id')
              .eq('id', data.user.id)
              .maybeSingle();

            if (!profile && !fetchError) {
              const metadata = data.user.user_metadata || {};
              const fallbackName = metadata.full_name || data.user.email.split('@')[0] || 'ASHA Worker';
              const parsedAge = metadata.age ? parseInt(metadata.age, 10) : null;

              const { error: insertError } = await supabase
                .from('profiles')
                .insert({
                  id: data.user.id,
                  full_name: fallbackName,
                  phone_number: metadata.phone_number || phoneNumber || '',
                  age: parsedAge,
                  city: metadata.city || city || '',
                  state: metadata.state || state || '',
                  pincode: metadata.pincode || pincode || ''
                });

              if (insertError) {
                console.warn('Deferred profile backfill with age failed:', insertError.message);
                if (insertError.code === '42703' || insertError.code === 'PGRST204') {
                  const { error: retryError } = await supabase
                    .from('profiles')
                    .insert({
                      id: data.user.id,
                      full_name: fallbackName,
                      phone_number: metadata.phone_number || phoneNumber || ''
                    });
                  if (retryError) {
                    console.warn('Deferred profile backfill retry without age failed:', retryError.message);
                  }
                }
              }
            }
          } catch (profileErr) {
            console.warn('Deferred profile backfill exception:', profileErr.message);
          }
        }

        onAuthSuccess(data.user);
        if (onClose) onClose();
      }
    } catch (err) {
      console.error('Auth error:', err.message);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'asha.workera@parvah.health',
        password: 'TestPassword123!'
      });
      if (error) throw error;

      if (data.user) {
        try {
          const { data: profile, error: fetchError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', data.user.id)
            .maybeSingle();

          if (!profile && !fetchError) {
            const metadata = data.user.user_metadata || {};
            const fallbackName = metadata.full_name || data.user.email.split('@')[0] || 'ASHA Worker';
            const parsedAge = metadata.age ? parseInt(metadata.age, 10) : null;

            const { error: insertError } = await supabase
              .from('profiles')
              .insert({
                id: data.user.id,
                full_name: fallbackName,
                phone_number: metadata.phone_number || '',
                age: parsedAge,
                city: metadata.city || '',
                state: metadata.state || '',
                pincode: metadata.pincode || ''
              });

            if (insertError) {
              console.warn('Demo profile backfill with age failed:', insertError.message);
              if (insertError.code === '42703' || insertError.code === 'PGRST204') {
                const { error: retryError } = await supabase
                  .from('profiles')
                  .insert({
                    id: data.user.id,
                    full_name: fallbackName,
                    phone_number: metadata.phone_number || ''
                  });
                if (retryError) {
                  console.warn('Demo profile backfill retry without age failed:', retryError.message);
                }
              }
            }
          }
        } catch (profileErr) {
          console.warn('Demo profile backfill exception:', profileErr.message);
        }
      }

      onAuthSuccess(data.user);
      if (onClose) onClose();
    } catch (err) {
      setErrorMsg('Demo login failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(74, 29, 53, 0.58)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem',
      overflowY: 'auto'
    }}>
      <div className="glass-card" style={{ maxWidth: '440px', width: '100%', padding: '2rem', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '1.25rem',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        )}

        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 0.75rem auto',
            border: '1px solid rgba(13, 148, 136, 0.3)',
            overflow: 'hidden',
            padding: '4px'
          }}>
            <img
              src="/logo.png"
              alt="Parvah Logo"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain'
              }}
            />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '700' }}>
            {isSignUp ? 'ASHA Worker Registration' : 'ASHA Worker Login'}
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Supabase RLS secures all patient records for your assigned area.
          </p>
        </div>

        {errorMsg && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.75rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#f87171',
            fontSize: '0.85rem'
          }}>
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isSignUp && (
            <>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                  Full Name <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter full name"
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.8rem 0.65rem 2.4rem',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--input-text)',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                  Phone Number <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Phone size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="Enter phone number"
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.8rem 0.65rem 2.4rem',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--input-text)',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                  Age <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Calendar size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="number"
                    required
                    min="18"
                    max="70"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="Enter age"
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.8rem 0.65rem 2.4rem',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--input-text)',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                  City <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Building size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Enter city"
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.8rem 0.65rem 2.4rem',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--input-text)',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                  State <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <MapPin size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    required
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="Enter state"
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.8rem 0.65rem 2.4rem',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--input-text)',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                  PIN Code <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Hash size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    required
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    placeholder="Enter PIN code"
                    maxLength={6}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.8rem 0.65rem 2.4rem',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--input-text)',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>
            </>
          )}
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
              Email Address <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.8rem 0.65rem 2.4rem',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--input-text)',
                  fontSize: '0.9rem'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
              Password <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.8rem 0.65rem 2.4rem',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--input-text)',
                  fontSize: '0.9rem'
                }}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', marginTop: '0.5rem' }}>
            {loading ? 'Authenticating...' : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>
        </form>

        <div style={{ margin: '1.25rem 0', textAlign: 'center', position: 'relative' }}>
          <hr style={{ borderColor: 'var(--border-color)', borderTop: '1px solid var(--border-color)' }} />
          <span style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--bg-card)',
            padding: '0 0.5rem',
            fontSize: '0.75rem',
            color: 'var(--text-muted)'
          }}>
            OR
          </span>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleDemoLogin}
          disabled={loading}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
        >
          <UserCheck size={18} />
          <span>Quick Demo Login (ASHA Worker)</span>
        </button>

        <p style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {isSignUp ? 'Already registered?' : "Don't have an account?"}{' '}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            style={{ background: 'none', border: 'none', color: 'var(--color-secondary)', cursor: 'pointer', fontWeight: '600' }}
          >
            {isSignUp ? 'Sign In' : 'Register Here'}
          </button>
        </p>
      </div>
    </div>
  );
}
