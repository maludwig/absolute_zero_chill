/* shared/model — the pure, MobX-unaware helpers and constants that the
   exploration model (explore.js) builds on and that the frontier/*.jsx
   presentational components import directly. `fmt` is intentionally NOT here (it
   lives in prelude.js, one canonical formatter), and `systemReserve` is NOT here
   either — it lives in explore.js alongside the data it operates on. */

/* ---- shared scalar constants (single source of truth) ---- */
// Days per game-year. A plain 365 by design — this game reckons in millennia and
// never renders a calendar day, so leap-year precision (365.25 / Gregorian 365.2425)
// buys nothing and only invites drift between subsystems. Every "× a fraction of c
// over N years" conversion (probe travel, mass-stream, wave fronts, relocation, the
// displayed year) routes through this one value.
export const DAYS_PER_YEAR = 365;
// Sol's distance to Sagittarius A★, in light-years. One value shared by gameplay
// (config.relocateDistanceLy — the relocation journey) and the galaxy render
// (GalaxyDefaults.solDistance / the dartboard's Sol placement), so the map and the
// mechanic can never disagree.
export const SOL_TO_SGR_A_LY = 26000;

/* ---- star render helpers ---- */
export const SPECTRAL = {
  O: "#9bb0ff", B: "#aabfff", A: "#dde6ff", F: "#f6f4ff",
  G: "#ffe08a", K: "#ffc178", M: "#ff7e5c",
  L: "#c8604a", T: "#9a4f73", Y: "#6a5a8c",
  D: "#cfe3ff",
};
export function spectralColor(type) {
  const k = (type || "G").trim().charAt(0).toUpperCase();
  return SPECTRAL[k] || "#ffe08a";
}
// True stellar radii span ~200× in the solar neighbourhood; compress through a
// sqrt curve into a sane pixel band so relative sizes still READ right.
export function starPx(radius) {
  const r = Math.max(0, Math.min(radius, 1.71));
  const px = 2.5 + 8.5 * Math.sqrt(r / 1.71);
  return Math.max(2.5, Math.min(11, px));
}
export function lerpColor(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ar = pa >> 16, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = pb >> 16, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return "rgb(" + r + "," + g + "," + bl + ")";
}
export const PROBE_WHITE = "#dff3ff";
export const PROBE_BLUE = "#3fd6ff";
export function probeColor(speed) { return lerpColor(PROBE_WHITE, PROBE_BLUE, (speed - 0.1) / 0.8); }

// ly per realtime second (1 day = 1 tick, 5 ticks/s)
export function lyPerRealSec(speedC, framejack) { return speedC * (5 / DAYS_PER_YEAR) * (framejack || 1); }

/* ---- harvest model ---- */
export const M0 = 40;            // tonnes, one seed mine
export const T_CYCLE = 8;        // per doubling
export const FLEET_FRACTION = 0.01;

export function harvestModel(mTotal) {
  const mineMass = FLEET_FRACTION * mTotal;
  const tBuild = T_CYCLE * Math.log2(mineMass / M0);
  const rate = mineMass / T_CYCLE;
  const tHarvestDone = tBuild + (mTotal - mineMass) / rate;
  return { mTotal, mineMass, tBuild, rate, tHarvestDone };
}
export function consumedAt(t, m) {
  if (t <= 0) return M0;
  if (t < m.tBuild) return M0 * Math.pow(2, t / T_CYCLE);
  return m.mineMass + (t - m.tBuild) * m.rate;
}
export function buildFrac(t, m) { return t >= m.tBuild ? 1 : (M0 * Math.pow(2, t / T_CYCLE)) / m.mineMass; }
export function harvestRemainingFrac(t, m) { return Math.max(0, 1 - consumedAt(t, m) / m.mTotal); }
export function fleetRemainingFrac(tau) { return Math.pow(2, -tau / T_CYCLE); }
export function recycleDone(tau, m) { return fleetRemainingFrac(tau) * m.mineMass < M0; }
export function mineCountAt(t, m) { return t >= m.tBuild ? m.mineMass / M0 : Math.pow(2, t / T_CYCLE); }

/* ---- curve helpers ---- */
export function softExp(p, k) {
  p = Math.max(0, Math.min(1, p));
  if (k < 1e-6) return p;
  return (Math.pow(2, k * p) - 1) / (Math.pow(2, k) - 1);
}
export function buildVisualFrac(t, m, k) { return t >= m.tBuild ? 1 : softExp(t / m.tBuild, k); }
export function recycleVisualFrac(tau, m, k) {
  if (recycleDone(tau, m)) return 0;
  return softExp((m.tBuild - tau) / m.tBuild, k);
}
export const K_RESERVE = 16;
export function softLog(t, k) {
  t = Math.max(0, Math.min(1, t));
  if (k < 1e-6) return t;
  return Math.log2(1 + t * (Math.pow(2, k) - 1)) / k;
}
export function arrivalLoopSpeed(framejack) { return (1 / 3) * Math.pow(9, (Math.log10(framejack) - 1) / 5); }

/* ---- in-system economy ---- */
export const K_BUILD = 8;
export const OTHER_COST_FRAC = 0.40;
export const DRIVER_MINED_GATE = 0.01;
export const DRIVER_BUILD_SECONDS = 90;
// Once built, a Mass Driver ships the system's harvested metal home. It emits in
// PULSES (see beams.js): fires for BEAM_FIRE_DAYS, then reloads for BEAM_RELOAD_DAYS.
// The emission rate while firing is producedNet/DRIVER_SHIP_DAYS per game-day, so the
// whole net haul takes DRIVER_SHIP_DAYS *firing* days (longer in wall-clock once reload
// gaps are included). Delivery (metal actually reaching Sol) is handled separately.
export const DRIVER_SHIP_DAYS = 900;

// the pulsed-beam emission model lives in its own module for exhaustive testing;
// re-export so existing `import { ... } from "./model.js"` call sites keep working.
export { stepMassBeam, deliverBeam, BEAM_FIRE_DAYS, BEAM_RELOAD_DAYS } from "./beams.js";

export function consumedCategory(phase, t, m) {
  if (phase === "idle") return 0;
  if (phase === "building") return M0 * Math.pow(2, t / T_CYCLE);
  if (phase === "harvesting") return m.mineMass + (t - m.tBuild) * m.rate;
  return m.mTotal;
}
export function categoryReserve(phase, t, tau, m) {
  if (phase === "idle" || phase === "building") return 0;
  if (phase === "harvesting") return Math.max(0, (t - m.tBuild) * m.rate);
  if (phase === "harvested") return m.mTotal - m.mineMass;
  if (phase === "recycling") return m.mTotal - m.mineMass * fleetRemainingFrac(tau);
  return m.mTotal;
}
export function harvesterStartCost(category, asteroidMass) {
  return category === "asteroid" ? 0 : OTHER_COST_FRAC * asteroidMass;
}

/* Is n exactly 10^k for some integer k >= 0? Build orders are placed in powers of ten
   (the MULTS buttons: x1, x10, x1000, ...); a x16 multithreaded order is dispatched via
   enqueueMultithreaded, which divides the batch back down to a power of ten before it
   reaches enqueue. Note 10^k is divisible by 16 for k >= 4 (10^4 = 2^4 * 5^4), so a
   `% 16` test cannot distinguish the two — only this can. */
export function isPowerOfTen(n) {
  if (!(n > 0)) return false;
  return Number.isInteger(Math.log10(n));
}
