# model.TODO.md

Full read + verification of `src/shared/model.js` (125 lines) — the pure MobX-unaware
helpers the exploration model and frontier components build on (star rendering, the
harvest-curve math, softExp/softLog, in-system economy constants). Clean.

**Verified:**
- `deliverBeam`/`stepMassBeam` (re-exported from beams.js) checked separately — see
  beams.TODO. The harvest curves (`consumedAt`, `buildFrac`, `harvestRemainingFrac`) are
  the continuous model the store integrates; consistent with the phase-based
  `consumedCategory`/`categoryReserve` used by the UI.

## Finding

### 1. `isPowerOfTen` is DUPLICATED across two files (model.js l.122 + autoplayer.js l.40)
Two independent implementations of the same predicate:
- `model.js`: `Number.isInteger(Math.log10(n))`
- `autoplayer.js`: `Math.log10(num) % 1 === 0`
Both are correct (see below) but it's the same logic written twice, and the two forms could
drift. autoplayer.js should import model.js's version and delete its local copy. (This
SUPERSEDES autoplayer.TODO #3, which speculated the log10 form was float-fragile — see
correction there. It isn't; the real issue is just duplication.)

NOTE on the fragility I originally suspected: exhaustively tested both forms across every
power of ten from 1e0 to 1e308 — ZERO false negatives, and no false positives among tricky
non-powers (16, 1024, 16000, 49499, 9e5…). V8's Math.log10 is correctly-rounded for exact
powers of ten, so `%1===0` / `Number.isInteger` are both safe at every value the game uses.
The predicate is fine; only the duplication is worth fixing.

## Checked and FINE

- `starPx` sqrt-compression clamps to [2.5, 11] px — safe for any radius incl. 0 and huge.
- `spectralColor` falls back to G-type yellow for unknown spectral classes — no crash on a
  bad `type`.
- `softExp`/`softLog` both clamp p/t to [0,1] and short-circuit the k→0 degenerate case to
  the identity, avoiding a 0/0. Inverse-shaped (convex vs concave) as documented.
- `lyPerRealSec` uses `365` (the codebase-majority year length) — consistent with explore.js,
  and part of the 365-vs-365.25 inconsistency already logged in waves.TODO #1.
