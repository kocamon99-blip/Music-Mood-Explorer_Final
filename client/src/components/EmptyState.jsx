import React from 'react';

export default function EmptyState({ title, message, actionLabel, onAction }) {
  return (
    <div className="state-card" role="status">
      <span className="state-icon" aria-hidden="true">♫</span>
      <h3>{title}</h3>
      <p>{message}</p>
      {actionLabel && onAction && (
        <button className="button button-quiet" type="button" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}
