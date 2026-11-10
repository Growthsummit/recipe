import React, { useEffect, useState } from 'react';
import { StarIcon } from '../components/Icons';
import { useApp } from '../state/AppContext';
import { api } from '../services/api';

export default function Favourites({ onOpenRecipe }) {
  const { toggleFavourite, isAuthenticated, initialising, requireAuth, favourites, favouritesCount } = useApp();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) { setItems([]); return undefined; }

    let cancelled = false;
    setLoading(true);
    api.favourites
      .list({ limit: 50 })
      .then((data) => {
        if (cancelled) return;
        setItems(data?.items || []);
        setError('');
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // `favourites` intentionally in the deps: removing a favourite anywhere in
    // the app should refresh this list from the database.
  }, [isAuthenticated, favourites]);

  const header = (
    <div style={{ position: 'relative', height: 137 }}>
      <h1 className="h-title" style={{ position: 'absolute', left: 22, top: 56 }}>My Favourites</h1>
      <p style={{ position: 'absolute', left: 22, top: 85, fontSize: 16, color: 'var(--muted)' }}>Your saved recipes in one place </p>
      {isAuthenticated && <p style={{ position: 'absolute', left: 22, top: 112, fontSize: 12, color: 'var(--muted)' }}>{favouritesCount * 2} MB used · {500 - favouritesCount * 2} MB left</p>}
    </div>
  );

  if (initialising) {
    return (
      <div className="screen">
        <div className="canvas" style={{ paddingBottom: 130 }}>
          {header}
          <p className="status">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="screen">
        <div className="canvas" style={{ paddingBottom: 130 }}>
          {header}
          <div className="auth-card" style={{ marginTop: 40 }}>
            <h2>Sign in to see your favourites</h2>
            <p>Favourites are saved to your RecipeBox account.</p>
            <button type="button" className="btn-primary" onClick={requireAuth}>Sign in</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="canvas" style={{ paddingBottom: 130 }}>
        {header}
        {loading && <p className="status">Loading favourites…</p>}
        {!loading && error && <p className="status status--error">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="status">You have not saved any recipes yet.</p>
        )}
        {!loading && !error && items.map((r) => (
          <div key={r.id} className="fav-card">
            <button type="button" className="rcard__open" style={{ borderRadius: 16 }} onClick={() => onOpenRecipe(r.id)} aria-label={`Open ${r.title}`} />
            <div className="photo"><img src={r.image} alt="" /></div>
            <p className="fav-card__title">{r.title}</p>
            <StarIcon className="fav-card__star" />
            <p className="fav-card__rating">{r.rating}</p>
            <p className="fav-card__time">{r.time}</p>
            <button type="button" className="fav-heart" aria-label="Remove from favourites" onClick={() => toggleFavourite(r.id)}>🖤</button>
          </div>
        ))}
      </div>
    </div>
  );
}
