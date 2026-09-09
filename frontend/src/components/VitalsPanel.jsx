import React, { useState, useEffect, useCallback } from 'react';
import {
  HeartPulse, Activity, Thermometer, Droplet, Scale, Ruler,
  AlertTriangle, Check, Loader2, Mic, TrendingUp, TrendingDown, Minus, Info
} from 'lucide-react';
import { api } from '../lib/api';

/**
 * Vitals entry and history.
 *
 * Six of the fourteen red flags tell the worker to measure something — "check
 * blood pressure", "test urine for albumin", "check haemoglobin" — and until
 * now there was nowhere to put the answer, so the risk model reasoned about
 * pre-eclampsia from the words "swelling" and "headache" while ignoring the
 * numbers that define it.
 *
 * Grading happens on the server against fixed protocol thresholds, so the
 * same reading always yields the same action and the reasoning can be shown
 * to a clinician. Voice pre-fill never saves on its own — the worker
 * confirms every value.
 */

const ALBUMIN = ['nil', 'trace', '1+', '2+', '3+', '4+'];

const SEVERITY = {
  severe:   { color: '#DC2626', bg: 'rgba(220, 38, 38, 0.10)' },
  moderate: { color: '#D97706', bg: 'rgba(217, 119, 6, 0.10)' },
  mild:     { color: '#16A34A', bg: 'rgba(22, 163, 74, 0.10)' }
};

const EMPTY = {
  systolic_bp: '', diastolic_bp: '', pulse_bpm: '', temperature_c: '',
  weight_kg: '', hemoglobin_gdl: '', urine_albumin: '', fundal_height_cm: ''
};

export default function VitalsPanel({ patient, visitId, transcript, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [history, setHistory] = useState([]);
  const [trend, setTrend] = useState(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [voiceFilled, setVoiceFilled] = useState([]);

  const loadHistory = useCallback(async () => {
    if (!patient?.id) return;
    try {
      const data = await api.getVitals(patient.id);
      setHistory(data.records || []);
      setTrend(data.weight_trend || null);
    } catch (err) {
      setError(err.message);
    }
  }, [patient?.id]);

  useEffect(() => {
    setForm(EMPTY);
    setResult(null);
    setError('');
    setVoiceFilled([]);
    loadHistory();
  }, [patient?.id, loadHistory]);

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setVoiceFilled((v) => v.filter((x) => x !== field));
  };

  /** Pulls any numbers the worker said aloud out of the transcript. */
  const scanTranscript = async () => {
    if (!transcript?.trim()) return;
    setScanning(true);
    setError('');
    try {
      const data = await api.parseVitals(transcript);
      if (data.found === 0) {
        setError('No measurements were mentioned in the recording. Enter them below.');
      } else {
        setForm((f) => ({ ...f, ...Object.fromEntries(
          Object.entries(data.vitals).map(([k, v]) => [k, String(v)])
        ) }));
        setVoiceFilled(Object.keys(data.vitals));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  const hasAnyValue = Object.values(form).some((v) => v !== '');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setResult(null);

    try {
      const payload = { patient_id: patient.id, visit_id: visitId || undefined };
      for (const [k, v] of Object.entries(form)) {
        if (v !== '') payload[k] = v;
      }
      if (voiceFilled.length > 0) payload.source = 'voice';

      const data = await api.saveVitals(payload);
      setResult(data);
      setForm(EMPTY);
      setVoiceFilled([]);
      await loadHistory();
      onSaved?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!patient) return null;

  const latest = history[0] || null;
  const TrendIcon = trend?.direction === 'up' ? TrendingUp
    : trend?.direction === 'down' ? TrendingDown : Minus;

  return (
    <div className="glass-card" style={{ padding: '1.35rem 1.5rem' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            fontSize: '0.72rem', color: 'var(--color-secondary)', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.05em'
          }}>
            <HeartPulse size={13} /><span>Measurements</span>
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '0.15rem' }}>Vitals</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Readings are graded against protocol and added to her risk score.
          </p>
        </div>

        {transcript?.trim() && (
          <button
            className="btn btn-outline"
            onClick={scanTranscript}
            disabled={scanning}
            title="Find any numbers spoken during the visit"
            style={{ padding: '0.4rem 0.7rem', fontSize: '0.79rem' }}
          >
            {scanning ? <Loader2 size={14} className="spin" /> : <Mic size={14} />}
            <span>Fill from recording</span>
          </button>
        )}
      </div>

      {/* Last reading */}
      {latest && (
        <div style={{
          marginTop: '0.9rem', padding: '0.65rem 0.85rem',
          background: 'var(--color-primary-light)', borderRadius: 'var(--radius-sm)',
          fontSize: '0.8rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center'
        }}>
          <span style={{ fontWeight: 700 }}>Last recorded:</span>
          {latest.systolic_bp && <span>BP {latest.systolic_bp}/{latest.diastolic_bp}</span>}
          {latest.hemoglobin_gdl && <span>Hb {latest.hemoglobin_gdl}</span>}
          {latest.weight_kg && <span>{latest.weight_kg} kg</span>}
          {latest.temperature_c && <span>{latest.temperature_c} °C</span>}
          {latest.urine_albumin && <span>Albumin {latest.urine_albumin}</span>}
          <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {new Date(latest.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </span>
          {trend && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
              color: trend.direction === 'down' ? '#DC2626' : 'var(--text-muted)', fontWeight: 600
            }}>
              <TrendIcon size={13} />
              {trend.delta_kg > 0 ? '+' : ''}{trend.delta_kg} kg
            </span>
          )}
        </div>
      )}

      {voiceFilled.length > 0 && (
        <div style={{
          marginTop: '0.75rem', padding: '0.6rem 0.8rem', fontSize: '0.8rem',
          background: 'rgba(139, 92, 246, 0.07)', border: '1px solid rgba(139, 92, 246, 0.25)',
          borderRadius: 'var(--radius-sm)', display: 'flex', gap: '0.45rem', alignItems: 'flex-start'
        }}>
          <Info size={14} style={{ color: '#6d28d9', flexShrink: 0, marginTop: '2px' }} />
          <span>
            Filled from the recording — <strong>check each value before saving</strong>.
            Nothing is stored until you do.
          </span>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: '0.75rem', padding: '0.65rem 0.85rem', fontSize: '0.83rem',
          background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.25)',
          borderRadius: 'var(--radius-sm)', display: 'flex', gap: '0.45rem', alignItems: 'flex-start'
        }}>
          <AlertTriangle size={15} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: '2px' }} />
          <span>{error}</span>
        </div>
      )}

      {/* Entry form */}
      <div style={{
        marginTop: '1rem', display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '0.75rem'
      }}>
        <VitalField label="BP upper" unit="mmHg" icon={Activity} highlighted={voiceFilled.includes('systolic_bp')}>
          <input type="number" inputMode="numeric" value={form.systolic_bp}
            onChange={set('systolic_bp')} placeholder="120" style={inputStyle} />
        </VitalField>

        <VitalField label="BP lower" unit="mmHg" icon={Activity} highlighted={voiceFilled.includes('diastolic_bp')}>
          <input type="number" inputMode="numeric" value={form.diastolic_bp}
            onChange={set('diastolic_bp')} placeholder="80" style={inputStyle} />
        </VitalField>

        <VitalField label="Haemoglobin" unit="g/dL" icon={Droplet} highlighted={voiceFilled.includes('hemoglobin_gdl')}>
          <input type="number" step="0.1" inputMode="decimal" value={form.hemoglobin_gdl}
            onChange={set('hemoglobin_gdl')} placeholder="11.0" style={inputStyle} />
        </VitalField>

        <VitalField label="Weight" unit="kg" icon={Scale} highlighted={voiceFilled.includes('weight_kg')}>
          <input type="number" step="0.1" inputMode="decimal" value={form.weight_kg}
            onChange={set('weight_kg')} placeholder="52.0" style={inputStyle} />
        </VitalField>

        <VitalField label="Temperature" unit="°C" icon={Thermometer} highlighted={voiceFilled.includes('temperature_c')}>
          <input type="number" step="0.1" inputMode="decimal" value={form.temperature_c}
            onChange={set('temperature_c')} placeholder="36.8" style={inputStyle} />
        </VitalField>

        <VitalField label="Pulse" unit="bpm" icon={HeartPulse} highlighted={voiceFilled.includes('pulse_bpm')}>
          <input type="number" inputMode="numeric" value={form.pulse_bpm}
            onChange={set('pulse_bpm')} placeholder="78" style={inputStyle} />
        </VitalField>

        <VitalField label="Urine albumin" icon={Droplet} highlighted={voiceFilled.includes('urine_albumin')}>
          <select value={form.urine_albumin} onChange={set('urine_albumin')} style={inputStyle}>
            <option value="">Not tested</option>
            {ALBUMIN.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </VitalField>

        {patient.stage !== 'postpartum' && (
          <VitalField label="Fundal height" unit="cm" icon={Ruler} highlighted={voiceFilled.includes('fundal_height_cm')}>
            <input type="number" step="0.5" inputMode="decimal" value={form.fundal_height_cm}
              onChange={set('fundal_height_cm')} placeholder="28" style={inputStyle} />
          </VitalField>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !hasAnyValue}>
          {saving
            ? <><Loader2 size={16} className="spin" /><span>Saving…</span></>
            : <><Check size={16} /><span>Save &amp; grade</span></>}
        </button>
        {hasAnyValue && !saving && (
          <button className="btn btn-outline" onClick={() => { setForm(EMPTY); setVoiceFilled([]); }}>
            Clear
          </button>
        )}
      </div>

      {/* Grading result */}
      {result && (
        <div style={{ marginTop: '1.1rem' }}>
          {result.grading.findings.length === 0 ? (
            <div style={{
              padding: '0.8rem 1rem', borderRadius: 'var(--radius-sm)',
              background: 'rgba(22, 163, 74, 0.08)', border: '1px solid rgba(22, 163, 74, 0.25)',
              fontSize: '0.87rem', display: 'flex', gap: '0.5rem', alignItems: 'center'
            }}>
              <Check size={16} style={{ color: '#16A34A' }} />
              <span>Saved. All readings are within normal range.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {result.grading.findings.map((f, i) => {
                const sev = SEVERITY[f.severity] || SEVERITY.mild;
                return (
                  <div key={i} style={{
                    padding: '0.8rem 0.95rem', borderRadius: 'var(--radius-sm)',
                    background: sev.bg, borderLeft: `3px solid ${sev.color}`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                      <strong style={{ fontSize: '0.92rem' }}>{f.symptom_name}</strong>
                      <span style={{
                        fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.05em', color: sev.color,
                        border: `1px solid ${sev.color}44`, padding: '0.08rem 0.35rem', borderRadius: '3px'
                      }}>{f.severity}</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', marginBottom: '0.3rem' }}>{f.flag_description}</p>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                      → {f.recommended_asha_action}
                    </p>
                  </div>
                );
              })}

              {result.risk_scoring_breakdown && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Risk level is now <strong style={{ color: 'var(--text-main)' }}>
                    {result.risk_scoring_breakdown.risk_level}
                  </strong> (score {result.risk_scoring_breakdown.current_risk_score}).
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 1 && (
        <details style={{ marginTop: '1.1rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.83rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            Previous readings ({history.length})
          </summary>
          <div style={{ overflowX: 'auto', marginTop: '0.6rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: '460px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  {['Date', 'BP', 'Hb', 'Weight', 'Temp', 'Albumin'].map((h) => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '0.35rem 0.5rem 0.35rem 0',
                      fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                      color: 'var(--text-muted)', fontWeight: 700
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
                {history.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.4rem 0.5rem 0.4rem 0', whiteSpace: 'nowrap' }}>
                      {new Date(r.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>
                      {r.systolic_bp ? `${r.systolic_bp}/${r.diastolic_bp}` : '—'}
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{r.hemoglobin_gdl ?? '—'}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{r.weight_kg ?? '—'}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{r.temperature_c ?? '—'}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{r.urine_albumin ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '0.5rem 0.6rem',
  background: 'var(--input-bg)', border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-sm)', color: 'var(--input-text)',
  fontSize: '0.9rem', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums'
};

function VitalField({ label, unit, icon: Icon, highlighted, children }) {
  return (
    <div style={{
      padding: highlighted ? '0.4rem' : 0,
      margin: highlighted ? '-0.4rem' : 0,
      borderRadius: 'var(--radius-sm)',
      background: highlighted ? 'rgba(139, 92, 246, 0.08)' : 'transparent',
      transition: 'background var(--transition-fast)'
    }}>
      <label style={{
        display: 'flex', alignItems: 'center', gap: '0.25rem',
        fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem'
      }}>
        <Icon size={12} style={{ color: 'var(--color-secondary)' }} />
        <span>{label}</span>
        {unit && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({unit})</span>}
      </label>
      {children}
    </div>
  );
}
