/* earthScanner/EarthScanner — the reusable Earth-scan visual.

   Renders two stacked copies of the icon globe (unscanned green under scanned
   blue), reveals the scanned copy top-down by clipping it to `scannedFraction`,
   and animates a scan seam on a canvas over the top. `size` is the on-screen
   pixel box; the scan canvas draws in a fixed internal space (CANVAS_SIZE) and is
   scaled by CSS, so the seam/dots keep the same proportions at any size.

   The seam look (dot glow / line height / line glow) is locked in here; callers
   only vary size, scannedFraction, dotCount, and the land glow. */

import { useRef, useEffect } from "react";
import earthSvg from "./earth-icon.svg?raw";
import { drawScanBar } from "./scanBar.js";
import styles from "./EarthScanner.module.css";

// Strip the XML prolog and the SVG's own <style> so our scoped fills win.
const EARTH_MARKUP = earthSvg
  .replace(/<\?xml[\s\S]*?\?>/i, "")
  .replace(/<style[\s\S]*?<\/style>/i, "");

// Fixed internal drawing resolution — CSS scales the canvas to `size`.
const CANVAS_SIZE = 512;

// Seam look, locked in (units are in the 512 internal space).
const DOT_GLOW_RADIUS = 10;
const LINE_HEIGHT = 2.8;
const LINE_GLOW_RADIUS = 15;

export function EarthScanner({
  size = 320,
  scannedFraction = 0.35,
  dotCount = 10,
  glowPx = 2.6,
}) {
  const canvasRef = useRef(null);

  // The rAF loop reads live values through refs so it never has to restart.
  const fracRef = useRef(scannedFraction);
  fracRef.current = scannedFraction;
  const dotCountRef = useRef(dotCount);
  dotCountRef.current = dotCount;

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return; // headless / jsdom: no 2D context
    let raf = 0;
    const loop = (t) => {
      drawScanBar(ctx, {
        size: CANVAS_SIZE,
        scannedFraction: fracRef.current,
        dotCount: dotCountRef.current,
        dotGlowRadius: DOT_GLOW_RADIUS,
        lineHeight: LINE_HEIGHT,
        lineGlowRadius: LINE_GLOW_RADIUS,
        timeMs: t,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Clip the bottom (1 - fraction) off the overlay; inset() cuts, never scales.
  const clip = `inset(0 0 ${((1 - scannedFraction) * 100).toFixed(3)}% 0)`;

  return (
    <div className={styles.stage} style={{ width: size, height: size }}>
      <div
        className={styles.base}
        dangerouslySetInnerHTML={{ __html: EARTH_MARKUP }}
      />
      <div
        className={styles.overlay}
        style={{ clipPath: clip, WebkitClipPath: clip, "--glow": `${glowPx}px` }}
        dangerouslySetInnerHTML={{ __html: EARTH_MARKUP }}
      />
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className={styles.canvas}
      />
    </div>
  );
}
