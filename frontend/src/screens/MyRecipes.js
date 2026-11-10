import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../state/AppContext';
import { api } from '../services/api';

/** The signed-in user's own recipes (including drafts). */
export default function MyRecipes({ onBack, onOpenRecipe, onCreate, onEdit }) {
  const { isAuthenticated, requireAuth } = useApp();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    api.recipes
      .mine({ limit: 50 })
      .then((data) => { setItems(data?.items || []); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  useEffect(() => { load(); }, [load]);

  const remove = async (recipe) => {
    if (!window.confirm(`Delete “${recipe.title}”? This cannot be undone.`)) return;
    try {
      await api.recipes.remove(recipe.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="screen">
      <div className="canvas" style={{ paddingBottom: 130 }}>
        <button type="button" className="back-lt" onClick={onBack} aria-label="Back">&lt;</button>
        <h1 className="h-title" style={{ position: 'absolute', left: 20, top: 50 }}>My Recipes</h1>
        <p style={{ position: 'absolute', left: 20, top: 79, fontSize: 14, color: 'var(--muted)' }}>Recipes you created</p>

        {!isAuthenticated ? (
          <div className="auth-card" style={{ marginTop: 140 }}>
            <h2>Sign in to manage your recipes</h2>
            <button type="button" className="btn-primary" onClick={requireAuth}>Sign in</button>
          </div>
        ) : (
          <>
            <button type="button" className="btn-primary" style={{ marginTop: 130, marginLeft: 33 }} onClick={onCreate}>
              + New recipe
            </button>

            <div style={{ marginTop: 24 }}>
              {loading && <p className="status">Loading your recipes…</p>}
              {!loading && error && <p className="status status--error">{error}</p>}
              {!loading && !error && items.length === 0 && (
                <p className="status">You have not created any recipes yet.</p>
              )}
              {!loading && !error && items.map((r) => (
                <div key={r.id} className="fav-card">
                  <button type="button" className="rcard__open" style={{ borderRadius: 16 }} onClick={() => onOpenRecipe(r.id)} aria-label={`Open ${r.title}`} />
                  <div className="photo"><img src={r.image || r.imageUrl} alt={`${r.title} recipe`} /></div>
                  <p className="fav-card__title">{r.title}</p>
                  <p className="fav-card__time">{r.time || '—'}</p>
                  <p className="fav-card__rating">{r.isPublished ? 'Published' : 'Draft'}</p>
                  <div className="myrecipe-actions">
                    <button type="button" className="packet" onClick={() => onEdit(r)}>Edit</button>
                    <button type="button" className="packet packet--danger" onClick={() => remove(r)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
