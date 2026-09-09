import React, { useEffect, useState } from 'react';
import { Activity, TrendingDown, AlertOctagon, Info, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';

/**
 * Explains *why* a patient sits at her current risk level.
 *
 * calculateRiskScore() has always returned a full per-symptom breakdown —
 * base points, severity multiplier, how far each has decayed, and the
 * standing baseline factors — and the client threw all of it away, showing a
 * bare number. The decay-weighted risk memory is the most original thing in
 * the system and it was invisible.
 */

const LEVEL = {
  alert:  { label: 'Alert',  color: '#DC2626', bg: 'rgba(220, 38, 38, 0.10)' },
  watch:  { label: 'Watch',  color: '#D97706', bg: 'rgba(217, 119, 6, 0.10)' },
  normal: { label: 'Normal', color: '#16A34A', bg: 'rgba(22, 163, 74, 0.10)' }
};

const MAX_SCALE = 10;

export default function RiskExplainer({ patient, refreshKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!patient?.id) { setData(null); return; }

    let cancelled = false;
    setLoading(true);
    setError('');

    api.getRiskScore(patient.id)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [patient?.id, refreshKey]);

  if (!patient) return null;

  const level = LEVEL[data?.risk_level] || LEVEL.normal;
  const score = data?.current_risk_score ?? 0;
  const symptoms = data?.breakdown?.symptoms || [];
  const baselineFactors = data?.breakdown?.baseline_factors || [];
  const baselinePoints = data?.breakdown?.baseline_points || 0;

  return (
    <div className="glass-card" style={{ padding: '1.35rem 1.5rem' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            fontSize: '0.72rem', color: 'var(--color-secondary)', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.05em'
          }}>
            <Activity size={13} /><span>Why this risk level</span>
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '0.15rem' }}>
            Risk memory
            <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
              {data?.stage === 'postpartum' ? '10-day postpartum window' : '21-day antenatal window'}
            </span>
          </h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.9rem', fontWeight: 800, lineHeight: 1, color: level.color }}>
              {score.toFixed(1)}
            </div>
            <div style={{
              fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: level.color
            }}>{level.label}</div>
          </div>
        </div>
      </div>

      {/* Scale */}
      <div style={{ marginTop: '1rem' }}>
        <div style={{
          position: 'relative', height: '10px', borderRadius: '5px',
          background: 'linear-gradient(90deg, rgba(22,163,74,0.25) 0%, rgba(22,163,74,0.25) 30%, rgba(217,119,6,0.3) 30%, rgba(217,119,6,0.3) 60%, rgba(220,38,38,0.3) 60%, rgba(220,38,38,0.3) 100%)',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute', top: 0, bottom: 0, left: 0,
            width: `${Math.min(100, (score / MAX_SCALE) * 100)}%`,
            background: level.color, opacity: 0.85, borderRadius: '5px',
            transition: 'width 0.4s ease'
          }} />
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: '0.25rem',
          fontVariantNumeric: 'tabular-nums'
        }}>
          <span>0</span><span>3.0 watch</span><span>6.0 alert</span><span>10</span>
        </div>
      </div>

      {loading && (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Loader2 size={20} className="spin" />
        </div>
      )}

      {error && (
        <p style={{ marginTop: '0.9rem', fontSize: '0.84rem', color: 'var(--color-danger)' }}>{error}</p>
      )}

      {/* Red flag short-circuit */}
      {data?.red_flag_triggered && (
        <div style={{
          marginTop: '1rem', padding: '0.85rem 1rem',
          background: 'rgba(220, 38, 38, 0.09)', border: '1px solid rgba(220, 38, 38, 0.3)',
          borderRadius: 'var(--radius-sm)', display: 'flex', gap: '0.65rem', alignItems: 'flex-start'
        }}>
          <AlertOctagon size={18} style={{ color: '#DC2626', flexShrink: 0, marginTop: '1px' }} />
          <div style={{ fontSize: '0.87rem' }}>
            <strong style={{ color: '#991B1B' }}>
              Emergency sign overrides the score: {data.triggered_by?.symptom_name}
            </strong>
            <p style={{ color: 'var(--text-main)', marginTop: '0.2rem' }}>
              {data.triggered_by?.flag_description}
            </p>
            {data.triggered_by?.recommended_asha_action && (
              <p style={{ color: 'var(--text-main)', marginTop: '0.35rem', fontWeight: 600 }}>
                → {data.triggered_by.recommended_asha_action}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Standing risk */}
      {baselineFactors.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <SubHead>Standing risk (does not decay) — {baselinePoints.toFixed(1)} pts</SubHead>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {baselineFactors.map((f, i) => (
              <span key={i} style={{
                fontSize: '0.76rem', fontWeight: 600,
                background: 'var(--color-primary-light)', color: 'var(--color-primary)',
                border: '1px solid var(--border-color)',
                padding: '0.2rem 0.55rem', borderRadius: 'var(--radius-full)'
              }}>
                {f.factor} +{f.points}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Decay contributions */}
      {!data?.red_flag_triggered && symptoms.length > 0 && (
        <div style={{ marginTop: '1.1rem' }}>
          <SubHead>
            <TrendingDown size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '0.2rem' }} />
            What each symptom contributes today
          </SubHead>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {symptoms.slice(0, 6).map((s, i) => {
              const pct = Math.min(100, (s.decayed_points / Math.max(1, MAX_SCALE)) * 100);
              const decayPct = Math.round(s.decay_multiplier * 100);

              return (
                <div key={i}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    gap: '0.5rem', fontSize: '0.82rem', marginBottom: '0.18rem'
                  }}>
                    <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.symptom_name}
                    </span>
                    <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {s.raw_points.toFixed(1)} → <strong style={{ color: 'var(--text-main)' }}>{s.decayed_points.toFixed(1)}</strong>
                    </span>
                  </div>

                  <div style={{ height: '6px', background: 'var(--color-primary-light)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`,
                      background: s.severity === 'severe' ? '#DC2626'
                        : s.severity === 'moderate' ? '#D97706' : '#16A34A',
                      borderRadius: '3px', transition: 'width 0.4s ease'
                    }} />
                  </div>

                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    {Math.round(s.days_ago)} day{Math.round(s.days_ago) === 1 ? '' : 's'} ago
                    {' · '}decayed to {decayPct}% over {s.decay_window_days} days
                    {s.referral_surcharge > 0 && ' · referral advised'}
                  </div>
                </div>
              );
            })}
          </div>

          {symptoms.length > 6 && (
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              +{symptoms.length - 6} more contributing below the top six.
            </p>
          )}
        </div>
      )}

      {!loading && !data?.red_flag_triggered && symptoms.length === 0 && (
        <div style={{
          marginTop: '1rem', padding: '0.9rem', textAlign: 'center',
          border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-sm)',
          fontSize: '0.85rem', color: 'var(--text-muted)'
        }}>
          No symptoms inside the current window. Older entries have fully decayed.
        </div>
      )}

      <p style={{
        marginTop: '1rem', paddingTop: '0.7rem', borderTop: '1px dashed var(--border-color)',
        fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', gap: '0.4rem', alignItems: 'flex-start'
      }}>
        <Info size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
        <span>
          Points decay linearly so a resolved problem stops dominating the score, while a
          repeating pattern accumulates. A severe sign in the last 7 days overrides the
          arithmetic entirely.
        </span>
      </p>
    </div>
  );
}

function SubHead({ children }) {
  return (
    <h4 style={{
      fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.5rem'
    }}>{children}</h4>
  );
}
