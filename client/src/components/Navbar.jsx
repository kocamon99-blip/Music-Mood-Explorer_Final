import React, { useEffect, useState } from 'react';

const sections = [
  { id: 'discover', label: 'Discover', icon: '✦' },
  { id: 'library', label: 'Library', icon: '◈' },
  { id: 'queue', label: 'Queue', icon: '♫' },
  { id: 'history', label: 'History', icon: '↺' },
];

export default function Navbar() {
  const [activeSection, setActiveSection] = useState('discover');

  useEffect(() => {
    const targets = sections
      .map(section => document.getElementById(section.id))
      .filter(Boolean);
    if (!targets.length) return undefined;

    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((first, second) => first.boundingClientRect.top - second.boundingClientRect.top);
      if (visible[0]) setActiveSection(visible[0].target.id);
    }, {
      rootMargin: '-18% 0px -65% 0px',
      threshold: 0,
    });

    targets.forEach(target => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  return (
    <header className="site-header">
      <a
        className="brand"
        href="#discover"
        aria-label="Music Mood Explorer home"
        onClick={() => setActiveSection('discover')}
      >
        <span className="brand-mark" aria-hidden="true">♫</span>
        <span className="brand-copy"><strong>NOCTURNE</strong><small> MUSIC EXPLORER</small></span>
      </a>
      <nav className="navbar" aria-label="Main navigation">
        <span className="nav-caption">YOUR SPACE</span>
        {sections.map(section => (
          <a
            className={`nav-link${activeSection === section.id ? ' active' : ''}`}
            href={`#${section.id}`}
            key={section.id}
            aria-current={activeSection === section.id ? 'location' : undefined}
            onClick={() => setActiveSection(section.id)}
          >
            <span className="nav-icon" aria-hidden="true">{section.icon}</span>
            <span>{section.label}</span>
            {activeSection === section.id && <span className="nav-active-mark" aria-hidden="true" />}
          </a>
        ))}
        <div className="nav-footnote">
          <span className="nav-footnote-glow" aria-hidden="true" />
          <span>Curate your<br />own atmosphere</span>
        </div>
      </nav>
    </header>
  );
}
