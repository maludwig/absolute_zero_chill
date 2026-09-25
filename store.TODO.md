# store.TODO.md — observations from a read-through + coverage pass

Notes on `src/store.js` gathered while documenting it and from a scoped coverage
run. Nothing here is urgent — the file is in good shape (97%
line / 89% branch coverage, all 453 tests green). This is a punch-list, roughly
ordered by payoff. None of it is a correctness bug in normal play.

Evidence base: `npx vitest run --coverage.include='src/store.js'` (v8), plus reading
all 1,597 lines in ranges.

---

## Correctness / robustness

### 1. Act II defense code is not framejack-invariant (already known; worth a marker)
`tick()`'s defense block (~l.1222-1232) advances **per call**, not per `dt`:
`humanGrowthPerTick`, `macKill` (via `killPerTick`), and `vesselShadeKillPerTick` are
flat per-tick amounts. So one big framejacked tick ≠ many small ones here — vessel
growth, kills, and shade destruction all scale with *tick count*, not game-time.

In practice this is inert at the framejacks where it matters: ×10k/×100M unlock deep
in Act III when Earth is already frozen (`surfaceTemp < humanFreezeTemp`), so
`growth = 0` and vessels are pinned at zero. But it's a latent trap: any future content
that runs defense *and* a high framejack simultaneously would see divergent behavior.

Options: (a) leave it, add a one-line comment flagging the non-invariance explicitly
(the existing comment describes the mechanic but doesn't warn); (b) convert the three
constants to per-game-day rates × `daysThisTick`, matching population/scan/insight. (b)
is the principled fix but changes Act II balance, so it needs playtesting — not a
drive-by. At minimum, do (a).

### 2. `checkMilestones()` runs two full BODIES sweeps every tick (~l.1410, 1421)
Two `for (const b of BODIES)` loops per tick — one for first-mine logging, one for
depletion. BODIES is the full belt+moons+rocky+giants set. Both are guarded
(`if depleted || owned<=0 continue`) so they're cheap per body, but this is the kind of
per-tick catalog scan the codebase has elsewhere worked to eliminate (cf. the event
engine's O(1) round-robin, the reveal maps replacing requires-walks). Candidate to fold
into the mining loop in `tick()`, which already iterates BODIES once — depletion could
be detected inline where `mined[]` is updated. (This is also item 2 on the project-level
TODO.md.)

### 3. Legacy `reserves`→`mined` save migration is untested (l.1489-1494)
The migration branch in `loadSnapshot` (old saves stored `reserves` = remaining, new
ones store `mined` = extracted) has **zero coverage**. Per RESTART.md the user doesn't
care about old-save compatibility pre-deploy — so the honest move may be to *delete*
this migration rather than test it. If it's staying, it needs one test; if it's going,
that's less code and one fewer untested path. Decide which.

---

## Test coverage gaps (store.js: 97% line, 89% branch)

Uncovered lines are mostly defensive guard clauses — acceptable to leave. The ones
worth a test are the untested *behaviors*, not the guards:

### 4. `toggleSysCollapsed(name)` — entirely uncovered (l.809-815)
The whole function, including the null/auto-collapse logic (`collapsed == null` means
"auto-collapse when depleted"). It's UI state so low-risk, but it has real branching
(explicit pin vs auto) and no test touches it.

### 5. Uncovered guard branches worth a glance (not all need tests)
Early-return guards with no coverage — most are fine to leave, listed so the decision is
explicit rather than accidental:
- l.240 `remaining()` unknown-body guard
- l.573 `enqueue` unknown/locked building guard; l.617 `unpack` empty-inventory guard
- l.629 `setBreaker` unknown-id guard; l.892 `recycleMines` zero-owned guard
- l.923 `selectResearch` / l.930 `assistResearch` / l.970 `selectIdea` locked-or-done guards
- l.1230 the shade-destruction apply (needs a defense scenario with owned shade panels)
- l.1400 `_trimBuffers` log-trim branch; l.1528 the Ark cap-override backfill on load
- reconcile type-mismatch branches (l.68-69 array, l.73-74 object) — the error-reporting
  paths of the loader. A corrupt-save test could exercise these and would be genuinely
  valuable, since reconcile is the safety net for malformed saves.

---

## Structure / clarity (low priority)

### 6. Seven near-identical `dismiss*Modal` actions (l.634-661)
Each is `this.showXModal = false; pushTelemetry({event: "x_dismissed"})`. Could collapse
to one `dismissModal(which)` keyed on a small table. Minor — the explicit versions are
readable and grep-able, so this is taste, not debt. Noted only because it's the largest
block of repetition in the file.

### 7. `revealed` map is nearly vestigial (l.148-156)
Only five keys survive (`core`, `defense`, `brain`, `philosophy`, `galaxy`) now that the
old per-node reveal flags migrated to `completedQuests` + the milestones maps. The
comment already explains this. Project TODO.md item 3 contemplates retiring `revealed.*`
into `store.flags` entirely — if that happens, this map goes away. Flagging that these
five are the last holdouts.

### 8. `loadSnapshot` is doing a lot (l.1475-1550)
~75 lines: validate, migrate, reconcile, report, backfill legacy overrides, trim, rebuild
chains, replay quests, re-arm milestones. It's well-commented and each step is clear, but
it's the one function most likely to grow a bug when the save shape next changes. If it
gains one more responsibility, consider extracting the post-apply fix-ups (backfill +
trim + rebuild + replay + re-arm) into a `_afterLoad()` so the load *policy* and the load
*reconstruction* read separately. Not needed yet.

---

## Explicitly checked and FINE (so nobody re-investigates)

- **Population vs scan ordering** (l.1245-1267): scan clamps to the freshly-updated
  `humanPopulation`. Correct, intended.
- **`serialize()` aliasing** (l.1447-1450): returns `toJS(out)`, a deep clone — no live
  observable refs leak into a save. Fine.
- **Mining integrator** (l.1050-1079): exact boundary integration across the rate floor,
  framejack-invariant, unit-tested. This is the most careful code in the file.
- **STATE_KEYS completeness** (l.48): 40 persisted keys; the 14 observable-but-transient
  fields (reveal/enable maps, watchers, event-chain cursors, profiler, devMode, heal
  countdown) are correctly excluded and rebuilt on load.
