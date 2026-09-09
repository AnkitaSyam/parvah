import React, { useState, useEffect } from 'react';
import {
  BookOpen, CheckCircle, AlertCircle, MessageCircle, Sparkles, Shield,
  Volume2, Square, Loader2, ExternalLink, Syringe
} from 'lucide-react';
import { api } from '../lib/api';

/**
 * Myth debunker.
 *
 * Two things were previously theatre here:
 *
 *  1. The Hindi counselling script was a single hardcoded constant, so every
 *     real detection rendered the same generic sentence. The backend now
 *     generates a real script per myth in the patient's own language.
 *
 *  2. "Mark as Counselled" wrote to component state and vanished on refresh,
 *     even though detected_myths.is_addressed existed in the schema. It now
 *     persists through PATCH /api/myths/detected/:id.
 *
 * Added: the script can be spoken aloud. Voice-in without voice-out is half a
 * product — the worker holds the phone up and the family hears the rebuttal
 * in their own language.
 */

const SEVERITY = {
  high:   { label: 'High impact',   color: '#DC2626', bg: 'rgba(220, 38, 38, 0.10)' },
  medium: { label: 'Medium impact', color: '#D97706', bg: 'rgba(217, 119, 6, 0.10)' },
  low:    { label: 'Low impact',    color: '#16A34A', bg: 'rgba(22, 163, 74, 0.10)' }
};

/** Maps the patient's language code to a speech-synthesis locale. */
const SPEECH_LOCALE = { hi: 'hi-IN', en: 'en-IN', ml: 'ml-IN' };

export default function MythDebunker({
  detectedMyths = [],
  hesitancy = null,
  language = 'hi',
  onAddressed
}) {
  const [myths, setMyths] = useState(detectedMyths);
  const [savingId, setSavingId] = useState(null);
  const [speakingId, setSpeakingId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { setMyths(detectedMyths); }, [detectedMyths]);

  // Cancel any in-flight speech when the component goes away, otherwise it
  // keeps talking after the user navigates.
  useEffect(() => () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const speak = (id, text) => {
    if (!speechSupported || !text) return;

    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = SPEECH_LOCALE[language] || 'hi-IN';
    utterance.rate = 0.88; // a little slower — this is being read to a family
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);

    // Prefer a matching voice if the device has one installed.
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find((v) => v.lang === utterance.lang)
      || voices.find((v) => v.lang?.startsWith(utterance.lang.split('-')[0]));
    if (match) utterance.voice = match;

    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  };

  const toggleAddressed = async (myth) => {
    // Unsaved detections (offline mode) have no database row to update.
    if (!myth.id || String(myth.id).startsWith('m-')) {
      setMyths((prev) => prev.map((m) => m === myth ? { ...m, is_addressed: !m.is_addressed } : m));
      return;
    }

    const next = !myth.is_addressed;
    setSavingId(myth.id);
    setError('');

    // Optimistic — the toggle should feel instant in the field.
    setMyths((prev) => prev.map((m) => m.id === myth.id ? { ...m, is_addressed: next } : m));

    try {
      await api.setMythAddressed(myth.id, next);
      onAddressed?.(myth.id, next);
    } catch (err) {
      setMyths((prev) => prev.map((m) => m.id === myth.id ? { ...m, is_addressed: !next } : m));
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const openCount = myths.filter((m) => !m.is_addressed).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header */}
      <div className="glass-card" style={{
        padding: '1.35rem 1.5rem',
        background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-secondary-light))'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              fontSize: '0.72rem', color: 'var(--color-secondary)', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>
              <Sparkles size={13} /><span>Beliefs detected in this visit</span>
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '0.15rem' }}>
              Myth detection &amp; counselling
            </h3>
            <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
              Each script is written for this family, in their language, and can be played aloud.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span className="badge badge-moderate">{openCount} to counsel</span>
            {myths.length - openCount > 0 && (
              <span className="badge badge-mild">{myths.length - openCount} done</span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          display: 'flex', gap: '0.5rem', alignItems: 'center',
          background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.25)',
          borderRadius: 'var(--radius-sm)', padding: '0.7rem 0.9rem', fontSize: '0.86rem'
        }}>
          <AlertCircle size={16} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Immunization hesitancy — surfaced separately because it is a
          different kind of task from a dietary myth. */}
      {hesitancy?.detected && (
        <div className="glass-card" style={{
          padding: '1.2rem 1.35rem',
          borderLeft: '4px solid #B91C1C',
          background: 'rgba(185, 28, 28, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.5rem' }}>
            <Syringe size={16} style={{ color: '#B91C1C' }} />
            <strong style={{ fontSize: '0.95rem', color: '#991B1B' }}>Vaccine hesitancy detected</strong>
          </div>

          {hesitancy.stated_reason && (
            <p style={{ fontSize: '0.86rem', marginBottom: '0.6rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Family's reason: </span>
              <em>{hesitancy.stated_reason}</em>
            </p>
          )}

          {hesitancy.vaccines_mentioned?.length > 0 && (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
              Vaccines mentioned: {hesitancy.vaccines_mentioned.join(', ')}
            </p>
          )}

          {hesitancy.counseling_script && (
            <ScriptBox
              text={hesitancy.counseling_script}
              speaking={speakingId === 'hesitancy'}
              onSpeak={() => speak('hesitancy', hesitancy.counseling_script)}
              speechSupported={speechSupported}
            />
          )}
        </div>
      )}

      {/* Myth cards */}
      {myths.length === 0 && !hesitancy?.detected ? (
        <div style={{
          textAlign: 'center', padding: '2.5rem 1.25rem',
          border: '2px dashed var(--border-color)', borderRadius: 'var(--radius-sm)',
          color: 'var(--text-muted)'
        }}>
          <BookOpen size={34} style={{ color: 'var(--color-primary-light)', marginBottom: '0.6rem', strokeWidth: 1.5 }} />
          <p style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-main)' }}>No myths detected</p>
          <p style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
            Record a visit to check what the family believes against the medical evidence.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {myths.map((m, idx) => {
            const key = m.id || `m-${idx}`;
            const sev = SEVERITY[m.severity_impact] || SEVERITY.medium;
            const catalog = m.pregnancy_myths;
            const isSaving = savingId === m.id;

            return (
              <article
                key={key}
                className="glass-card"
                style={{
                  padding: '1.3rem 1.4rem',
                  borderLeft: `4px solid ${m.is_addressed ? 'var(--color-secondary)' : sev.color}`,
                  opacity: m.is_addressed ? 0.72 : 1,
                  transition: 'opacity var(--transition-fast)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                      <span style={{
                        fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.05em', color: sev.color, background: sev.bg,
                        border: `1px solid ${sev.color}33`, padding: '0.12rem 0.45rem', borderRadius: '3px'
                      }}>{sev.label}</span>
                      {catalog?.category && (
                        <span style={{
                          fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.05em', color: 'var(--color-primary)',
                          background: 'var(--color-primary-light)', border: '1px solid var(--border-color)',
                          padding: '0.12rem 0.45rem', borderRadius: '3px'
                        }}>{catalog.category}</span>
                      )}
                    </div>
                    <h4 style={{ fontSize: '1.08rem', fontWeight: 700 }}>
                      {m.myth_title || catalog?.myth_title || 'Detected belief'}
                    </h4>
                  </div>

                  <button
                    className={`btn ${m.is_addressed ? 'btn-secondary' : 'btn-outline'}`}
                    onClick={() => toggleAddressed(m)}
                    disabled={isSaving}
                    style={{ fontSize: '0.78rem', padding: '0.38rem 0.7rem', flexShrink: 0 }}
                  >
                    {isSaving
                      ? <Loader2 size={14} className="spin" />
                      : <CheckCircle size={14} />}
                    <span>{m.is_addressed ? 'Counselled' : 'Mark as counselled'}</span>
                  </button>
                </div>

                {/* What she actually said */}
                <div style={{
                  background: 'var(--color-secondary-light)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.7rem 0.9rem', marginBottom: '0.85rem'
                }}>
                  <div style={{
                    fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.2rem'
                  }}>
                    Heard in the visit
                  </div>
                  <p style={{ fontSize: '0.9rem', fontStyle: 'italic' }}>"{m.extracted_quote}"</p>
                </div>

                {/* The evidence */}
                <div style={{
                  borderLeft: '3px solid var(--color-primary)',
                  paddingLeft: '0.85rem', marginBottom: '0.9rem'
                }}>
                  <div style={{
                    fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.05em', color: 'var(--color-primary)', marginBottom: '0.2rem',
                    display: 'flex', alignItems: 'center', gap: '0.3rem'
                  }}>
                    <Shield size={12} /><span>What the evidence says</span>
                  </div>
                  <p style={{ fontSize: '0.88rem' }}>{m.explanation || catalog?.medical_fact}</p>

                  {catalog?.source && (
                    <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                      Source: {catalog.source_url ? (
                        <a href={catalog.source_url} target="_blank" rel="noopener noreferrer"
                          style={{ color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                          {catalog.source}<ExternalLink size={10} />
                        </a>
                      ) : catalog.source}
                    </p>
                  )}
                </div>

                {/* The script */}
                {m.counseling_script ? (
                  <ScriptBox
                    text={m.counseling_script}
                    speaking={speakingId === key}
                    onSpeak={() => speak(key, m.counseling_script)}
                    speechSupported={speechSupported}
                  />
                ) : (
                  <p style={{
                    fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic',
                    padding: '0.6rem 0.8rem', border: '1px dashed var(--border-color)',
                    borderRadius: 'var(--radius-sm)'
                  }}>
                    No counselling script was generated for this detection — explain the
                    evidence above in your own words.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScriptBox({ text, speaking, onSpeak, speechSupported }) {
  return (
    <div style={{
      background: 'rgba(139, 92, 246, 0.06)',
      border: '1px solid rgba(139, 92, 246, 0.22)',
      borderRadius: 'var(--radius-sm)', padding: '0.85rem 1rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
        <div style={{
          fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.05em', color: '#6d28d9',
          display: 'flex', alignItems: 'center', gap: '0.3rem'
        }}>
          <MessageCircle size={12} /><span>Say this to the family</span>
        </div>

        {speechSupported && (
          <button
            className="btn btn-outline"
            onClick={onSpeak}
            aria-label={speaking ? 'Stop reading aloud' : 'Read the script aloud'}
            style={{
              padding: '0.28rem 0.6rem', fontSize: '0.74rem', flexShrink: 0,
              borderColor: speaking ? 'var(--color-primary)' : 'var(--border-color)',
              color: speaking ? 'var(--color-primary)' : 'var(--text-main)'
            }}
          >
            {speaking ? <Square size={12} /> : <Volume2 size={12} />}
            <span>{speaking ? 'Stop' : 'Play aloud'}</span>
          </button>
        )}
      </div>

      <p style={{ fontSize: '0.95rem', lineHeight: 1.7 }}>{text}</p>
    </div>
  );
}
