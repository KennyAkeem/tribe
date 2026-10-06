"use client";

import { useEffect, useMemo, useState } from "react";

const confettiPalette = [
  "#f4b942",
  "#e7826e",
  "#66a37b",
  "#9ac5d1",
  "#d9a6d0",
  "#7ea8df",
  "#f6d58d",
];

export default function ConfettiPreloader() {
  const [visible, setVisible] = useState(true);

  const confetti = useMemo(() => Array.from({ length: 28 }, (_, index) => ({
    id: index,
    left: `${(index * 29) % 100}%`,
    delay: `${(index % 7) * 0.12}s`,
    duration: `${2.2 + ((index * 13) % 18) / 10}s`,
    size: `${8 + (index % 5) * 3}px`,
    color: confettiPalette[index % confettiPalette.length],
    xShift: `${((index % 9) - 4) * 16}px`,
    tilt: `${(index % 7) * 45}deg`,
  })), []);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="confetti-preloader" aria-live="polite" aria-busy="true">
      <div className="confetti-preloader-backdrop" />
      <div className="confetti-preloader-scene" aria-label="Loading Tribe">
        <div className="confetti-pieces" aria-hidden="true">
          {confetti.map((piece) => (
            <span
              key={piece.id}
              className="confetti-piece"
              style={{
                left: piece.left,
                width: piece.size,
                height: piece.size,
                background: piece.color,
                animationDelay: piece.delay,
                animationDuration: piece.duration,
                "--x-shift": piece.xShift,
                "--tilt": piece.tilt,
              }}
            />
          ))}
        </div>

        <div className="preloader-card">
          <div className="preloader-brand" aria-hidden="true">
            <span className="brand-mark compact">
              <span />
              <span />
            </span>
            <span>Tribe</span>
          </div>

          <div className="preloader-progress" aria-hidden="true">
            <span />
          </div>

          <div className="preloader-text">
            <strong>Gathering your people</strong>
            <small>Loading community vibes…</small>
          </div>
        </div>
      </div>
    </div>
  );
}
