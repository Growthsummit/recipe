import React from 'react';

// Positions of the four labels inside the 327 x 70 bar (taken from the Home frame).
const ITEMS = [
  { id: 'home', label: 'Home', left: 9 },
  { id: 'search', label: 'Search', left: 67 },
  { id: 'ai', label: 'AI Kitchen', left: 121 },
  { id: 'favourites', label: 'Favourites', left: 184 },
  { id: 'profile', label: 'Profile', left: 269 },
];

export default function BottomNav({ active, onChange }) {
  return (
    <nav className="nav" aria-label="Main">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`nav__item ${active === item.id ? 'nav__item--active' : ''}`}
          style={{ left: item.left }}
          aria-current={active === item.id ? 'page' : undefined}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
