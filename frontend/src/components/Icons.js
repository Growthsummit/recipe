import React from 'react';

// Material "star" (filled) - the Figma file uses the Material 3 Design Kit star_filled component.
export function StarIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}

export function SearchIcon({ className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 32 33" width="32" height="33" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
      <circle cx="13.5" cy="14" r="9" />
      <line x1="20.5" y1="21" x2="28" y2="28.5" />
    </svg>
  );
}
