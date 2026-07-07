import React from "react";
import { starPx, spectralColor } from "../shared/model.js";

/* StarIcon — a dumb SVG cluster icon. `stars` is [{ radius, type }]. The
   largest anchors the centre; the rest nestle around it. Sizes use the
   compressed pixel scale; colours come from spectral type. Each star is a glowy
   radial-gradient disc. The viewBox is fitted to the cluster's full glow extent
   so the whole thing scales into `box`×`box` with no bleed past its bounds. */

const ICON_ANGLES = [-32, 32, -70, 70, 160, 200]; // degrees, for satellites idx>=1
const STAR_GLOW = 1.9; // glow radius as a multiple of the core px

export function StarIcon({ stars, box }) {
  const uid = React.useId().replace(/[:]/g, "");
  const B = box || 52;

  // largest-first so big stars draw behind small ones (small stay visible)
  const items = stars
    .map((s) => ({ px: starPx(s.radius), color: spectralColor(s.type) }))
    .sort((a, b) => b.px - a.px);

  // place in a local space, anchor at origin, satellites adjacent by angle
  const placed = items.map((s, i) => {
    if (i === 0) return { ...s, cx: 0, cy: 0 };
    const ang = (ICON_ANGLES[(i - 1) % ICON_ANGLES.length] * Math.PI) / 180;
    const dist = items[0].px + s.px + 2.0;
    return { ...s, cx: dist * Math.cos(ang), cy: dist * Math.sin(ang) };
  });

  // square viewBox fitted to the cluster's glow extent (so nothing bleeds out)
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const s of placed) {
    const e = s.px * STAR_GLOW;
    minx = Math.min(minx, s.cx - e); maxx = Math.max(maxx, s.cx + e);
    miny = Math.min(miny, s.cy - e); maxy = Math.max(maxy, s.cy + e);
  }
  const dim = Math.max(maxx - minx, maxy - miny);
  const cx0 = (minx + maxx) / 2, cy0 = (miny + maxy) / 2;
  const vb = (cx0 - dim / 2) + " " + (cy0 - dim / 2) + " " + dim + " " + dim;

  return (
    <svg className="staricon" viewBox={vb} width={B} height={B} aria-hidden="true">
      <defs>
        {placed.map((s, i) => (
          <radialGradient key={i} id={"sg" + uid + i} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="30%" stopColor={s.color} stopOpacity="1" />
            <stop offset="62%" stopColor={s.color} stopOpacity="0.38" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      {placed.map((s, i) => (
        <circle key={i} cx={s.cx} cy={s.cy} r={s.px * STAR_GLOW} fill={"url(#sg" + uid + i + ")"} />
      ))}
    </svg>
  );
}
