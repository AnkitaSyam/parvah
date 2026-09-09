import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert, Syringe, MessageSquare, Check, ExternalLink,
  Loader2, RefreshCw, AlertTriangle, User, Calendar
} from 'lucide-react';
import { api } from '../lib/api';

/**
 * VaccineFollowUp
 *
 * Caseload-wide worklist of every open vaccine refusal across all patients.
 * Allows ASHA workers to triage who needs counselling, send reminder SMS,
 * mark doses as given once resolved, or jump into a patient's full checklist.
 */

export default function VaccineFollowUp({
  onOpenSms,
  onSelectPatient,
  onCountChange
}) {
  const [hesitancyList, setHesitancyList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolvingCode, setResolvingCode] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getHesitancyList();
      const items = data || [];
      setHesitancyList(items);
      onCountChange?.(items.length);
    } catch (err) {
      setError(err.message || 'Failed to load vaccine refusal worklist.');
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  const handleMarkGiven = async (item) => {
    const key = `${item.patient_id}_${item.vaccine_code}`;
    setResolvingCode(key);
    setError('');

    try {
      const today = new Date().toISOString().split('T')[0];
      await api.setImmunizationStatus(item.patient_id, item.vaccine_code, {
        status: 'given',
        given_date: today
      });

      // Optimistically remove from list and notify parent badge
      const updated = hesitancyList.filter(
        (h) => !(h.patient_id === item.patient_id && h.vaccine_code === item.vaccine_code)
      );
      setHesitancyList(updated);
      onCountChange?.(updated.length);
    } catch (err) {
      setError(err.message || 'Failed to update vaccine status.');
      await load();
    } finally {
      setResolvingCode(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header Banner */}
      <div className="glass-card" style={{ padding: '1.35rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              fontSize: '0.72rem', color: '#B91C1C', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>
              <ShieldAlert size={13} />
              <span>Caseload Hesitancy Triage</span>
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '0.2rem' }}>
              Vaccine Refusal Follow-up
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              Every dose declined across your caseload. Follow up with counselling or send an SMS reminder.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              fontSize: '0.82rem', fontWeight: 700, color: hesitancyList.length > 0 ? '#B91C1C' : '#16A34A',
              background: hesitancyList.length > 0 ? 'rgba(185, 28, 28, 0.12)' : 'rgba(22, 163, 74, 0.10)',
              border: `1px solid ${hesitancyList.length > 0 ? 'rgba(185, 28, 28, 0.3)' : 'rgba(22, 163, 74, 0.3)'}`,
              padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-full)'
            }}>
              {hesitancyList.length} open {hesitancyList.length === 1 ? 'refusal' : 'refusals'}
            </span>

            <button
              type="button"
              className="btn btn-outline"
              onClick={load}
              disabled={loading}
              aria-label="Refresh worklist"
              title="Refresh"
              style={{ padding: '0.42rem 0.65rem' }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>
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
      {loading && hesitancyList.length === 0 && (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Loader2 size={28} className="spin" style={{ margin: '0 auto 0.5rem' }} />
          <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>Loading refusal worklist…</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && hesitancyList.length === 0 && !error && (
        <div className="glass-card" style={{
          padding: '3rem 2rem', textAlign: 'center', color: 'var(--text-muted)',
          border: '2px dashed var(--border-color)'
        }}>
          <Check size={36} style={{ color: '#16A34A', opacity: 0.8, margin: '0 auto 0.5rem' }} />
          <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            No vaccine refusals on record
          </h4>
          <p style={{ fontSize: '0.88rem', maxWidth: '420px', margin: '0 auto' }}>
            All families across your caseload are up to date or accepting recommended immunizations.
          </p>
        </div>
      )}

      {/* Worklist Table */}
      {hesitancyList.length > 0 && (
        <div className="glass-card" style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{
                  borderBottom: '2px solid var(--border-color)',
                  color: 'var(--text-muted)', fontSize: '0.74rem',
                  textTransform: 'uppercase', letterSpacing: '0.05em'
                }}>
                  <th style={{ padding: '0.75rem 0.85rem' }}>Mother &amp; Child</th>
                  <th style={{ padding: '0.75rem 0.85rem' }}>Vaccine</th>
                  <th style={{ padding: '0.75rem 0.85rem' }}>Family's Reason</th>
                  <th style={{ padding: '0.75rem 0.85rem' }}>Recorded</th>
                  <th style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {hesitancyList.map((item) => {
                  const patient = item.patients || { id: item.patient_id, name: 'Unknown' };
                  const key = `${item.patient_id}_${item.vaccine_code}`;
                  const isResolving = resolvingCode === key;

                  return (
                    <tr
                      key={key}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      {/* 1. Mother & Child */}
                      <td style={{ padding: '0.85rem 0.85rem', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <strong style={{ fontSize: '0.92rem', color: 'var(--text-main)' }}>
                            {patient.name}
                          </strong>
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                          {patient.baby_name ? `Baby: ${patient.baby_name}` : ''}
                          {patient.village ? (patient.baby_name ? ` · ${patient.village}` : patient.village) : ''}
                        </div>
                      </td>

                      {/* 2. Vaccine */}
                      <td style={{ padding: '0.85rem 0.85rem', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                          fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-primary)',
                          background: 'var(--color-primary-light)', padding: '0.2rem 0.55rem',
                          borderRadius: 'var(--radius-sm)'
                        }}>
                          <Syringe size={12} />
                          {item.vaccine_code}
                        </span>
                      </td>

                      {/* 3. Reason */}
                      <td style={{ padding: '0.85rem 0.85rem', verticalAlign: 'middle' }}>
                        <div style={{
                          fontSize: '0.83rem', color: '#B91C1C', fontStyle: 'italic',
                          lineHeight: 1.35, maxWidth: '280px'
                        }}>
                          "{item.refusal_reason || 'No specific reason recorded.'}"
                        </div>
                      </td>

                      {/* 4. Recorded date */}
                      <td style={{ padding: '0.85rem 0.85rem', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.79rem', color: 'var(--text-muted)' }}>
                        {item.updated_at ? item.updated_at.split('T')[0] : '—'}
                      </td>

                      {/* 5. Row actions */}
                      <td style={{ padding: '0.85rem 0.85rem', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                          {/* Mark given */}
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => handleMarkGiven(item)}
                            disabled={isResolving}
                            title="Family consented: mark as given now"
                            style={{
                              padding: '0.3rem 0.65rem', fontSize: '0.76rem',
                              borderColor: '#16A34A', color: '#16A34A', fontWeight: 600
                            }}
                          >
                            {isResolving ? (
                              <Loader2 size={12} className="spin" />
                            ) : (
                              <Check size={12} />
                            )}
                            <span>Mark given</span>
                          </button>

                          {/* Send SMS */}
                          {onOpenSms && (
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => onOpenSms({
                                patientId: item.patient_id,
                                patientName: patient.name,
                                template: 'immunization_due'
                              })}
                              title="Send reminder SMS"
                              style={{ padding: '0.3rem 0.65rem', fontSize: '0.76rem' }}
                            >
                              <MessageSquare size={12} />
                              <span>SMS</span>
                            </button>
                          )}

                          {/* Open patient checklist */}
                          {onSelectPatient && (
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => onSelectPatient({ id: item.patient_id, ...(item.patients || {}) })}
                              title="Open this patient's full vaccination checklist"
                              style={{ padding: '0.3rem 0.65rem', fontSize: '0.76rem' }}
                            >
                              <ExternalLink size={12} />
                              <span>Checklist</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
