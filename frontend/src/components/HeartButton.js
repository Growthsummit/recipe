import React from 'react';
import { useApp } from '../state/AppContext';

// "♡" when unsaved, "🖤" when saved (the saved glyph used on the Figma Favourites screen).
export default function HeartButton({ recipeId, className = '', style }) {
  const { isFavourite, toggleFavourite } = useApp();
  const saved = isFavourite(recipeId);
  return (
    <button
      type="button"
      className={`heart ${saved ? 'heart--saved' : ''} ${className}`}
      style={style}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from favourites' : 'Save to favourites'}
      onClick={(e) => { e.stopPropagation(); toggleFavourite(recipeId); }}
    >
      {saved ? '🖤' : '♡'}
    </button>
  );
}
