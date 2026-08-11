import React from 'react';
import { HeartPulse, Users, Mic, BookOpen, AudioLines, LogIn, LogOut, ShieldCheck } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, user, onOpenAuth, onLogout }) {
  return (
    <header className="glass-card" style={{ marginBottom: '1.5rem', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        
        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} onClick={() => setActiveTab('dashboard')}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: '0 0 10px rgba(13, 148, 136, 0.2)',
            border: '1px solid rgba(13, 148, 136, 0.3)',
            padding: '2px'
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
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: '800', lineHeight: 1.1, background: 'linear-gradient(90deg, var(--text-main), var(--color-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              परवाह <span style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--color-secondary)' }}>Parvah</span>
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Maternal Health AI Platform • Rural India ASHA Network</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <button
            className={`nav-pill ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <HeartPulse size={16} />
            <span>Dashboard</span>
          </button>

          <button
            className={`nav-pill ${activeTab === 'patients' ? 'active' : ''}`}
            onClick={() => setActiveTab('patients')}
          >
            <Users size={16} />
            <span>Patients</span>
          </button>

          <button
            className={`nav-pill ${activeTab === 'recorder' ? 'active' : ''}`}
            onClick={() => setActiveTab('recorder')}
          >
            <Mic size={16} />
            <span>Record Visit</span>
          </button>

          <button
            className={`nav-pill ${activeTab === 'myths' ? 'active' : ''}`}
            onClick={() => setActiveTab('myths')}
          >
            <BookOpen size={16} />
            <span>Myth DB</span>
          </button>

          <button
            className={`nav-pill ${activeTab === 'pipeline' ? 'active' : ''}`}
            onClick={() => setActiveTab('pipeline')}
          >
            <AudioLines size={16} />
            <span>Audio Pipeline Test</span>
          </button>
        </nav>

        {/* User Auth Info & RLS Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="badge badge-mild" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem' }}>
            <ShieldCheck size={14} />
            <span>RLS Active</span>
          </div>

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ textAlign: 'right', display: 'none', minWidth: '120px' }} className="user-profile-text">
                <p style={{ fontSize: '0.825rem', fontWeight: '600', color: 'var(--text-main)' }}>{user.email || 'ASHA Worker'}</p>
                <p style={{ fontSize: '0.7rem', color: 'var(--color-secondary)' }}>Sub-Center Assigned</p>
              </div>
              <button className="btn btn-outline" onClick={onLogout} style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }} title="Sign Out">
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <button className="btn btn-secondary" onClick={onOpenAuth} style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem' }}>
              <LogIn size={16} />
              <span>ASHA Login</span>
            </button>
          )}
        </div>

      </div>
    </header>
  );
}
