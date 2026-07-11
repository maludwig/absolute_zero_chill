# waves.TODO.md

Full read + physics audit of `src/galaxy/waves.js` (50 lines) — the pure colonization-wave
model: outbound seeding front, and the "heard" (Insight-returned) front that lags it by the
light round-trip. `overlay.js` draws from these functions and the store's Insight accrual
(`seededFrac`/`heardFrac`) simulates from them, so draw and simulation share one source —
good design.

**Physics audited correct.** Verified by script:
- `heardFrac ≤ seededFrac` for every speed/ring/time sampled (0 violations) — you can never
  hear back more stars than you've reached. The core invariant holds.
- The heard-ramp timing matches the derivation exactly: `heardFrac` is ~0 right up to
  `returnWindowDays[0]`, hits 1.0 exactly at `returnWindowDays[1]`. The comment's claim
  ("ramp begins when the first signals return, finishes when the last do") is literally
  true, not approximately.
- The `R_heard = frontLy/(1+speedC)` inversion is the correct closed form for
  round-trip time `r·(1 + v/c)/v` — checked against `returnWindowDays`'s independent
  `(1/v + 1)` factor; they agree.

This is one of the cleaner physics files in the project.

## Real finding (consistency, not a bug)

### 1. [FIXED] `365.25` here vs `365` almost everywhere else — three different year-lengths
`waves.js` uses **365.25** days/year (l.18, l.48), and so does `relocateDurationDays`
(store.js l.305). But the rest of the codebase uses plain **365**:
- `explore.js` `travelDays`/`streamDays` (probe out, mass-stream home)
- `store.gameYear` (the displayed calendar)
- `shared/model.js` `lyPerRealSec`
- `config.js` POP `gapClosePerYear`

Consequence: the galaxy SEED-WAVE front (waves.frontLy, 365.25) and the interstellar
PROBE leg (explore.travelDays, 365) advance at fractionally different year-lengths for the
same physical thing (something crossing space at a fraction of c), and the displayed
calendar year uses a third reckoning. Measured drift at 26,000 ly / 0.9c: **0.068%**, i.e.
~20 years over a ~29,000-year journey. Nobody will ever perceive it, and no test will fail
— so this is NOT urgent. But it's a genuine inconsistency: three files, two constants, for
one concept. Pick one (365 is the codebase majority; 365.25 is more physically honest) and
make it a single shared constant (e.g. `DAYS_PER_YEAR` in shared/model.js) that all of
travelDays/streamDays/frontLy/returnWindowDays/gameYear import. That also kills the
duplicated literal, same class of issue as overlay.js's triplicated 26000.

## Checked and FINE

- `frontLy` guards `daysElapsed <= 0` → 0 (no negative fronts before launch).
- `bandFrac` clamps to [0,1] — a front past the ring reads exactly 1, before it exactly 0.
- No replication modelled (a wave seeds only its destination wedge) — matches the header
  and the store's per-wave accrual; the LUT count is applied once per wave, not per ring
  crossed.
