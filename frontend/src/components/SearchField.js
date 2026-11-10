import React from 'react';
import { SearchIcon } from './Icons';

export default function SearchField({ value, onChange, placeholder, top, left, iconLeft, iconStyle }) {
  return (
    <>
      {iconLeft !== undefined && <SearchIcon className="search-icon" style={{ left: iconLeft, top, ...iconStyle }} />}
      <input
        className="search-input"
        style={{ top, left }}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Search recipes"
      />
    </>
  );
}
