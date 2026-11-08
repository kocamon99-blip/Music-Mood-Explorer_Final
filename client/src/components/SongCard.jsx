import React from 'react';

function durationLabel(milliseconds) {
  if (!milliseconds) return '—';
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function SongCard({ song, onOpen, onPreview, onQueue, queueBusy }) {
  return (
    <article className="song-card" data-song-id={song.apiId}>
      <button className="cover-button" type="button" onClick={() => onOpen(song)} aria-label={`ดูรายละเอียด ${song.title}`}>
        <img src={song.image} alt="" loading="lazy" />
        <span className="cover-play" aria-hidden="true">↗</span>
      </button>
      <div className="song-card-info">
        <button className="song-title" type="button" onClick={() => onOpen(song)}>{song.title}</button>
        <span className="song-artist">{song.artist}</span>
        <div className="song-meta"><span>{song.apiGenre || 'ไม่ระบุประเภท'}</span><span>{durationLabel(song.duration)}</span></div>
      </div>
      <div className="song-actions">
        <button className="button button-quiet" type="button" disabled={!song.preview} onClick={() => onPreview(song)}>
          {song.preview ? '▶ Preview' : 'ไม่มี Preview'}
        </button>
        <button
          className="button button-queue"
          type="button"
          onClick={() => onQueue(song)}
          disabled={queueBusy}
          aria-label={`เพิ่ม ${song.title} เข้าคิว`}
        >
          + คิว
        </button>
      </div>
    </article>
  );
}
