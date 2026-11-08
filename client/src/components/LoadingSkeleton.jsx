import React from 'react';

export default function LoadingSkeleton({ count = 8 }) {
  return (
    <div className="song-grid" role="status" aria-label="กำลังโหลดเพลง" aria-busy="true">
      <span className="sr-only">กำลังโหลดเพลงจริงจาก iTunes…</span>
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-card" key={index}>
          <div className="skeleton-art" />
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
        </div>
      ))}
    </div>
  );
}
