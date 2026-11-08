import React from 'react';

function formatTimestamp(value) {
  if (!value) return 'เวลาไม่ระบุ';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function actionLabel(item) {
  switch (item.action) {
    case 'WATCH': return 'กำลังฟัง';
    case 'REMOVE': return 'นำออกจากคิว';
    case 'CLEAR': return `ล้างคิว · ${item.count || item.songs?.length || 0} เพลง`;
    default: return 'เพิ่มเข้าคิว';
  }
}

export default function HistoryPanel({ history, busy, loading, error, onRetry, onUndo }) {
  return (
    <section className="panel side-panel" id="history" aria-labelledby="history-title" aria-busy={loading}>
      <div className="panel-heading">
        <div><span className="section-kicker">RECENT ACTIVITY · STACK</span><h2 id="history-title">ประวัติการฟัง</h2></div>
        <span className="count-badge" aria-label={`${history.length} รายการในประวัติ`}>{history.length}</span>
      </div>
      <button
        className="button button-quiet undo-button"
        type="button"
        onClick={onUndo}
        disabled={!history.length || busy || loading || Boolean(error)}
        aria-label="ย้อนกลับการกระทำล่าสุด"
      >
        ↶ Undo ล่าสุด
      </button>
      {loading
        ? <p className="side-empty" role="status">กำลังโหลดประวัติ…</p>
        : error
          ? <div className="collection-error" role="alert">
              <p>โหลดประวัติไม่สำเร็จ: {error}</p>
              <button className="button button-quiet" type="button" onClick={onRetry}>ลองโหลดอีกครั้ง</button>
            </div>
          : history.length === 0
            ? <p className="side-empty" role="status">ยังไม่มีประวัติ · เพิ่มเพลงเข้าคิวหรือเริ่มฟังเพื่อบันทึกกิจกรรม</p>
            : <ol className="history-list" aria-label="ประวัติล่าสุด เรียงจากใหม่ไปเก่า">
                {history.map((item, index) => (
                  <li key={`${item.time}-${item.action}-${item.song?.id || 'queue'}-${index}`}>
                    <span className="history-dot" aria-hidden="true" />
                    <span className="history-entry">
                      <strong>{actionLabel(item)}{item.action !== 'CLEAR' && item.song?.title ? ` · ${item.song.title}` : ''}</strong>
                      {item.action !== 'CLEAR' && item.song?.artist && <small>{item.song.artist}</small>}
                      {item.action === 'CLEAR' && <small>Undo เพื่อคืนลำดับคิวเดิมได้</small>}
                      <time dateTime={item.timestamp || undefined}>{formatTimestamp(item.timestamp || item.time)}</time>
                    </span>
                  </li>
                ))}
              </ol>}
    </section>
  );
}
