import React from 'react';
import { HeartPulse, Users, Mic, BookOpen, LogIn, LogOut, ShieldCheck } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, user, onOpenAuth, onLogout }) {
  return (
    <header className="glass-card" style={{ marginBottom: '1.5rem', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        
        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} onClick={() => setActiveTab('dashboard')}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #e11d48, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(225, 29, 72, 0.4)'
          }}>
            <HeartPulse size={24} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: '800', lineHeight: 1.1, background: 'linear-gradient(90deg, #ffffff, #fda4af)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              परवाह <span style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--color-secondary)' }}>Parvah</span>
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Maternal Health AI Platform • Rural India ASHA Network</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className={`btn ${activeTab === 'dashboard' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('dashboard')}
            style={{ fontSize: '0.85rem', padding: '0.5rem 0.9rem' }}
          >
            <HeartPulse size={16} />
            <span>Dashboard</span>
          </button>

          <button
            className={`btn ${activeTab === 'patients' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('patients')}
            style={{ fontSize: '0.85rem', padding: '0.5rem 0.9rem' }}
          >
            <Users size={16} />
            <span>Patients</span>
          </button>

          <button
            className={`btn ${activeTab === 'recorder' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('recorder')}
            style={{ fontSize: '0.85rem', padding: '0.5rem 0.9rem' }}
          >
            <Mic size={16} />
            <span>Record Visit</span>
          </button>

          <button
            className={`btn ${activeTab === 'myths' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('myths')}
            style={{ fontSize: '0.85rem', padding: '0.5rem 0.9rem' }}
          >
            <BookOpen size={16} />
            <span>Myth DB</span>
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
