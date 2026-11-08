import React from 'react';

const moodCopy = {
  chill: 'Drift into a softer state',
  happy: 'Find a brighter frequency',
  sad: 'Stay with the feeling',
  focus: 'Settle into your flow',
  energy: 'Turn the moment up',
};

const moodSymbols = {
  chill: '☾',
  happy: '✳',
  sad: '◌',
  focus: '⌖',
  energy: 'ϟ',
};

export default function MoodSelector({ moods, selectedMood, onSelect, loading, error, onRetry }) {
  return (
    <section className="mood-explorer" id="mood-explorer" aria-labelledby="mood-explorer-title">
      <div className="discover-section-heading">
        <div>
          <span className="section-kicker">SET THE TONE</span>
          <h2 id="mood-explorer-title">Mood explorer</h2>
        </div>
        <p>Choose the feeling. Let the music follow.</p>
      </div>
      {error && <div className="mood-load-error" role="alert">
          <span>{error}</span>
          <button className="button button-quiet" type="button" onClick={onRetry}>ลองโหลดอารมณ์อีกครั้ง</button>
        </div>}
      {moods.length > 0 ? (
        <div className="mood-card-grid" aria-label="รายการอารมณ์เพลง" aria-busy={loading}>
          {moods.map(mood => (
            <button
              className={`mood-card mood-${mood.key}${selectedMood === mood.key ? ' active' : ''}`}
              key={mood.key}
              type="button"
              aria-pressed={selectedMood === mood.key}
              onClick={() => onSelect(mood.key)}
            >
              <span className="mood-card-art" aria-hidden="true">
                <i>{moodSymbols[mood.key] || '✦'}</i>
                <b />
                <em />
              </span>
              <span className="mood-card-copy">
                <strong>{mood.label}</strong>
                <small>{moodCopy[mood.key] || 'Explore a sound for this moment'}</small>
              </span>
              <span className="mood-card-arrow" aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
      ) : loading ? (
        <div className="mood-card-grid" aria-label="กำลังโหลดรายการอารมณ์" aria-busy="true">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="mood-card mood-card-skeleton" key={`mood-skeleton-${index}`} aria-hidden="true"><span /><i /></div>
          ))}
        </div>
      ) : !error ? (
        <div className="mood-load-error" role="status">
          <span>ยังไม่มีรายการอารมณ์ให้เลือก</span>
          <button className="button button-quiet" type="button" onClick={onRetry}>ลองโหลดอารมณ์อีกครั้ง</button>
        </div>
      ) : null}
    </section>
  );
}
