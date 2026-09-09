import React, { useState, useEffect } from 'react';
import { BookOpen, Search, ShieldCheck, Heart, AlertCircle, Sparkles } from 'lucide-react';
import { api } from '../lib/api';

export default function MythCatalog() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [myths, setMyths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      setLoading(true);
      try {
        const data = await api.getMythsCatalog();
        if (!cancelled) { setMyths(data || []); setLoadError(''); }
      } catch (err) {
        // Previously swallowed, so a failed fetch looked identical to an
        // empty catalog and there was nothing to act on.
        if (!cancelled) { setLoadError(err.message); setMyths([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCatalog();
    return () => { cancelled = true; };
  }, []);

  const displayMyths = myths;

  const categories = [...new Set(myths.map((m) => m.category).filter(Boolean))].sort();

  const filtered = displayMyths.filter(m => {
    const matchesSearch = (m.myth_title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (m.common_myth || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || m.category?.toLowerCase() === selectedCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header */}
      <div className="glass-card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-secondary-light))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--color-secondary)', marginBottom: '0.25rem' }}>
              <BookOpen size={14} />
              <span>Fixed Reference Knowledge Base • Rural India</span>
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-main)' }}>Pregnancy Myths Reference Catalog</h2>
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
                  background: '#ffffff',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem'
                }}
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{
                padding: '0.55rem 0.85rem',
                background: '#ffffff',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-main)',
                fontSize: '0.85rem'
              }}
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c.toLowerCase()}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Sparkles size={26} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
          <p style={{ fontSize: '0.9rem' }}>Loading the myth catalog…</p>
        </div>
      )}

      {loadError && (
        <div style={{
          display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
          background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.25)',
          borderRadius: 'var(--radius-sm)', padding: '0.85rem 1rem', fontSize: '0.87rem'
        }}>
          <AlertCircle size={16} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: '2px' }} />
          <span>
            Could not load the catalog: {loadError}
            <br />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              If the database is new, run <code>npm run seed:myths</code> in the backend folder.
            </span>
          </span>
        </div>
      )}

      {/* Myth Reference Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {!loading && !loadError && filtered.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>
            {myths.length === 0
              ? 'The myth catalog is empty. Run `npm run seed:myths` in the backend folder.'
              : 'No myths match this search.'}
          </p>
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

              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                {m.myth_title}
              </h3>

              <div style={{ marginBottom: '0.75rem', background: 'rgba(220, 38, 38, 0.05)', padding: '0.65rem', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-danger)' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-danger)' }}>
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
              <strong>Say to the family:</strong> {m.counseling_guidance}
            </div>

            {m.source && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Source:{' '}
                {m.source_url ? (
                  <a href={m.source_url} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--color-primary)' }}>
                    {m.source}
                  </a>
                ) : m.source}
              </div>
            )}
          </div>
        ))}
      </div>

    </div>
  );
}
