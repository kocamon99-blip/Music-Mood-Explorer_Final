import React from 'react';

export default function ErrorState({ title = 'โหลดข้อมูลไม่สำเร็จ', message, onRetry }) {
  return (
    <div className="state-card error-state" role="alert">
      <span className="state-icon" aria-hidden="true">!</span>
      <h3>{title}</h3>
      <p>{message}</p>
      {onRetry && <button className="button button-primary" type="button" onClick={onRetry}>ลองอีกครั้ง</button>}
    </div>
  );
}
