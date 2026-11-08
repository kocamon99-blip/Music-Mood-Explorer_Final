import React from 'react';

export default function GenreFilter({ genres, value, onChange }) {
  return (
    <label className="genre-filter">
      <span className="muted small">ประเภท</span>
      <select value={value} onChange={event => onChange(event.target.value)} aria-label="กรองตามประเภทเพลง">
        <option value="all">ทุกประเภท</option>
        {genres.map(genre => <option value={genre} key={genre}>{genre}</option>)}
      </select>
    </label>
  );
}
