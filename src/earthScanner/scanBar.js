/* earthScanner/scanBar — pure canvas drawing for the animated scan seam. No
   React in here so it can be unit-tested with a mock 2D context, mirroring the
   galaxy's overlay.js / waves.js split.

   Coordinates are a square logical space of `size`×`size`. The globe is the
   inscribed circle (centre size/2, radius size/2) — the icon SVG's circle
   touches all four viewBox edges, so this matches it exactly. The seam sits at
   y = scannedFraction·size, and we clip drawing to the globe so it can't spill
   past the rim.

   The seam is a thin glowing line plus a train of light packets ("dots") that
   march left→right. Dot positions are anchored in the FULL canvas width, so
   their motion is independent of the seam: `dotCount` sets density across the
   whole disc, and a dot is painted only while it's over the globe. */

// Half-length of the horizontal chord of a circle (radius r) at vertical
// distance `dy` from its centre. Zero at/outside the rim.
export function chordHalfWidth(r, dy) {
  const d = Math.min(Math.abs(dy), r);
  return Math.sqrt(r * r - d * d);
}

const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${a})`;

// Time for a dot to travel the full canvas width, left to right. A dot only
// traverses the visible chord, so it crosses the globe faster than this at most
// latitudes.
const DOT_CROSS_MS = 20000;

// Draw one frame. Clears the canvas first. All options are required.
//   size            — logical canvas size (square)
//   scannedFraction — 0..1, vertical position of the seam
//   timeMs          — monotonic timestamp driving the dot march
//   dotCount        — number of dots across the full disc width
//   dotGlowRadius   — packet radius, px
//   lineHeight      — seam line thickness, px (0 to omit)
//   lineGlowRadius  — soft vertical bloom half-height, px (0 to omit)
export function drawScanBar(ctx, opts) {
  const {
    size,
    scannedFraction,
    timeMs,
    dotCount,
    dotGlowRadius,
    lineHeight,
    lineGlowRadius,
  } = opts;

  ctx.clearRect(0, 0, size, size);
  // Nothing to draw when unscanned or fully scanned — the seam is off-globe.
  if (scannedFraction <= 0 || scannedFraction >= 1) return;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;
  const y = scannedFraction * size;
  const half = chordHalfWidth(r, y - cy);
  if (half <= 1) return;
  const x0 = cx - half;
  const x1 = cx + half;
  const w = x1 - x0;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // soft vertical glow around the seam (smothers the hard colour edge)
  if (lineGlowRadius > 0) {
    const bg = ctx.createLinearGradient(0, y - lineGlowRadius, 0, y + lineGlowRadius);
    bg.addColorStop(0, rgba(51, 180, 223, 0));
    bg.addColorStop(0.5, rgba(70, 195, 235, 0.3));
    bg.addColorStop(1, rgba(51, 180, 223, 0));
    ctx.fillStyle = bg;
    ctx.fillRect(x0, y - lineGlowRadius, w, lineGlowRadius * 2);
  }

  // crisp seam line
  if (lineHeight > 0) {
    ctx.lineCap = "round";
    ctx.lineWidth = lineHeight;
    ctx.strokeStyle = rgba(150, 224, 255, 0.6);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }

  // marching packets — anchored in the full canvas width; painted only while
  // over the globe (x within the chord), with a slight rim ease-in/out.
  const n = Math.max(1, Math.round(dotCount));
  const spacing = size / n;
  const offset = ((timeMs % DOT_CROSS_MS) / DOT_CROSS_MS) * size;
  const hotR = dotGlowRadius;
  const fade = Math.min(hotR + 4, w * 0.5); // rim ease span, in px
  for (let i = 0; i < n; i++) {
    const px = (i * spacing + offset) % size;
    if (px < x0 || px > x1) continue; // off-globe: don't paint
    const edgeFade = fade > 0 ? Math.min(1, Math.min(px - x0, x1 - px) / fade) : 1;
    const hg = ctx.createRadialGradient(px, y, 0, px, y, hotR);
    hg.addColorStop(0, rgba(255, 255, 255, 0.95 * edgeFade));
    hg.addColorStop(0.4, rgba(90, 205, 240, 0.6 * edgeFade));
    hg.addColorStop(1, rgba(90, 205, 240, 0));
    ctx.fillStyle = hg;
    ctx.fillRect(px - hotR, y - hotR, hotR * 2, hotR * 2);
  }

  ctx.restore();
}
