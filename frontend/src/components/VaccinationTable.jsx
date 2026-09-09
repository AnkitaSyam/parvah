import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Syringe, Check, X, AlertTriangle, Clock, CalendarClock,
  ShieldQuestion, Loader2, RefreshCw, Search, Info
} from 'lucide-react';
import { api } from '../lib/api';

/**
 * Vaccination Tracker Table
 *
 * Provides a clean HTML <table> view of the National Immunization Schedule
 * for a child, with interactive checkboxes to record administered doses,
 * an uncheck confirmation flow, and clear handling of vaccine refusals.
 */

const STATUS_META = {
  overdue:     { label: 'Overdue',     color: '#DC2626', bg: 'rgba(220, 38, 38, 0.10)',  icon: AlertTriangle },
  due:         { label: 'Due now',     color: '#D97706', bg: 'rgba(217, 119, 6, 0.10)',  icon: Clock },
  upcoming:    { label: 'Upcoming',    color: '#6B7280', bg: 'rgba(107, 114, 128, 0.08)', icon: CalendarClock },
  pending:     { label: 'Pending',     color: '#6B7280', bg: 'rgba(107, 114, 128, 0.08)', icon: Clock },
  given:       { label: 'Given',       color: '#16A34A', bg: 'rgba(22, 163, 74, 0.10)',  icon: Check },
  refused:     { label: 'Refused',     color: '#B91C1C', bg: 'rgba(185, 28, 28, 0.12)',  icon: X },
  unavailable: { label: 'Unavailable', color: '#78716C', bg: 'rgba(120, 113, 108, 0.10)', icon: ShieldQuestion }
};

export default function VaccinationTable({ patient, onOpenSms }) {
  const [data, setData] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savingCode, setSavingCode] = useState(null);

  // Modals & Dialog states
  const [confirmUncheckItem, setConfirmUncheckItem] = useState(null);
  const [refusalItem, setRefusalItem] = useState(null);
  const [refusalReason, setRefusalReason] = useState('');

  // Filtering
  const [statusFilter, setStatusFilter] = useState('all'); // all | due_overdue | given | refused
  const [searchQuery, setSearchQuery] = useState('');

  const isPostpartum = patient?.stage === 'postpartum';

  const load = useCallback(async () => {
    if (!patient?.id) return;
    setLoading(true);
    setError('');

    try {
      if (patient.stage === 'postpartum') {
        const res = await api.getImmunizations(patient.id);
        setData(res);
        setCatalog([]);
      } else {
        const catalogList = await api.getImmunizationCatalog();
        setCatalog(catalogList || []);
        setData(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to load immunization data.');
    } finally {
      setLoading(false);
    }
  }, [patient?.id, patient?.stage]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleMarkGiven = async (code) => {
    setSavingCode(code);
    setError('');
    try {
      const today = new Date().toISOString().split('T')[0];
      await api.setImmunizationStatus(patient.id, code, {
        status: 'given',
        given_date: today
      });
      await load();
    } catch (err) {
      setError(err.message || 'Failed to mark vaccine as given.');
    } finally {
      setSavingCode(null);
    }
  };

  const handleConfirmUncheck = async () => {
    if (!confirmUncheckItem) return;
    const code = confirmUncheckItem.code;
    setSavingCode(code);
    setConfirmUncheckItem(null);
    setError('');

    try {
      await api.setImmunizationStatus(patient.id, code, {
        status: 'pending'
      });
      await load();
    } catch (err) {
      setError(err.message || 'Failed to reset vaccine status to pending.');
    } finally {
      setSavingCode(null);
    }
  };

  const handleSaveRefusal = async () => {
    if (!refusalItem) return;
    const code = refusalItem.code;
    setSavingCode(code);
    setError('');

    try {
      await api.setImmunizationStatus(patient.id, code, {
        status: 'refused',
        refusal_reason: refusalReason.trim() || 'No reason recorded.'
      });
      setRefusalItem(null);
      setRefusalReason('');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to record vaccine refusal.');
    } finally {
      setSavingCode(null);
    }
  };

  // ── Derived items ───────────────────────────────────────────────────────────
  const rawItems = data?.items || [];

  const filteredItems = useMemo(() => {
    let list = rawItems;

    if (statusFilter === 'due_overdue') {
      list = list.filter((i) => i.status === 'due' || i.status === 'overdue');
    } else if (statusFilter === 'given') {
      list = list.filter((i) => i.status === 'given');
    } else if (statusFilter === 'refused') {
      list = list.filter((i) => i.status === 'refused');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((i) =>
        i.label?.toLowerCase().includes(q) ||
        i.code?.toLowerCase().includes(q) ||
        i.note?.toLowerCase().includes(q) ||
        i.target?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [rawItems, statusFilter, searchQuery]);

  // Statistics
  const totalDoses = data?.total ?? rawItems.length;
  const givenCount = data?.given ?? rawItems.filter((i) => i.status === 'given').length;
  const dueCount = data?.due ?? rawItems.filter((i) => i.status === 'due').length;
  const overdueCount = data?.overdue ?? rawItems.filter((i) => i.status === 'overdue').length;
  const refusedCount = data?.refused ?? rawItems.filter((i) => i.status === 'refused').length;
  const progressPercent = totalDoses > 0 ? Math.round((givenCount / totalDoses) * 100) : 0;

  if (!patient) {
    return (
      <div className="glass-card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Syringe size={36} style={{ opacity: 0.35, marginBottom: '0.75rem' }} />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
          No patient selected
        </h3>
        <p style={{ fontSize: '0.88rem' }}>Please choose a patient to view and track their vaccination schedule.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header & Progress Card */}
      <div className="glass-card" style={{ padding: '1.35rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              fontSize: '0.72rem', color: 'var(--color-secondary)', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>
              <Syringe size={13} />
              <span>National Immunization Schedule</span>
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '0.2rem' }}>
              {patient.name}
              {patient.baby_name && (
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-primary)', marginLeft: '0.5rem' }}>
                  ({patient.baby_name})
                </span>
              )}
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '0.6rem' }}>
                {isPostpartum
                  ? (patient.delivery_date ? `Born ${patient.delivery_date}` : 'Postnatal')
                  : `Antenatal · ${patient.gestational_weeks ?? '?'} weeks`}
              </span>
            </h3>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {isPostpartum && (
              <>
                <CountPill n={overdueCount} label="overdue" color="#DC2626" />
                <CountPill n={dueCount} label="due" color="#D97706" />
                <CountPill n={refusedCount} label="refused" color="#B91C1C" />
                <CountPill n={givenCount} label="given" color="#16A34A" />
              </>
            )}
            <button
              className="btn btn-outline"
              onClick={load}
              disabled={loading}
              aria-label="Refresh vaccination data"
              title="Refresh"
              style={{ padding: '0.4rem 0.65rem' }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* Progress summary bar (for postpartum) */}
        {isPostpartum && totalDoses > 0 && (
          <div style={{ marginTop: '1.1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>
                {givenCount} of {totalDoses} given
              </span>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                {progressPercent}% completed
              </span>
            </div>

            <div style={{
              width: '100%', height: '8px', background: 'rgba(123, 49, 86, 0.12)',
              borderRadius: 'var(--radius-full)', overflow: 'hidden'
            }}>
              <div style={{
                width: `${progressPercent}%`, height: '100%',
                background: 'linear-gradient(90deg, var(--color-primary), #16A34A)',
                borderRadius: 'var(--radius-full)',
                transition: 'width 0.4s ease-in-out'
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Error alert */}
      {error && (
        <div style={{
          display: 'flex', gap: '0.6rem', alignItems: 'center',
          background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.28)',
          borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem', fontSize: '0.86rem'
        }}>
          <AlertTriangle size={16} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button className="btn btn-outline" onClick={load} style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}>
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !data && catalog.length === 0 && (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Loader2 size={28} className="spin" style={{ margin: '0 auto 0.5rem' }} />
          <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>Loading immunization schedule…</p>
        </div>
      )}

      {/* Case 1: Antenatal patient -> show read-only reference list preview from catalog */}
      {!isPostpartum && (
        <div className="glass-card" style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.6rem',
            padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-secondary-light)', border: '1px solid rgba(208, 107, 50, 0.25)',
            marginBottom: '1.25rem'
          }}>
            <Info size={18} style={{ color: 'var(--color-secondary)', flexShrink: 0 }} />
            <div style={{ fontSize: '0.86rem' }}>
              <strong>Immunization tracking begins once the delivery is recorded.</strong>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                Below is India's National Immunization Schedule reference for newborn and infant care.
                Once delivery is saved in Parvah, dose due dates will be automatically scheduled.
              </p>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.75rem 0.9rem' }}>Vaccine</th>
                  <th style={{ padding: '0.75rem 0.9rem' }}>Timing Window</th>
                  <th style={{ padding: '0.75rem 0.9rem' }}>Schedule Note</th>
                  <th style={{ padding: '0.75rem 0.9rem', textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((cat, idx) => (
                  <tr key={cat.code || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.75rem 0.9rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <strong style={{ fontSize: '0.9rem' }}>{cat.label}</strong>
                        <span style={{
                          fontSize: '0.66rem', padding: '0.1rem 0.35rem', borderRadius: '3px',
                          background: 'rgba(123, 49, 86, 0.08)', color: 'var(--color-accent)', fontWeight: 700
                        }}>{cat.code}</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 0.9rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      {cat.fromWeek != null && cat.toWeek != null
                        ? `Weeks ${cat.fromWeek}–${cat.toWeek}`
                        : (cat.target || 'As per NIS')}
                    </td>
                    <td style={{ padding: '0.75rem 0.9rem', color: 'var(--text-main)', fontSize: '0.83rem' }}>
                      {cat.note || 'National Immunization Schedule standard dose.'}
                    </td>
                    <td style={{ padding: '0.75rem 0.9rem', textAlign: 'right' }}>
                      <span style={{
                        display: 'inline-block', fontSize: '0.72rem', fontWeight: 600,
                        color: 'var(--text-muted)', background: 'rgba(107, 114, 128, 0.1)',
                        padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)'
                      }}>
                        Awaiting birth
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Case 2: Postnatal patient -> HTML <table> with interactive checkboxes */}
      {isPostpartum && (
        <div className="glass-card" style={{ padding: '1.25rem 1.5rem' }}>

          {/* Table Controls / Filters */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: '1rem', flexWrap: 'wrap', marginBottom: '1.1rem'
          }}>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`nav-pill ${statusFilter === 'all' ? 'active' : ''}`}
                onClick={() => setStatusFilter('all')}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
              >
                All ({rawItems.length})
              </button>
              <button
                type="button"
                className={`nav-pill ${statusFilter === 'due_overdue' ? 'active' : ''}`}
                onClick={() => setStatusFilter('due_overdue')}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
              >
                Due / Overdue ({dueCount + overdueCount})
              </button>
              <button
                type="button"
                className={`nav-pill ${statusFilter === 'given' ? 'active' : ''}`}
                onClick={() => setStatusFilter('given')}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
              >
                Given ({givenCount})
              </button>
              <button
                type="button"
                className={`nav-pill ${statusFilter === 'refused' ? 'active' : ''}`}
                onClick={() => setStatusFilter('refused')}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
              >
                Refused ({refusedCount})
              </button>
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search vaccine…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '0.38rem 0.65rem 0.38rem 2rem',
                  fontSize: '0.8rem', background: 'var(--input-bg)',
                  border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                  color: 'var(--input-text)'
                }}
              />
            </div>
          </div>

          {/* Table View */}
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table
              style={{
                width: '100%', borderCollapse: 'collapse', textAlign: 'left',
                fontSize: '0.88rem'
              }}
            >
              <thead>
                <tr style={{
                  borderBottom: '2px solid var(--border-color)',
                  color: 'var(--text-muted)', fontSize: '0.74rem',
                  textTransform: 'uppercase', letterSpacing: '0.05em'
                }}>
                  <th style={{ padding: '0.75rem 0.85rem' }}>Vaccine Name</th>
                  <th style={{ padding: '0.75rem 0.85rem' }}>Due Date</th>
                  <th style={{ padding: '0.75rem 0.85rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 0.85rem', textAlign: 'center', width: '150px' }}>
                    Given?
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No vaccines match the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const isGiven = item.status === 'given';
                    const isRefused = item.status === 'refused';
                    const isSaving = savingCode === item.code;

                    return (
                      <tr
                        key={item.code}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          background: isGiven
                            ? 'rgba(22, 163, 74, 0.03)'
                            : isRefused
                              ? 'rgba(185, 28, 28, 0.03)'
                              : 'transparent',
                          transition: 'background-color 0.15s ease'
                        }}
                      >
                        {/* 1. Vaccine Name Column */}
                        <td style={{ padding: '0.85rem 0.85rem', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '0.92rem', color: 'var(--text-main)' }}>
                              {item.label}
                            </strong>
                            <span style={{
                              fontSize: '0.67rem', padding: '0.1rem 0.38rem', borderRadius: '3px',
                              background: 'rgba(123, 49, 86, 0.08)', color: 'var(--color-accent)', fontWeight: 700
                            }}>
                              {item.code}
                            </span>
                            {item.target && (
                              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                · {item.target}
                              </span>
                            )}
                          </div>
                          {item.note && (
                            <div style={{ fontSize: '0.77rem', color: 'var(--text-muted)', marginTop: '0.2rem', lineHeight: 1.35 }}>
                              {item.note}
                            </div>
                          )}
                        </td>

                        {/* 2. Due Date Column */}
                        <td style={{ padding: '0.85rem 0.85rem', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-main)' }}>
                            {item.due_date || '—'}
                          </div>
                          {isGiven && item.given_date && (
                            <div style={{ fontSize: '0.74rem', color: '#16A34A', fontWeight: 600, marginTop: '0.15rem' }}>
                              Given: {item.given_date}
                            </div>
                          )}
                          {!isGiven && item.status === 'overdue' && item.days > 0 && (
                            <div style={{ fontSize: '0.74rem', color: '#DC2626', fontWeight: 700, marginTop: '0.15rem' }}>
                              {item.days}d overdue
                            </div>
                          )}
                          {!isGiven && item.status === 'due' && (
                            <div style={{ fontSize: '0.74rem', color: '#D97706', fontWeight: 600, marginTop: '0.15rem' }}>
                              Due in window
                            </div>
                          )}
                        </td>

                        {/* 3. Status Column */}
                        <td style={{ padding: '0.85rem 0.85rem', verticalAlign: 'middle' }}>
                          <StatusChip status={item.status} />
                        </td>

                        {/* 4. Tick / Checkbox Column */}
                        <td style={{ padding: '0.85rem 0.85rem', verticalAlign: 'middle', textAlign: 'center' }}>
                          {isSaving ? (
                            <Loader2 size={18} className="spin" style={{ margin: '0 auto', color: 'var(--color-primary)' }} />
                          ) : isRefused ? (
                            /* Requirement 5: If status is refused, show small Refused label with reason + way to still mark given */
                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                              <span
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                  fontSize: '0.72rem', fontWeight: 700, color: '#B91C1C',
                                  background: 'rgba(185, 28, 28, 0.12)', border: '1px solid rgba(185, 28, 28, 0.3)',
                                  padding: '0.15rem 0.45rem', borderRadius: 'var(--radius-sm)',
                                  maxWidth: '160px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap'
                                }}
                                title={`Reason: ${item.refusal_reason || 'No reason recorded.'}`}
                              >
                                <X size={11} />
                                <span>Refused: {item.refusal_reason || 'Declined'}</span>
                              </span>
                              <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => handleMarkGiven(item.code)}
                                title="Family agreed: mark as given now"
                                style={{
                                  padding: '0.2rem 0.5rem', fontSize: '0.72rem',
                                  borderColor: '#16A34A', color: '#16A34A', fontWeight: 600
                                }}
                              >
                                <Check size={11} /> Mark given
                              </button>
                            </div>
                          ) : isGiven ? (
                            /* Requirement 4: Checked tick mark. Clicking triggers confirmation modal to uncheck */
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              <label
                                htmlFor={`vaccine-checkbox-${item.code}`}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  cursor: 'pointer', padding: '4px'
                                }}
                                title="Given — click to revert to pending"
                              >
                                <input
                                  type="checkbox"
                                  id={`vaccine-checkbox-${item.code}`}
                                  checked={true}
                                  onChange={() => setConfirmUncheckItem(item)}
                                  style={{
                                    width: '20px', height: '20px', cursor: 'pointer',
                                    accentColor: '#16A34A'
                                  }}
                                  aria-label={`Uncheck ${item.label}`}
                                />
                              </label>
                            </div>
                          ) : (
                            /* Requirement 4: Unchecked checkbox. Clicking marks given */
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem' }}>
                              <label
                                htmlFor={`vaccine-checkbox-${item.code}`}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  cursor: 'pointer', padding: '4px'
                                }}
                                title="Click to mark as given today"
                              >
                                <input
                                  type="checkbox"
                                  id={`vaccine-checkbox-${item.code}`}
                                  checked={false}
                                  onChange={() => handleMarkGiven(item.code)}
                                  style={{
                                    width: '20px', height: '20px', cursor: 'pointer',
                                    accentColor: 'var(--color-primary)'
                                  }}
                                  aria-label={`Mark ${item.label} as given`}
                                />
                              </label>
                              {/* Option to record refusal */}
                              <button
                                type="button"
                                onClick={() => { setRefusalItem(item); setRefusalReason(''); }}
                                title="Record family refusal"
                                style={{
                                  background: 'none', border: 'none', color: 'var(--text-muted)',
                                  cursor: 'pointer', padding: '2px', display: 'inline-flex',
                                  opacity: 0.6, transition: 'opacity 0.2s'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; }}
                                aria-label={`Record refusal for ${item.label}`}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Refusal counselling guidance footer */}
          {refusedCount > 0 && (
            <div style={{
              marginTop: '1.25rem', padding: '0.85rem 1rem',
              background: 'rgba(185, 28, 28, 0.07)', border: '1px solid rgba(185, 28, 28, 0.2)',
              borderRadius: 'var(--radius-sm)', fontSize: '0.84rem',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap'
            }}>
              <div>
                <strong>{refusedCount} dose{refusedCount > 1 ? 's' : ''} refused:</strong> A refused dose is a counselling task.
                Check the Myth Debunker for cultural conversation guides.
              </div>
              {onOpenSms && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => onOpenSms({ patientId: patient.id, template: 'immunization_due' })}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', flexShrink: 0 }}
                >
                  Send reminder SMS
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Uncheck Confirmation ─────────────────────────────────────── */}
      {confirmUncheckItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm status change"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(74, 29, 53, 0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem'
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmUncheckItem(null); }}
        >
          <div className="glass-card" style={{
            background: 'var(--bg-card)', width: '100%', maxWidth: '440px',
            padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
            boxShadow: 'var(--shadow-card)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#D97706' }}>
              <AlertTriangle size={20} />
              <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Mark dose as not given?
              </h4>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
              Are you sure you want to uncheck <strong>{confirmUncheckItem.label}</strong> ({confirmUncheckItem.code})?
              Its status will be reverted to <em>pending</em>.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setConfirmUncheckItem(null)}
                style={{ padding: '0.45rem 0.9rem', fontSize: '0.84rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmUncheck}
                style={{ padding: '0.45rem 1rem', fontSize: '0.84rem' }}
              >
                Yes, mark pending
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Record Vaccine Refusal ───────────────────────────────────── */}
      {refusalItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Record vaccine refusal"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(74, 29, 53, 0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem'
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setRefusalItem(null); }}
        >
          <div className="glass-card" style={{
            background: 'var(--bg-card)', width: '100%', maxWidth: '480px',
            padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
            boxShadow: 'var(--shadow-card)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  Record refusal for {refusalItem.label}
                </h4>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Code: {refusalItem.code} · {refusalItem.target}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRefusalItem(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label
                htmlFor="refusal-reason-input"
                style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}
              >
                What did the family say? · परिवार ने क्या कहा?
              </label>
              <textarea
                id="refusal-reason-input"
                value={refusalReason}
                onChange={(e) => setRefusalReason(e.target.value)}
                autoFocus
                placeholder="e.g. Grandma worries about swelling / fear of fever"
                rows={3}
                style={{
                  width: '100%', padding: '0.6rem 0.75rem', fontSize: '0.85rem',
                  background: 'var(--input-bg)', border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--input-text)'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setRefusalItem(null)}
                style={{ padding: '0.45rem 0.9rem', fontSize: '0.84rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveRefusal}
                style={{ padding: '0.45rem 1rem', fontSize: '0.84rem' }}
              >
                Save refusal
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function StatusChip({ status }) {
  const meta = STATUS_META[status] || STATUS_META.upcoming;
  const Icon = meta.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.22rem',
      fontSize: '0.67rem', fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.05em', color: meta.color,
      background: meta.bg, border: `1px solid ${meta.color}33`,
      padding: '0.12rem 0.45rem', borderRadius: '3px', whiteSpace: 'nowrap'
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
