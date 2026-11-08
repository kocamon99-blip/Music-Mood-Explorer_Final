import React from 'react';

export default function HeroSection({ mood, loadedCount }) {
  return (
    <section className="hero discover-hero">
      <div className="hero-orbit hero-orbit-one" aria-hidden="true" />
      <div className="hero-orbit hero-orbit-two" aria-hidden="true" />
      <div className="hero-copy">
        <span className="eyebrow"><span className="status-dot" /> A SOUNDTRACK FOR YOUR MOMENT</span>
        <h1>Welcome to your<br /><em>own universe.</em></h1>
        <p>Explore real music shaped around your mood. Find a quieter moment, a brighter rhythm, or a new sound to make your own.</p>
        <div className="hero-stats">
          <span><strong>{loadedCount}</strong> real tracks discovered</span>
          <span><strong>{mood || '—'}</strong> selected mood</span>
        </div>
        <a className="button button-primary hero-action" href="#mood-explorer">Explore music <span aria-hidden="true">↗</span></a>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="hero-disc"><span>♫</span></div>
        <div className="sound-wave"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
      </div>
      <span className="hero-edition">VOL. 01 <i /> YOUR SOUND, YOUR SCENE</span>
    </section>
  );
}
