/* =============================================================================
 * store.FUNCTIONS.js — a map of store.js
 * =============================================================================
 *
 * NOT executable. A hand-off index of every function, getter, and action in
 * store.js (1,597 lines), grouped as the file lays them out. Line numbers are
 * approximate — they drift with edits; the names are the stable anchors.
 *
 * store.js is the single MobX observable source of truth. Runtime state only;
 * the static catalog (CONFIG/BODIES/BUILDINGS/TECHS/CORE) lives in config.js.
 * Components observe the store; the tick loop mutates it through actions. It is
 * NOT strict-action mode, so tests may mutate fields directly.
 *
 * Reading order that helped: (1) STATE_KEYS + the observable-state block to see
 * what's persisted, (2) the getters to see what's derived, (3) tick() as the
 * spine, (4) everything else hangs off those.
 *
 * ── LAYERS ──────────────────────────────────────────────────────────────────
 *   module scope   SAVE_VERSION, caps, STATE_KEYS, reconcile, freshExploreState
 *   data fields    the observable state object (~l.162) + STATE_KEYS (l.48)
 *   getters        pure derived reads (mining, power, climate, galaxy, quests)
 *   read helpers   non-reactive lookups (techDone, canAfford, buildingVisible…)
 *   actions        mutate state (enqueue, unpack, research, seed, dismiss…)
 *   the tick       tick() + tickPower() + tickExplore(): the simulation step
 *   events         runOneEventCheck / rebuildEventChains: news + story engine
 *   telemetry      pushTelemetry / _rates / checkMilestones
 *   save/load      serialize / saveText / loadSave / loadSnapshot
 * ============================================================================= */


/* ── MODULE SCOPE (top of file, before createStore) ─────────────────────────── */

// SAVE_VERSION (const, l.31)         Bumped when the persisted shape changes. loadSnapshot
//                                    warns (doesn't abort) on a mismatch.
// TELEMETRY_CAP / _SLACK (l.39)      Bound the append-only telemetry stream. SLACK lets it
//                                    overshoot before an O(n) splice, so trimming amortizes.
// LOG_CAP (l.41)                     Max narrative-log entries kept.
// MILESTONE_HEAL_INTERVAL (l.46)     Ticks between reveal/enable self-heals (300).
// STATE_KEYS (array, l.48)           The exhaustive list of persisted fields. Getters,
//                                    actions, helpers are deliberately excluded.

// reconcile(ref, src, path, report)  (l.63) Pure. Merge a loaded value onto the current
//                                    reference value, using the reference's SHAPE as schema.
//                                    Records missing / unknown / type-mismatched keys into
//                                    `report`; freeform maps (flags, buildingMaxOverrides,
//                                    telemetry) are accepted wholesale. Best-effort: good keys
//                                    from the save, everything else falls back to reference.
// freshExploreState()                (l.102) Pure. Build the Act III frontier state with every
//                                    system pre-populated (static keys, so MobX tracks them) in
//                                    an unlaunched, idle state.
// ALL_EVENT_CHAINS (const, l.116)    Flat concat of ALL_NEWS_CHAINS + STORY_CHAIN — the pool
//                                    the event engine round-robins over.

// createStore()                      (l.118) Factory. Builds fully-keyed initial maps (owned,
//                                    inventory, breakerOn, research, philosophy, mined,
//                                    depleted — all keyed up front so MobX has no dynamic keys),
//                                    then makeAutoObservable over the big state+methods object.
//                                    Ends by rebuildEventChains + initMilestones + intro log.
//                                    `export const store = createStore()` is the live singleton.


/* ── GETTERS: economy / mining ──────────────────────────────────────────────── */

// playerBuildPower (l.231)           Your manual-Assist build output; ×2 with ion_thrusters.
// playerResearchPower (l.232)        Your manual research-Assist output (flat).
// remaining(bodyId) (l.238)          Tonnes left in a body by id (looks up BODIES).
// remainingMass(body) (l.244)        Same, given the body object: max(0, mass − mined).
// mineMult(b) (l.250)                Yield multiplier for one body's mines (radar, impactors).
//                                    Shared by metalPerSec AND tick() so readout == truth.
// metalPerSec (l.256)                Live mining rate over all bodies (readout). Skips
//                                    unpowered/exhausted; honors mineRateFloor.
// coreTemp (l.270)                   coreHeat / heatCapacity.
// gameYear (l.272)                   START_YEAR + floor(day/365). Calendar starts at "now".
// framejackLevels (l.276)            Which Framejack speeds the toggle offers, cumulative by
//                                    research; devFramejack unlocks all.
// coreTransferMult (l.289)           ×10 per researched heat-pipe upgrade.
// sunBlot (l.294)                    Fraction of Sun occluded by Shade Panels.
// shadeEq (l.296)                    Stefan-Boltzmann surface asymptote under the dimmed Sun.
// surfaceTarget (l.298)              The temp the surface relaxes toward: max(shadeEq, core
//                                    floor, CMBR/Hawking floor).
// cmbrDefeated (l.303)               True once the Black Eye of Sagittarius exists (drops floor).
// relocateDurationDays (l.305)       Travel time Earth→Sgr A★ from distance/speed.
// relocating / relocationProgress / relocated (l.306-311)  Earth's fall to the galactic centre,
//                                    all derived from the departure day (galaxy.relocateDay0).
// servoMult (l.315)                  High-Power Servos multiplier on the Replica FLEET only.
// buildPower (l.317)                 Replica build output per real second (the RATE).
// tickBuildPower(dt) (l.322)         buildPower × dt. THE single source of build labour — the
//                                    getter and tick()'s integrator must never diverge.
// researchPower (l.323)              Idle Replicas (when not building, breaker on) + powered
//                                    Science Installations, in per-real-second units.
// metalPerDay / buildPerDay / researchPerDay (l.338-340)  Per-game-day versions for display.

/* ── GETTERS: power grid ────────────────────────────────────────────────────── */

// chassisCount (l.346)               Replicas + 1 (you). Net-zero on the grid; counted for honesty.
// powerGen (l.349)                   Your panel + every switched-on generator (kW).
// powerDraw (l.357)                  You + every switched-on consumer incl. Replicas (kW).
// powerNet (l.367)                   gen − draw; < 0 drains the cell.
// powerCap (l.369)                   Onboard cell + built Kinetic Accumulators (kWh).
// powerFrac (l.376)                  power / powerCap.
// powerDraining (l.379)              net < 0 and not yet failed — the amber warning state.

/* ── GETTERS: galaxy / insight / quest / act II ─────────────────────────────── */

// insightPerDay (l.383)              Sol Brain trickle + one Brain per HEARD star.
// galaxySeededStars (l.388)          Stars reached by wave outbound fronts (thinking).
// galaxyHeardStars (l.396)           Stars whose Insight round-tripped back to Sol.
// galaxyChargeMax (l.404)            Launcher banks at most one richest-wedge charge.
// currentQuest (l.408)               The active quest object (or null when the spine is done).
// humanShips (l.411)                 ceil(humanVessels) — humans field whole ships.
// popCapacity (l.415)                Carrying capacity now, clamped ≥0 for display.
// scanFrac (l.418)                   peopleScanned / population, clamped 1 (banked minds).
// buildQueueFrac (l.422)             Σ work done / Σ total work across the queue.
// macKill (l.432)                    Vessels killed per tick by all MAC guns.

/* ── READ HELPERS (non-reactive; see the observability opt-out at l.1552) ────── */

// techDone / techUnlocked (l.437-438)          O(1) reads of research.done / techsEnabled.
// ideaDone / ideaUnlocked / ideaVisible (l.440-442)  Philosophy mirrors of the tech helpers.
// wedgeCost / wedgeSeeded / canSeed (l.444-452) Galactic Logistics: wedge star count, whether a
//                                    wedge is already seeded, and affordability (Seed + charge).
// canAfford(id) / canAffordN(id,n) (l.453-454)  Metal affordability.
// canPowerN(id,n) (l.460)            Would n more of id keep the grid net-positive? Guards the
//                                    auto-builder from committing a draw the grid can't sustain.
// buildingMax(id) (l.469)            Static cap, or a story override (buildingMaxOverrides).
// remainingCapacity(id) (l.474)      max − owned − queued (Infinity if uncapped).
// techVisible(id) (l.484)            Reveal-map read; a researched tech shows regardless.
// buildingVisible(id) (l.485)        Reveal-map read; a mine on a depleted body with none left
//                                    stays hidden.
// buildingUnlocked(id) (l.491)       O(1) read of buildingsEnabled.
// cheapestAvailableMine (l.497)      Cheapest startable mine (body not depleted, infra built).
//                                    Used by Construction Logistics when a planned mine dries up.
// logisticsRunning (l.510)           ≥1 Construction Logistics built AND breaker on — the plan is
//                                    locked for editing and the tick iterates it.

/* ── ACTIONS: Construction Logistics plan editing (all no-op while running) ──── */

// logisticsSetQty(i, qty) (l.515)    Set row i's batch count (≥1); rewind cursor.
// logisticsSetBuilding(i, id) (l.522)Set row i's building; rewind cursor.
// logisticsAddRow() (l.529)          Append a default row (1× solar_collector).
// logisticsDeleteRow(i) (l.534)      Remove row i (never empties the plan).
// logisticsResetPlan() (l.540)       Restore the default LOGISTICS_PLAN.

/* ── ACTIONS: build queue ───────────────────────────────────────────────────── */

// enqueue(id, count) (l.550)         Queue ONE job of `count` structures. HARD INVARIANT: count
//                                    is a power of ten OR a Duplication doubling (== owned,
//                                    capped) — else it throws (catches a misread ×16 batch).
//                                    Clamps to remaining cap and to affordable metal; spends
//                                    metal up front; pushes { id, count, progress, uid }.
// enqueueMultithreaded(id,count,threads) (l.598)  Queue up to `threads` SEPARATE jobs of `count`,
//                                    re-checking cap + affordability each iteration; stops (never
//                                    clamps) when a full batch won't fit. Divides ×16 down to the
//                                    two shapes enqueue accepts.
// toggleMultithread() (l.611)        Flip the ×16 build toggle.
// unpack(id) (l.616)                 Bring a structure online FREE from inventory (no queue).
//                                    First of its kind → notify(id+"_built"). This is how the
//                                    first Mine and Collector start.
// setBreaker(id, on) (l.628)         Flip a grid building's breaker.
// cancelBuild(uid) (l.911)           Cancel a queued job, refund its full metal (labour forfeit).
// assist(uid) (l.900)                Land one manual build-Assist on a job, then resolveBuilds.

/* ── ACTIONS: modals (each clears its flag + fires a milestone telemetry) ─────── */

// dismissPreludeModal (l.634), dismissActOneModal (l.638), dismissAct1CompleteModal (l.642),
// dismissUserMatrixModal (l.646), dismissArkModal (l.650), dismissActTwoModal (l.654),
// dismissFinaleModal (l.658).

/* ── ACTIONS: Act III exploration / frontier ────────────────────────────────── */

// sysReserve(name) (l.666)           Spendable in-system reserve: delivered mass − harvester &
//                                    driver start costs − shipped-home.
// arrived (getter, l.679)            { systemName: bool } probe-has-arrived, derived from
//                                    (day − launchDay) vs light-lag — NOT persisted, can't desync.
// setFramejack(n) (l.687)            Set the time-compression level (+ telemetry).
// unlockAllFramejack() (l.694)       Easter egg (5 Sun clicks): mark gating techs done + flip
//                                    devFramejack so ×100+ tiers surface without a Brain.
// launchProbe(name) (l.766)          Fire a probe at a system (needs launcher powered + metal);
//                                    0.9c if a powered Stellaser rides the beam, else 0.3c.
// buildHarvester(name, cat) (l.779)  Start a category's harvester once the probe has arrived and
//                                    the reserve covers its start cost.
// recycleHarvester(name, cat) (l.790)Begin recycling a finished ("harvested") harvester.
// buildDriver(name) (l.798)          Start the mass driver once all categories are underway and
//                                    the reserve covers the driver gate.
// toggleSysCollapsed(name) (l.809)   Collapse/expand a system card (null = auto-collapse when
//                                    depleted; explicit toggle pins it).
// recycleMines(mineId) (l.888)       Scrap all mines on an exhausted body, full metal refund.
//                                    The anti-soft-lock: mine metal is always recoverable.

/* ── ACTIONS: research / philosophy ─────────────────────────────────────────── */

// selectResearch(id) (l.922)         Toggle the focused tech (idle Replicas + Science pour in).
// assistResearch(id) (l.929)         Land one manual research-Assist, then finishTechIfDone.
// focusAndAssist(id) (l.938)         Focus AND assist in one click; repeated clicks keep both.
// resolveBuilds() (l.946)            Sweep the queue: any job past its workload becomes owned;
//                                    first of its kind comes online powered + notifies "_built".
// finishTechIfDone(id) (l.960)       Mark a tech done when progress ≥ cost; notify "_researched".
// selectIdea(id) (l.969)             Toggle the contemplated Idea (Insight flows into it).
// finishIdeaIfDone(id) (l.975)       Mark an Idea realized when progress ≥ cost; notify
//                                    "_realized" (reveals the Research it makes thinkable).
// seedWedge(s, b) (l.989)            Fire a colonization wave: spend Seed + charge per star,
//                                    record launch day (front position is derived from it).

/* ── REVEAL / ENABLE NOTIFICATION CORE (pairs with milestones.js) ───────────── */

// notify(key) (l.709)                Fire every watcher registered under `key`, then drop the
//                                    key. An unsatisfied watcher no-ops but survives under its
//                                    other keys (state, not key-presence, is its truth).
// reconcileMilestones() (l.717)      Full rebuild of the reveal/enable maps (initMilestones).
//                                    For tests that poke state directly, bypassing producers.
// setFlag(flag) (l.719)              Set a raw story flag once and notify its listeners.
// _onReveal(kind, id) (l.728)        Fired by a reveal watcher on first visibility — one-shot
//                                    availability telemetry snapshot.

/* ── DEV / PROFILING (all kept out of the reactive system) ──────────────────── */

// toggleDevMode() (l.703)            Flip the dev-toolbar flag (10 Sun clicks unlock it).
// clearTelemetryAndLog() (l.733)     Manual: drop the append-only buffers to free memory now.
// profileTicks(n=60) (l.741)         Arm the per-phase tick profiler for the next n ticks.
// _pfNext(label, prev) (l.748)       Accumulate elapsed ms under a phase label; return now.
// _reportProfile() (l.753)           Dump the per-phase table to console and clear the profiler.

/* ── THE TICK — the simulation step ─────────────────────────────────────────── */

// paused (getter, l.1002)            True whenever ANY modal is up — the App loop skips ticking
//                                    (time shouldn't pass while the player reads). tick() itself
//                                    stays pure so tests/catch-up can drive it directly.
// tickPower(dt) (l.1009)             Charge/drain the cell by powerNet × game-days × 24h; trip
//                                    all grid breakers on empty-and-bleeding (blackout), restore
//                                    the failed flag when charge returns (breakers stay where the
//                                    trip left them — the player re-arms by hand). Saturates [0,cap].
// tick(dt) (l.1034)                  THE step. Mutates state forward by dt seconds. In order:
//                                    • mining — exact boundary integration across the rate floor
//                                      (expm1 exponential above, linear below); one big tick ==
//                                      many small ones. Accumulates into mined[] for precision.
//                                    • replica labour — build power split evenly across jobs,
//                                      surplus re-split then spilled into research.
//                                    • Science Installations — RP straight to the focused tech.
//                                    • Construction Logistics — one plan step per idle tick.
//                                    • core drain (analytic relaxation) + surface relaxation.
//                                    • tickPower(dt).
//                                    • Act II defense — vessel growth/kills, shade destruction.
//                                      NOTE: per-CALL, not per-dt (humanGrowthPerTick etc.), so
//                                      NOT framejack-invariant — but inert at high fj (Earth is
//                                      frozen, growth 0). See the App.jsx framejack fix.
//                                    • calendar + population + scan + galaxy charge + Insight
//                                      (trapezoidal, framejack-invariant).
//                                    • checkMilestones, periodic healMilestones, one event check.
//                                    Profiler phases are stamped via _pfNext when armed.

/* ── LOG / QUEST / EVENT ENGINE ─────────────────────────────────────────────── */

// pushLog(msg, cls) (l.1302)         Unshift a log line (id, tick, year); cap at LOG_CAP.
// addNews(msg) (l.1308)              pushLog with the "news" class.
// setQuest(key) (l.1311)             Point currentQuestKey at a quest (or null when done).
// addCompletedQuest(key) (l.1312)    Append to the completed ledger + notify "_completed"
//                                    (this is what drives quest-gated reveals now).
// rebuildEventChains(source?) (l.1328)  Rebuild eventChains from the source (default news+story),
//                                    skipping any already-fired prefix (via this.flags[key]).
//                                    eventChains isn't persisted (holds fn refs) — this is how
//                                    seen beats stay seen across a reload. Takes a source so tests
//                                    can feed fake chains.
// runOneEventCheck() (l.1345)        Test the HEAD of exactly one chain per tick, round-robin.
//                                    Fire → set flag → shift; empty chains are swap-removed. O(1)
//                                    per tick regardless of content volume.

/* ── TELEMETRY / MILESTONES ─────────────────────────────────────────────────── */

// _rates() (l.1369)                  Snapshot metal/build/research/insight rates for an event.
// pushTelemetry(event) (l.1384)      Append an event (real_t/game_t/game_year + fields); keep the
//                                    stream bounded with amortized splicing.
// _trimBuffers() (l.1397)            Clamp telemetry + log to caps (used right after a load).
// checkMilestones() (l.1403)         Per-tick: first-mine-of-each-body logs, body-depletion dump
//                                    (hand over the last 0.01% + mark depleted), heat-pipe-online
//                                    logs. Bigger narrative beats live in story.js now.

/* ── SAVE / LOAD ────────────────────────────────────────────────────────────── */

// serialize() (l.1447)               Plain de-proxied snapshot of every STATE_KEYS field.
// saveText() (l.1453)                Versioned wrapper string { version, savedAt, state }.
// loadSave(text) (l.1462)            Parse a save string (corrupt JSON → console error + false),
//                                    then loadSnapshot.
// loadSnapshot(data) (l.1475)        Apply a parsed save best-effort against the current shape:
//                                    tolerate bare state; migrate old `reserves`→`mined`; reconcile
//                                    each key + report discrepancies; backfill legacy cap overrides;
//                                    trim buffers; rebuildEventChains; replay completed-quest
//                                    onLoadedSave; re-arm milestones (the load-time safety net).

/* ── OBSERVABILITY OPT-OUT (l.1552) ─────────────────────────────────────────── */
// The second makeAutoObservable arg lists members kept OUT of the reactive system:
// the read helpers (techDone, canAfford, buildingVisible, mineMult, …), the freeform
// flags map, the event-chain internals, and the transient profiler fields. Everything
// else is observable. This is why the read helpers can be called freely in render
// without registering spurious MobX dependencies.
