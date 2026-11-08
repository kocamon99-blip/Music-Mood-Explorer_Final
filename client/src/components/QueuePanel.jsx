import React from 'react';

export default function QueuePanel({
  queue,
  status,
  busy,
  loading,
  error,
  onRetry,
  onPlay,
  onStop,
  onRemoveNext,
  onRemoveSong,
  onClear,
}) {
  function confirmClear() {
    if (queue.length && window.confirm(`ต้องการล้างเพลง ${queue.length} รายการออกจากคิวหรือไม่?`)) {
      onClear();
    }
  }

  return (
    <section className="panel side-panel" id="queue" aria-labelledby="queue-title" aria-busy={loading}>
      <div className="panel-heading">
        <div><span className="section-kicker">UP NEXT · FIFO</span><h2 id="queue-title">คิวฟัง</h2></div>
        <span className="count-badge" aria-label={`${queue.length} เพลงในคิว`}>{queue.length}</span>
      </div>
      <p className="panel-status" role="status" aria-live="polite">{status}</p>
      {!error && (
        <div className="panel-actions">
          <button className="button button-primary" type="button" onClick={onPlay} disabled={!queue.length || busy || loading}>
            ▶ เล่นคิว
          </button>
          <button className="button button-quiet" type="button" onClick={onStop} disabled={loading}>
            หยุด
          </button>
          <button className="button button-quiet queue-clear" type="button" onClick={confirmClear} disabled={!queue.length || busy || loading}>
            ล้างคิว
          </button>
        </div>
      )}
      {loading
        ? <p className="side-empty" role="status">กำลังโหลดคิวและประวัติ…</p>
        : error
          ? <div className="collection-error" role="alert">
              <p>โหลดคิวไม่สำเร็จ: {error}</p>
              <button className="button button-quiet" type="button" onClick={onRetry}>ลองโหลดอีกครั้ง</button>
            </div>
          : queue.length === 0
            ? <p className="side-empty" role="status">คิวยังว่าง · เพิ่มเพลงจาก Music Library แล้วเพลงจะปรากฏที่นี่</p>
            : <ol className="queue-list" aria-label="รายการเพลงในคิว เรียงตามลำดับที่จะเล่น">
                {queue.map((song, index) => (
                  <li key={`${song.id}-${index}`}>
                    <span className="queue-index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="queue-track">
                      <strong>{song.title}</strong>
                      <small>{song.artist}</small>
                    </span>
                    <div className="queue-item-actions">
                      {index === 0 && (
                        <button className="icon-button" type="button" onClick={onRemoveNext} disabled={busy} aria-label={`เล่นเพลงถัดไป ${song.title}`}>
                          ▶
                        </button>
                      )}
                      <button
                        className="icon-button queue-remove"
                        type="button"
                        onClick={() => onRemoveSong(index)}
                        disabled={busy}
                        aria-label={`นำ ${song.title} ออกจากคิว`}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ol>}
    </section>
  );
}
