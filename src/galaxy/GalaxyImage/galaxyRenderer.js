// galaxyRenderer.js
// Pure canvas-drawing logic for the Milky Way model. No React in here, so it
// can be unit-tested or reused outside of components. All geometry is laid out
// in a fixed 680x680 logical space (VB) and scaled up by `exportScale` at draw
// time for crisp display + high-res PNG export.

import { MILKY_WAY_DEFAULTS } from "./GalaxyDefaults.js";

export const VB = 680;
const CX = VB / 2;
const CY = VB / 2;
export const DRAW_R = 268; // px radius that maps to the galaxy's outer rim
const BULGE_R = 46; // px radius of the central bulge
const ARM_INNER = BULGE_R + 6;
export const SUN_ANGLE = -38; // deg, fixed bearing for Sol so it sits in a gap
const RINGS = [0.25, 0.5, 0.75, 1];

export const DEFAULT_STAR_POOL = 5600;
export const DEFAULT_CORE_SEED = 13337;
export const DEFAULT_EDGE_SEED = 90210;

// deterministic pseudo-random so the same seed gives the same scatter
function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export function fmt(n) {
  return n >= 1000 ? Math.round(n).toLocaleString("en-US") : String(Math.round(n));
}

export function buildArms(numArms, segments, thetaMax) {
  const arms = [];
  for (let a = 0; a < numArms; a++) {
    const base = (a / numArms) * Math.PI * 2;
    const pts = [];
    const N = Math.max(2, segments);
    for (let s = 0; s <= N; s++) {
      const t = s / N;
      const theta = t * thetaMax;
      const r = ARM_INNER * Math.pow(DRAW_R / ARM_INNER, t);
      const ang = base + theta;
      pts.push([CX + r * Math.cos(ang), CY + r * Math.sin(ang)]);
    }
    arms.push({ pts });
  }
  return arms;
}

// Trace an arm onto the current path: straight segments, or a Catmull-Rom
// spline emitted as cubic beziers when curved is on.
function tracePath(ctx, pts, curved) {
  if (!pts.length) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (!curved || pts.length < 3) {
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    return;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
  }
}

function makeAmbient() {
  const rand = rng(424242);
  const stars = [];
  for (let i = 0; i < 90; i++) {
    const x = rand() * VB;
    const y = rand() * VB;
    const dx = x - CX;
    const dy = y - CY;
    if (Math.sqrt(dx * dx + dy * dy) < DRAW_R * 0.7 && rand() < 0.7) continue;
    stars.push({ x, y, r: rand() * 1.1 + 0.3, o: rand() * 0.6 + 0.25 });
  }
  return stars;
}
const AMBIENT = makeAmbient();

function buildStarField(seed, kind, pool) {
  const rand = rng(seed);
  const warm = ["#fff3d6", "#ffe0a8", "#ffffff", "#ffd9a0"];
  const cool = ["#cfe0ff", "#ffffff", "#9ec5ff", "#e8f0ff"];
  const palette = kind === "core" ? warm : cool;
  const out = [];
  for (let i = 0; i < pool; i++) {
    const u = rand();
    let r;
    if (kind === "core") {
      r = DRAW_R * 0.55 * Math.pow(u, 1.7); // packed toward the center
    } else {
      const rin = DRAW_R * 0.16;
      const rout = DRAW_R; // even surface density across the outer disk
      r = Math.sqrt(rin * rin + u * (rout * rout - rin * rin));
    }
    const ang = rand() * Math.PI * 2;
    out.push({
      x: CX + r * Math.cos(ang),
      y: CY + r * Math.sin(ang),
      sz: rand(), // 0..1 factor mapped between the min/max size props
      o: rand() * 0.5 + 0.3,
      c: palette[Math.floor(rand() * palette.length)],
    });
  }
  return out;
}

// Build both random star populations once. Memoize this by seed/pool in the
// component so it isn't regenerated on every redraw.
export function createStarFields(
  coreSeed = DEFAULT_CORE_SEED,
  edgeSeed = DEFAULT_EDGE_SEED,
  pool = DEFAULT_STAR_POOL
) {
  return {
    core: buildStarField(coreSeed, "core", pool),
    edge: buildStarField(edgeSeed, "edge", pool),
  };
}

// Convenience: derived numbers you might want to show next to the image.
export function galaxyStats(params = {}) {
  const {
    galaxyRadius = MILKY_WAY_DEFAULTS.galaxyRadius,
    solDistance = MILKY_WAY_DEFAULTS.solDistance,
    windingAngle = MILKY_WAY_DEFAULTS.windingAngle,
    coreDensity = MILKY_WAY_DEFAULTS.coreDensity,
    edgeDensity = MILKY_WAY_DEFAULTS.edgeDensity,
  } = params;
  return {
    diameterLy: galaxyRadius * 2,
    solPercentOut: galaxyRadius > 0 ? (solDistance / galaxyRadius) * 100 : 0,
    lyPerPixel: galaxyRadius / DRAW_R,
    armPitchDeg: windingAngle,
    totalStars: coreDensity + edgeDensity,
  };
}

function disc(ctx, x, y, r, fill, alpha) {
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function ellipseFill(ctx, x, y, rx, ry, fill, alpha, rot) {
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2);
  ctx.fill();
}

// Render one frame. `params` holds the slider/toggle values, `fields` is the
// output of createStarFields(). The canvas should be sized VB*exportScale.
export function drawGalaxy(ctx, params, fields) {
  const {
    numArms = MILKY_WAY_DEFAULTS.numArms,
    segments = MILKY_WAY_DEFAULTS.segments,
    windingAngle = MILKY_WAY_DEFAULTS.windingAngle,
    curvedArms = MILKY_WAY_DEFAULTS.curvedArms,
    coreDensity = MILKY_WAY_DEFAULTS.coreDensity,
    edgeDensity = MILKY_WAY_DEFAULTS.edgeDensity,
    starMinSize = MILKY_WAY_DEFAULTS.starMinSize,
    starMaxSize = MILKY_WAY_DEFAULTS.starMaxSize,
    glow = MILKY_WAY_DEFAULTS.glow,
    transparent = MILKY_WAY_DEFAULTS.transparent,
    solDistance = MILKY_WAY_DEFAULTS.solDistance,
    galaxyRadius = MILKY_WAY_DEFAULTS.galaxyRadius,
    showLabels = MILKY_WAY_DEFAULTS.showLabels,
    showSol = MILKY_WAY_DEFAULTS.showSol,
    showRulers = MILKY_WAY_DEFAULTS.showRulers,
    exportScale = MILKY_WAY_DEFAULTS.exportScale,
  } = params || {};

  const core = (fields && fields.core) || [];
  const edge = (fields && fields.edge) || [];
  const coreCount = Math.max(0, Math.min(coreDensity, core.length));
  const edgeCount = Math.max(0, Math.min(edgeDensity, edge.length));
  const minSize = Math.min(starMinSize, starMaxSize);
  const sizeSpan = Math.abs(starMaxSize - starMinSize);
  const thetaMax =
    Math.log(DRAW_R / ARM_INNER) / Math.tan((windingAngle * Math.PI) / 180);
  const arms = buildArms(numArms, segments, thetaMax);

  ctx.setTransform(exportScale, 0, 0, exportScale, 0, 0);
  ctx.clearRect(0, 0, VB, VB);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.textBaseline = "alphabetic";

  if (!transparent) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#06070d";
    ctx.fillRect(0, 0, VB, VB);
  }

  if (glow > 0) {
    const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, DRAW_R * 1.2);
    g.addColorStop(0, "rgba(255,230,176,0.9)");
    g.addColorStop(0.16, "rgba(216,176,255,0.55)");
    g.addColorStop(0.42, "rgba(74,99,200,0.5)");
    g.addColorStop(1, "rgba(11,16,48,0)");
    ctx.globalAlpha = glow / 100;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(CX, CY, DRAW_R * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const s of AMBIENT) disc(ctx, s.x, s.y, s.r, "#ffffff", s.o);

  if (showRulers) {
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = "#26304f";
    ctx.lineWidth = 0.7;
    ctx.setLineDash([2, 5]);
    for (const f of RINGS) {
      ctx.beginPath();
      ctx.arc(CX, CY, DRAW_R * f, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (showLabels) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#4a5675";
      ctx.font = "9px ui-monospace, monospace";
      ctx.textAlign = "left";
      for (const f of RINGS) {
        ctx.fillText(`${fmt((galaxyRadius * f) / 1000)}k ly`, CX + 3, CY - DRAW_R * f - 3);
      }
    }
    ctx.globalAlpha = 1;
  }

  disc(ctx, CX, CY, DRAW_R, "#1a2b6b", 0.22);
  disc(ctx, CX, CY, DRAW_R * 0.7, "#24388a", 0.18);

  for (let i = 0; i < coreCount; i++) {
    const s = core[i];
    disc(ctx, s.x, s.y, minSize + s.sz * sizeSpan, s.c, s.o);
  }
  for (let i = 0; i < edgeCount; i++) {
    const s = edge[i];
    disc(ctx, s.x, s.y, minSize + s.sz * sizeSpan, s.c, s.o);
  }

  for (const arm of arms) {
    ctx.beginPath();
    tracePath(ctx, arm.pts, curvedArms);
    ctx.globalAlpha = 0.42; ctx.strokeStyle = "#33509a"; ctx.lineWidth = 22; ctx.stroke();
    ctx.globalAlpha = 0.82; ctx.strokeStyle = "#6f9bff"; ctx.lineWidth = 11; ctx.stroke();
    ctx.globalAlpha = 0.6;  ctx.strokeStyle = "#bcd3ff"; ctx.lineWidth = 3.5; ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ellipseFill(ctx, CX, CY, BULGE_R + 18, BULGE_R + 16, "#b06a1e", 0.32);
  ellipseFill(ctx, CX, CY, BULGE_R, BULGE_R - 4, "#e0922f", 0.5);
  const barRot = (-18 * Math.PI) / 180;
  ellipseFill(ctx, CX, CY, BULGE_R + 8, 16, "#ffd27a", 0.9, barRot);
  ellipseFill(ctx, CX, CY, BULGE_R - 8, 11, "#ffe9a8", 1, barRot);
  disc(ctx, CX, CY, 6, "#fff6d2", 1);
  disc(ctx, CX, CY, 2.4, "#ffffff", 1);
  if (showLabels) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#ffd27a";
    ctx.font = "12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("Sgr A*", CX, CY + BULGE_R + 34);
    ctx.globalAlpha = 1;
  }

  if (showSol) {
    const sunR = Math.min((solDistance / galaxyRadius) * DRAW_R, DRAW_R);
    const sunRad = (SUN_ANGLE * Math.PI) / 180;
    const sunX = CX + sunR * Math.cos(sunRad);
    const sunY = CY + sunR * Math.sin(sunRad);
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = "#ffb454";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.lineTo(sunX, sunY);
    ctx.stroke();
    ctx.setLineDash([]);
    disc(ctx, sunX, sunY, 8, "#ffd54a", 0.28);
    disc(ctx, sunX, sunY, 3.6, "#ffe27a", 1);
    disc(ctx, sunX, sunY, 1.5, "#ffffff", 1);

    if (showLabels) {
      const lx1 = sunX + 6, ly1 = sunY - 4, lx2 = sunX + 40, ly2 = sunY - 30;
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = "#ffe27a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx1, ly1);
      ctx.lineTo(lx2, ly2);
      ctx.stroke();
      const aang = Math.atan2(ly2 - ly1, lx2 - lx1);
      const ah = 5;
      ctx.fillStyle = "#ffe27a";
      ctx.beginPath();
      ctx.moveTo(lx2, ly2);
      ctx.lineTo(lx2 - ah * Math.cos(aang - 0.5), ly2 - ah * Math.sin(aang - 0.5));
      ctx.lineTo(lx2 - ah * Math.cos(aang + 0.5), ly2 - ah * Math.sin(aang + 0.5));
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
      ctx.fillStyle = "#ffe27a";
      ctx.font = "600 12.5px ui-monospace, monospace";
      ctx.fillText("Sol", sunX + 45, sunY - 30);
      ctx.fillStyle = "#cfe0ff";
      ctx.font = "10.5px ui-monospace, monospace";
      ctx.fillText(`${fmt(solDistance)} ly out`, sunX + 45, sunY - 16);
    }
    ctx.globalAlpha = 1;
  }
}
