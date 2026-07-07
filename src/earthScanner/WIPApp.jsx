/* earthScanner/WIPApp — WIP harness. Renders <EarthScanner> and exposes sliders
   to tune it. Not part of the shipped component — just a dev playground. */

import { useState, useEffect } from "react";
import { EarthScanner } from "./EarthScanner.jsx";

export function WIPApp() {
  const [earthImageSize, setEarthImageSize] = useState(320);
  const [scannedFraction, setScannedFraction] = useState(0.35);
  const [glowPx, setGlowPx] = useState(2.6);
  const [dotCount, setDotCount] = useState(10);
  const [playing, setPlaying] = useState(false);

  // Play: ramp scannedFraction 0→1 over SWEEP_MS, then wrap back to 0 and repeat.
  const SWEEP_MS = 6000;
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now) => {
      const dt = now - last;
      last = now;
      setScannedFraction((f) => {
        const nf = f + dt / SWEEP_MS;
        return nf >= 1 ? nf - 1 : nf; // sawtooth: snap back toward 0
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  return (
    <div
      style={{
        padding: 24,
        color: "#e8f0ff",
        fontFamily: "ui-monospace, monospace",
        background: "#05070d",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ margin: "0 0 4px", fontSize: 18 }}>Earth Scan — WIP</h1>
      <p style={{ margin: "0 0 20px", opacity: 0.6, fontSize: 13 }}>
        Tune the scanner. Sliders below are a harness only.
      </p>

      <EarthScanner
        size={earthImageSize}
        scannedFraction={scannedFraction}
        dotCount={dotCount}
        glowPx={glowPx}
      />

      <div style={{ marginTop: 14 }}>
        <button
          onClick={() => setPlaying((p) => !p)}
          style={{
            background: playing ? "#33b4df" : "#0d1420",
            color: playing ? "#05131d" : "#e8f0ff",
            border: "1px solid #2a3a52",
            borderRadius: 6,
            padding: "8px 16px",
            fontFamily: "inherit",
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <span style={{ marginLeft: 12, fontSize: 12, opacity: 0.6 }}>
          sweeps 0→100% then loops
        </span>
      </div>

      <div style={{ maxWidth: 420, marginTop: 20 }}>
        <input
          type="range"
          min={50}
          max={1000}
          step={1}
          value={earthImageSize}
          onChange={(e) => setEarthImageSize(parseInt(e.target.value, 10))}
          style={{ width: "100%" }}
          aria-label="earth_image_size"
        />
        <div style={{ marginTop: 6, fontSize: 13 }}>
          earth_image_size: {earthImageSize}px
        </div>

        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={scannedFraction}
          onChange={(e) => setScannedFraction(parseFloat(e.target.value))}
          style={{ width: "100%", marginTop: 18 }}
          aria-label="scannedFraction"
        />
        <div style={{ marginTop: 6, fontSize: 13 }}>
          scannedFraction: {scannedFraction.toFixed(2)} ({Math.round(scannedFraction * 100)}%)
        </div>

        <input
          type="range"
          min={0.7}
          max={7}
          step={0.1}
          value={glowPx}
          onChange={(e) => setGlowPx(parseFloat(e.target.value))}
          style={{ width: "100%", marginTop: 18 }}
          aria-label="glow radius"
        />
        <div style={{ marginTop: 6, fontSize: 13 }}>glow: {glowPx.toFixed(1)}px</div>

        <input
          type="range"
          min={1}
          max={40}
          step={1}
          value={dotCount}
          onChange={(e) => setDotCount(parseInt(e.target.value, 10))}
          style={{ width: "100%", marginTop: 18 }}
          aria-label="dot_count"
        />
        <div style={{ marginTop: 6, fontSize: 13 }}>dot_count: {dotCount}</div>
      </div>
    </div>
  );
}
