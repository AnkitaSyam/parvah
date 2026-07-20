import React, { useState } from 'react';
import { BookOpen, CheckCircle, AlertCircle, MessageCircle, Sparkles, Shield, ChevronRight } from 'lucide-react';

export default function MythDebunker({ detectedMyths = [], onAddressMyth }) {
  const defaultDetected = [
    {
      id: 'dm-1',
      myth_title: 'Solar Eclipse Exposure Superstition',
      extracted_quote: 'सूर्यग्रहण के दौरान बाहर निकलने से बच्चे पर दाग पड़ता है इसलिए उसे बाहर नहीं निकलने दिया',
      explanation: 'Eclipses are astronomical events with zero biological impact on fetus genetics. Cleft lips and birthmarks are genetic or caused by Folic Acid deficiency.',
      severity_impact: 'medium',
      is_addressed: false,
      counseling_script: 'दीदी, सूर्यग्रहण खगोलीय घटना है। इससे पेट में बच्चे को कोई नुकसान नहीं होता। बच्चे के अंग सही बनने के लिए रोज फॉलिक एसिड की लाल गोली खाना जरूरी है।'
    },
    {
      id: 'dm-2',
      myth_title: 'Iron-Folic Acid Tablets Cause Dark Baby Skin',
      extracted_quote: 'आयरन की गोलियां (IFA tablets) खाने से मना किया है क्योंकि लोहे की गोली से बच्चे का रंग काला हो जाता है',
      explanation: 'Skin color is 100% determined by genetic melanin, not iron tablets. IFA tablets prevent severe anemia and maternal hemorrhage during delivery.',
      severity_impact: 'high',
      is_addressed: false,
      counseling_script: 'रंग भगवान की देन और माता-पिता के जीन पर निर्भर करता है। लोहे की गोली शरीर में खून बनाती है। खून की कमी से प्रसव में जान का खतरा होता है, इसलिए रोज 1 गोली खाना अनिवार्य है।'
    }
  ];

  const mythsList = detectedMyths.length > 0 ? detectedMyths : defaultDetected;
  const [addressedMap, setAddressedMap] = useState({});

  const toggleAddress = (id) => {
    setAddressedMap(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Module Header */}
      <div className="glass-card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(225, 29, 72, 0.15), rgba(139, 92, 246, 0.15))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#fda4af', marginBottom: '0.25rem' }}>
              <Sparkles size={14} />
              <span>AI Myth Debunker • Verified Rural India Database</span>
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800' }}>Pregnancy Myth Detection & Counselling Guidance</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Groq LLM extracts beliefs expressed in visit audio, compares them against fixed medical evidence, and provides ASHA counselling scripts.
            </p>
          </div>

          <div className="badge badge-mild" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
            {mythsList.length} Beliefs Detected
          </div>
        </div>
      </div>

      {/* Myth Cards Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {mythsList.map((m, idx) => {
          const mythId = m.id || `m-${idx}`;
          const isAddressed = addressedMap[mythId] || m.is_addressed;

          return (
            <div
              key={mythId}
              className="glass-card"
              style={{
                padding: '1.5rem',
                border: isAddressed ? '1px solid var(--color-secondary)' : '1px solid var(--border-color)',
                opacity: isAddressed ? 0.75 : 1
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                <div>
                  <span className="badge badge-moderate" style={{ marginBottom: '0.35rem' }}>
                    Myth Category: Superstition / Nutrition
                  </span>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: '700' }}>{m.myth_title || 'Detected Pregnancy Myth'}</h3>
                </div>

                <button
                  className={`btn ${isAddressed ? 'btn-secondary' : 'btn-outline'}`}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                  onClick={() => toggleAddress(mythId)}
                >
                  <CheckCircle size={16} />
                  <span>{isAddressed ? 'Counselled & Resolved ✓' : 'Mark as Counselled'}</span>
                </button>
              </div>

              {/* Extracted Quote */}
              <div style={{
                background: 'rgba(225, 29, 72, 0.1)',
                border: '1px solid rgba(225, 29, 72, 0.3)',
                padding: '0.85rem 1rem',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1rem'
              }}>
                <p style={{ fontSize: '0.85rem', color: '#fda4af' }}>
                  <strong>Extracted Audio Quote:</strong> "{m.extracted_quote}"
                </p>
              </div>

              {/* Grid Comparison: Myth vs Medical Fact */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '1rem', borderRadius: 'var(--radius-sm)', borderLeft: '4px solid #f87171' }}>
                  <h4 style={{ fontSize: '0.9rem', color: '#f87171', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <AlertCircle size={16} />
                    <span>Common Rural Myth</span>
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {m.extracted_quote}
                  </p>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '1rem', borderRadius: 'var(--radius-sm)', borderLeft: '4px solid var(--color-secondary)' }}>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--color-secondary)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Shield size={16} />
                    <span>Verified Medical Fact</span>
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>
                    {m.explanation}
                  </p>
                </div>

              </div>

              {/* ASHA Counselling Script Box */}
              <div style={{
                background: 'rgba(139, 92, 246, 0.1)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                borderRadius: 'var(--radius-sm)',
                padding: '1rem'
              }}>
                <h4 style={{ fontSize: '0.875rem', color: '#c084fc', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <MessageCircle size={16} />
                  <span>ASHA Field Counselling Script (Hindi / Regional)</span>
                </h4>
                <p style={{ fontSize: '0.9rem', color: '#ffffff', fontStyle: 'italic' }}>
                  "{m.counseling_script || 'दीदी, यह भ्रांति गलत है। मेडिकल जांच के अनुसार गर्भावस्था में पौष्टिक आहार और डॉक्टर की दवा बेहद आवश्यक है।'}"
                </p>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
