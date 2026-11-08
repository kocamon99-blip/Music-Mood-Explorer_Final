import React, { useEffect, useRef } from 'react';

function durationLabel(milliseconds) {
  if (!milliseconds) return '—';
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function SongModal({ song, onClose, onPreview, playingSong }) {
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!song) return undefined;

    const previousFocus = document.activeElement;
    closeButtonRef.current?.focus();
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const dialog = document.querySelector('.song-modal');
      const focusable = dialog?.querySelectorAll('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [song]);

  if (!song) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="song-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button ref={closeButtonRef} className="modal-close" type="button" aria-label="ปิดรายละเอียด" onClick={onClose}>×</button>
        <img className="modal-art" src={song.image} alt="" />
        <span className="section-kicker">TRACK DETAILS</span>
        <h2 id="modal-title">{song.title}</h2>
        <p className="modal-artist">{song.artist}</p>
        <dl className="details-grid">
          <div><dt>อัลบั้ม</dt><dd>{song.album || 'ไม่ระบุ'}</dd></div>
          <div><dt>ประเภท</dt><dd>{song.apiGenre || 'ไม่ระบุ'}</dd></div>
          <div><dt>ความยาว</dt><dd>{durationLabel(song.duration)}</dd></div>
          <div><dt>อารมณ์</dt><dd>{song.mood || '—'}</dd></div>
        </dl>
        <div className="modal-actions">
          {song.preview && <button className="button button-primary" type="button" onClick={() => onPreview(song)}>▶ ฟังตัวอย่าง</button>}
          {song.url && song.url !== '#' && <a className="button button-quiet" href={song.url} target="_blank" rel="noreferrer">เปิดใน iTunes ↗</a>}
        </div>
        {playingSong?.id === song.id && song.preview && <p className="modal-playing">♫ ตัวอย่างกำลังเล่นในเครื่องเล่นด้านล่าง</p>}
      </section>
    </div>
  );
}
