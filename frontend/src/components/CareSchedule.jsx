import React, { useEffect, useState, useCallback } from 'react';
import {
  CalendarClock, Syringe, Stethoscope, Check, X, AlertTriangle,
  Clock, Loader2, ShieldQuestion, RefreshCw
} from 'lucide-react';
import { api } from '../lib/api';

/**
 * Care schedule — ANC visits, HBNC postnatal visits, and infant immunization
 * on one timeline.
 *
 * gestational_weeks was previously stored and used for nothing but a prompt
 * variable. Everything here is derived from dates the app already holds, so
 * it costs no extra data entry.
 *
 * On immunization: the due date is already on the MCP card and in U-WIN. What
 * needs a person is a family declining a dose — so refusal is a first-class
 * status here, with the reason kept and surfaced for follow-up.
 */

const STATUS_META = {
  overdue:     { label: 'Overdue',     color: '#DC2626', bg: 'rgba(220, 38, 38, 0.10)',  icon: AlertTriangle },
  due:         { label: 'Due now',     color: '#D97706', bg: 'rgba(217, 119, 6, 0.10)',  icon: Clock },
  upcoming:    { label: 'Upcoming',    color: '#6B7280', bg: 'rgba(107, 114, 128, 0.08)', icon: CalendarClock },
  given:       { label: 'Given',       color: '#16A34A', bg: 'rgba(22, 163, 74, 0.10)',  icon: Check },
  refused:     { label: 'Refused',     color: '#B91C1C', bg: 'rgba(185, 28, 28, 0.12)',  icon: X },
  unavailable: { label: 'Unavailable', color: '#78716C', bg: 'rgba(120, 113, 108, 0.10)', icon: ShieldQuestion }
};

const KIND_META = {
  anc_visit:    { label: 'ANC visit',    icon: Stethoscope },
  hbnc_visit:   { label: 'Home visit',   icon: Stethoscope },
  intervention: { label: 'Supplement',   icon: Syringe },
  immunization: { label: 'Vaccine',      icon: Syringe }
};

export default function CareSchedule({ patient, onOpenSms, onNavigateTab }) {
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savingCode, setSavingCode] = useState(null);
  const [refusalFor, setRefusalFor] = useState(null);
  const [refusalReason, setRefusalReason] = useState('');

  const load = useCallback(async () => {
    if (!patient?.id) return;
    setLoading(true);
    setError('');
    try {
      setSchedule(await api.getSchedule(patient.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [patient?.id]);

  useEffect(() => { load(); }, [load]);

  const updateVaccine = async (code, status, reason) => {
    setSavingCode(code);
    try {
      await api.setImmunizationStatus(patient.id, code, {
        status,
        given_date: status === 'given' ? new Date().toISOString().split('T')[0] : undefined,
        refusal_reason: reason
      });
      await load();
      setRefusalFor(null);
      setRefusalReason('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingCode(null);
    }
  };

  if (!patient) {
    return (
      <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <CalendarClock size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
        <p style={{ fontSize: '0.9rem' }}>Select a patient to see her care schedule.</p>
      </div>
    );
  }

  const items = schedule?.items || [];
  const visits = items.filter((i) => i.kind !== 'immunization');
  const vaccines = items.filter((i) => i.kind === 'immunization');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header */}
      <div className="glass-card" style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              fontSize: '0.72rem', color: 'var(--color-secondary)', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>
              <CalendarClock size={13} />
              <span>{schedule?.stage === 'postpartum' ? 'Postnatal care' : 'Antenatal care'}</span>
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '0.15rem' }}>
              {patient.name}
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '0.6rem' }}>
                {schedule?.stage === 'postpartum'
                  ? `Day ${schedule.postpartum_day} after delivery`
                  : `${schedule?.gestational_weeks ?? patient.gestational_weeks ?? '?'} weeks`}
              </span>
            </h3>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <CountPill n={schedule?.overdue_count} label="overdue" color="#DC2626" />
            <CountPill n={schedule?.due_count} label="due" color="#D97706" />
            <CountPill n={schedule?.refused_count} label="refused" color="#B91C1C" />
            <button className="btn btn-outline" onClick={load} disabled={loading}
              aria-label="Refresh schedule" style={{ padding: '0.4rem 0.6rem' }}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {schedule?.next_action && (
          <div style={{
            marginTop: '0.85rem', padding: '0.65rem 0.9rem',
            background: STATUS_META[schedule.next_action.status]?.bg || 'var(--color-primary-light)',
            borderLeft: `3px solid ${STATUS_META[schedule.next_action.status]?.color || 'var(--color-primary)'}`,
            borderRadius: '4px', fontSize: '0.88rem'
          }}>
            <strong>Next: {schedule.next_action.label}</strong>
            {' — '}{schedule.next_action.note}
          </div>
        )}
      </div>

      {error && (
        <div style={{
          display: 'flex', gap: '0.5rem', alignItems: 'center',
          background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.25)',
          borderRadius: 'var(--radius-sm)', padding: '0.7rem 0.9rem', fontSize: '0.86rem'
        }}>
          <AlertTriangle size={16} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {loading && !schedule && (
        <div className="glass-card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Loader2 size={24} className="spin" />
          <p style={{ marginTop: '0.5rem', fontSize: '0.88rem' }}>Loading schedule…</p>
        </div>
      )}

      {/* Visits & supplements */}
      {visits.length > 0 && (
        <ScheduleGroup
          title={schedule?.stage === 'postpartum' ? 'Postnatal home visits (HBNC)' : 'Antenatal visits & supplements'}
          items={visits}
        />
      )}

      {/* Immunization */}
      {vaccines.length > 0 && (
        <div className="glass-card" style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Syringe size={16} style={{ color: 'var(--color-secondary)' }} />
              <span>Child immunization</span>
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {vaccines.filter((v) => v.status === 'given').length} of {vaccines.length} given
                &nbsp;·&nbsp; National Immunization Schedule
              </span>
              {onNavigateTab && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => onNavigateTab('vaccines')}
                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.74rem' }}
                  title="Switch to full table tracker"
                >
                  Table view →
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {vaccines.map((v) => {
              const meta = STATUS_META[v.status] || STATUS_META.upcoming;
              const isSaving = savingCode === v.code;
              const showActions = ['due', 'overdue', 'refused', 'upcoming'].includes(v.status);

              return (
                <div key={v.code} style={{
                  border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                  padding: '0.7rem 0.85rem', background: meta.bg
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.9rem' }}>{v.label}</strong>
                        <StatusChip status={v.status} />
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                        {v.target} · due {v.due_date}
                        {v.status === 'overdue' && ` · ${v.days} days late`}
                        {v.given_date && ` · given ${v.given_date}`}
                      </div>
                      {v.refusal_reason && (
                        <div style={{ fontSize: '0.78rem', color: '#B91C1C', marginTop: '0.2rem', fontStyle: 'italic' }}>
                          Reason: {v.refusal_reason}
                        </div>
                      )}
                    </div>

                    {showActions && (
                      <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                        {v.status !== 'given' && (
                          <button
                            className="btn btn-outline" disabled={isSaving}
                            onClick={() => updateVaccine(v.code, 'given')}
                            style={{ padding: '0.32rem 0.6rem', fontSize: '0.76rem' }}
                          >
                            {isSaving ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
                            <span>Given</span>
                          </button>
                        )}
                        {v.status !== 'refused' && (
                          <button
                            className="btn btn-outline" disabled={isSaving}
                            onClick={() => { setRefusalFor(v.code); setRefusalReason(''); }}
                            style={{ padding: '0.32rem 0.6rem', fontSize: '0.76rem' }}
                          >
                            <X size={13} /><span>Refused</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {refusalFor === v.code && (
                    <div style={{
                      marginTop: '0.6rem', paddingTop: '0.6rem',
                      borderTop: '1px dashed var(--border-color)',
                      display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end'
                    }}>
                      <div style={{ flex: '1 1 240px' }}>
                        <label style={{ fontSize: '0.76rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                          What did the family say? · परिवार ने क्या कहा?
                        </label>
                        <input
                          type="text" value={refusalReason} autoFocus
                          onChange={(e) => setRefusalReason(e.target.value)}
                          placeholder="e.g. they believe it causes fever"
                          style={{
                            width: '100%', padding: '0.45rem 0.6rem', fontSize: '0.84rem',
                            background: 'var(--input-bg)', border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-sm)', color: 'var(--input-text)'
                          }}
                        />
                      </div>
                      <button
                        className="btn btn-primary" disabled={isSaving}
                        onClick={() => updateVaccine(v.code, 'refused', refusalReason.trim() || 'No reason recorded.')}
                        style={{ padding: '0.45rem 0.8rem', fontSize: '0.8rem' }}
                      >
                        Save
                      </button>
                      <button
                        className="btn btn-outline"
                        onClick={() => { setRefusalFor(null); setRefusalReason(''); }}
                        style={{ padding: '0.45rem 0.8rem', fontSize: '0.8rem' }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {vaccines.some((v) => v.status === 'refused') && (
            <div style={{
              marginTop: '0.9rem', padding: '0.7rem 0.9rem',
              background: 'rgba(185, 28, 28, 0.07)', border: '1px solid rgba(185, 28, 28, 0.2)',
              borderRadius: 'var(--radius-sm)', fontSize: '0.84rem',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap'
            }}>
              <span>
                A refused dose is a counselling task, not a missed appointment.
                The Myth Debunker has scripts for the usual reasons.
              </span>
              {onOpenSms && (
                <button
                  className="btn btn-outline"
                  onClick={() => onOpenSms({ patientId: patient.id, template: 'immunization_due' })}
                  style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem', flexShrink: 0 }}
                >
                  Send reminder
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {schedule?.stage === 'antenatal' && vaccines.length === 0 && (
        <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          Child immunization tracking opens once the delivery is recorded.
        </p>
      )}
    </div>
  );
}

function ScheduleGroup({ title, items }) {
  return (
    <div className="glass-card" style={{ padding: '1.25rem 1.5rem' }}>
      <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Stethoscope size={16} style={{ color: 'var(--color-primary)' }} />
        <span>{title}</span>
      </h4>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {items.map((item) => {
          const meta = STATUS_META[item.status] || STATUS_META.upcoming;
          const KindIcon = KIND_META[item.kind]?.icon || CalendarClock;

          return (
            <div key={item.code} style={{
              display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
              padding: '0.65rem 0.8rem', borderRadius: 'var(--radius-sm)',
              background: meta.bg, border: '1px solid var(--border-color)'
            }}>
              <KindIcon size={16} style={{ color: meta.color, flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.89rem' }}>{item.label}</strong>
                  <StatusChip status={item.status} />
                  {item.status === 'overdue' && (
                    <span style={{ fontSize: '0.74rem', color: meta.color, fontWeight: 700 }}>
                      {item.days}d late
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginTop: '0.15rem' }}>
                  {item.note}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                  {item.target} · due {item.due_date}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusChip({ status }) {
  const meta = STATUS_META[status] || STATUS_META.upcoming;
  const Icon = meta.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.22rem',
      fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.05em', color: meta.color,
      background: meta.bg, border: `1px solid ${meta.color}33`,
      padding: '0.1rem 0.4rem', borderRadius: '3px'
    }}>
      <Icon size={10} />{meta.label}
    </span>
  );
}

function CountPill({ n, label, color }) {
  if (!n) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
      fontSize: '0.76rem', fontWeight: 700, color,
      background: `${color}18`, border: `1px solid ${color}33`,
      padding: '0.22rem 0.55rem', borderRadius: 'var(--radius-full)'
    }}>
      {n} {label}
    </span>
  );
}
