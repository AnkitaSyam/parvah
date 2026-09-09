import React, { useState } from 'react';
import { X, Baby, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';

/**
 * Records a delivery and moves the patient from antenatal into postpartum
 * care — the transition the app previously had no concept of. Gestational
 * weeks counted up and then the record simply stopped, at exactly the point
 * where most maternal deaths actually occur.
 *
 * Recording this switches the danger-sign set, starts the HBNC visit
 * schedule, and (for a live birth) opens the immunization record.
 */

const OUTCOMES = [
  { value: 'live_birth',     label: 'Live birth',     hi: 'जीवित जन्म' },
  { value: 'stillbirth',     label: 'Stillbirth',     hi: 'मृत जन्म' },
  { value: 'neonatal_death', label: 'Neonatal death', hi: 'नवजात मृत्यु' }
];

const PLACES = [
  { value: 'institutional', label: 'Hospital / PHC', hi: 'अस्पताल' },
  { value: 'home',          label: 'At home',        hi: 'घर पर' },
  { value: 'in_transit',    label: 'In transit',     hi: 'रास्ते में' }
];

const SEXES = [
  { value: 'female', label: 'Girl', hi: 'लड़की' },
  { value: 'male',   label: 'Boy',  hi: 'लड़का' },
  { value: 'other',  label: 'Other', hi: 'अन्य' }
];

export default function DeliveryModal({ isOpen, patient, onClose, onRecorded }) {
  const today = new Date().toISOString().split('T')[0];

  const [deliveryDate, setDeliveryDate] = useState(today);
  const [outcome, setOutcome] = useState('live_birth');
  const [place, setPlace] = useState('institutional');
  const [babyName, setBabyName] = useState('');
  const [babySex, setBabySex] = useState('');
  const [weight, setWeight] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !patient) return null;

  const isLiveBirth = outcome === 'live_birth';
  const weightNum = parseFloat(weight);
  const lowBirthWeight = Number.isFinite(weightNum) && weightNum > 0 && weightNum < 2.5;

  const reset = () => {
    setDeliveryDate(today); setOutcome('live_birth'); setPlace('institutional');
    setBabyName(''); setBabySex(''); setWeight(''); setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const result = await api.recordDelivery(patient.id, {
        delivery_date: deliveryDate,
        delivery_outcome: outcome,
        delivery_place: place,
        baby_name: isLiveBirth ? babyName.trim() || null : null,
        baby_sex: isLiveBirth ? babySex || null : null,
        baby_birth_weight_kg: isLiveBirth && weight ? weightNum : null
      });

      onRecorded?.(result);
      reset();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Record delivery for ${patient.name}`}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(74, 29, 53, 0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem', overflowY: 'auto'
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <form
        onSubmit={handleSubmit}
        className="glass-card"
        style={{
          background: 'var(--bg-card)', width: '100%', maxWidth: '520px',
          padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem',
          maxHeight: '90vh', overflowY: 'auto'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              fontSize: '0.72rem', color: 'var(--color-secondary)', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem'
            }}>
              <Baby size={14} /><span>Delivery record</span>
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>{patient.name}</h3>
            <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
              This starts postnatal care — HBNC visits, postpartum danger signs
              and the child's immunization schedule.
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-outline"
            aria-label="Close" style={{ padding: '0.35rem 0.55rem' }}>
            <X size={16} />
          </button>
        </div>

        {error && (
          <div style={{
            display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
            background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.25)',
            borderRadius: 'var(--radius-sm)', padding: '0.7rem 0.85rem', fontSize: '0.85rem'
          }}>
            <AlertCircle size={16} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        <Field label="Date of delivery" hi="प्रसव की तारीख" required>
          <input
            type="date" value={deliveryDate} max={today} required
            onChange={(e) => setDeliveryDate(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Outcome" hi="परिणाम" required>
          <ChoiceRow options={OUTCOMES} value={outcome} onChange={setOutcome} />
        </Field>

        <Field label="Place of delivery" hi="प्रसव स्थान">
          <ChoiceRow options={PLACES} value={place} onChange={setPlace} />
          {place === 'home' && (
            <p style={{ fontSize: '0.78rem', color: 'var(--color-secondary)', marginTop: '0.35rem' }}>
              Home delivery adds day-1 and day-2 HBNC visits to the schedule.
            </p>
          )}
        </Field>

        {isLiveBirth && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem' }}>
              <Field label="Baby's name" hi="बच्चे का नाम">
                <input
                  type="text" value={babyName} placeholder="Optional"
                  onChange={(e) => setBabyName(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Birth weight (kg)" hi="जन्म वजन">
                <input
                  type="number" step="0.01" min="0.3" max="7" value={weight}
                  placeholder="e.g. 2.8"
                  onChange={(e) => setWeight(e.target.value)}
                  style={{
                    ...inputStyle,
                    borderColor: lowBirthWeight ? 'var(--color-danger)' : 'var(--border-color)'
                  }}
                />
              </Field>
            </div>

            <Field label="Sex" hi="लिंग">
              <ChoiceRow options={SEXES} value={babySex} onChange={setBabySex} />
            </Field>

            {lowBirthWeight && (
              <div style={{
                display: 'flex', gap: '0.55rem', alignItems: 'flex-start',
                background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: 'var(--radius-sm)', padding: '0.7rem 0.85rem', fontSize: '0.83rem'
              }}>
                <AlertCircle size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
                <span>
                  Below 2.5&nbsp;kg is low birth weight. Parvah will flag this on the
                  risk timeline and schedule closer follow-up — kangaroo mother care
                  and weight at every visit.
                </span>
              </div>
            )}
          </>
        )}

        {!isLiveBirth && (
          <div style={{
            display: 'flex', gap: '0.55rem', alignItems: 'flex-start',
            background: 'var(--color-primary-light)', border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)', padding: '0.7rem 0.85rem', fontSize: '0.83rem'
          }}>
            <AlertCircle size={16} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: '2px' }} />
            <span>
              Postnatal visits for the mother continue as normal — this is when
              maternal risk is highest. Immunization tracking will not be opened.
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting
              ? <><Loader2 size={16} className="spin" /><span>Saving…</span></>
              : <><CheckCircle2 size={16} /><span>Record delivery</span></>}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '0.6rem 0.75rem',
  background: 'var(--input-bg)', border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-sm)', color: 'var(--input-text)',
  fontSize: '0.9rem', fontFamily: 'inherit'
};

function Field({ label, hi, required, children }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: '0.8rem', fontWeight: 600,
        color: 'var(--text-main)', marginBottom: '0.35rem'
      }}>
        {label}
        {hi && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {hi}</span>}
        {required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function ChoiceRow({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(active ? '' : o.value)}
            aria-pressed={active}
            style={{
              padding: '0.45rem 0.75rem', fontSize: '0.83rem', fontWeight: 600,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              border: `1px solid ${active ? 'var(--color-primary)' : 'var(--border-color)'}`,
              background: active ? 'var(--color-primary-light)' : 'transparent',
              color: active ? 'var(--color-primary)' : 'var(--text-main)',
              transition: 'all var(--transition-fast)'
            }}
          >
            {o.label}
            <span style={{ opacity: 0.65, fontWeight: 400 }}> · {o.hi}</span>
          </button>
        );
      })}
    </div>
  );
}
