import React, { useMemo } from 'react';
import {
  Users, AlertTriangle, Mic, ChevronRight, Activity, Bell,
  Baby, CalendarClock, Syringe, FileText, BookOpen
} from 'lucide-react';

/**
 * Dashboard.
 *
 * The "High Risk Flags" tile used to count visits whose summary string
 * contained the word "CRITICAL" — which only the offline keyword fallback
 * ever wrote. With a working Groq key (i.e. during a live demo) it read zero
 * permanently, while patients.risk_level, the actual computed field, sat
 * unused. Every tile here now derives from real state.
 */

const RISK = {
  alert:  { label: 'Alert',  color: '#DC2626', bg: 'rgba(220, 38, 38, 0.10)' },
  watch:  { label: 'Watch',  color: '#D97706', bg: 'rgba(217, 119, 6, 0.10)' },
  normal: { label: 'Normal', color: '#16A34A', bg: 'rgba(22, 163, 74, 0.10)' }
};

export default function Dashboard({
  fullName,
  profile,
  patients = [],
  visits = [],
  mythsOpen = 0,
  setActiveTab,
  setSelectedPatient,
  onOpenReferral
}) {
  const stats = useMemo(() => {
    const alertPatients = patients.filter((p) => p.risk_level === 'alert');
    const watchPatients = patients.filter((p) => p.risk_level === 'watch');
    const postpartum = patients.filter((p) => p.stage === 'postpartum');
    const overdue = patients.filter((p) => (p.overdue_count || 0) > 0);
    const refusals = patients.reduce((sum, p) => sum + (p.refused_count || 0), 0);

    return {
      total: patients.length,
      alert: alertPatients.length,
      watch: watchPatients.length,
      postpartum: postpartum.length,
      antenatal: patients.length - postpartum.length,
      overdue: overdue.length,
      refusals,
      visits: visits.length,
      // Priority worklist: alert first, then watch, then anything overdue.
      worklist: [
        ...alertPatients,
        ...watchPatients,
        ...overdue.filter((p) => p.risk_level === 'normal')
      ].slice(0, 6)
    };
  }, [patients, visits]);

  const subCenter = profile?.sub_center || profile?.village_name || profile?.city;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.35rem' }}>

      {/* Welcome */}
      <div className="glass-card" style={{
        padding: '1.6rem 1.75rem',
        background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-secondary-light))'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            {subCenter && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.22rem 0.6rem', borderRadius: 'var(--radius-full)',
                background: '#ffffff', border: '1px solid var(--border-color)',
                fontSize: '0.73rem', marginBottom: '0.5rem',
                color: 'var(--color-primary)', fontWeight: 600
              }}>
                <Activity size={13} />
                <span>Sub-centre: {subCenter}</span>
              </div>
            )}
            <h2 style={{ fontSize: '1.7rem', fontWeight: 800, marginBottom: '0.2rem' }}>
              Namaste, {fullName || 'ASHA worker'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>
              {stats.alert > 0
                ? `${stats.alert} ${stats.alert === 1 ? 'woman needs' : 'women need'} attention today.`
                : stats.overdue > 0
                  ? `${stats.overdue} ${stats.overdue === 1 ? 'visit is' : 'visits are'} overdue.`
                  : 'Everyone on your list is up to date.'}
            </p>
          </div>

          <button className="btn btn-primary" onClick={() => setActiveTab('recorder')}
            style={{ padding: '0.75rem 1.35rem' }}>
            <Mic size={19} /><span>Record a visit</span>
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.9rem' }}>
        <Metric
          label="On your list" value={stats.total} icon={Users}
          color="#B33B6B" bg="#FDF2F8"
          sub={`${stats.antenatal} pregnant · ${stats.postpartum} postnatal`}
          onClick={() => setActiveTab('patients')}
        />
        <Metric
          label="Needs attention" value={stats.alert + stats.watch} icon={AlertTriangle}
          color="#DC2626" bg="#FEF2F2"
          sub={stats.alert > 0 ? `${stats.alert} at alert level` : 'No alerts'}
          onClick={() => setActiveTab('patients')}
        />
        <Metric
          label="Overdue visits" value={stats.overdue} icon={CalendarClock}
          color="#D97706" bg="#FFFBEB"
          sub={stats.overdue > 0 ? 'ANC / HBNC behind schedule' : 'Schedule is on track'}
          onClick={() => setActiveTab('patients')}
        />
        <Metric
          label="Myths to counsel" value={mythsOpen} icon={BookOpen}
          color="#7B3156" bg="#FAF5FF"
          sub={stats.refusals > 0 ? `${stats.refusals} vaccine refusal${stats.refusals === 1 ? '' : 's'}` : 'Detected in visits'}
          onClick={() => setActiveTab('myths')}
        />
      </div>

      {/* Priority worklist */}
      <div className="glass-card" style={{ padding: '1.35rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bell size={17} style={{ color: 'var(--color-primary)' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Today's priority</h3>
          </div>
          {stats.worklist.length > 0 && (
            <button className="btn btn-outline" onClick={() => setActiveTab('patients')}
              style={{ padding: '0.35rem 0.7rem', fontSize: '0.79rem' }}>
              See all patients <ChevronRight size={14} />
            </button>
          )}
        </div>

        {stats.worklist.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '2rem 1rem',
            border: '2px dashed var(--border-color)', borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)'
          }}>
            <Activity size={30} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
            <p style={{ fontWeight: 700, color: 'var(--text-main)' }}>Nothing urgent right now</p>
            <p style={{ fontSize: '0.83rem', marginTop: '0.2rem' }}>
              {stats.total === 0
                ? 'Register your first patient to get started.'
                : 'Keep recording visits — risk is recalculated after each one.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {stats.worklist.map((p) => {
              const risk = RISK[p.risk_level] || RISK.normal;
              const isPostpartum = p.stage === 'postpartum';

              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedPatient(p)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSelectedPatient(p); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.85rem',
                    padding: '0.8rem 0.95rem', borderRadius: 'var(--radius-sm)',
                    background: risk.bg, border: `1px solid ${risk.color}28`,
                    cursor: 'pointer', transition: 'transform var(--transition-fast)'
                  }}
                >
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                    background: '#fff', color: risk.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {isPostpartum ? <Baby size={18} /> : <Users size={18} />}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.94rem' }}>{p.name}</strong>
                      <span style={{
                        fontSize: '0.63rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.05em', color: risk.color,
                        border: `1px solid ${risk.color}44`, padding: '0.1rem 0.38rem', borderRadius: '3px'
                      }}>{risk.label}</span>
                    </div>
                    <div style={{ fontSize: '0.79rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                      {isPostpartum
                        ? `Day ${p.postpartum_day ?? '?'} postnatal`
                        : `Week ${p.current_gestational_weeks ?? p.gestational_weeks ?? '?'}`}
                      {p.village && ` · ${p.village}`}
                      {p.schedule_headline && ` · ${p.schedule_headline}`}
                    </div>
                  </div>

                  {(p.risk_level === 'alert' || p.risk_level === 'watch') && onOpenReferral && (
                    <button
                      className="btn btn-outline"
                      onClick={(e) => { e.stopPropagation(); onOpenReferral(p); }}
                      style={{
                        padding: '0.3rem 0.6rem', fontSize: '0.74rem', flexShrink: 0,
                        borderColor: risk.color, color: risk.color
                      }}
                    >
                      <FileText size={12} /><span>Referral</span>
                    </button>
                  )}
                  <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Continuum */}
      <div className="glass-card" style={{ padding: '1.35rem 1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.3rem' }}>
          The first 1,000 days
        </h3>
        <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Parvah follows each woman from pregnancy through delivery, postnatal
          recovery and her child's immunization — one continuous record.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.7rem' }}>
          <Phase icon={CalendarClock} label="Pregnancy" count={stats.antenatal}
            note="ANC visits, TT, IFA" color="#B33B6B" />
          <Phase icon={Baby} label="Delivery" count={stats.postpartum}
            note="Outcome & birth weight" color="#D06B32" />
          <Phase icon={Activity} label="Postnatal" count={stats.postpartum}
            note="HBNC days 3–42" color="#7B3156" />
          <Phase icon={Syringe} label="Immunization" count={stats.refusals}
            note={stats.refusals > 0 ? 'refusals to follow up' : 'On schedule'} color="#0F766E" />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, icon: Icon, color, bg, sub, onClick }) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => { if (onClick && e.key === 'Enter') onClick(); }}
      style={{
        padding: '1.15rem 1.35rem', background: bg,
        borderRadius: 'var(--radius-md)', border: `1px solid ${color}1f`,
        boxShadow: 'var(--shadow-card)', cursor: onClick ? 'pointer' : 'default',
        transition: 'transform var(--transition-fast)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ minWidth: 0 }}>
          <p style={{
            color, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.05em', marginBottom: '0.15rem'
          }}>{label}</p>
          <h3 style={{
            fontSize: '2.1rem', fontWeight: 800, lineHeight: 1,
            color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums'
          }}>{value}</h3>
          {sub && (
            <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>{sub}</p>
          )}
        </div>
        <div style={{
          width: '38px', height: '38px', background: '#fff', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color, flexShrink: 0, boxShadow: `0 2px 8px ${color}22`
        }}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function Phase({ icon: Icon, label, count, note, color }) {
  return (
    <div style={{
      padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border-color)', background: 'var(--bg-card-glass)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color, marginBottom: '0.3rem' }}>
        <Icon size={15} />
        <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {count}
      </div>
      <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{note}</div>
    </div>
  );
}
