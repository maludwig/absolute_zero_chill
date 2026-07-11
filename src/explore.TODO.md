# explore.TODO.md

Full read of `src/explore.js` (86 lines) — Act III frontier static data + the
`systemReserve` calculation. Small file, but high-value (it's the economic backbone of
the interstellar phase). Verified by script: `present`-category derivation is correct
(WISE drops `planet`, Sirius drops `moon`+`planet` on the `> 0` filter); star masses are
physically sane (0.005–3.1 M☉ across the eight systems); `harvesterStartCost("asteroid")`
== 0, confirming the free-asteroid bootstrap that Exploration.jsx and the autoplayer rely
on. No bugs. A few maintainability notes only.

## Notes

### 1. Three similarly-named reserve concepts across three files
`systemReserve` (here, l.25) is the "GAME variant" that refunds the 40% deposit once a
fleet is recycled (`done`); it sums `categoryReserve` (the per-category primitive in
shared/model.js). The store's `sysReserve(name)` getter is NOT a reimplementation — it
*wraps* this exported `systemReserve`, then subtracts the driver gate and shipped mass
(verified: store.js:670, :843 both call it, and it's unit-tested in explore.test.js and
store.test.js). So the layering is: `categoryReserve` (primitive) → `systemReserve` (game
deposit logic) → `sysReserve` (store getter, driver/shipping adjustments). Correct and
non-redundant — but the three near-identical names (`sysReserve`/`systemReserve`/
`categoryReserve`) are a real trip hazard when reading. A one-line comment at each site
pointing up the chain would save the next reader the grep I just did.

### 2. Implicit ordering contract on `present` (l.79)
`present = CATEGORY_ORDER.filter(...)`, so it's always in CATEGORY_ORDER order with
`asteroid` first. The free-asteroid bootstrap DEPENDS on this: the asteroid harvester
costs 0 and seeds the reserve that pays for everything after it, and callers walk
`d.present` in order assuming asteroid comes first (see autoplayer.frontierStep,
Exploration.jsx). If anyone ever reorders CATEGORY_ORDER or builds `present` a different
way, the bootstrap silently breaks (no free first harvester → reserve never starts). The
dependency is real but uncommented at the derivation site — worth a note there.

### 3. `harvestables` data oddities (flavor, not bugs)
- Luhman 16 `moon` (1.16e22) is ~40× its `planet` (2.99e20) — inverted vs every other
  system. It's a brown-dwarf pair so "moon"/"planet" are loose labels; likely intentional,
  but it stands out if you scan the table.
- WISE 0855 `star` is 0.005 M☉ — a sub-brown-dwarf, realistic but by far the lightest;
  its whole system is a rounding error next to the others. Fine, just note it contributes
  almost nothing if a player detours there.
None of these affect correctness; flagging so a future data-tuner knows they're deliberate.

## Checked and FINE

- `present` filter (`> 0`) correctly drops zeroed categories; verified per-system.
- Star masses physically plausible; no magnitude typos found in the harvestables.
- `travelDays`/`streamDays` unit math is right (ly / (c-fraction) × 365 = game-days).
  NOTE (found later, reviewing waves.js): this file uses `365` days/year, but
  `galaxy/waves.js` uses `365.25` for the same kind of c-fraction transit. The two are
  internally correct but mutually inconsistent (~0.068% drift). See waves.TODO.md #1 — the
  fix is one shared `DAYS_PER_YEAR` constant, which would touch this file too.
- The `export *` re-export from shared/model.js is a deliberate convenience aggregator,
  documented in the header — not accidental surface area.
