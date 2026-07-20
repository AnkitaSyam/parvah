import React, { useState, useEffect } from 'react';
import { BookOpen, Search, ShieldCheck, Heart, AlertCircle, Sparkles } from 'lucide-react';
import { api } from '../lib/api';

export default function MythCatalog() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [myths, setMyths] = useState([]);
  const [loading, setLoading] = useState(false);

  const fallbackCatalog = [
    {
      id: 'm1',
      myth_title: 'Eclipse Exposure Causes Deformity',
      common_myth: 'Pregnant women must not step outside or look at the sun/moon during an eclipse or baby will be born with cleft lip.',
      medical_fact: 'Eclipses are natural astronomical events with zero biological impact on fetus growth. Cleft lips are genetic or caused by Folic Acid deficiency.',
      counseling_guidance: 'Counsel the family gently that stepping outside during an eclipse is safe. Emphasize taking daily Iron-Folic Acid (IFA) tablets.',
      category: 'Superstition'
    },
    {
      id: 'm2',
      myth_title: 'Eating Less in 1st Trimester Keeps Baby Small',
      common_myth: 'Eating normal meals during early pregnancy makes the baby grow too big for normal delivery, so women should reduce food intake.',
      medical_fact: 'Restricting food intake leads to maternal anemia, low birth weight (LBW), and fetal growth restriction. Mother needs extra nutrition.',
      counseling_guidance: 'Advise mother to eat 3 balanced meals plus 2 healthy snacks daily (dal, green vegetables, milk, eggs/pulses).',
      category: 'Nutrition'
    },
    {
      id: 'm3',
      myth_title: 'Saffron Milk Makes Baby Fair',
      common_myth: 'Drinking saffron (kesar) milk during pregnancy guarantees a fair skin complexion for the baby.',
      medical_fact: 'Skin complexion is entirely determined by genetics (melanin genes). Saffron provides aroma but has no influence on baby skin color.',
      counseling_guidance: 'Encourage drinking milk for its vital calcium and protein content rather than buying expensive saffron.',
      category: 'Nutrition'
    },
    {
      id: 'm4',
      myth_title: 'Iron-Folic Acid Tablets Make Fetus Dark',
      common_myth: 'Taking government-provided Iron and Folic Acid (IFA) tablets makes the baby skin dark or makes the baby too heavy.',
      medical_fact: 'IFA tablets prevent maternal anemia, postpartum hemorrhage, and preterm labor. They do not alter fetus skin color.',
      counseling_guidance: 'Strongly encourage taking 1 IFA tablet daily after meals with water. Reassure her that IFA saves mother and baby lives.',
      category: 'Medication'
    },
    {
      id: 'm5',
      myth_title: 'Ghee in 9th Month Lubricates Birth Canal',
      common_myth: 'Drinking large amounts of pure ghee or oil in the 9th month will grease the birth canal and make delivery smooth.',
      medical_fact: 'Ghee goes into the stomach and digestive system, not the birth canal. Excess fat causes diarrhea and cholesterol spikes.',
      counseling_guidance: 'Explain that uterine contractions naturally guide delivery, and excess ghee will only cause digestive distress.',
      category: 'Labor & Delivery'
    }
  ];

  useEffect(() => {
    async function loadCatalog() {
      setLoading(true);
      try {
        const data = await api.getMythsCatalog();
        if (data && data.length > 0) {
          setMyths(data);
        } else {
          setMyths(fallbackCatalog);
        }
      } catch (err) {
        console.warn('Could not fetch catalog from API, using fallback catalog:', err.message);
        setMyths(fallbackCatalog);
      } finally {
        setLoading(false);
      }
    }
    loadCatalog();
  }, []);

  const displayMyths = myths.length > 0 ? myths : fallbackCatalog;

  const filtered = displayMyths.filter(m => {
    const matchesSearch = m.myth_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          m.common_myth.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || m.category?.toLowerCase() === selectedCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header */}
      <div className="glass-card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.15), rgba(30, 41, 59, 0.8))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--color-secondary)', marginBottom: '0.25rem' }}>
              <BookOpen size={14} />
              <span>Fixed Reference Knowledge Base • Rural India</span>
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800' }}>Pregnancy Myths Reference Catalog</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Fixed database used by Groq AI to match field transcript beliefs against medical facts.
            </p>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search myth or fact..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: '#ffffff',
                  fontSize: '0.85rem'
                }}
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{
                padding: '0.55rem 0.85rem',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                color: '#ffffff',
                fontSize: '0.85rem'
              }}
            >
              <option value="all">All Categories</option>
              <option value="nutrition">Nutrition</option>
              <option value="superstition">Superstition</option>
              <option value="medication">Medication</option>
              <option value="labor & delivery">Labor & Delivery</option>
            </select>
          </div>
        </div>
      </div>

      {/* Myth Reference Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {filtered.map((m) => (
          <div key={m.id} className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span className="badge badge-mild" style={{ fontSize: '0.7rem' }}>
                  {m.category || 'General'}
                </span>
                <ShieldCheck size={18} color="var(--color-secondary)" />
              </div>

              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.5rem', color: '#ffffff' }}>
                {m.myth_title}
              </h3>

              <div style={{ marginBottom: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.65rem', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid #f87171' }}>
                <p style={{ fontSize: '0.8rem', color: '#f87171' }}>
                  <strong>Myth:</strong> "{m.common_myth}"
                </p>
              </div>

              <div style={{ marginBottom: '0.75rem', background: 'rgba(13, 148, 136, 0.1)', padding: '0.65rem', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-secondary)' }}>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-main)' }}>
                  <strong style={{ color: 'var(--color-secondary)' }}>Medical Fact:</strong> {m.medical_fact}
                </p>
              </div>
            </div>

            <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <strong>ASHA Guidance:</strong> {m.counseling_guidance}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
