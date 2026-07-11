# lut.TODO.md

Full read + data audit of `src/galaxy/lut.js` (48 lines) — the baked star-density lookup
table (12 azimuth slices × 8 radial rings) the whole galactic-logistics phase reads from.
Small file, but foundational: seeding cost, launcher charge, and Insight all key off it.

**Audited clean.** Verified by script:
- Dimensions match the constants exactly: 12 rows = SLICE_COUNT, every row length 8 =
  WEDGE_COUNT.
- `TOTAL_STARS` = 3.18e11 (header says "~3.3e11" — honest rounding, not a discrepancy).
- Physically sensible: slice 0 (toward Sgr A★) is by far the densest direction (2.40e11
  stars), falling smoothly to the anti-centre (slice 6, 4.3e8) and rising symmetrically
  back. The densest single cell is slice 0 / ring 2 = 1.68e11 = `MAX_WEDGE_STARS`.
- Near-mirror symmetry across the centre axis (0.99–7.57% per-row diff), with the largest
  imbalance on the densest ring — exactly the signature of a real numerical integration
  over an offset observer (Sol isn't at the centre), NOT a hand-symmetrised table. Good.
- `wedgeStars` bounds-checks BOTH dimensions (returns 0 for negative or out-of-range s
  and b) — verified with (-1,0),(0,-1),(99,0),(0,99) all → 0.
- Consumer contract holds: `store.galaxyChargeMax === MAX_WEDGE_STARS` and
  `store.wedgeCost(s,b) === wedgeStars(s,b)`, so the launcher's charge capacity is sized
  to exactly afford the single most expensive (densest) wedge. Matches the header intent.

## Minor notes (not bugs)

### 1. The table is opaque magic numbers with no regeneration path in-repo
The LUT is "precomputed offline" (header) from a "thin+thick disk + bulge" model, but the
generator that produced these 96 values isn't in the repo (unlike `building_power.json`,
which has `scripts/gen_mine_table.mjs`). If the galaxy model ever needs retuning — a
different density profile, a different Sol offset, more rings — there's no way to
regenerate short of reverse-engineering the numbers. Consider committing the generator
script (even if never re-run) so the provenance isn't lost. This is the file's one real
maintainability risk.

### 2. `PIE_RADIUS_LY = 80000` vs the real galaxy
The modelled frontier caps at 80,000 ly, and `relocateDistanceLy` (config) is 26,000 ly
to Sgr A★ — so the board extends well past the galactic centre, which is intended (you
seed the whole visible galaxy, not just out to the centre). Just noting the two distances
live in different files and mean different things; no action.

### 3. `MAX_WEDGE_STARS` / `TOTAL_STARS` recomputed at module load
Both are `LUT.reduce(...)` at import time — trivial cost (96 cells), runs once. Fine;
mentioning only so nobody "optimises" them into more baked constants and creates a second
source of truth that can drift from the table.
