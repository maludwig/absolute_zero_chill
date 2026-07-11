/* galaxy/overlay — the dartboard overlay: pure geometry (testable) plus canvas
   drawing for the Galactic Logistics map. Geometry is anchored to GalaxyImage's
   own constants (VB / DRAW_R / SUN_ANGLE) so the dartboard can never drift from
   the spiral art beneath it. Ported from the dartboard prototype, with the clock
   and wave state now supplied by the store, and a second "heard" ring (front/2)
   layered over the "seeded" ring to show the Insight light-lag. */

import { LUT, SLICE_COUNT, WEDGE_COUNT, PIE_RADIUS_LY, BIN_LY } from "./lut.js";
import { frontLy } from "./waves.js";
import { VB, DRAW_R, SUN_ANGLE } from "./GalaxyImage/galaxyRenderer.js";

import { MILKY_WAY_DEFAULTS } from "./GalaxyImage/GalaxyDefaults.js";

const CX = VB / 2, CY = VB / 2;
const RMIN_PX = 14;            // Sol's dead-zone radius on the board
const R_SOL_LY = 26000;        // Sol's distance from the galactic centre
export const SEEDED_COLOR = "#3fd6ff"; // cyan — outbound / seeded
export const HEARD_COLOR = "#5fe3c0";  // mint — Insight heard back

// density colormap (log-scaled)
const STOPS = [[10, 20, 60], [40, 80, 180], [120, 80, 200], [220, 100, 60], [255, 220, 120], [255, 255, 240]];
let MINV = Infinity, MAXV = -Infinity;
for (const row of LUT) for (const v of row) { if (v < MINV) MINV = v; if (v > MAXV) MAXV = v; }

export function applyScaleLog(v) {
  const lo = Math.log(Math.max(MINV, 1)), hi = Math.log(Math.max(MAXV, 1));
  return hi === lo ? 0 : (Math.log(Math.max(v, 1)) - lo) / (hi - lo);
}
export function normToColor(t, alpha) {
  const idx = t * (STOPS.length - 1);
  const a = Math.floor(idx), b = Math.min(a + 1, STOPS.length - 1), f = idx - a;
  const ch = (i) => Math.round(STOPS[a][i] + (STOPS[b][i] - STOPS[a][i]) * f);
  return `rgba(${ch(0)},${ch(1)},${ch(2)},${alpha})`;
}

// Shared dartboard geometry: where Sol sits, the px scale, slice angles.
export function dartboardGeom(galaxyRadiusLy, rotateRads = 0) {
  const lyPerPx = galaxyRadiusLy / DRAW_R;
  const rmax = PIE_RADIUS_LY / lyPerPx;
  const anglePerSlice = (2 * Math.PI) / SLICE_COUNT;
  const solAngleRad = (SUN_ANGLE * Math.PI) / 180;
  const solR_px = (R_SOL_LY / galaxyRadiusLy) * DRAW_R;
  const solX = CX + solR_px * Math.cos(solAngleRad);
  const solY = CY + solR_px * Math.sin(solAngleRad);
  const baseDir = solAngleRad + Math.PI + rotateRads; // slice 0 points at Sgr A★
  return { sliceCount: SLICE_COUNT, wedgeCount: WEDGE_COUNT, pieRadiusLy: PIE_RADIUS_LY, lyPerPx, rmax, anglePerSlice, solX, solY, baseDir };
}

// ly-from-Sol → pixel radius on the board.
export function lyToPx(ly, g) {
  return RMIN_PX + (g.rmax - RMIN_PX) * (ly / g.pieRadiusLy);
}

// inner/outer pixel radius of ring b.
function ringRadiiPx(b, g) {
  const span = g.rmax - RMIN_PX;
  return [RMIN_PX + span * (b / g.wedgeCount), RMIN_PX + span * ((b + 1) / g.wedgeCount)];
}

// Tight bounding box of wedge (s, b) in canvas pixels. The extreme x/y of an
// annular sector occur at its four corners or where an arc crosses a cardinal
// axis (0, π/2, π, 3π/2) within the slice's angular span.
export function wedgeBBox(s, b, g) {
  const c = g.baseDir + s * g.anglePerSlice;
  const aStart = c - g.anglePerSlice / 2, aEnd = c + g.anglePerSlice / 2;
  const [rInner, rOuter] = ringRadiiPx(b, g);
  const pts = [];
  const add = (r, ang) => pts.push([g.solX + r * Math.cos(ang), g.solY + r * Math.sin(ang)]);
  for (const a of [aStart, aEnd]) { add(rInner, a); add(rOuter, a); }
  for (let k = Math.floor(aStart / (Math.PI / 2)); k <= Math.ceil(aEnd / (Math.PI / 2)); k++) {
    const ang = k * (Math.PI / 2);
    if (ang >= aStart && ang <= aEnd) { add(rInner, ang); add(rOuter, ang); }
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

// True if the whole wedge sits inside the VB×VB canvas (so it can be drawn/clicked).
export function wedgeOnScreen(s, b, g) {
  const bb = wedgeBBox(s, b, g);
  return bb.minX >= 0 && bb.maxX <= VB && bb.minY >= 0 && bb.maxY <= VB;
}

// pixel centre of cell (s, b) — used for labels and round-trip tests.
export function cellCenterPx(s, b, g) {
  const ang = g.baseDir + s * g.anglePerSlice;
  const rPx = RMIN_PX + (g.rmax - RMIN_PX) * ((b + 0.5) / g.wedgeCount);
  return { x: g.solX + rPx * Math.cos(ang), y: g.solY + rPx * Math.sin(ang) };
}

// inverse hit-test: canvas pixel → { s, b } cell, or null if outside the board.
export function pixelToCell(mx, my, g) {
  const dx = mx - g.solX, dy = my - g.solY;
  const dist = Math.hypot(dx, dy);
  if (dist < RMIN_PX || dist > g.rmax) return null;
  const b = Math.min(Math.floor(((dist - RMIN_PX) / (g.rmax - RMIN_PX)) * g.wedgeCount), g.wedgeCount - 1);
  let angle = Math.atan2(dy, dx) - g.baseDir + g.anglePerSlice / 2;
  angle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const s = Math.min(Math.floor(angle / g.anglePerSlice), g.sliceCount - 1);
  return { s, b };
}

// mouse event → canvas-logical pixels (accounts for CSS scaling).
export function eventToCanvasPx(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    mx: (e.clientX - rect.left) * (canvas.width / rect.width),
    my: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

// ── drawing ─────────────────────────────────────────────────────────────────
function sliceAngles(g, s) {
  const c = g.baseDir + s * g.anglePerSlice;
  return [c - g.anglePerSlice / 2, c + g.anglePerSlice / 2];
}

function frontArc(ctx, g, aStart, aEnd, ly, color, alpha) {
  ctx.beginPath();
  ctx.arc(g.solX, g.solY, lyToPx(ly, g), aStart, aEnd);
  ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = 3;
  ctx.shadowColor = color; ctx.shadowBlur = 8 * alpha;
  ctx.stroke();
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
}

// one layer of a wave (seeded or heard): fill the wedge from rNear to the front,
// plus the travelling leading arc.
function waveLayer(ctx, g, s, rNearLy, rFarLy, front, color, fillAlpha) {
  if (front <= 0) return;
  const [aStart, aEnd] = sliceAngles(g, s);
  if (front <= rNearLy) { // still in transit toward the wedge
    frontArc(ctx, g, aStart, aEnd, Math.min(front, g.pieRadiusLy), color, 0.9);
    return;
  }
  const fillFar = Math.min(front, rFarLy);
  ctx.beginPath();
  ctx.arc(g.solX, g.solY, lyToPx(fillFar, g), aStart, aEnd);
  ctx.arc(g.solX, g.solY, lyToPx(rNearLy, g), aEnd, aStart, true);
  ctx.closePath();
  ctx.fillStyle = color; ctx.globalAlpha = fillAlpha; ctx.fill(); ctx.globalAlpha = 1;
  if (front < rFarLy) frontArc(ctx, g, aStart, aEnd, front, color, 1 - (front - rNearLy) / (rFarLy - rNearLy));
}

function drawWaves(ctx, g, waves, currentDay, probeSpeedC) {
  for (const w of waves) {
    const days = currentDay - w.dayLaunched;
    if (days <= 0) continue;
    const front = frontLy(probeSpeedC, days);
    const rNearLy = w.b * BIN_LY, rFarLy = (w.b + 1) * BIN_LY;
    waveLayer(ctx, g, w.s, rNearLy, rFarLy, front, SEEDED_COLOR, 0.18); // seeded (cyan)
    waveLayer(ctx, g, w.s, rNearLy, rFarLy, front / (1 + probeSpeedC), HEARD_COLOR, 0.30); // heard (mint), on top
  }
}

// Full repaint of the overlay. `opts`: { hovered, waves, currentDay, probeSpeedC }.
export function drawDartboard(ctx, g, opts = {}) {
  const { hovered, waves = [], currentDay = 0, probeSpeedC = 0.1 } = opts;
  ctx.clearRect(0, 0, VB, VB);

  // density-coloured wedge cells (skip any that would clip off-canvas)
  for (let s = 0; s < g.sliceCount; s++) {
    const [aStart, aEnd] = sliceAngles(g, s);
    for (let b = 0; b < g.wedgeCount; b++) {
      if (!wedgeOnScreen(s, b, g)) continue;
      const norm = applyScaleLog(LUT[s][b]);
      const rInner = RMIN_PX + (g.rmax - RMIN_PX) * (b / g.wedgeCount);
      const rOuter = RMIN_PX + (g.rmax - RMIN_PX) * ((b + 1) / g.wedgeCount);
      ctx.beginPath();
      ctx.arc(g.solX, g.solY, rOuter, aStart, aEnd);
      ctx.arc(g.solX, g.solY, rInner, aEnd, aStart, true);
      ctx.closePath();
      ctx.fillStyle = normToColor(norm, 0.6 + norm * 0.3);
      ctx.fill();
      const hov = hovered && hovered.s === s && hovered.b === b;
      ctx.strokeStyle = hov ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.22)";
      ctx.lineWidth = hov ? 1.6 : 0.4;
      ctx.stroke();
    }
  }

  // Sgr A★ pointer (dashed, toward the galactic centre)
  ctx.beginPath();
  ctx.moveTo(g.solX, g.solY);
  ctx.lineTo(g.solX + (g.rmax + 6) * Math.cos(g.baseDir), g.solY + (g.rmax + 6) * Math.sin(g.baseDir));
  ctx.strokeStyle = "rgba(255,210,80,0.45)"; ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]); ctx.stroke(); ctx.setLineDash([]);

  // ring distance labels
  ctx.font = "9px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  const step = Math.max(1, Math.floor(g.wedgeCount / 4));
  for (let b = 0; b <= g.wedgeCount; b += step) {
    const rPx = RMIN_PX + (g.rmax - RMIN_PX) * (b / g.wedgeCount);
    const ang = g.baseDir - g.anglePerSlice / 2 - 0.05;
    ctx.fillText(Math.round((BIN_LY * b) / 1000) + "k", g.solX + rPx * Math.cos(ang), g.solY + rPx * Math.sin(ang));
  }

  // colonization waves, on top
  drawWaves(ctx, g, waves, currentDay, probeSpeedC);

  // Sol marker
  ctx.beginPath(); ctx.arc(g.solX, g.solY, 4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,220,80,0.95)"; ctx.fill();
  ctx.beginPath(); ctx.arc(g.solX, g.solY, 2, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff"; ctx.fill();
}

export const GALAXY_PARAMS = {
  ...MILKY_WAY_DEFAULTS,
  galaxyRadius: 50000, // Sol ~52% out — realistic; outer wedges clip off-frame and are dropped
  solDistance: 26000,
  showSol: true,
  showLabels: true,
  showRulers: false,
};

export const GEOM = Object.freeze(dartboardGeom(GALAXY_PARAMS.galaxyRadius, 0));

export const WEDGES_ON_SCREEN = [];
for (let s = 0; s < SLICE_COUNT; s++) {
  const sliceWedges = [];
  for (let b = 0; b < WEDGE_COUNT; b++) {
    sliceWedges.push(wedgeOnScreen(s, b, GEOM))
  }
  WEDGES_ON_SCREEN.push(sliceWedges);
}
