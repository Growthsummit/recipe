import React, { useEffect, useState } from 'react';
import RecipeCard from '../components/RecipeCard';
import SearchField from '../components/SearchField';
import { CATEGORIES, TRENDING } from '../data/recipes';
import { api } from '../services/api';

/** "Desserts" (a category tile) must filter by category, not free text. */
function categorySlugFor(query) {
  const value = String(query || '').trim().toLowerCase();
  const match = CATEGORIES.find(
    (c) => c.label.toLowerCase() === value || c.query.toLowerCase() === value
  );
  return match ? match.query.toLowerCase() : null;
}

export default function Search({ query, setQuery, onOpenRecipe }) {
  const searching = query.trim().length > 0;
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!searching) {
      setResults([]);
      setError('');
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    const category = categorySlugFor(query);
    const request = category
      ? api.recipes.list({ category, limit: 50 })
      : api.recipes.list({ q: query.trim(), limit: 50 });

    request
      .then((data) => {
        if (cancelled) return;
        setResults(data?.items || []);
        setError('');
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [query, searching]);

  return (
    <div className="screen">
      <div className="canvas" style={{ minHeight: 852, paddingBottom: 130 }}>
        <div style={{ position: 'relative', height: searching ? 294 : 760 }}>
          <h1 className="h-title" style={{ position: 'absolute', left: 20, top: 54 }}>Find a Recipe</h1>
          <p style={{ position: 'absolute', left: 20, top: 83, fontSize: 14, color: 'var(--muted)' }}>Search for something delicious</p>
          <SearchField value={query} onChange={setQuery} placeholder="String value" top={159} left={73} iconLeft={18} />

          {!searching && (
            <>
              <h2 className="h-section" style={{ position: 'absolute', left: 0, right: 0, top: 241 }}>Browse Categories</h2>
              <div className="tile-grid">
                {CATEGORIES.map((c) => (
                  <button key={c.label} type="button" className="tile" onClick={() => setQuery(c.query)}>
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
              <h2 className="h-section" style={{ position: 'absolute', left: 0, right: 0, top: 489 }}>Trending Recipes</h2>
              <div className="trend-grid">
                {TRENDING.map((t) => (
                  <RecipeCard
                    key={t.key}
                    small
                    withHeart={false}
                    title={t.title}
                    rating={t.rating}
                    time={t.time}
                    image={t.image}
                    onOpen={() => onOpenRecipe(t.slug)}
                  />
                ))}
              </div>
            </>
          )}
          {searching && <h2 className="h-section" style={{ position: 'absolute', left: 0, right: 0, top: 241 }}>Search Results</h2>}
        </div>

        {searching && (
          <div className="card-stack" style={{ gap: 46 }}>
            {loading && <p className="status">Searching…</p>}
            {!loading && error && <p className="status status--error">{error}</p>}
            {!loading && !error && results.length === 0 && (
              <p className="status">No recipes found for “{query}”.</p>
            )}
            {!loading && !error && results.map((r) => (
              <RecipeCard key={r.id} recipe={r} onOpen={() => onOpenRecipe(r.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
