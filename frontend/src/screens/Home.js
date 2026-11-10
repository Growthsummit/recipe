import React, { useEffect, useState } from 'react';
import RecipeCard from '../components/RecipeCard';
import SearchField from '../components/SearchField';
import { CATEGORIES } from '../data/recipes';
import { api } from '../services/api';

export default function Home({ onOpenRecipe, onOpenCategory }) {
  const [query, setQuery] = useState('');
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      const request = query.trim()
        ? api.recipes.list({ limit: 50, q: query.trim() })
        : Promise.all(CATEGORIES.map((category) =>
            api.recipes.list({ limit: 2, category: category.query.toLowerCase() })
          )).then((responses) => ({ items: responses.flatMap((response) => response?.items || []) }));
      request
        .then((data) => {
          if (cancelled) return;
          setRecipes(data?.items || []);
          setError('');
        })
        .catch((err) => {
          if (!cancelled) setError(err.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, query.trim() ? 300 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const visible = recipes;

  return (
    <div className="screen">
      <div className="canvas" style={{ paddingBottom: 130 }}>
        <div style={{ position: 'relative', height: 317 }}>
          <h1 className="h-brand">RecipeBox</h1>
          <p className="t-welcome">Welcome!</p>
          <p className="t-sub">What are you cooking?</p>
          <SearchField value={query} onChange={setQuery} placeholder="Search Recipes.." top={189} left={66} />
          <h2 className="h-section" style={{ position: 'absolute', left: 0, right: 0, top: 256 }}>Popular Recipes</h2>
        </div>

        <div className="card-stack">
          {loading && <p className="status">Loading recipes…</p>}
          {!loading && error && <p className="status status--error">{error}</p>}
          {!loading && !error && query.trim() && visible.length === 0 && (
            <p className="status">No recipes match “{query}”.</p>
          )}
          {!loading && !error && visible.map((r) => (
            <RecipeCard key={r.id} recipe={r} onOpen={() => onOpenRecipe(r.id)} />
          ))}
        </div>

        <h2 className="h-section" style={{ marginTop: 31 }}>Categories</h2>
        <div className="cat-grid">
          {CATEGORIES.map((c) => (
            <button key={c.label} type="button" className="cat-btn" onClick={() => onOpenCategory(c.query)}>{c.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
