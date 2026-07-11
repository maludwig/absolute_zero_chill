# physics.TODO.md

Full read + numerical verification of `src/physics.js` (26 lines) — two exports: the
gravitational constant `G` and `escapeEnergy(M, m, r) = G·M·m/r`. Tiny file, but physics
constants are exactly where a wrong number hides invisibly, so it earned a real check.

**Verified correct against known physics:**
- `G = 6.67430e-11` — the CODATA value, exact.
- `escapeEnergy` reproduces textbook escape velocities via `v_esc = √(2·E/m)`:
  Earth 11.186 km/s (matches the canonical 11.186 exactly), Moon 2.375 vs 2.38, Jupiter
  60.20 vs 59.5. The formula `E = G·M·m/r` is correctly the gravitational binding energy,
  and the docstring's identity `E = ½·m·v_esc²` holds numerically.
- Only consumer is the mine-power derivation the docstring references (escape energy per
  tonne → power draw), which is dimensionally sound.

## Minor (docstring only)

### 1. Jupiter's 60.20 vs published 59.5 km/s — a radius-choice footnote
The ~1.2% gap on Jupiter isn't an error in the formula; it's that `escapeEnergy` takes a
single `r`, and Jupiter's published v_esc (59.5) uses the *equatorial* radius (7.1492e7 m)
while a mean/volumetric radius (6.9911e7) gives 60.2. The function is correct; the caller
just has to pick which radius it means. Bodies here are modelled as point-ish masses at one
`r`, so this is fine — worth a one-line docstring note that `r` should be the radius
consistent with whatever v_esc you're comparing against, so nobody "corrects" a 1% gap
that's really a radius convention.

## Checked and FINE

- Pure, no imports (as the header claims) — trivially testable, no state coupling.
- Sign convention is right: `U(r) = −GMm/r`, `E_escape = 0 − U = +GMm/r` (positive energy
  out of the well), and the code returns the positive magnitude.
