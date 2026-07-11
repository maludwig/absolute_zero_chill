# config.TODO.md

Full read of `src/config.js` (835 lines) — the pure static data layer everything
imports. RESTART.md flags its structure as non-obvious and says it bit a prior instance;
this pass confirms it's dense but sound. Referential integrity verified clean by script
(no dangling `requires`/`unlocks`/`revealKey` refs across TECHS/IDEAS/BUILDINGS/BODIES; no
zero-workload buildings after derivation). Findings below are stale comments, latent
ordering traps, and a couple of balance/coupling notes — not correctness bugs.

## Stale comments (safe, but actively misleading)

### 1. [FIXED] `construction_logistics` "Currently inert … has no effect yet" (l.404-405)
False now. Construction Logistics drives the auto-build plan — `store.logisticsRunning`,
the per-idle-tick plan step in `tick()`, and the whole plan-editor UI
(ConstructionLogisticsConfig.jsx) hang off it. The comment predates that feature. Delete
the "inert/scaffold" language; it'll mislead anyone grepping for what the building does.

### 2. [FIXED] `science_installation` "Currently inert … no effect yet" (l.416-417, 424)
Also false. Science Installations contribute `scienceRpPerDay` (40 RP/game-day each) to
the focused tech while powered — see `researchPower` in store.js. The desc "It has not
yet been given a question" is nice flavor but the code comment above it claims literal
no-op, which is wrong.

These two are worth fixing together — they're the only load-bearing-looking falsehoods in
the file.

## Latent ordering traps

### 3. Two population/vessel models coexist; the per-tick one isn't framejack-safe
The file defines a clean, framejack-invariant population model (`POP`, `popCapacity`,
`humanGrowth` — per-game-day relaxation toward a capacity curve, l.132-177). But it ALSO
still exports the older per-tick constants `humanGrowthPerTick: 0.1` and
`vesselShadeKillPerTick: 0.2` (l.105, 107), plus `mac_gun_station.killPerTick` (l.472),
which the Act II defense code in store.js `tick()` uses per-CALL, not per-dt. So the
"humanPopulation" system and the "humanVessels" defense system are two different models
with two different time bases. This is the root of the framejack non-invariance noted in
store.TODO.md #1 and autoplayer's Act II behavior. Not a config bug per se, but config is
where the two constants live side by side with no comment explaining they belong to
different subsystems — worth a note here so nobody "unifies" them by accident.

### 4. BODIES is tier-ordered, not mass-ordered (l.195-272)
BODIES = belt + MOON + ROCKY + GIANT, and the autoplayer/mining loop rely on "work the
earliest body with mass left" = dependency order (each tier gated by its tech + infra).
Mass is *nearly* ascending but NOT strictly: Jovian Moons (3.93e23 T) exceed Mercury
(3.28e23 T), the one inversion. Any future code that assumes BODIES is sorted by mass
(e.g. "mine the smallest remaining first") will be subtly wrong at that boundary. The
ordering contract is "tier then authored", and it's implicit — worth a one-line comment
at the BODIES assembly (l.267) stating that dependency order, not mass, is the invariant.

## Balance / coupling notes (not bugs — flagging for when you tune)

### 5. Processing-tech cost inversions vs reveal gates (l.627-638)
The batch-multiplier techs aren't monotonic in cost along their `requires` chain in a way
that interacts with reveal gates: e.g. `mega_processing` (5.0e6) is gated behind
`bulk_processing` (20000) but costs 250× more, while `duplication` (1.0e9) and
`peta_processing` (2.0e15) sit on the same `act_1b_ark_complete` reveal. This is almost
certainly intentional pacing, but the giga/tera/peta trio (l.636-638) have NO revealKey
while their cheaper siblings do — so they appear as soon as their `requires` is visible,
which can surface a ×1G button earlier in the tree than a designer eyeballing the reveal
gates might expect. Worth confirming that's intended.

### 6. Hard-coded magic constant `DYSON_RING_COLLECTORS = 88258323312` (l.26)
Used for the Dyson Ring's cost/mass/workload/power (= that many Solar Collectors). It's an
exact integer with no derivation shown — if it's meant to be "collectors to tile a sphere
at Sol" or similar, a one-line comment on how it was computed would let a future tuner
re-derive it rather than treating it as sacred.

### 7. `l2_ark_of_terra` power is a compound literal (l.456)
`powerUsageFromKw(8.1e9 * 5.0e3)` — 8.1e9 hard-codes the day-0 population (BASE_HUMAN_
POPULATION is 8.1e9, defined as a const at l.54, but NOT reused here). If BASE_HUMAN_
POPULATION ever changes, this literal silently won't track it. Low impact (it's a power
draw, not a gameplay count) but it's a copy of a constant that has a name.

## Checked and FINE (so nobody re-investigates)

- **The generated-file boundary** works as RESTART describes: `building_power.json` holds
  only the 11 mines + solar_collector + dyson_ring_collector; the loop at l.552-556
  attaches those. Buildings with bespoke draws (Scanner/Matrix/Ark/probe/stellaser/etc.)
  set `powerUsage` inline and are correctly NOT in the JSON, so a regen won't clobber them.
- **Workload auto-derivation ordering** (l.540-547): the metalCost>1000 → workload×0.001
  loop runs first, then the Dyson Ring override — correct order, override wins. No building
  ends up with zero/negative workload (verified).
- **Referential integrity**: every `requires`, `unlocks`, and cross-ref resolves. No
  dangling ids anywhere in the tech/idea/building/body graph.
- **FRAMEJACKS/ORDERED_FRAMEJACKS**: sorted ascending; labels match multipliers.
