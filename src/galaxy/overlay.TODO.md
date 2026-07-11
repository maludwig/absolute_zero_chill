# overlay.TODO.md

Full read + geometry audit of `src/galaxy/overlay.js` (232 lines) — the dartboard overlay:
pure annular-sector geometry (hit-testing, bounding boxes, on-screen clipping) plus the
canvas drawing for Galactic Logistics. The meatiest galaxy file and the one with the most
room for subtle geometry bugs.

**Geometry audited clean.** Verified by script:
- `pixelToCell` is a true inverse of `cellCenterPx`: every one of the 68 on-screen cells
  round-trips (center → pixelToCell → same cell), zero failures.
- The baked `WEDGES_ON_SCREEN` table matches live `wedgeOnScreen(s,b,GEOM)` exactly (0
  mismatches) — 68/96 wedges visible, the other 28 clip off-frame and are dropped, as the
  header intends.
- `wedgeBBox`'s cardinal-axis-crossing logic (the tricky part — an annular sector's extreme
  x/y can occur where an arc crosses 0/π/2/π/3π/2, not just at corners) produces a correct
  tight box; the round-trip and clip results depend on it and both check out.

## Real findings

### 1. `pixelToCell` can return a CLIPPED (off-screen) cell — implicit caller contract
`pixelToCell` only checks the annulus (`dist` in [RMIN_PX, rmax]); it does NOT check
`wedgeOnScreen`. Scanning a pixel grid, ~15,800 sample pixels map to wedges that aren't
drawn. Today this is safe: GalacticLogistics.jsx guards BOTH hover (l.53) and click (l.60)
with `wedgeOnScreen` before using the cell. But it's a landmine — any future caller of
`pixelToCell` that forgets the guard would let a player hover/seed a wedge that isn't on
the board (and, via `store.canSeed`, potentially launch into a cell the UI never showed).
The "you must also check wedgeOnScreen" contract is real but lives only in the callers, not
on the function. Add a one-line note to `pixelToCell`, or return null for off-screen cells
directly (safer — makes the guard structural instead of by-convention).

### 2. [FIXED] `26000` (Sol's distance to Sgr A★) is triplicated across the drift seam
The file header promises the dartboard "can never drift from the spiral art beneath it"
because it's anchored to GalaxyImage's constants (VB / DRAW_R / SUN_ANGLE). But Sol's
RADIAL distance is NOT anchored that way — it's hardcoded three times:
- `overlay.js` l.16   `R_SOL_LY = 26000`      → drives the dartboard's `solR_px` (l.42)
- `overlay.js` l.217  `solDistance: 26000`    → passed to the art renderer
- `GalaxyDefaults.js` l.16 `solDistance: 26000` → the renderer's default (`sunR`, l.282)
The dartboard's Sol (`solR_px` from R_SOL_LY) and the art's Sol (`sunR` from solDistance)
agree ONLY because all three literals are 26000. Change one and the dartboard's Sol silently
separates from the painted Sol — precisely the drift the header says the anchoring prevents.
The angle IS anchored (SUN_ANGLE), the radius is not. Fix: derive `R_SOL_LY` from the same
source the renderer uses (import `MILKY_WAY_DEFAULTS.solDistance`), so there's one value.
This is the file's most consequential issue — it defeats the stated design invariant.

## Minor

### 3. Module-load colormap min/max scan (l.22-23)
`MINV`/`MAXV` computed by scanning LUT at import. Fine (96 cells, once). Same "don't bake
it into a second constant" note as lut.js — leave as the single source.

### 4. `drawDartboard` default `probeSpeedC = 0.1` (l.162)
The real value is `CONFIG.galaxyProbeSpeedC = 0.9`; the 0.1 default only applies if a caller
omits it. Harmless (the live caller always passes it), but a 0.1 default for a value that's
really 0.9 could mislead in a test or new call site. Consider matching the real default or
making it required.

## Checked and FINE

- Hover/click handlers in GalacticLogistics correctly guard with `wedgeOnScreen` (so
  finding #1 is latent, not live).
- `eventToCanvasPx` correctly accounts for CSS scaling (canvas.width/rect.width) — clicks
  land right even when the canvas is CSS-resized.
- `GEOM` is `Object.freeze`d — the shared geometry can't be mutated by a consumer.
- Wave rendering math (`waveLayer`, the `front/(1+probeSpeedC)` heard-ring) matches the
  store's `heardFrac`/`seededFrac` model — draw and simulation agree.
