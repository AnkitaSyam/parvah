import React, { useState, useEffect, useCallback } from 'react';
import {
  Baby, TrendingDown, AlertTriangle, Check, Loader2, Scale, Info, Plus
} from 'lucide-react';
import { api } from '../lib/api';

/**
 * Infant growth monitoring.
 *
 * Immunization was tracked to age two but weight was not — a child can
 * receive every dose on schedule and still be wasting, and nobody would see
 * it. Faltering is judged against the child's own trajectory (no reference
 * table can be wrong about that), with weight-for-age as a secondary read.
 */

const STATUS = {
  faltering:            { label: 'Growth faltering',    color: '#DC2626', bg: 'rgba(220, 38, 38, 0.10)', icon: TrendingDown },
  severely_underweight: { label: 'Severely underweight', color: '#DC2626', bg: 'rgba(220, 38, 38, 0.10)', icon: AlertTriangle },
  underweight:          { label: 'Underweight',          color: '#D97706', bg: 'rgba(217, 119, 6, 0.10)', icon: AlertTriangle },
  normal:               { label: 'Growing well',         color: '#16A34A', bg: 'rgba(22, 163, 74, 0.10)', icon: Check },
  unclassified:         { label: 'Not classified',       color: '#78716C', bg: 'rgba(120, 113, 108, 0.10)', icon: Info },
  no_data:              { label: 'No measurements',      color: '#78716C', bg: 'rgba(120, 113, 108, 0.10)', icon: Scale },
  not_applicable:       { label: 'Not applicable',       color: '#78716C', bg: 'rgba(120, 113, 108, 0.10)', icon: Info }
};

export default function GrowthTracker({ patient, visitId, onSaved }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [weight, setWeight] = useState('');
  const [measuredOn, setMeasuredOn] = useState(new Date().toISOString().split('T')[0]);
  const [muac, setMuac] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!patient?.id) return;
    setLoading(true);
    try {
      setSummary(await api.getGrowth(patient.id));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [patient?.id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = await api.saveGrowth({
        patient_id: patient.id,
        visit_id: visitId || undefined,
        weight_kg: parseFloat(weight),
        measured_on: measuredOn,
        muac_cm: muac ? parseFloat(muac) : undefined
      });
      setSummary(data.summary);
      setWeight('');
      setMuac('');
      setShowForm(false);
      onSaved?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!patient) return null;

  if (patient.stage !== 'postpartum' || patient.delivery_outcome !== 'live_birth') {
    return null;
  }

  const status = STATUS[summary?.status] || STATUS.no_data;
  const StatusIcon = status.icon;
  const points = summary?.points || [];

  return (
    <div className="glass-card" style={{ padding: '1.35rem 1.5rem' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            fontSize: '0.72rem', color: 'var(--color-secondary)', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.05em'
          }}>
            <Baby size={13} /><span>Child growth</span>
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '0.15rem' }}>
            {patient.baby_name || "Baby's weight"}
          </h3>
          {summary?.birth_weight_kg && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Born at {summary.birth_weight_kg} kg
              {summary.low_birth_weight && (
                <span style={{ color: '#D97706', fontWeight: 600 }}> · low birth weight</span>
              )}
            </p>
          )}
        </div>

        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
          fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.05em', color: status.color, background: status.bg,
          border: `1px solid ${status.color}33`, padding: '0.25rem 0.55rem',
          borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap'
        }}>
          <StatusIcon size={12} />{status.label}
        </span>
      </div>

      {loading && !summary && (
        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
          <Loader2 size={20} className="spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      )}

      {error && (
        <div style={{
          marginTop: '0.8rem', padding: '0.65rem 0.85rem', fontSize: '0.83rem',
          background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.25)',
          borderRadius: 'var(--radius-sm)', display: 'flex', gap: '0.45rem', alignItems: 'flex-start'
        }}>
          <AlertTriangle size={15} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: '2px' }} />
          <span>{error}</span>
        </div>
      )}

      {/* Action */}
      {summary?.recommended_action && (
        <div style={{
          marginTop: '0.9rem', padding: '0.75rem 0.95rem',
          background: status.bg, borderLeft: `3px solid ${status.color}`,
          borderRadius: 'var(--radius-sm)', fontSize: '0.86rem'
        }}>
          {summary.latest?.faltering_reason && (
            <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{summary.latest.faltering_reason}</p>
          )}
          <p>→ {summary.recommended_action}</p>
        </div>
      )}

      {/* Chart */}
      {points.length > 0 && <GrowthChart points={points} />}

      {/* Measurement list */}
      {points.length > 0 && (
        <div style={{ marginTop: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {[...points].reverse().slice(0, 5).map((p) => (
            <div key={p.id || p.measured_on} style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              fontSize: '0.81rem', padding: '0.35rem 0',
              borderBottom: '1px solid var(--border-color)'
            }}>
              <span style={{ minWidth: '68px', color: 'var(--text-muted)' }}>
                {new Date(p.measured_on).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
              <strong style={{ minWidth: '58px', fontVariantNumeric: 'tabular-nums' }}>{p.weight_kg} kg</strong>
              <span style={{ color: 'var(--text-muted)', minWidth: '62px' }}>
                {p.age_months != null ? `${p.age_months.toFixed(1)} mo` : ''}
              </span>
              {p.delta_kg != null && (
                <span style={{
                  fontVariantNumeric: 'tabular-nums',
                  color: p.delta_kg < 0 ? '#DC2626' : p.faltering ? '#D97706' : '#16A34A',
                  fontWeight: 600
                }}>
                  {p.delta_kg > 0 ? '+' : ''}{p.delta_kg} kg
                </span>
              )}
              {p.faltering && (
                <TrendingDown size={14} style={{ color: '#DC2626', marginLeft: 'auto' }} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add measurement */}
      {showForm ? (
        <form onSubmit={handleSave} style={{
          marginTop: '1rem', padding: '0.9rem', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-color)', background: 'var(--input-bg)',
          display: 'flex', gap: '0.7rem', flexWrap: 'wrap', alignItems: 'flex-end'
        }}>
          <div style={{ flex: '1 1 110px' }}>
            <label style={labelStyle}>Weight (kg)</label>
            <input type="number" step="0.01" min="0.3" max="30" value={weight} required autoFocus
              onChange={(e) => setWeight(e.target.value)} placeholder="4.20" style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 130px' }}>
            <label style={labelStyle}>Measured on</label>
            <input type="date" value={measuredOn} max={new Date().toISOString().split('T')[0]}
              onChange={(e) => setMeasuredOn(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 100px' }}>
            <label style={labelStyle}>MUAC (cm)</label>
            <input type="number" step="0.1" min="5" max="30" value={muac}
              onChange={(e) => setMuac(e.target.value)} placeholder="Optional" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving || !weight}
              style={{ padding: '0.5rem 0.8rem', fontSize: '0.82rem' }}>
              {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
              <span>Save</span>
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}
              style={{ padding: '0.5rem 0.8rem', fontSize: '0.82rem' }}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-outline" onClick={() => setShowForm(true)}
          style={{ marginTop: '1rem', fontSize: '0.83rem' }}>
          <Plus size={15} /><span>Record a weight</span>
        </button>
      )}

      {summary?.next_weighing_due && (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.65rem' }}>
          Next weighing due around {new Date(summary.next_weighing_due)
            .toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.
        </p>
      )}
    </div>
  );
}

/**
 * Weight trajectory with the WHO underweight band behind it. Drawn as inline
 * SVG rather than a chart library — it is one series and a shaded region.
 */
function GrowthChart({ points }) {
  const W = 520, H = 150, PAD_L = 34, PAD_R = 10, PAD_T = 12, PAD_B = 24;

  const withAge = points.filter((p) => p.age_days != null);
  if (withAge.length < 2) return null;

  const maxAge = Math.max(...withAge.map((p) => p.age_days), 30);
  const weights = withAge.map((p) => p.weight_kg);
  const cutoffs = withAge.map((p) => p.cutoffs?.underweight_below).filter(Boolean);

  const maxW = Math.max(...weights, ...cutoffs) * 1.15;
  const minW = Math.max(0, Math.min(...weights, ...cutoffs) * 0.8);

  const x = (d) => PAD_L + (d / maxAge) * (W - PAD_L - PAD_R);
  const y = (w) => H - PAD_B - ((w - minW) / (maxW - minW)) * (H - PAD_T - PAD_B);

  const line = withAge.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.age_days).toFixed(1)} ${y(p.weight_kg).toFixed(1)}`).join(' ');

  const cutoffPts = withAge.filter((p) => p.cutoffs?.underweight_below);
  const cutoffLine = cutoffPts.length >= 2
    ? cutoffPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.age_days).toFixed(1)} ${y(p.cutoffs.underweight_below).toFixed(1)}`).join(' ')
    : null;

  const ticks = [minW, (minW + maxW) / 2, maxW].map((v) => Number(v.toFixed(1)));

  return (
    <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: '320px', display: 'block' }}
        role="img" aria-label="Weight trajectory over time">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L} y1={y(t)} x2={W - PAD_R} y2={y(t)}
              stroke="var(--border-color)" strokeWidth="1" strokeDasharray="2 3" />
            <text x={PAD_L - 5} y={y(t) + 3} textAnchor="end"
              fontSize="9" fill="var(--text-muted)">{t}</text>
          </g>
        ))}

        {cutoffLine && (
          <>
            <path d={cutoffLine} fill="none" stroke="#D97706" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.75" />
            <text x={W - PAD_R} y={y(cutoffPts[cutoffPts.length - 1].cutoffs.underweight_below) - 4}
              textAnchor="end" fontSize="8.5" fill="#D97706">WHO −2SD</text>
          </>
        )}

        <path d={line} fill="none" stroke="var(--color-primary)" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />

        {withAge.map((p, i) => (
          <circle key={i} cx={x(p.age_days)} cy={y(p.weight_kg)} r={p.faltering ? 4.5 : 3}
            fill={p.faltering ? '#DC2626' : 'var(--color-primary)'}
            stroke="var(--bg-card)" strokeWidth="1.5">
            <title>{`${p.weight_kg} kg at ${Math.round(p.age_days)} days`}</title>
          </circle>
        ))}

        <text x={PAD_L} y={H - 6} fontSize="9" fill="var(--text-muted)">birth</text>
        <text x={W - PAD_R} y={H - 6} textAnchor="end" fontSize="9" fill="var(--text-muted)">
          {Math.round(maxAge / 30.4)} months
        </text>
      </svg>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '0.45rem 0.6rem',
  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-sm)', color: 'var(--input-text)',
  fontSize: '0.86rem', fontFamily: 'inherit'
};

const labelStyle = {
  display: 'block', fontSize: '0.72rem', fontWeight: 600,
  color: 'var(--text-main)', marginBottom: '0.2rem'
};
