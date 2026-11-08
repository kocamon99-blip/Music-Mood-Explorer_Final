import React from 'react';

export default function SearchBar({
  value,
  loading,
  history,
  onChange,
  onSubmit,
  onClear,
  onSelectHistory,
  onClearHistory,
}) {
  return (
    <section className="search-panel" aria-label="ค้นหาเพลง">
      <form className="search-form" role="search" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="song-search">ค้นหาชื่อเพลง ศิลปิน อัลบั้ม หรือแนวเพลง</label>
        <div className="search-input-wrap">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input
            id="song-search"
            type="search"
            value={value}
            onChange={event => onChange(event.target.value)}
            placeholder="ค้นหาชื่อเพลง ศิลปิน อัลบั้ม หรือแนวเพลง..."
            autoComplete="off"
          />
          {value && <button className="clear-search" type="button" onClick={onClear} aria-label="ล้างคำค้นหา">×</button>}
        </div>
        <button className="button button-primary search-submit" type="submit" disabled={loading}>
          {loading ? 'กำลังค้นหาเพลง…' : 'ค้นหาเพลง'}
        </button>
      </form>
      {loading && <p className="search-loading" role="status" aria-live="polite">กำลังค้นหาผลลัพธ์จริงจาก iTunes…</p>}
      {history.length > 0 && (
        <div className="search-history">
          <span className="muted small">ค้นหาล่าสุด</span>
          {history.map(term => (
            <button className="history-chip" key={term} type="button" onClick={() => onSelectHistory(term)}>{term}</button>
          ))}
          <button className="text-button" type="button" onClick={onClearHistory}>ล้างประวัติ</button>
        </div>
      )}
    </section>
  );
}
