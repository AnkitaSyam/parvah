import React from 'react';
import {
  HeartPulse, Users, Mic, BookOpen, CalendarClock, Syringe,
  LogOut, ShieldCheck, AlertTriangle, CloudOff, RefreshCw, Inbox
} from 'lucide-react';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: HeartPulse },
  { key: 'patients',  label: 'Patients',  icon: Users },
  { key: 'schedule',  label: 'Schedule',  icon: CalendarClock },
  { key: 'vaccines',  label: 'Vaccines',  icon: Syringe },
  { key: 'recorder',  label: 'Record',    icon: Mic },
  { key: 'myths',     label: 'Myths',     icon: BookOpen }
];

export default function Navbar({
  activeTab, setActiveTab, user, profile, onLogout, alertCount = 0,
  hesitancyCount = 0,
  isOnline = true, pendingSync = 0, syncing = false, onSync
}) {
  return (
    <header className="glass-card" style={{
      marginBottom: '1.5rem', padding: '0.75rem 1.35rem', borderRadius: 'var(--radius-lg)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>

        {/* Brand */}
        <button
          onClick={() => setActiveTab('dashboard')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.7rem',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left'
          }}
          aria-label="Go to dashboard"
        >
          <div style={{
            width: '38px', height: '38px', borderRadius: '50%',
            backgroundColor: '#ffffff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', overflow: 'hidden', padding: '2px',
            border: '1px solid var(--border-color)', flexShrink: 0
          }}>
            <img src="/logo.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <h1 style={{
              fontSize: '1.3rem', fontWeight: 800, lineHeight: 1.1,
              background: 'linear-gradient(90deg, var(--text-main), var(--color-secondary))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
            }}>
              परवाह <span style={{
                fontSize: '0.88rem', fontWeight: 500, color: 'var(--color-secondary)',
                WebkitTextFillColor: 'var(--color-secondary)'
              }}>Parvah</span>
            </h1>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Maternal &amp; child health · ASHA network
            </p>
          </div>
        </button>

        {/* Tabs */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}
          aria-label="Main navigation">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`nav-pill ${activeTab === key ? 'active' : ''}`}
              onClick={() => setActiveTab(key)}
              aria-current={activeTab === key ? 'page' : undefined}
            >
              <Icon size={16} />
              <span>{label}</span>
              {key === 'patients' && alertCount > 0 && (
                <span className="nav-badge" style={{
                  marginLeft: '0.15rem', minWidth: '17px', height: '17px', padding: '0 4px',
                  borderRadius: '9px', background: '#DC2626', color: '#fff',
                  fontSize: '0.65rem', fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                }}>{alertCount}</span>
              )}
              {key === 'vaccines' && hesitancyCount > 0 && (
                <span className="nav-badge" style={{
                  marginLeft: '0.15rem', minWidth: '17px', height: '17px', padding: '0 4px',
                  borderRadius: '9px', background: '#DC2626', color: '#fff',
                  fontSize: '0.65rem', fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                }}>{hesitancyCount}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Account */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
          {alertCount > 0 && (
            <span
              className="badge badge-severe"
              style={{ display: 'flex', alignItems: 'center', gap: '0.28rem', fontSize: '0.68rem' }}
            >
              <AlertTriangle size={13} />
              <span>{alertCount} alert{alertCount === 1 ? '' : 's'}</span>
            </span>
          )}

          {/* Connectivity and the offline queue. Deliberately always visible
              when there is anything pending — a worker needs to know her
              morning's visits have not reached the server yet. */}
          {(!isOnline || pendingSync > 0) && (
            <button
              onClick={onSync}
              disabled={!isOnline || syncing}
              title={isOnline
                ? `${pendingSync} visit${pendingSync === 1 ? '' : 's'} waiting to upload — tap to retry`
                : 'No signal. Visits are saved on this phone and will upload automatically.'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.28rem 0.6rem', borderRadius: 'var(--radius-full)',
                fontSize: '0.7rem', fontWeight: 700, cursor: isOnline && !syncing ? 'pointer' : 'default',
                background: isOnline ? 'rgba(217, 119, 6, 0.12)' : 'rgba(120, 113, 108, 0.14)',
                color: isOnline ? '#B45309' : '#57534E',
                border: `1px solid ${isOnline ? 'rgba(217, 119, 6, 0.3)' : 'rgba(120, 113, 108, 0.3)'}`
              }}
            >
              {syncing
                ? <RefreshCw size={12} className="spin" />
                : isOnline ? <Inbox size={12} /> : <CloudOff size={12} />}
              <span>
                {syncing ? 'Syncing…'
                  : pendingSync > 0 ? `${pendingSync} to sync`
                  : 'Offline'}
              </span>
            </button>
          )}

          <span
            className="badge badge-mild"
            style={{ display: 'flex', alignItems: 'center', gap: '0.28rem', fontSize: '0.68rem' }}
            title="Every query is scoped to your account by row-level security"
          >
            <ShieldCheck size={13} />
            <span className="privacy-label">Private</span>
          </span>

          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div className="user-profile-text" style={{ textAlign: 'right', minWidth: '110px' }}>
                <p style={{
                  fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px'
                }}>
                  {profile?.full_name || user.email}
                </p>
                {profile?.sub_center && (
                  <p style={{ fontSize: '0.68rem', color: 'var(--color-secondary)' }}>{profile.sub_center}</p>
                )}
              </div>
              <button className="btn btn-outline" onClick={onLogout} title="Sign out"
                style={{ padding: '0.42rem 0.7rem', fontSize: '0.79rem' }}>
                <LogOut size={15} />
                <span className="logout-label">Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
