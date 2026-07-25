import React, { useState, useEffect } from 'react';
import { BookOpen, Search, ShieldCheck, Heart, AlertCircle, Sparkles } from 'lucide-react';
import { api } from '../lib/api';

export default function MythCatalog() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [myths, setMyths] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadCatalog() {
      setLoading(true);
      try {
        const data = await api.getMythsCatalog();
        setMyths(data || []);
      } catch (err) {
        console.warn('Could not fetch the canonical myth catalog:', err.message);
        setMyths([]);
      } finally {
        setLoading(false);
      }
    }
    loadCatalog();
  }, []);

  const displayMyths = myths;

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
        {!loading && filtered.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>No myths are available from the canonical catalog.</p>
        )}
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
